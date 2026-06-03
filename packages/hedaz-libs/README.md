# hedaz-libs

Pure-Rust analysis library for FuzzyFinance receipt and sale exports. No Cloudflare-layer dependencies; consumed by `apps/zadeh` (the analysis Worker) and unit-testable in isolation.

## Modules

| Module        | What it does |
|---------------|--------------|
| `csv`         | RFC 4180 line splitter (handles quoted commas + escaped quotes). |
| `categories`  | `PrimaryCategory` / `SecondaryCategory` enums + `FromStr`. |
| `units`       | `UnitType` + `UnitGroup` enums; `UnitType::from_str` recognises all aliases (kg, kilos, kilograms, …) case-insensitively. |
| `currency`    | ISO 4217 active currency enum + `FromStr`. |
| `models`      | `ReceiptRow` / `SaleRow` structs parsed from the export CSV. |
| `context`     | `Context` — holds the chosen default currency, default unit per `UnitGroup`, and a `(from, to) → rate` exchange-rate table. Provides `convert_currency` and `convert_unit`. |
| `alluvial`    | Aggregations + 4-tier Sankey/Alluvial data builder. |

---

## Alluvial Diagram Data Structure

The `alluvial` module turns a slice of `ReceiptRow` plus a `Context` into a graph that maps directly onto any Sankey/Alluvial renderer (D3-sankey, plotly, observable-sankey, …).

### Four-Tier Topology

Spending flows left-to-right through four node levels:

```
   Merchant ──> Primary Category ──> Secondary Category ──> Product
   (level 0)       (level 1)              (level 2)          (level 3)
```

Each row in the input contributes one unit of flow to **three** links:

1. `merchant → primary`
2. `primary → secondary`
3. `secondary → product`

Primary and Secondary nodes are **shared across merchants** (one "Food & Grocery" node, multiple inflows). Product nodes are deduplicated by normalised description so `"RIBENA  1L"`, `"ribena 1l"`, and `"  RIBENA 1L  "` collapse to a single terminal node.

### Two Attributes Per Node and Per Link

Every node and link carries:

| Attribute      | Type                              | Meaning |
|----------------|-----------------------------------|---------|
| `total_price` / `value` | `f64`                  | Sum of `line_item_total` from contributing rows, converted to `ctx.default_currency`. |
| `unit_totals`  | `UnitTotals`                      | Per-`UnitGroup` totals of `qty × unit_size`, each converted to the context's default unit for that group. |

`UnitTotals` is a simple wrapper around a per-group map so weights, volumes, and counts never get summed into a single nonsense number:

```rust
pub struct UnitTotals {
    pub by_group: HashMap<UnitGroup, f64>,
    // Weight   → kilograms     (ctx default)
    // Volume   → litres         (ctx default)
    // Length   → metres         (ctx default)
    // Area     → square metres  (ctx default)
    // CountAndPack → raw count  (no universal conversion)
}
```

### Types

```rust
pub enum NodeLevel { Merchant, PrimaryCategory, SecondaryCategory, Product }

pub struct AlluvialNode {
    pub id: String,           // "merchant:Coles", "primary:Food & Grocery", …
    pub label: String,        // human-readable
    pub level: NodeLevel,
    pub total_price: f64,
    pub unit_totals: UnitTotals,
}

pub struct AlluvialLink {
    pub source: String,       // node id
    pub target: String,       // node id
    pub value: f64,           // total_price flowing along this link
    pub unit_totals: UnitTotals,
}

pub struct AlluvialData {
    pub nodes: Vec<AlluvialNode>,
    pub links: Vec<AlluvialLink>,
}
```

Node IDs are level-prefixed so identity is unambiguous across levels (`"primary:Food & Grocery"` is distinct from `"secondary:Food & Grocery"`, were both to exist).

### Invariants

For any `AlluvialData` produced by `build_alluvial_data`:

- **Flow balance**: each non-terminal node's `total_price` equals the sum of its outgoing link `value`s; each non-source node's `total_price` equals the sum of its incoming link `value`s.
- **Referential integrity**: every `link.source` and `link.target` exists in `nodes`.
- **Determinism**: nodes are sorted by `(level, label)`; links by `(source, target)`. Same input + same context → byte-identical JSON.
- **No silent drops**: rows with `Unclassified` categories aggregate under "Unclassified" nodes; rows with empty merchants/descriptions aggregate under `(unknown merchant)` / `(no description)` sentinel labels.

### Aggregation Roll-Ups (intermediate views)

Three flat aggregations are available for charts that don't need the full Sankey:

```rust
pub fn aggregate_by_secondary_category(&[ReceiptRow], &Context)
    -> Result<Vec<CategoryAgg<SecondaryCategory>>, AggregationError>;

pub fn aggregate_by_primary_category(&[ReceiptRow], &Context)
    -> Result<Vec<CategoryAgg<PrimaryCategory>>, AggregationError>;

pub fn aggregate_by_merchant_primary(&[ReceiptRow], &Context)
    -> Result<Vec<CategoryAgg<(String, PrimaryCategory)>>, AggregationError>;
```

