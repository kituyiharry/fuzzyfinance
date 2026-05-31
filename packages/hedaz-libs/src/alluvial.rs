use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::categories::{PrimaryCategory, SecondaryCategory};
use crate::context::Context;
use crate::currency::Currency;
use crate::models::ReceiptRow;
use crate::units::{UnitGroup, UnitType};

// ── Data types ────────────────────────────────────────────────────────────────

/// Per-`UnitGroup` totals: each value is the sum of `qty * unit_size` for
/// matching line items, converted to the context's default unit for that group.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct UnitTotals {
    pub by_group: HashMap<UnitGroup, f64>,
}

/// A grouped aggregation: total price (in the context's default currency)
/// plus per-group unit totals.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategoryAgg<K> {
    pub key: K,
    pub total_price: f64,
    pub unit_totals: UnitTotals,
}

/// Tier a node sits at in the four-level Alluvial.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NodeLevel {
    Merchant,
    PrimaryCategory,
    SecondaryCategory,
    Product,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlluvialNode {
    pub id: String,
    pub label: String,
    pub level: NodeLevel,
    pub total_price: f64,
    pub unit_totals: UnitTotals,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlluvialLink {
    pub source: String,
    pub target: String,
    pub value: f64,
    pub unit_totals: UnitTotals,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlluvialData {
    pub nodes: Vec<AlluvialNode>,
    pub links: Vec<AlluvialLink>,
}

/// Failure modes for the aggregation routines.
#[derive(Debug, Clone, PartialEq)]
pub enum AggregationError {
    /// A row's currency couldn't be converted to the context's default
    /// because no rate is registered (either direction).
    MissingExchangeRate { from: Currency, to: Currency },
}

impl std::fmt::Display for AggregationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingExchangeRate { from, to } => write!(
                f,
                "no exchange rate registered for {:?} -> {:?}",
                from, to,
            ),
        }
    }
}

