use serde::{Deserialize, Serialize};

use crate::categories::{PrimaryCategory, SecondaryCategory};
use crate::currency::Currency;
use crate::units::UnitType;
use crate::csv::parse_rows;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn req(s: &str) -> String {
    s.trim().to_owned()
}

fn opt_str(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() { None } else { Some(t.to_owned()) }
}

fn opt_f64(s: &str) -> Option<f64> {
    s.trim().parse::<f64>().ok()
}

/// Tags are stored as a semicolon-separated string; split and trim each tag.
fn parse_tags(s: &str) -> Vec<String> {
    s.trim()
        .split(';')
        .map(|t| t.trim().to_owned())
        .filter(|t| !t.is_empty())
        .collect()
}

// ── Receipt ───────────────────────────────────────────────────────────────────
//
// CSV columns (index):
//  0  Receipt ID
//  1  Merchant
//  2  Receipt Date        (YYYY-MM-DD)
//  3  Uploaded At         (YYYY-MM-DD HH:MM:SS)
//  4  Category
//  5  Tags                ("; "-separated)
//  6  Receipt Total
//  7  Currency
//  8  Line Item Description
//  9  Qty
// 10  Unit Price
// 11  Line Item Total
// 12  Unit Size
// 13  Unit Type
// 14  Primary Category
// 15  Secondary Category

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReceiptRow {
    pub receipt_id: String,
    pub merchant: String,
    pub receipt_date: String,
    pub uploaded_at: String,
    pub category: String,
    pub tags: Vec<String>,
    pub receipt_total: f64,
    pub currency: Currency,
    pub line_item_description: Option<String>,
    pub qty: Option<f64>,
    pub unit_price: Option<f64>,
    pub line_item_total: Option<f64>,
    pub unit_size: Option<f64>,
    pub unit_type: UnitType,
    pub primary_category: PrimaryCategory,
    pub secondary_category: SecondaryCategory,
}

impl ReceiptRow {
    fn from_fields(f: &[String]) -> Option<Self> {
        if f.len() < 16 {
            return None;
        }
        Some(ReceiptRow {
            receipt_id:            req(&f[0]),
            merchant:              req(&f[1]),
            receipt_date:          req(&f[2]),
            uploaded_at:           req(&f[3]),
            category:              req(&f[4]),
            tags:                  parse_tags(&f[5]),
            receipt_total:         opt_f64(&f[6])?,
            currency:              f[7].parse().unwrap_or_default(),
            line_item_description: opt_str(&f[8]),
            qty:                   opt_f64(&f[9]),
            unit_price:            opt_f64(&f[10]),
            line_item_total:       opt_f64(&f[11]),
            unit_size:             opt_f64(&f[12]),
            unit_type:             f[13].parse().unwrap_or_default(),
            primary_category:      f[14].parse().unwrap_or_default(),
            secondary_category:    f[15].parse().unwrap_or_default(),
        })
    }
}

/// Parse a FuzzyFinance receipt export CSV into typed rows.
/// Rows that are malformed (e.g. missing required fields) are silently skipped.
pub fn parse_receipt_csv(csv: &str) -> Vec<ReceiptRow> {
    parse_rows(csv)
        .into_iter()
        .filter_map(|row| ReceiptRow::from_fields(&row))
        .collect()
}

// ── Sale ──────────────────────────────────────────────────────────────────────
//
// CSV columns (index):
//  0  Sale ID
//  1  Sale Date           (YYYY-MM-DD)
//  2  Uploaded At         (YYYY-MM-DD HH:MM:SS)
//  3  Category
//  4  Tags                ("; "-separated)
//  5  Total Revenue
//  6  Total Cost
//  7  Total Margin
//  8  Currency
//  9  Line Item Description
// 10  Type                ("product" | "service")
// 11  Units Sold
// 12  Buy Price
// 13  Sell Price
// 14  Margin %
// 15  Line Item Total
// 16  Line Item Total Cost
// 17  Unit Size
// 18  Unit Type
// 19  Primary Category
// 20  Secondary Category

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SaleRow {
    pub sale_id: String,
    pub sale_date: String,
    pub uploaded_at: String,
    pub category: String,
    pub tags: Vec<String>,
    pub total_revenue: f64,
    pub total_cost: Option<f64>,
    pub total_margin: Option<f64>,
    pub currency: Currency,
    pub line_item_description: Option<String>,
    /// "product" | "service" | None (for summary rows with no line items)
    pub item_type: Option<String>,
    pub units_sold: Option<f64>,
    pub buy_price: Option<f64>,
    pub sell_price: Option<f64>,
    pub margin_pct: Option<f64>,
    pub line_item_total: Option<f64>,
    pub line_item_total_cost: Option<f64>,
    pub unit_size: Option<f64>,
    pub unit_type: UnitType,
    pub primary_category: PrimaryCategory,
    pub secondary_category: SecondaryCategory,
}

