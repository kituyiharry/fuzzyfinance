//! Time-bucketed trendline aggregation: total spend per category over time.
//!
//! Emits per-bucket totals for every primary AND every secondary category so
//! the client can render two parallel multi-line charts. The output shape is
//! deliberately raw points (no spline interpolation) — clients use
//! `d3-shape`'s `curveCatmullRom` to smooth at render time, keeping the JSON
//! compact and independent of the display dimensions.

use std::collections::BTreeMap;

use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::alluvial::AggregationError;
use crate::categories::{PrimaryCategory, SecondaryCategory};
use crate::context::Context;
use crate::models::ReceiptRow;

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BucketKind {
    Day,
    Month,
    Quarter,
}

/// A single category's series, aligned with the top-level `buckets` array
/// (`points[i]` is the total for `buckets[i]`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrendSeries {
    pub key: String,
    pub label: String,
    pub points: Vec<f64>,
    pub total: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrendlineData {
    pub bucket_kind: BucketKind,
    /// Sorted, contiguous bucket keys. For days: `"YYYY-MM-DD"`. For months:
    /// `"YYYY-MM"`. For quarters: `"YYYY-Q1"`/`"YYYY-Q2"`/etc.
    pub buckets: Vec<String>,
    pub primary_series: Vec<TrendSeries>,
    pub secondary_series: Vec<TrendSeries>,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Build a trendline aggregation from receipt rows. Prices are converted to
/// the context's default currency; unconvertible currencies propagate as
/// `MissingExchangeRate` (matching alluvial semantics).
pub fn build_trendline(
    rows: &[ReceiptRow],
    ctx: &Context,
) -> Result<TrendlineData, AggregationError> {
    let dated: Vec<(NaiveDate, &ReceiptRow)> = rows
        .iter()
        .filter_map(|r| parse_iso_date(&r.receipt_date).map(|d| (d, r)))
        .collect();

    if dated.is_empty() {
        return Ok(TrendlineData {
            bucket_kind: BucketKind::Month,
            buckets: Vec::new(),
            primary_series: Vec::new(),
            secondary_series: Vec::new(),
        });
    }

    let min_date = dated.iter().map(|(d, _)| *d).min().unwrap();
    let max_date = dated.iter().map(|(d, _)| *d).max().unwrap();
    let span_days = (max_date - min_date).num_days();

    let bucket_kind = if span_days <= 62 {
        BucketKind::Day
    } else if span_days <= 730 {
        BucketKind::Month
    } else {
        BucketKind::Quarter
    };

    let buckets = enumerate_buckets(min_date, max_date, bucket_kind);
    let bucket_index: BTreeMap<String, usize> = buckets
        .iter()
        .enumerate()
        .map(|(i, k)| (k.clone(), i))
        .collect();

    // (category_key, label) -> Vec<f64> of length buckets.len()
    let mut primary_acc: BTreeMap<(String, String), Vec<f64>> = BTreeMap::new();
    let mut secondary_acc: BTreeMap<(String, String), Vec<f64>> = BTreeMap::new();

    for (date, row) in &dated {
        let Some(price) = row.line_item_total else { continue };
        let Some(converted) = ctx.convert_currency(price, &row.currency) else {
            return Err(AggregationError::MissingExchangeRate {
                from: row.currency.clone(),
                to: ctx.default_currency.clone(),
            });
        };

        let bucket = bucket_key(*date, bucket_kind);
        let Some(&idx) = bucket_index.get(&bucket) else { continue };

        let primary_label = enum_label(&row.primary_category);
        let primary_entry = primary_acc
            .entry((primary_label.clone(), primary_label))
            .or_insert_with(|| vec![0.0; buckets.len()]);
        primary_entry[idx] += converted;

        let secondary_label = enum_label_secondary(&row.secondary_category);
        let secondary_entry = secondary_acc
            .entry((secondary_label.clone(), secondary_label))
            .or_insert_with(|| vec![0.0; buckets.len()]);
        secondary_entry[idx] += converted;
    }

    Ok(TrendlineData {
        bucket_kind,
        buckets,
        primary_series: to_sorted_series(primary_acc),
        secondary_series: to_sorted_series(secondary_acc),
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_sorted_series(acc: BTreeMap<(String, String), Vec<f64>>) -> Vec<TrendSeries> {
    let mut series: Vec<TrendSeries> = acc
        .into_iter()
        .map(|((key, label), points)| {
            let total = points.iter().sum();
            TrendSeries { key, label, points, total }
        })
        .filter(|s| s.total > 0.0)
        .collect();
    series.sort_by(|a, b| b.total.partial_cmp(&a.total).unwrap_or(std::cmp::Ordering::Equal));
    series
}

fn parse_iso_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok()
}

fn bucket_key(date: NaiveDate, kind: BucketKind) -> String {
    match kind {
        BucketKind::Day => date.format("%Y-%m-%d").to_string(),
        BucketKind::Month => format!("{:04}-{:02}", date.year(), date.month()),
        BucketKind::Quarter => format!("{:04}-Q{}", date.year(), (date.month() - 1) / 3 + 1),
    }
}

fn enumerate_buckets(min: NaiveDate, max: NaiveDate, kind: BucketKind) -> Vec<String> {
    let mut out = Vec::new();
    match kind {
        BucketKind::Day => {
            let mut d = min;
            while d <= max {
                out.push(bucket_key(d, kind));
                d = d.succ_opt().unwrap_or(max);
                if d == max { out.push(bucket_key(d, kind)); break; }
            }
            // Edge case: min == max
            if out.is_empty() { out.push(bucket_key(min, kind)); }
            out.dedup();
        }
        BucketKind::Month => {
            let (mut y, mut m) = (min.year(), min.month());
            let (ey, em) = (max.year(), max.month());
            loop {
                out.push(format!("{:04}-{:02}", y, m));
                if y == ey && m == em { break; }
                m += 1;
                if m > 12 { m = 1; y += 1; }
            }
        }
        BucketKind::Quarter => {
            let (mut y, mut q) = (min.year(), (min.month() - 1) / 3 + 1);
            let (ey, eq) = (max.year(), (max.month() - 1) / 3 + 1);
            loop {
                out.push(format!("{:04}-Q{}", y, q));
                if y == ey && q == eq { break; }
                q += 1;
                if q > 4 { q = 1; y += 1; }
            }
        }
    }
    out
}

fn enum_label(p: &PrimaryCategory) -> String {
    serde_json::to_value(p)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default()
}

fn enum_label_secondary(s: &SecondaryCategory) -> String {
    serde_json::to_value(s)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::currency::Currency;
    use crate::units::UnitType;

    #[allow(clippy::too_many_arguments)]
    fn row(
        date: &str,
        line_item_total: Option<f64>,
        primary: PrimaryCategory,
        secondary: SecondaryCategory,
        currency: Currency,
    ) -> ReceiptRow {
        ReceiptRow {
            receipt_id: "rx-test".to_owned(),
            merchant: "Coles".to_owned(),
            receipt_date: date.to_owned(),
            uploaded_at: format!("{} 00:00:00", date),
            category: "Groceries".to_owned(),
            tags: vec![],
            receipt_total: 0.0,
            currency,
            line_item_description: Some("test".to_owned()),
            qty: Some(1.0),
            unit_price: None,
            line_item_total,
            unit_size: None,
            unit_type: UnitType::Unclassified,
            primary_category: primary,
            secondary_category: secondary,
        }
    }

    fn approx(a: f64, b: f64) -> bool { (a - b).abs() < 1e-6 }

    #[test]
    fn short_span_uses_daily_buckets() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("2026-05-01", Some(10.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::AUD),
            row("2026-05-15", Some(20.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::AUD),
        ];
        let t = build_trendline(&rows, &ctx).unwrap();
        assert_eq!(t.bucket_kind, BucketKind::Day);
        // Inclusive enumeration: 2026-05-01 .. 2026-05-15 = 15 days
        assert_eq!(t.buckets.len(), 15);
        assert_eq!(t.buckets[0], "2026-05-01");
        assert_eq!(t.buckets[14], "2026-05-15");
    }

    #[test]
    fn medium_span_uses_monthly_buckets() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("2026-01-15", Some(10.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::Beverages, Currency::AUD),
            row("2026-06-20", Some(30.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::Beverages, Currency::AUD),
        ];
        let t = build_trendline(&rows, &ctx).unwrap();
        assert_eq!(t.bucket_kind, BucketKind::Month);
        assert_eq!(t.buckets, vec!["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);

        let bev = t.secondary_series.iter().find(|s| s.label == "Beverages").unwrap();
        assert!(approx(bev.points[0], 10.0));
        assert!(approx(bev.points[5], 30.0));
        assert!(approx(bev.points[2], 0.0)); // empty month
        assert!(approx(bev.total, 40.0));
    }

    #[test]
    fn long_span_uses_quarterly_buckets() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("2024-01-15", Some(10.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::AUD),
            row("2026-04-20", Some(30.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::AUD),
        ];
        let t = build_trendline(&rows, &ctx).unwrap();
        assert_eq!(t.bucket_kind, BucketKind::Quarter);
        assert_eq!(t.buckets.first().unwrap(), "2024-Q1");
        assert_eq!(t.buckets.last().unwrap(), "2026-Q2");
    }

    #[test]
    fn series_sorted_by_total_desc() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("2026-05-01", Some(5.0),  PrimaryCategory::HealthAndBeauty, SecondaryCategory::Skincare, Currency::AUD),
            row("2026-05-02", Some(50.0), PrimaryCategory::FoodAndGrocery,  SecondaryCategory::DairyAndEggs, Currency::AUD),
            row("2026-05-03", Some(20.0), PrimaryCategory::FoodAndGrocery,  SecondaryCategory::DairyAndEggs, Currency::AUD),
        ];
        let t = build_trendline(&rows, &ctx).unwrap();
        assert_eq!(t.primary_series[0].label, "Food & Grocery");
        assert!(approx(t.primary_series[0].total, 70.0));
        assert_eq!(t.primary_series[1].label, "Health & Beauty");
        assert!(approx(t.primary_series[1].total, 5.0));
    }

    #[test]
    fn missing_exchange_rate_errors() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("2026-05-01", Some(1000.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::KES),
        ];
        assert!(matches!(
            build_trendline(&rows, &ctx).unwrap_err(),
            AggregationError::MissingExchangeRate { .. },
        ));
    }

    #[test]
    fn currency_conversion_applied() {
        let mut ctx = Context::new(Currency::AUD);
        ctx.add_rate(Currency::KES, Currency::AUD, 0.012);
        let rows = vec![
            row("2026-05-01", Some(100.0),  PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::AUD),
            row("2026-05-02", Some(1000.0), PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::KES),
        ];
        let t = build_trendline(&rows, &ctx).unwrap();
        let food = t.primary_series.iter().find(|s| s.label == "Food & Grocery").unwrap();
        // 100 AUD + 1000 KES * 0.012 = 112 AUD
        assert!(approx(food.total, 112.0));
    }

    #[test]
    fn empty_rows_returns_empty_data() {
        let ctx = Context::new(Currency::AUD);
        let t = build_trendline(&[], &ctx).unwrap();
        assert!(t.buckets.is_empty());
        assert!(t.primary_series.is_empty());
        assert!(t.secondary_series.is_empty());
    }
}
