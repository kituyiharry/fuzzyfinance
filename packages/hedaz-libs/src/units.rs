use serde::{Deserialize, Serialize};

/// The measurement group a unit belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UnitGroup {
    #[serde(rename = "Weight")]
    Weight,
    #[serde(rename = "Volume")]
    Volume,
    #[serde(rename = "Count / Pack")]
    CountAndPack,
    #[serde(rename = "Length")]
    Length,
    #[serde(rename = "Area")]
    Area,
    #[serde(rename = "Unclassified")]
    Unclassified,
}

/// Canonical unit type, matching the UNIT_TYPES list in unit-normalizer.js.
/// `from_str` accepts all aliases (case-insensitive) defined in UNIT_MAP.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum UnitType {
    #[default]
    #[serde(rename = "Unclassified")]
    Unclassified,

    // Weight
    #[serde(rename = "kg")]  Kg,
    #[serde(rename = "g")]   G,
    #[serde(rename = "mg")]  Mg,
    #[serde(rename = "lb")]  Lb,
    #[serde(rename = "oz")]  Oz,
    #[serde(rename = "t")]   T,

    // Volume
    #[serde(rename = "L")]      L,
    #[serde(rename = "ml")]     Ml,
    #[serde(rename = "cl")]     Cl,
    #[serde(rename = "fl oz")]  FlOz,

    // Count / Pack
    #[serde(rename = "pk")]    Pk,
    #[serde(rename = "ct")]    Ct,
    #[serde(rename = "pcs")]   Pcs,
    #[serde(rename = "ea")]    Ea,
    #[serde(rename = "box")]   Box,
    #[serde(rename = "doz")]   Doz,
    #[serde(rename = "roll")]  Roll,
    #[serde(rename = "bag")]   Bag,
    #[serde(rename = "can")]   Can,
    #[serde(rename = "btl")]   Btl,
    #[serde(rename = "sht")]   Sht,
    #[serde(rename = "pair")]  Pair,

    // Length
    #[serde(rename = "m")]   M,
    #[serde(rename = "cm")]  Cm,
    #[serde(rename = "mm")]  Mm,
    #[serde(rename = "km")]  Km,
    #[serde(rename = "ft")]  Ft,
    #[serde(rename = "in")]  In,
    #[serde(rename = "yd")]  Yd,

    // Area
    #[serde(rename = "sqm")]   Sqm,
    #[serde(rename = "sqft")]  Sqft,
}

impl std::str::FromStr for UnitType {
    type Err = std::convert::Infallible;
    /// Parse a raw unit type string (from a CSV field) into a canonical `UnitType`.
    /// Accepts all aliases defined in UNIT_MAP (case-insensitive).
    /// Returns `Unclassified` for empty or unrecognised inputs.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s.trim().to_lowercase().as_str() {
            // Weight — kg
            "kg" | "kgs" | "kilo" | "kilos" | "kilogram" | "kilograms" => Self::Kg,
            // Weight — g
            "g" | "gm" | "gms" | "gram" | "grams" => Self::G,
            // Weight — mg
            "mg" | "milligram" | "milligrams" => Self::Mg,
            // Weight — lb
            "lb" | "lbs" | "pound" | "pounds" => Self::Lb,
            // Weight — oz
            "oz" | "ounce" | "ounces" => Self::Oz,
            // Weight — t
            "t" | "ton" | "tons" | "tonne" | "tonnes" => Self::T,

            // Volume — L  (canonical is uppercase, aliases are lowercase)
            "l" | "lt" | "ltr" | "ltrs" | "litre" | "litres" | "liter" | "liters" => Self::L,
            // Volume — ml
            "ml" | "mls" | "millilitre" | "millilitres" | "milliliter" | "milliliters" => Self::Ml,
            // Volume — cl
            "cl" | "centilitre" | "centilitres" | "centiliter" | "centiliters" => Self::Cl,
            // Volume — fl oz  (multi-word alias, compare after lowercasing)
            "fl oz" | "fl.oz" | "floz" | "fluid oz" | "fluid ounce" | "fluid ounces" => Self::FlOz,

            // Count/Pack — pk
            "pk" | "pks" | "pack" | "packs" => Self::Pk,
            // Count/Pack — ct
            "ct" | "count" | "counts" => Self::Ct,
            // Count/Pack — pcs
            "pcs" | "pc" | "piece" | "pieces" => Self::Pcs,
            // Count/Pack — ea
            "ea" | "each" => Self::Ea,
            // Count/Pack — box
            "box" | "boxes" | "bx" => Self::Box,
            // Count/Pack — doz
            "doz" | "dozen" | "dozens" | "dz" => Self::Doz,
            // Count/Pack — roll
            "roll" | "rolls" => Self::Roll,
            // Count/Pack — bag
            "bag" | "bags" => Self::Bag,
            // Count/Pack — can
            "can" | "cans" => Self::Can,
            // Count/Pack — btl
            "btl" | "btls" | "bottle" | "bottles" => Self::Btl,
            // Count/Pack — sht
            "sht" | "sheet" | "sheets" => Self::Sht,
            // Count/Pack — pair
            "pair" | "pairs" | "pr" => Self::Pair,