impl SaleRow {
    fn from_fields(f: &[String]) -> Option<Self> {
        if f.len() < 21 {
            return None;
        }
        Some(SaleRow {
            sale_id:               req(&f[0]),
            sale_date:             req(&f[1]),
            uploaded_at:           req(&f[2]),
            category:              req(&f[3]),
            tags:                  parse_tags(&f[4]),
            total_revenue:         opt_f64(&f[5])?,
            total_cost:            opt_f64(&f[6]),
            total_margin:          opt_f64(&f[7]),
            currency:              f[8].parse().unwrap_or_default(),
            line_item_description: opt_str(&f[9]),
            item_type:             opt_str(&f[10]),
            units_sold:            opt_f64(&f[11]),
            buy_price:             opt_f64(&f[12]),
            sell_price:            opt_f64(&f[13]),
            margin_pct:            opt_f64(&f[14]),
            line_item_total:       opt_f64(&f[15]),
            line_item_total_cost:  opt_f64(&f[16]),
            unit_size:             opt_f64(&f[17]),
            unit_type:             f[18].parse().unwrap_or_default(),
            primary_category:      f[19].parse().unwrap_or_default(),
            secondary_category:    f[20].parse().unwrap_or_default(),
        })
    }
}

/// Parse a FuzzyFinance sale export CSV into typed rows.
/// Rows that are malformed (e.g. missing required fields) are silently skipped.
pub fn parse_sale_csv(csv: &str) -> Vec<SaleRow> {
    parse_rows(csv)
        .into_iter()
        .filter_map(|row| SaleRow::from_fields(&row))
        .collect()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const RECEIPT_CSV: &str =
        include_str!("../sample/samplerecords_2026_05-27_13receipts.csv");
    const SALE_CSV: &str =
        include_str!("../sample/samplerecords_2026_05-28_8sales.csv");

    // ── Receipt ───────────────────────────────────────────────────────────────

    #[test]
    fn receipt_parses_many_rows() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        assert!(rows.len() > 50, "got {} rows", rows.len());
    }

    #[test]
    fn receipt_first_row_required_fields() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        let r = &rows[0];
        assert_eq!(r.receipt_id, "014697c3-a89a-456a-b073-a7e78ed3dbff");
        assert_eq!(r.merchant, "Coles Supermarkets Australia Pty Ltd");
        assert_eq!(r.receipt_date, "2026-04-20");
        assert_eq!(r.category, "Groceries");
        assert!((r.receipt_total - 77.39).abs() < 0.01);
        assert_eq!(r.currency, Currency::AUD);
    }

    #[test]
    fn receipt_no_category_gives_unclassified() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        // Early receipts have no primary/secondary category data
        let r = rows.iter()
            .find(|r| r.receipt_id == "014697c3-a89a-456a-b073-a7e78ed3dbff")
            .unwrap();
        assert_eq!(r.primary_category, PrimaryCategory::Unclassified);
        assert_eq!(r.secondary_category, SecondaryCategory::Unclassified);
    }

    #[test]
    fn receipt_known_categories_parse_to_enum() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        // Receipt e8fc7d74 has items classified under "Food & Grocery"
        let r = rows.iter()
            .find(|r| {
                r.receipt_id == "e8fc7d74-23ff-49df-9c71-f33a4609c6a7"
                    && r.primary_category != PrimaryCategory::Unclassified
            })
            .expect("should find a classified row from receipt e8fc7d74");
        assert_eq!(r.primary_category, PrimaryCategory::FoodAndGrocery);
    }

    #[test]
    fn receipt_secondary_with_embedded_comma_parses_correctly() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        // "Shower, Bath & Soap" contains a comma — must parse as a single quoted
        // field and resolve to the correct enum variant, not Unclassified
        let r = rows.iter()
            .find(|r| {
                r.receipt_id == "afbd196d-0ea2-4003-b6d8-d46dbca469ae"
                    && r.secondary_category == SecondaryCategory::ShowerBathAndSoap
            })
            .expect("should find row with ShowerBathAndSoap secondary");
        assert_eq!(r.primary_category, PrimaryCategory::HealthAndBeauty);
    }

    #[test]
    fn receipt_secondary_condiments_with_comma() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        // "Condiments, Sauces & Spreads" also has an embedded comma
        let r = rows.iter()
            .find(|r| r.secondary_category == SecondaryCategory::CondimentsSaucesAndSpreads)
            .expect("should find a CondimentsSaucesAndSpreads row");
        assert_eq!(r.primary_category, PrimaryCategory::FoodAndGrocery);
    }

    #[test]
    fn receipt_tags_split_correctly() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        let r = &rows[0];
        assert!(r.tags.contains(&"groceries".to_owned()));
        assert!(r.tags.contains(&"coles".to_owned()));
        assert!(r.tags.contains(&"cleaning".to_owned()));
    }

    #[test]
    fn receipt_line_item_fields_present() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        let r = &rows[0]; // RIBENA BLACKCURRANT 1LITRE
        assert_eq!(r.line_item_description.as_deref(), Some("RIBENA BLACKCURRANT 1LITRE"));
        assert_eq!(r.qty, Some(1.0));
        assert_eq!(r.unit_price, Some(7.40));
        assert_eq!(r.line_item_total, Some(7.40));
        assert_eq!(r.unit_size, None);
        assert_eq!(r.unit_type, UnitType::Unclassified);
    }

    #[test]
    fn receipt_unit_size_and_type_parsed() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        // 74ed8f0d has items with g, kg, ml, pk — first classified item is "g"
        let r = rows.iter()
            .find(|r| {
                r.receipt_id == "74ed8f0d-a564-4969-807c-fa8762651222"
                    && r.unit_type == UnitType::G
            })
            .expect("should find a row with UnitType::G from receipt 74ed8f0d");
        assert!(r.unit_size.is_some());
        assert_eq!(r.unit_type, UnitType::G);
        // spot-check that other unit types from the same receipt parse too
        assert!(rows.iter().any(|r| {
            r.receipt_id == "74ed8f0d-a564-4969-807c-fa8762651222"
                && r.unit_type == UnitType::Ml
        }));
        assert!(rows.iter().any(|r| {
            r.receipt_id == "74ed8f0d-a564-4969-807c-fa8762651222"
                && r.unit_type == UnitType::Pk
        }));
    }

    #[test]
    fn receipt_negative_line_item_total_parsed() {
        let rows = parse_receipt_csv(RECEIPT_CSV);
        let r = rows.iter()
            .find(|r| r.line_item_total.is_some_and(|t| t < 0.0))
            .expect("should find at least one discount row");
        assert!(r.line_item_total.unwrap() < 0.0);
    }

    // ── Sale ──────────────────────────────────────────────────────────────────

    #[test]
    fn sale_parses_all_records() {
        let rows = parse_sale_csv(SALE_CSV);
        assert!(rows.len() >= 8, "got {} rows", rows.len());
    }

    #[test]
    fn sale_no_category_gives_unclassified() {
        let rows = parse_sale_csv(SALE_CSV);
        // Most sales in the sample have no category data
        let r = rows.iter()
            .find(|r| r.sale_id == "d05e06a7-b0a9-4f4d-adb7-ad3ed054b461")
            .unwrap();
        assert_eq!(r.primary_category, PrimaryCategory::Unclassified);
        assert_eq!(r.secondary_category, SecondaryCategory::Unclassified);
    }

    #[test]
    fn sale_known_categories_parse_to_enum() {
        let rows = parse_sale_csv(SALE_CSV);
        // 5f5be5bd has primary "Business Service" / secondary "Accommodation..."
        let r = rows.iter()
            .find(|r| r.sale_id == "5f5be5bd-cdc5-4034-8686-ccee02495f6f")
            .expect("should find sale 5f5be5bd");
        assert_eq!(r.primary_category, PrimaryCategory::BusinessService);
        assert_eq!(
            r.secondary_category,
            SecondaryCategory::AccommodationAndFoodServicesIndustry
        );
    }

    #[test]
    fn sale_food_grocery_beverages_secondary() {
        let rows = parse_sale_csv(SALE_CSV);
        // 860516f9 has Food & Grocery / Beverages on its line items
        let r = rows.iter()
            .find(|r| r.secondary_category == SecondaryCategory::Beverages)
            .expect("should find a Beverages secondary row");
        assert_eq!(r.primary_category, PrimaryCategory::FoodAndGrocery);
    }

    #[test]
    fn sale_summary_row_has_no_line_item_fields() {
        let rows = parse_sale_csv(SALE_CSV);
        let r = rows.iter()
            .find(|r| r.sale_id == "d05e06a7-b0a9-4f4d-adb7-ad3ed054b461")
            .expect("should find sale d05e06a7");
        assert!((r.total_revenue - 8370.01).abs() < 0.01);
        assert_eq!(r.currency, Currency::KES);
        assert_eq!(r.total_cost, None);
        assert_eq!(r.total_margin, None);
        assert_eq!(r.line_item_description, None);
        assert_eq!(r.item_type, None);
        assert_eq!(r.units_sold, None);
        assert_eq!(r.sell_price, None);
        assert_eq!(r.line_item_total, None);
    }

    #[test]
    fn sale_total_cost_and_margin_parsed() {
        let rows = parse_sale_csv(SALE_CSV);
        let r = rows.iter()
            .find(|r| r.sale_id == "fb19db4b-5ab4-4471-a240-c1b5ff871aa5")
            .expect("should find sale fb19db4b");
        assert_eq!(r.total_cost, Some(2940.0));
        assert_eq!(r.total_margin, Some(2000.0));
    }

    #[test]
    fn sale_product_line_items_parsed() {
        let rows = parse_sale_csv(SALE_CSV);
        let sale_rows: Vec<_> = rows.iter()
            .filter(|r| r.sale_id == "2f63b814-a19e-45bf-95e1-e4dfbb706258")
            .collect();
        assert!(!sale_rows.is_empty());
        for r in &sale_rows {
            assert_eq!(r.item_type.as_deref(), Some("product"));
            assert!(r.sell_price.is_some());
            assert!(r.line_item_total.is_some());
        }
    }

    #[test]
    fn sale_chapati_line_item_values() {
        let rows = parse_sale_csv(SALE_CSV);
        let r = rows.iter()
            .find(|r| {
                r.sale_id == "2f63b814-a19e-45bf-95e1-e4dfbb706258"
                    && r.line_item_description.as_deref() == Some("CHAPATI")
            })
            .expect("should find CHAPATI line item");
        assert_eq!(r.units_sold, Some(3.0));
        assert_eq!(r.sell_price, Some(50.0));
        assert_eq!(r.line_item_total, Some(150.0));
        assert_eq!(r.buy_price, None);
    }

    #[test]
    fn sale_service_item_type_parsed() {
        let rows = parse_sale_csv(SALE_CSV);
        let r = rows.iter()
            .find(|r| r.sale_id == "5f5be5bd-cdc5-4034-8686-ccee02495f6f")
            .expect("should find sale 5f5be5bd");
        assert_eq!(r.item_type.as_deref(), Some("service"));
        assert_eq!(r.sell_price, Some(1200.0));
        assert_eq!(r.line_item_total, Some(1200.0));
    }

    #[test]
    fn sale_fractional_units_sold() {
        let rows = parse_sale_csv(SALE_CSV);
        let r = rows.iter()
            .find(|r| {
                r.sale_id == "ac927fd2-72c8-4840-8a34-c96f5bcccd22"
                    && r.units_sold.is_some_and(|u| u > 1.0 && u < 1.2)
            })
            .expect("should find fractional units_sold row");
        assert!((r.units_sold.unwrap() - 1.1265).abs() < 0.0001);
    }

    #[test]
    fn sale_tags_split_correctly() {
        let rows = parse_sale_csv(SALE_CSV);
        let r = rows.iter()
            .find(|r| r.sale_id == "2f63b814-a19e-45bf-95e1-e4dfbb706258")
            .unwrap();
        assert!(r.tags.contains(&"retail".to_owned()));
        assert!(r.tags.contains(&"hospitality".to_owned()));
    }
}