impl std::error::Error for AggregationError {}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Trim, collapse internal whitespace, lowercase.
fn normalise_description(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Convert a row's `line_item_total` to the context's default currency.
/// `Ok(None)` if the row has no `line_item_total`.
/// `Err(MissingExchangeRate)` if conversion isn't possible.
fn row_price_in_default(
    row: &ReceiptRow,
    ctx: &Context,
) -> Result<Option<f64>, AggregationError> {
    let Some(price) = row.line_item_total else {
        return Ok(None);
    };
    match ctx.convert_currency(price, &row.currency) {
        Some(v) => Ok(Some(v)),
        None => Err(AggregationError::MissingExchangeRate {
            from: row.currency.clone(),
            to: ctx.default_currency.clone(),
        }),
    }
}

/// Compute `(UnitGroup, converted_value)` for a row's `qty * unit_size`,
/// converted to the context's default unit for that group.
/// `None` if any required field is missing/unclassified.
///
/// Count/Pack units (pk, ct, ea, …) have no mathematical conversion factor
/// between each other, so they pass through unconverted under the
/// `CountAndPack` group.
fn row_unit_contribution(
    row: &ReceiptRow,
    ctx: &Context,
) -> Option<(UnitGroup, f64)> {
    let qty = row.qty?;
    let unit_size = row.unit_size?;
    if row.unit_type == UnitType::Unclassified {
        return None;
    }
    let group = row.unit_type.group();
    let total_size = qty * unit_size;
    if group == UnitGroup::CountAndPack {
        return Some((group, total_size));
    }
    let (target_unit, converted) = ctx.convert_unit(&row.unit_type, total_size)?;
    Some((target_unit.group(), converted))
}

fn accumulate(totals: &mut UnitTotals, group: UnitGroup, value: f64) {
    *totals.by_group.entry(group).or_insert(0.0) += value;
}

fn primary_label(p: &PrimaryCategory) -> String {
    serde_json::to_value(p)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default()
}

fn secondary_label(s: &SecondaryCategory) -> String {
    serde_json::to_value(s)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default()
}

const MISSING_MERCHANT: &str = "(unknown merchant)";
const MISSING_DESCRIPTION: &str = "(no description)";

fn merchant_label(row: &ReceiptRow) -> String {
    if row.merchant.trim().is_empty() {
        MISSING_MERCHANT.to_owned()
    } else {
        row.merchant.clone()
    }
}

fn product_label(row: &ReceiptRow) -> String {
    let normalised = row
        .line_item_description
        .as_deref()
        .map(normalise_description)
        .unwrap_or_default();
    if normalised.is_empty() {
        MISSING_DESCRIPTION.to_owned()
    } else {
        normalised
    }
}

// ── Aggregation routines ──────────────────────────────────────────────────────

/// Common loop that splits rows into buckets keyed by `K`.
fn aggregate_by<K, F>(
    rows: &[ReceiptRow],
    ctx: &Context,
    key_of: F,
) -> Result<HashMap<K, CategoryAgg<K>>, AggregationError>
where
    K: Eq + std::hash::Hash + Clone,
    F: Fn(&ReceiptRow) -> K,
{
    let mut buckets: HashMap<K, CategoryAgg<K>> = HashMap::new();
    for row in rows {
        let price = row_price_in_default(row, ctx)?;
        let unit_contrib = row_unit_contribution(row, ctx);
        if price.is_none() && unit_contrib.is_none() {
            continue;
        }
        let key = key_of(row);
        let agg = buckets.entry(key.clone()).or_insert_with(|| CategoryAgg {
            key,
            total_price: 0.0,
            unit_totals: UnitTotals::default(),
        });
        if let Some(p) = price {
            agg.total_price += p;
        }
        if let Some((g, v)) = unit_contrib {
            accumulate(&mut agg.unit_totals, g, v);
        }
    }
    Ok(buckets)
}

pub fn aggregate_by_secondary_category(
    rows: &[ReceiptRow],
    ctx: &Context,
) -> Result<Vec<CategoryAgg<SecondaryCategory>>, AggregationError> {
    let mut out: Vec<_> = aggregate_by(rows, ctx, |r| r.secondary_category.clone())?
        .into_values()
        .collect();
    out.sort_by_key(|a| format!("{:?}", a.key));
    Ok(out)
}

pub fn aggregate_by_primary_category(
    rows: &[ReceiptRow],
    ctx: &Context,
) -> Result<Vec<CategoryAgg<PrimaryCategory>>, AggregationError> {
    let mut out: Vec<_> = aggregate_by(rows, ctx, |r| r.primary_category.clone())?
        .into_values()
        .collect();
    out.sort_by_key(|a| format!("{:?}", a.key));
    Ok(out)
}

pub fn aggregate_by_merchant_primary(
    rows: &[ReceiptRow],
    ctx: &Context,
) -> Result<Vec<CategoryAgg<(String, PrimaryCategory)>>, AggregationError> {
    let mut out: Vec<_> = aggregate_by(rows, ctx, |r| {
        (merchant_label(r), r.primary_category.clone())
    })?
    .into_values()
    .collect();
    out.sort_by(|a, b| {
        let ka = (&a.key.0, format!("{:?}", a.key.1));
        let kb = (&b.key.0, format!("{:?}", b.key.1));
        ka.cmp(&kb)
    });
    Ok(out)
}

// ── Alluvial diagram ──────────────────────────────────────────────────────────

fn upsert_node(
    nodes: &mut HashMap<String, AlluvialNode>,
    id: &str,
    label: &str,
    level: NodeLevel,
    price: f64,
    unit_contrib: Option<(UnitGroup, f64)>,
) {
    let node = nodes.entry(id.to_owned()).or_insert_with(|| AlluvialNode {
        id: id.to_owned(),
        label: label.to_owned(),
        level,
        total_price: 0.0,
        unit_totals: UnitTotals::default(),
    });
    node.total_price += price;
    if let Some((g, v)) = unit_contrib {
        accumulate(&mut node.unit_totals, g, v);
    }
}

fn upsert_link(
    links: &mut HashMap<(String, String), AlluvialLink>,
    source: &str,
    target: &str,
    price: f64,
    unit_contrib: Option<(UnitGroup, f64)>,
) {
    let link = links
        .entry((source.to_owned(), target.to_owned()))
        .or_insert_with(|| AlluvialLink {
            source: source.to_owned(),
            target: target.to_owned(),
            value: 0.0,
            unit_totals: UnitTotals::default(),
        });
    link.value += price;
    if let Some((g, v)) = unit_contrib {
        accumulate(&mut link.unit_totals, g, v);
    }
}

pub fn build_alluvial_data(
    rows: &[ReceiptRow],
    ctx: &Context,
) -> Result<AlluvialData, AggregationError> {
    let mut nodes: HashMap<String, AlluvialNode> = HashMap::new();
    let mut links: HashMap<(String, String), AlluvialLink> = HashMap::new();

    for row in rows {
        let price_opt = row_price_in_default(row, ctx)?;
        let unit_contrib = row_unit_contribution(row, ctx);
        if price_opt.is_none() && unit_contrib.is_none() {
            continue;
        }
        let price = price_opt.unwrap_or(0.0);

        let m_label = merchant_label(row);
        let p_label = primary_label(&row.primary_category);
        let s_label = secondary_label(&row.secondary_category);
        let d_label = product_label(row);

        let m_id = format!("merchant:{}", m_label);
        let p_id = format!("primary:{}", p_label);
        let s_id = format!("secondary:{}", s_label);
        let d_id = format!("product:{}", d_label);

        upsert_node(&mut nodes, &m_id, &m_label, NodeLevel::Merchant,         price, unit_contrib);
        upsert_node(&mut nodes, &p_id, &p_label, NodeLevel::PrimaryCategory,  price, unit_contrib);
        upsert_node(&mut nodes, &s_id, &s_label, NodeLevel::SecondaryCategory, price, unit_contrib);
        upsert_node(&mut nodes, &d_id, &d_label, NodeLevel::Product,          price, unit_contrib);

        upsert_link(&mut links, &m_id, &p_id, price, unit_contrib);
        upsert_link(&mut links, &p_id, &s_id, price, unit_contrib);
        upsert_link(&mut links, &s_id, &d_id, price, unit_contrib);
    }

    let mut nodes_vec: Vec<AlluvialNode> = nodes.into_values().collect();
    nodes_vec.sort_by(|a, b| (a.level as u8, &a.label).cmp(&(b.level as u8, &b.label)));

    let mut links_vec: Vec<AlluvialLink> = links.into_values().collect();
    links_vec.sort_by(|a, b| (&a.source, &a.target).cmp(&(&b.source, &b.target)));

    Ok(AlluvialData {
        nodes: nodes_vec,
        links: links_vec,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use serde_json::json;

use crate::{alluvial, models::parse_receipt_csv};
    use super::*;
    const RECEIPT_CSV: &str =
        include_str!("../sample/samplerecords_2026_05-27_13receipts.csv");

    #[allow(clippy::too_many_arguments)]
    fn row(
        merchant: &str,
        line_item_description: Option<&str>,
        qty: Option<f64>,
        line_item_total: Option<f64>,
        unit_size: Option<f64>,
        unit_type: UnitType,
        primary_category: PrimaryCategory,
        secondary_category: SecondaryCategory,
        currency: Currency,
    ) -> ReceiptRow {
        ReceiptRow {
            receipt_id: "rx-test".to_owned(),
            merchant: merchant.to_owned(),
            receipt_date: "2026-05-29".to_owned(),
            uploaded_at: "2026-05-29 00:00:00".to_owned(),
            category: "Groceries".to_owned(),
            tags: vec![],
            receipt_total: 0.0,
            currency,
            line_item_description: line_item_description.map(String::from),
            qty,
            unit_price: None,
            line_item_total,
            unit_size,
            unit_type,
            primary_category,
            secondary_category,
        }
    }

    fn approx(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    // #[test]
    // fn print_sample_data() {
    //     let rows = parse_receipt_csv(RECEIPT_CSV);
    //     let ctx = Context::new(Currency::AUD);
    //     let alluvial = build_alluvial_data(&rows, &ctx).unwrap();
    //     let allstr = serde_json::ser::to_string(&alluvial).unwrap();
    //     eprintln!("{allstr}");
    // }

    // ── 1. Happy path: single currency, two merchants, two primaries ─────────
    #[test]
    fn happy_path_single_currency() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Coles", Some("Milk 1L"),  Some(1.0), Some(4.00), Some(1.0),   UnitType::L,  PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs,  Currency::AUD),
            row("Coles", Some("Soap 500g"), Some(1.0), Some(6.50), Some(500.0), UnitType::G,  PrimaryCategory::HealthAndBeauty, SecondaryCategory::ShowerBathAndSoap, Currency::AUD),
            row("Woolies", Some("Cheese 250g"), Some(2.0), Some(5.00), Some(250.0), UnitType::G, PrimaryCategory::FoodAndGrocery, SecondaryCategory::DairyAndEggs, Currency::AUD),
        ];

        let by_sec = aggregate_by_secondary_category(&rows, &ctx).unwrap();
        let dairy = by_sec.iter().find(|a| a.key == SecondaryCategory::DairyAndEggs).unwrap();
        assert!(approx(dairy.total_price, 9.00));

        let by_prim = aggregate_by_primary_category(&rows, &ctx).unwrap();
        let food = by_prim.iter().find(|a| a.key == PrimaryCategory::FoodAndGrocery).unwrap();
        assert!(approx(food.total_price, 9.00));
        let hb = by_prim.iter().find(|a| a.key == PrimaryCategory::HealthAndBeauty).unwrap();
        assert!(approx(hb.total_price, 6.50));

        let by_mp = aggregate_by_merchant_primary(&rows, &ctx).unwrap();
        let coles_food = by_mp.iter()
            .find(|a| a.key.0 == "Coles" && a.key.1 == PrimaryCategory::FoodAndGrocery)
            .unwrap();
        assert!(approx(coles_food.total_price, 4.00));
        let woolies_food = by_mp.iter()
            .find(|a| a.key.0 == "Woolies" && a.key.1 == PrimaryCategory::FoodAndGrocery)
            .unwrap();
        assert!(approx(woolies_food.total_price, 5.00));

        let alluvial = build_alluvial_data(&rows, &ctx).unwrap();
        // 2 merchants + 2 primaries + 2 secondaries + 3 products = 9 nodes
        assert_eq!(alluvial.nodes.len(), 9);
    }

    // ── 2. Multi-currency with a registered rate ─────────────────────────────
    #[test]
    fn multi_currency_with_rate() {
        let mut ctx = Context::new(Currency::AUD);
        ctx.add_rate(Currency::KES, Currency::AUD, 0.012);
        let rows = vec![
            row("Coles", Some("Bread"), Some(1.0), Some(100.0), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::BakeryAndBread, Currency::AUD),
            row("Naivas", Some("Bread"), Some(1.0), Some(1000.0), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::BakeryAndBread, Currency::KES),
        ];

        let by_prim = aggregate_by_primary_category(&rows, &ctx).unwrap();
        let food = by_prim.iter().find(|a| a.key == PrimaryCategory::FoodAndGrocery).unwrap();
        // 100 AUD + (1000 KES * 0.012) = 112 AUD
        assert!(approx(food.total_price, 112.0));
    }

    // ── 3. Missing rate → all four routines error ────────────────────────────
    #[test]
    fn missing_rate_errors_all_routines() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Naivas", Some("Bread"), Some(1.0), Some(1000.0), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::BakeryAndBread, Currency::KES),
        ];

        let expected = AggregationError::MissingExchangeRate {
            from: Currency::KES,
            to: Currency::AUD,
        };
        assert_eq!(aggregate_by_secondary_category(&rows, &ctx).unwrap_err(), expected);
        assert_eq!(aggregate_by_primary_category(&rows, &ctx).unwrap_err(), expected);
        assert_eq!(aggregate_by_merchant_primary(&rows, &ctx).unwrap_err(), expected);
        assert_eq!(build_alluvial_data(&rows, &ctx).unwrap_err(), expected);
    }

    // ── 4. Per-group unit totals (Weight + Volume + Count/Pack) ──────────────
    #[test]
    fn per_group_unit_totals() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Coles", Some("a"), Some(1.0), Some(1.0), Some(500.0), UnitType::G,  PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
            row("Coles", Some("b"), Some(1.0), Some(1.0), Some(1.0),   UnitType::Kg, PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
            row("Coles", Some("c"), Some(1.0), Some(1.0), Some(250.0), UnitType::Ml, PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
            row("Coles", Some("d"), Some(1.0), Some(1.0), Some(5.0),   UnitType::Pk, PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
        ];

        let by_prim = aggregate_by_primary_category(&rows, &ctx).unwrap();
        let food = &by_prim[0];
        let weight = food.unit_totals.by_group.get(&UnitGroup::Weight).copied().unwrap_or(0.0);
        let volume = food.unit_totals.by_group.get(&UnitGroup::Volume).copied().unwrap_or(0.0);
        let count  = food.unit_totals.by_group.get(&UnitGroup::CountAndPack).copied().unwrap_or(0.0);
        assert!(approx(weight, 1.5), "weight was {}", weight);
        assert!(approx(volume, 0.25), "volume was {}", volume);
        assert!(approx(count,  5.0), "count was {}", count);
    }

    // ── 5. qty × unit_size aggregation ───────────────────────────────────────
    #[test]
    fn qty_times_unit_size() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Coles", Some("a"), Some(2.0), Some(1.0), Some(375.0), UnitType::G,  PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
            row("Coles", Some("b"), Some(1.0), Some(1.0), Some(1.0),   UnitType::Kg, PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
        ];

        let by_sec = aggregate_by_secondary_category(&rows, &ctx).unwrap();
        let bucket = &by_sec[0];
        let weight = bucket.unit_totals.by_group.get(&UnitGroup::Weight).copied().unwrap();
        // 2 * 375g = 750g = 0.75 kg + 1 kg = 1.75 kg
        assert!(approx(weight, 1.75), "weight was {}", weight);
    }

    // ── 6. Rows with missing fields are partially skipped ────────────────────
    #[test]
    fn skips_rows_with_missing_fields() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            // No price: excluded from price totals, but unit_size still contributes
            row("Coles", Some("a"), Some(1.0), None,        Some(500.0), UnitType::G,            PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
            // No unit_size: excluded from unit totals, price still contributes
            row("Coles", Some("b"), Some(1.0), Some(10.00), None,        UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
            // Neither price nor unit info: completely skipped
            row("Coles", Some("c"), None,      None,        None,        UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::PantryAndDryGoods, Currency::AUD),
        ];

        let by_prim = aggregate_by_primary_category(&rows, &ctx).unwrap();
        let food = &by_prim[0];
        assert!(approx(food.total_price, 10.00));
        let weight = food.unit_totals.by_group.get(&UnitGroup::Weight).copied().unwrap();
        assert!(approx(weight, 0.5));
    }

    // ── 7. Description normalisation collapses near-duplicates ───────────────
    #[test]
    fn description_normalisation_dedups_products() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Coles", Some("RIBENA  1L"),     Some(1.0), Some(7.40), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::Beverages, Currency::AUD),
            row("Coles", Some("ribena 1l"),       Some(1.0), Some(7.40), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::Beverages, Currency::AUD),
            row("Coles", Some("  RIBENA 1L  "),  Some(1.0), Some(7.40), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::Beverages, Currency::AUD),
            row("Coles", Some("RIBENA BLACK"),   Some(1.0), Some(7.40), None, UnitType::Unclassified, PrimaryCategory::FoodAndGrocery, SecondaryCategory::Beverages, Currency::AUD),
        ];

        let alluvial = build_alluvial_data(&rows, &ctx).unwrap();
        let products: Vec<_> = alluvial.nodes.iter()
            .filter(|n| n.level == NodeLevel::Product)
            .collect();
        assert_eq!(products.len(), 2);

        let ribena_1l = products.iter().find(|n| n.label == "ribena 1l").unwrap();
        assert!(approx(ribena_1l.total_price, 22.20));

        let ribena_black = products.iter().find(|n| n.label == "ribena black").unwrap();
        assert!(approx(ribena_black.total_price, 7.40));
    }

    // ── 8. Alluvial structure invariants ─────────────────────────────────────
    #[test]
    fn alluvial_structure_invariants() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Coles",   Some("Milk 1L"),     Some(1.0), Some(4.00), Some(1.0),   UnitType::L,  PrimaryCategory::FoodAndGrocery,  SecondaryCategory::DairyAndEggs,       Currency::AUD),
            row("Coles",   Some("Soap 500g"),   Some(1.0), Some(6.50), Some(500.0), UnitType::G,  PrimaryCategory::HealthAndBeauty, SecondaryCategory::ShowerBathAndSoap,  Currency::AUD),
            row("Woolies", Some("Cheese 250g"), Some(2.0), Some(5.00), Some(250.0), UnitType::G,  PrimaryCategory::FoodAndGrocery,  SecondaryCategory::DairyAndEggs,       Currency::AUD),
        ];

        let alluvial = build_alluvial_data(&rows, &ctx).unwrap();

        // Node count: 2 merchants + 2 primaries + 2 secondaries + 3 products = 9
        let merchant_count  = alluvial.nodes.iter().filter(|n| n.level == NodeLevel::Merchant).count();
        let primary_count   = alluvial.nodes.iter().filter(|n| n.level == NodeLevel::PrimaryCategory).count();
        let secondary_count = alluvial.nodes.iter().filter(|n| n.level == NodeLevel::SecondaryCategory).count();
        let product_count   = alluvial.nodes.iter().filter(|n| n.level == NodeLevel::Product).count();
        assert_eq!(merchant_count, 2);
        assert_eq!(primary_count, 2);
        assert_eq!(secondary_count, 2);
        assert_eq!(product_count, 3);

        // Per-merchant outflow sum equals merchant node total_price
        for n in alluvial.nodes.iter().filter(|n| n.level == NodeLevel::Merchant) {
            let outflow: f64 = alluvial.links.iter()
                .filter(|l| l.source == n.id)
                .map(|l| l.value)
                .sum();
            assert!(approx(outflow, n.total_price),
                "merchant {} outflow={} total_price={}", n.label, outflow, n.total_price);
        }

        // Per-product inflow sum equals product node total_price
        for n in alluvial.nodes.iter().filter(|n| n.level == NodeLevel::Product) {
            let inflow: f64 = alluvial.links.iter()
                .filter(|l| l.target == n.id)
                .map(|l| l.value)
                .sum();
            assert!(approx(inflow, n.total_price),
                "product {} inflow={} total_price={}", n.label, inflow, n.total_price);
        }

        // Every link's source and target reference an existing node
        let node_ids: std::collections::HashSet<_> =
            alluvial.nodes.iter().map(|n| n.id.as_str()).collect();
        for l in &alluvial.links {
            assert!(node_ids.contains(l.source.as_str()), "missing source: {}", l.source);
            assert!(node_ids.contains(l.target.as_str()), "missing target: {}", l.target);
        }

        // Total receipt-level price = sum of all merchant nodes
        let total: f64 = alluvial.nodes.iter()
            .filter(|n| n.level == NodeLevel::Merchant)
            .map(|n| n.total_price)
            .sum();
        assert!(approx(total, 15.50));
    }

    // ── 9. Unclassified rows are not silently dropped ────────────────────────
    #[test]
    fn unclassified_rows_aggregate_under_unclassified() {
        let ctx = Context::new(Currency::AUD);
        let rows = vec![
            row("Coles", Some("Mystery"), Some(1.0), Some(3.00), None, UnitType::Unclassified,
                PrimaryCategory::Unclassified, SecondaryCategory::Unclassified, Currency::AUD),
        ];

        let by_prim = aggregate_by_primary_category(&rows, &ctx).unwrap();
        assert_eq!(by_prim.len(), 1);
        assert_eq!(by_prim[0].key, PrimaryCategory::Unclassified);
        assert!(approx(by_prim[0].total_price, 3.00));

        let by_sec = aggregate_by_secondary_category(&rows, &ctx).unwrap();
        assert_eq!(by_sec.len(), 1);
        assert_eq!(by_sec[0].key, SecondaryCategory::Unclassified);

        let alluvial = build_alluvial_data(&rows, &ctx).unwrap();
        assert!(alluvial.nodes.iter().any(|n| n.label == "Unclassified"
            && n.level == NodeLevel::PrimaryCategory));
        assert!(alluvial.nodes.iter().any(|n| n.label == "Unclassified"
            && n.level == NodeLevel::SecondaryCategory));
    }
}
