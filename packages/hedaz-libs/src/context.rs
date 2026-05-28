use std::collections::HashMap;

use crate::currency::Currency;
use crate::units::{UnitGroup, UnitType};

/// Conversion context: default currency, per-group default unit types,
/// and a currency exchange-rate table.
pub struct Context {
    /// All monetary amounts are normalised to this currency.
    pub default_currency: Currency,
    /// Preferred output unit for each measurement group.
    pub unit_defaults: HashMap<UnitGroup, UnitType>,
    /// Exchange rates stored as `(from, to) → rate`, where
    /// `rate` = number of `to` units per 1 `from` unit.
    /// The inverse pair is checked automatically when a direct rate is absent.
    pub currency_rates: HashMap<(Currency, Currency), f64>,
}

impl Context {
    /// Create a context with sensible default units per group.
    ///
    /// | Group        | Default |
    /// |-------------|---------|
    /// | Weight       | kg      |
    /// | Volume       | L       |
    /// | Length       | m       |
    /// | Area         | sqm     |
    /// | Count / Pack | ea      |
    pub fn new(default_currency: Currency) -> Self {
        let mut unit_defaults = HashMap::new();
        unit_defaults.insert(UnitGroup::Weight,       UnitType::Kg);
        unit_defaults.insert(UnitGroup::Volume,       UnitType::L);
        unit_defaults.insert(UnitGroup::Length,       UnitType::M);
        unit_defaults.insert(UnitGroup::Area,         UnitType::Sqm);
        unit_defaults.insert(UnitGroup::CountAndPack, UnitType::Ea);
        unit_defaults.insert(UnitGroup::Unclassified, UnitType::Unclassified);

        Self {
            default_currency,
            unit_defaults,
            currency_rates: HashMap::new(),
        }
    }

    /// Override the default unit for a measurement group.
    pub fn set_unit_default(&mut self, group: UnitGroup, unit: UnitType) -> &mut Self {
        self.unit_defaults.insert(group, unit);
        self
    }

    /// Register an exchange rate: 1 `from` = `rate` `to`.
    /// You only need to insert one direction; the inverse is looked up automatically.
    pub fn add_rate(&mut self, from: Currency, to: Currency, rate: f64) -> &mut Self {
        self.currency_rates.insert((from, to), rate);
        self
    }

    // ── Currency conversion ────────────────────────────────────────────────────

    /// Convert `amount` (in `from` currency) to `self.default_currency`.
    ///
    /// Returns `None` if the rate is missing and `from` is not the default.
    pub fn convert_currency(&self, amount: f64, from: &Currency) -> Option<f64> {
        if from == &self.default_currency {
            return Some(amount);
        }
        let key = (from.clone(), self.default_currency.clone());
        if let Some(&rate) = self.currency_rates.get(&key) {
            return Some(amount * rate);
        }
        // Try inverse: (default → from) stored, so 1/rate converts from → default
        let inv = (self.default_currency.clone(), from.clone());
        if let Some(&rate) = self.currency_rates.get(&inv) {
            return Some(amount / rate);
        }
        None
    }

    // ── Unit conversion ────────────────────────────────────────────────────────

    /// Convert `unit_size` (measured in `unit_type`) to the context's default
    /// unit for that measurement group.
    ///
    /// Returns `None` when:
    /// - the group is `Unclassified`
    /// - the group is `CountAndPack` (no universal size conversion)
    /// - the group has no default registered in the context
    pub fn convert_unit(&self, unit_type: &UnitType, unit_size: f64) -> Option<(UnitType, f64)> {
        let group = unit_type.group();
        if matches!(group, UnitGroup::Unclassified | UnitGroup::CountAndPack) {
            return None;
        }
        let target = self.unit_defaults.get(&group)?;
        if unit_type == target {
            return Some((target.clone(), unit_size));
        }
        let base = to_base(unit_type, unit_size)?;
        let result = from_base(target, base)?;
        Some((target.clone(), result))
    }
}

// ── Internal conversion helpers ────────────────────────────────────────────────
//
// Each group uses a fixed base unit:
//   Weight → g  |  Volume → ml  |  Length → mm  |  Area → sqm