            // Length — m
            "m" | "meter" | "meters" | "metre" | "metres" => Self::M,
            // Length — cm
            "cm" | "centimeter" | "centimeters" | "centimetre" | "centimetres" => Self::Cm,
            // Length — mm
            "mm" | "millimeter" | "millimeters" | "millimetre" | "millimetres" => Self::Mm,
            // Length — km
            "km" | "kilometer" | "kilometers" | "kilometre" | "kilometres" => Self::Km,
            // Length — ft
            "ft" | "foot" | "feet" => Self::Ft,
            // Length — in
            "in" | "inch" | "inches" => Self::In,
            // Length — yd
            "yd" | "yds" | "yard" | "yards" => Self::Yd,

            // Area — sqm
            "sqm" | "sq m" | "sq.m" | "m2"
            | "square meter" | "square meters"
            | "square metre" | "square metres" => Self::Sqm,
            // Area — sqft
            "sqft" | "sq ft" | "sq.ft" | "ft2"
            | "square foot" | "square feet" => Self::Sqft,

            _ => Self::Unclassified,
        })
    }
}

impl UnitType {
    /// The measurement group this unit belongs to.
    pub fn group(&self) -> UnitGroup {
        match self {
            Self::Kg | Self::G | Self::Mg | Self::Lb | Self::Oz | Self::T
                => UnitGroup::Weight,
            Self::L | Self::Ml | Self::Cl | Self::FlOz
                => UnitGroup::Volume,
            Self::Pk | Self::Ct | Self::Pcs | Self::Ea | Self::Box | Self::Doz
            | Self::Roll | Self::Bag | Self::Can | Self::Btl | Self::Sht | Self::Pair
                => UnitGroup::CountAndPack,
            Self::M | Self::Cm | Self::Mm | Self::Km | Self::Ft | Self::In | Self::Yd
                => UnitGroup::Length,
            Self::Sqm | Self::Sqft
                => UnitGroup::Area,
            Self::Unclassified
                => UnitGroup::Unclassified,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ut(s: &str) -> UnitType { s.parse().unwrap() }

    // ── from_str: canonical abbreviations ────────────────────────────────────

    #[test]
    fn canonical_abbreviations_parse() {
        assert_eq!(ut("kg"),   UnitType::Kg);
        assert_eq!(ut("g"),    UnitType::G);
        assert_eq!(ut("mg"),   UnitType::Mg);
        assert_eq!(ut("lb"),   UnitType::Lb);
        assert_eq!(ut("oz"),   UnitType::Oz);
        assert_eq!(ut("t"),    UnitType::T);
        assert_eq!(ut("L"),    UnitType::L);
        assert_eq!(ut("ml"),   UnitType::Ml);
        assert_eq!(ut("cl"),   UnitType::Cl);
        assert_eq!(ut("fl oz"),UnitType::FlOz);
        assert_eq!(ut("pk"),   UnitType::Pk);
        assert_eq!(ut("ct"),   UnitType::Ct);
        assert_eq!(ut("pcs"),  UnitType::Pcs);
        assert_eq!(ut("ea"),   UnitType::Ea);
        assert_eq!(ut("box"),  UnitType::Box);
        assert_eq!(ut("doz"),  UnitType::Doz);
        assert_eq!(ut("roll"), UnitType::Roll);
        assert_eq!(ut("bag"),  UnitType::Bag);
        assert_eq!(ut("can"),  UnitType::Can);
        assert_eq!(ut("btl"),  UnitType::Btl);
        assert_eq!(ut("sht"),  UnitType::Sht);
        assert_eq!(ut("pair"), UnitType::Pair);
        assert_eq!(ut("m"),    UnitType::M);
        assert_eq!(ut("cm"),   UnitType::Cm);
        assert_eq!(ut("mm"),   UnitType::Mm);
        assert_eq!(ut("km"),   UnitType::Km);
        assert_eq!(ut("ft"),   UnitType::Ft);
        assert_eq!(ut("in"),   UnitType::In);
        assert_eq!(ut("yd"),   UnitType::Yd);
        assert_eq!(ut("sqm"),  UnitType::Sqm);
        assert_eq!(ut("sqft"), UnitType::Sqft);
    }

    // ── from_str: alias resolution ────────────────────────────────────────────

    #[test]
    fn weight_aliases_resolve() {
        assert_eq!(ut("kilograms"), UnitType::Kg);
        assert_eq!(ut("grams"),     UnitType::G);
        assert_eq!(ut("milligrams"),UnitType::Mg);
        assert_eq!(ut("pounds"),    UnitType::Lb);
        assert_eq!(ut("ounces"),    UnitType::Oz);
        assert_eq!(ut("tonnes"),    UnitType::T);
    }

    #[test]
    fn volume_aliases_resolve() {
        assert_eq!(ut("litre"),          UnitType::L);
        assert_eq!(ut("litres"),         UnitType::L);
        assert_eq!(ut("millilitres"),    UnitType::Ml);
        assert_eq!(ut("centilitres"),    UnitType::Cl);
        assert_eq!(ut("fluid ounces"),   UnitType::FlOz);
        assert_eq!(ut("fl.oz"),          UnitType::FlOz);
    }

    #[test]
    fn count_pack_aliases_resolve() {
        assert_eq!(ut("pack"),    UnitType::Pk);
        assert_eq!(ut("pieces"),  UnitType::Pcs);
        assert_eq!(ut("each"),    UnitType::Ea);
        assert_eq!(ut("bottles"), UnitType::Btl);
        assert_eq!(ut("dozen"),   UnitType::Doz);
        assert_eq!(ut("pairs"),   UnitType::Pair);
        assert_eq!(ut("sheets"),  UnitType::Sht);
        assert_eq!(ut("boxes"),   UnitType::Box);
    }

    #[test]
    fn length_aliases_resolve() {
        assert_eq!(ut("metres"),      UnitType::M);
        assert_eq!(ut("centimetres"), UnitType::Cm);
        assert_eq!(ut("millimetres"), UnitType::Mm);
        assert_eq!(ut("kilometres"),  UnitType::Km);
        assert_eq!(ut("feet"),        UnitType::Ft);
        assert_eq!(ut("inches"),      UnitType::In);
        assert_eq!(ut("yards"),       UnitType::Yd);
    }

    #[test]
    fn area_aliases_resolve() {
        assert_eq!(ut("square metres"), UnitType::Sqm);
        assert_eq!(ut("sq.m"),          UnitType::Sqm);
        assert_eq!(ut("m2"),            UnitType::Sqm);
        assert_eq!(ut("square feet"),   UnitType::Sqft);
        assert_eq!(ut("sq ft"),         UnitType::Sqft);
        assert_eq!(ut("ft2"),           UnitType::Sqft);
    }

    // ── from_str: case-insensitivity and edge cases ───────────────────────────

    #[test]
    fn case_insensitive() {
        assert_eq!(ut("KG"),    UnitType::Kg);
        assert_eq!(ut("Grams"), UnitType::G);
        assert_eq!(ut("ML"),    UnitType::Ml);
        assert_eq!(ut("FL OZ"), UnitType::FlOz);
        assert_eq!(ut("Pack"),  UnitType::Pk);
    }

    #[test]
    fn empty_and_unknown_give_unclassified() {
        assert_eq!(ut(""),          UnitType::Unclassified);
        assert_eq!(ut("  "),        UnitType::Unclassified);
        assert_eq!(ut("widgets"),   UnitType::Unclassified);
    }

    // ── group() ───────────────────────────────────────────────────────────────

    #[test]
    fn group_returns_correct_bucket() {
        assert_eq!(UnitType::Kg.group(),   UnitGroup::Weight);
        assert_eq!(UnitType::G.group(),    UnitGroup::Weight);
        assert_eq!(UnitType::L.group(),    UnitGroup::Volume);
        assert_eq!(UnitType::Ml.group(),   UnitGroup::Volume);
        assert_eq!(UnitType::FlOz.group(), UnitGroup::Volume);
        assert_eq!(UnitType::Pk.group(),   UnitGroup::CountAndPack);
        assert_eq!(UnitType::Btl.group(),  UnitGroup::CountAndPack);
        assert_eq!(UnitType::M.group(),    UnitGroup::Length);
        assert_eq!(UnitType::Km.group(),   UnitGroup::Length);
        assert_eq!(UnitType::Sqm.group(),  UnitGroup::Area);
        assert_eq!(UnitType::Sqft.group(), UnitGroup::Area);
        assert_eq!(UnitType::Unclassified.group(), UnitGroup::Unclassified);
    }

    // ── serde ─────────────────────────────────────────────────────────────────

    #[test]
    fn serialises_as_canonical_abbreviation() {
        assert_eq!(serde_json::to_string(&UnitType::Kg).unwrap(),    "\"kg\"");
        assert_eq!(serde_json::to_string(&UnitType::L).unwrap(),     "\"L\"");
        assert_eq!(serde_json::to_string(&UnitType::FlOz).unwrap(),  "\"fl oz\"");
        assert_eq!(serde_json::to_string(&UnitType::Sqm).unwrap(),   "\"sqm\"");
        assert_eq!(serde_json::to_string(&UnitType::Unclassified).unwrap(), "\"Unclassified\"");
    }

    #[test]
    fn unit_group_serialises_correctly() {
        assert_eq!(serde_json::to_string(&UnitGroup::CountAndPack).unwrap(), "\"Count / Pack\"");
        assert_eq!(serde_json::to_string(&UnitGroup::Weight).unwrap(),       "\"Weight\"");
    }

    #[test]
    fn roundtrip_deserialise() {
        for unit in [UnitType::Kg, UnitType::FlOz, UnitType::Sqft, UnitType::Unclassified] {
            let json = serde_json::to_string(&unit).unwrap();
            let back: UnitType = serde_json::from_str(&json).unwrap();
            assert_eq!(back, unit);
        }
    }
}