Each returns a sorted `Vec<CategoryAgg<K>>` where:

```rust
pub struct CategoryAgg<K> {
    pub key: K,
    pub total_price: f64,
    pub unit_totals: UnitTotals,
}
```

### Currency Rule

Any row whose `currency` differs from `ctx.default_currency` **and** has no exchange rate registered (in either direction) causes the whole aggregation to fail with:

```rust
pub enum AggregationError {
    MissingExchangeRate { from: Currency, to: Currency },
}
```

This is intentional — silent skipping would understate totals; partial conversion would mix units. The caller must register a rate via `ctx.add_rate(from, to, rate)` before aggregating mixed-currency data.

### Row-Inclusion Rules

| Field on row              | Behaviour |
|---------------------------|-----------|
| `line_item_total = None`  | Row contributes no price, but `qty × unit_size` still counts toward `unit_totals`. |
| `qty = None` or `unit_size = None` | Row contributes no unit-size, but its price still counts. |
| `unit_type = Unclassified` | Same as missing unit-size — price counts, unit-size doesn't. |
| Neither price nor unit info | Row is skipped entirely. |

### Example: Minimal JSON Shape

For a fixture of 3 rows (Coles + Woolies, two primary categories, three products), `serde_json::to_string_pretty(&alluvial)` produces:

```json
{
  "nodes": [
    { "id": "merchant:Coles",   "label": "Coles",   "level": "Merchant", "total_price": 10.50, "unit_totals": { "by_group": { "Weight": 0.5, "Volume": 1.0 } } },
    { "id": "merchant:Woolies", "label": "Woolies", "level": "Merchant", "total_price":  5.00, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "id": "primary:Food & Grocery",  "label": "Food & Grocery",  "level": "PrimaryCategory", "total_price": 9.00, "unit_totals": { "by_group": { "Weight": 0.5, "Volume": 1.0 } } },
    { "id": "primary:Health & Beauty", "label": "Health & Beauty", "level": "PrimaryCategory", "total_price": 6.50, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "id": "secondary:Dairy & Eggs",       "label": "Dairy & Eggs",       "level": "SecondaryCategory", "total_price": 9.00, "unit_totals": { "by_group": { "Weight": 0.5, "Volume": 1.0 } } },
    { "id": "secondary:Shower, Bath & Soap","label": "Shower, Bath & Soap","level": "SecondaryCategory", "total_price": 6.50, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "id": "product:milk 1l",     "label": "milk 1l",     "level": "Product", "total_price": 4.00, "unit_totals": { "by_group": { "Volume": 1.0 } } },
    { "id": "product:cheese 250g", "label": "cheese 250g", "level": "Product", "total_price": 5.00, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "id": "product:soap 500g",   "label": "soap 500g",   "level": "Product", "total_price": 6.50, "unit_totals": { "by_group": { "Weight": 0.5 } } }
  ],
  "links": [
    { "source": "merchant:Coles",   "target": "primary:Food & Grocery",   "value": 4.00, "unit_totals": { "by_group": { "Volume": 1.0 } } },
    { "source": "merchant:Coles",   "target": "primary:Health & Beauty",  "value": 6.50, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "source": "merchant:Woolies", "target": "primary:Food & Grocery",   "value": 5.00, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "source": "primary:Food & Grocery",  "target": "secondary:Dairy & Eggs",        "value": 9.00, "unit_totals": { "by_group": { "Weight": 0.5, "Volume": 1.0 } } },
    { "source": "primary:Health & Beauty", "target": "secondary:Shower, Bath & Soap", "value": 6.50, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "source": "secondary:Dairy & Eggs",        "target": "product:milk 1l",     "value": 4.00, "unit_totals": { "by_group": { "Volume": 1.0 } } },
    { "source": "secondary:Dairy & Eggs",        "target": "product:cheese 250g", "value": 5.00, "unit_totals": { "by_group": { "Weight": 0.5 } } },
    { "source": "secondary:Shower, Bath & Soap", "target": "product:soap 500g",   "value": 6.50, "unit_totals": { "by_group": { "Weight": 0.5 } } }
  ]
}
```

### Usage

```rust
use hedaz_libs::context::Context;
use hedaz_libs::currency::Currency;
use hedaz_libs::models::parse_receipt_csv;
use hedaz_libs::alluvial::build_alluvial_data;

let rows = parse_receipt_csv(&csv_text);

let mut ctx = Context::new(Currency::AUD);
ctx.add_rate(Currency::KES, Currency::AUD, 0.012);

let alluvial = build_alluvial_data(&rows, &ctx)?;
let json = serde_json::to_string(&alluvial)?;
```