fn to_base(unit: &UnitType, size: f64) -> Option<f64> {
    Some(match unit {
        // Weight (base: g)
        UnitType::G  => size,
        UnitType::Kg => size * 1_000.0,
        UnitType::Mg => size / 1_000.0,
        UnitType::Lb => size * 453.592_37,
        UnitType::Oz => size * 28.349_523,
        UnitType::T  => size * 1_000_000.0,
        // Volume (base: ml)
        UnitType::Ml  => size,
        UnitType::L   => size * 1_000.0,
        UnitType::Cl  => size * 10.0,
        UnitType::FlOz => size * 29.573_53,
        // Length (base: mm)
        UnitType::Mm  => size,
        UnitType::Cm  => size * 10.0,
        UnitType::M   => size * 1_000.0,
        UnitType::Km  => size * 1_000_000.0,
        UnitType::Ft  => size * 304.8,
        UnitType::In  => size * 25.4,
        UnitType::Yd  => size * 914.4,
        // Area (base: sqm)
        UnitType::Sqm  => size,
        UnitType::Sqft => size * 0.092_903_04,
        // Count/Pack and Unclassified have no base
        _ => return None,
    })
}

fn from_base(unit: &UnitType, base: f64) -> Option<f64> {
    Some(match unit {
        // Weight from g
        UnitType::G  => base,
        UnitType::Kg => base / 1_000.0,
        UnitType::Mg => base * 1_000.0,
        UnitType::Lb => base / 453.592_37,
        UnitType::Oz => base / 28.349_523,
        UnitType::T  => base / 1_000_000.0,
        // Volume from ml
        UnitType::Ml  => base,
        UnitType::L   => base / 1_000.0,
        UnitType::Cl  => base / 10.0,
        UnitType::FlOz => base / 29.573_53,
        // Length from mm
        UnitType::Mm  => base,
        UnitType::Cm  => base / 10.0,
        UnitType::M   => base / 1_000.0,
        UnitType::Km  => base / 1_000_000.0,
        UnitType::Ft  => base / 304.8,
        UnitType::In  => base / 25.4,
        UnitType::Yd  => base / 914.4,
        // Area from sqm
        UnitType::Sqm  => base,
        UnitType::Sqft => base / 0.092_903_04,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usd_ctx() -> Context {
        Context::new(Currency::USD)
    }

    // ── Unit conversion ────────────────────────────────────────────────────────

    #[test]
    fn same_unit_returns_unchanged() {
        let ctx = usd_ctx();
        let (t, v) = ctx.convert_unit(&UnitType::Kg, 2.5).unwrap();
        assert_eq!(t, UnitType::Kg);
        assert!((v - 2.5).abs() < 1e-9);
    }

    #[test]
    fn converts_g_to_kg() {
        let ctx = usd_ctx(); // default weight: kg
        let (t, v) = ctx.convert_unit(&UnitType::G, 500.0).unwrap();
        assert_eq!(t, UnitType::Kg);
        assert!((v - 0.5).abs() < 1e-9);
    }

    #[test]
    fn converts_mg_to_kg() {
        let ctx = usd_ctx();
        let (t, v) = ctx.convert_unit(&UnitType::Mg, 1_000_000.0).unwrap();
        assert_eq!(t, UnitType::Kg);
        assert!((v - 1.0).abs() < 1e-9);
    }

    #[test]
    fn converts_lb_to_kg() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::Lb, 1.0).unwrap();
        assert!((v - 0.453_592_37).abs() < 1e-6);
    }

    #[test]
    fn converts_oz_to_kg() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::Oz, 16.0).unwrap();
        assert!((v - 0.453_592_37).abs() < 1e-5);
    }

    #[test]
    fn converts_t_to_kg() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::T, 1.0).unwrap();
        assert!((v - 1_000.0).abs() < 1e-9);
    }

    #[test]
    fn converts_ml_to_l() {
        let ctx = usd_ctx(); // default volume: L
        let (t, v) = ctx.convert_unit(&UnitType::Ml, 250.0).unwrap();
        assert_eq!(t, UnitType::L);
        assert!((v - 0.25).abs() < 1e-9);
    }

    #[test]
    fn converts_cl_to_l() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::Cl, 100.0).unwrap();
        assert!((v - 1.0).abs() < 1e-9);
    }

    #[test]
    fn converts_fl_oz_to_l() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::FlOz, 33.814).unwrap();
        assert!((v - 1.0).abs() < 1e-3);
    }

    #[test]
    fn converts_mm_to_m() {
        let ctx = usd_ctx(); // default length: m
        let (t, v) = ctx.convert_unit(&UnitType::Mm, 1_000.0).unwrap();
        assert_eq!(t, UnitType::M);
        assert!((v - 1.0).abs() < 1e-9);
    }

    #[test]
    fn converts_ft_to_m() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::Ft, 1.0).unwrap();
        assert!((v - 0.3048).abs() < 1e-9);
    }

    #[test]
    fn converts_yd_to_m() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::Yd, 1.0).unwrap();
        assert!((v - 0.9144).abs() < 1e-9);
    }

    #[test]
    fn converts_km_to_m() {
        let ctx = usd_ctx();
        let (_, v) = ctx.convert_unit(&UnitType::Km, 1.0).unwrap();
        assert!((v - 1_000.0).abs() < 1e-9);
    }

    #[test]
    fn converts_sqft_to_sqm() {
        let ctx = usd_ctx(); // default area: sqm
        // 1 sqm ≈ 10.7639 sqft → 10.7639 sqft ≈ 1 sqm
        let (t, v) = ctx.convert_unit(&UnitType::Sqft, 10.763_910_4).unwrap();
        assert_eq!(t, UnitType::Sqm);
        assert!((v - 1.0).abs() < 1e-5);
    }

    #[test]
    fn count_pack_returns_none() {
        let ctx = usd_ctx();
        assert!(ctx.convert_unit(&UnitType::Pk, 5.0).is_none());
        assert!(ctx.convert_unit(&UnitType::Ea, 1.0).is_none());
        assert!(ctx.convert_unit(&UnitType::Btl, 12.0).is_none());
    }

    #[test]
    fn unclassified_unit_returns_none() {
        let ctx = usd_ctx();
        assert!(ctx.convert_unit(&UnitType::Unclassified, 1.0).is_none());
    }

    #[test]
    fn custom_unit_default_is_respected() {
        let mut ctx = usd_ctx();
        ctx.set_unit_default(UnitGroup::Weight, UnitType::G);
        let (t, v) = ctx.convert_unit(&UnitType::Kg, 1.0).unwrap();
        assert_eq!(t, UnitType::G);
        assert!((v - 1_000.0).abs() < 1e-9);
    }

    // ── Currency conversion ────────────────────────────────────────────────────

    #[test]
    fn same_currency_returns_amount() {
        let ctx = usd_ctx();
        assert_eq!(ctx.convert_currency(100.0, &Currency::USD), Some(100.0));
    }

    #[test]
    fn direct_rate_converts() {
        let mut ctx = usd_ctx();
        ctx.add_rate(Currency::AUD, Currency::USD, 0.65);
        let result = ctx.convert_currency(100.0, &Currency::AUD).unwrap();
        assert!((result - 65.0).abs() < 1e-9);
    }

    #[test]
    fn inverse_rate_converts() {
        // Store USD→AUD = 1.54; convert 100 AUD → USD via inverse
        let mut ctx = usd_ctx();
        ctx.add_rate(Currency::USD, Currency::AUD, 1.54);
        let result = ctx.convert_currency(100.0, &Currency::AUD).unwrap();
        assert!((result - 100.0 / 1.54).abs() < 1e-6);
    }

    #[test]
    fn missing_rate_returns_none() {
        let ctx = usd_ctx();
        assert!(ctx.convert_currency(100.0, &Currency::KES).is_none());
    }

    #[test]
    fn multi_currency_lookup() {
        let mut ctx = usd_ctx();
        ctx.add_rate(Currency::KES, Currency::USD, 0.0077);
        ctx.add_rate(Currency::AUD, Currency::USD, 0.65);
        assert!((ctx.convert_currency(1000.0, &Currency::KES).unwrap() - 7.7).abs() < 1e-6);
        assert!((ctx.convert_currency(200.0, &Currency::AUD).unwrap() - 130.0).abs() < 1e-6);
    }
}
