use serde::{Deserialize, Serialize};

/// ISO 4217 active currency code.
/// Unrecognised input parses to `Unknown`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum Currency {
    AED, AFN, ALL, AMD, ANG, AOA, ARS, AUD, AWG, AZN,
    BAM, BBD, BDT, BGN, BHD, BIF, BMD, BND, BOB, BRL,
    BSD, BTN, BWP, BYN, BZD,
    CAD, CDF, CHF, CLP, CNY, COP, CRC, CUP, CVE, CZK,
    DJF, DKK, DOP, DZD,
    EGP, ERN, ETB, EUR,
    FJD, FKP,
    GBP, GEL, GHS, GIP, GMD, GNF, GTQ, GYD,
    HKD, HNL, HTG, HUF,
    IDR, ILS, INR, IQD, IRR, ISK,
    JMD, JOD, JPY,
    KES, KGS, KHR, KMF, KPW, KRW, KWD, KYD, KZT,
    LAK, LBP, LKR, LRD, LSL, LYD,
    MAD, MDL, MGA, MKD, MMK, MNT, MOP, MRU, MUR, MVR, MWK, MXN, MYR, MZN,
    NAD, NGN, NIO, NOK, NPR, NZD,
    OMR,
    PAB, PEN, PGK, PHP, PKR, PLN, PYG,
    QAR,
    RON, RSD, RUB, RWF,
    SAR, SBD, SCR, SDG, SEK, SGD, SHP, SLE, SOS, SRD, SSP, STN, SVC, SYP, SZL,
    THB, TJS, TMT, TND, TOP, TRY, TTD, TWD, TZS,
    UAH, UGX, USD, UYU, UZS,
    VES, VND, VUV,
    WST,
    XAF, XCD, XOF, XPF,
    YER,
    ZAR, ZMW, ZWG,
    /// Unrecognised or absent currency code.
    #[default]
    Unknown,
}

impl std::str::FromStr for Currency {
    type Err = std::convert::Infallible;
    /// Parse an ISO 4217 code string (case-insensitive) into a `Currency`.
    /// Returns `Unknown` for empty or unrecognised inputs.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s.trim().to_uppercase().as_str() {
            "AED" => Self::AED, "AFN" => Self::AFN, "ALL" => Self::ALL,
            "AMD" => Self::AMD, "ANG" => Self::ANG, "AOA" => Self::AOA,
            "ARS" => Self::ARS, "AUD" => Self::AUD, "AWG" => Self::AWG,
            "AZN" => Self::AZN,
            "BAM" => Self::BAM, "BBD" => Self::BBD, "BDT" => Self::BDT,
            "BGN" => Self::BGN, "BHD" => Self::BHD, "BIF" => Self::BIF,
            "BMD" => Self::BMD, "BND" => Self::BND, "BOB" => Self::BOB,
            "BRL" => Self::BRL, "BSD" => Self::BSD, "BTN" => Self::BTN,
            "BWP" => Self::BWP, "BYN" => Self::BYN, "BZD" => Self::BZD,
            "CAD" => Self::CAD, "CDF" => Self::CDF, "CHF" => Self::CHF,
            "CLP" => Self::CLP, "CNY" => Self::CNY, "COP" => Self::COP,
            "CRC" => Self::CRC, "CUP" => Self::CUP, "CVE" => Self::CVE,
            "CZK" => Self::CZK,
            "DJF" => Self::DJF, "DKK" => Self::DKK, "DOP" => Self::DOP,
            "DZD" => Self::DZD,
            "EGP" => Self::EGP, "ERN" => Self::ERN, "ETB" => Self::ETB,
            "EUR" => Self::EUR,
            "FJD" => Self::FJD, "FKP" => Self::FKP,
            "GBP" => Self::GBP, "GEL" => Self::GEL, "GHS" => Self::GHS,
            "GIP" => Self::GIP, "GMD" => Self::GMD, "GNF" => Self::GNF,
            "GTQ" => Self::GTQ, "GYD" => Self::GYD,
            "HKD" => Self::HKD, "HNL" => Self::HNL, "HTG" => Self::HTG,
            "HUF" => Self::HUF,
            "IDR" => Self::IDR, "ILS" => Self::ILS, "INR" => Self::INR,
            "IQD" => Self::IQD, "IRR" => Self::IRR, "ISK" => Self::ISK,
            "JMD" => Self::JMD, "JOD" => Self::JOD, "JPY" => Self::JPY,
            "KES" => Self::KES, "KGS" => Self::KGS, "KHR" => Self::KHR,
            "KMF" => Self::KMF, "KPW" => Self::KPW, "KRW" => Self::KRW,
            "KWD" => Self::KWD, "KYD" => Self::KYD, "KZT" => Self::KZT,
            "LAK" => Self::LAK, "LBP" => Self::LBP, "LKR" => Self::LKR,
            "LRD" => Self::LRD, "LSL" => Self::LSL, "LYD" => Self::LYD,
            "MAD" => Self::MAD, "MDL" => Self::MDL, "MGA" => Self::MGA,
            "MKD" => Self::MKD, "MMK" => Self::MMK, "MNT" => Self::MNT,
            "MOP" => Self::MOP, "MRU" => Self::MRU, "MUR" => Self::MUR,
            "MVR" => Self::MVR, "MWK" => Self::MWK, "MXN" => Self::MXN,
            "MYR" => Self::MYR, "MZN" => Self::MZN,
            "NAD" => Self::NAD, "NGN" => Self::NGN, "NIO" => Self::NIO,
            "NOK" => Self::NOK, "NPR" => Self::NPR, "NZD" => Self::NZD,
            "OMR" => Self::OMR,
            "PAB" => Self::PAB, "PEN" => Self::PEN, "PGK" => Self::PGK,
            "PHP" => Self::PHP, "PKR" => Self::PKR, "PLN" => Self::PLN,
            "PYG" => Self::PYG,
            "QAR" => Self::QAR,
            "RON" => Self::RON, "RSD" => Self::RSD, "RUB" => Self::RUB,
            "RWF" => Self::RWF,
            "SAR" => Self::SAR, "SBD" => Self::SBD, "SCR" => Self::SCR,
            "SDG" => Self::SDG, "SEK" => Self::SEK, "SGD" => Self::SGD,
            "SHP" => Self::SHP, "SLE" => Self::SLE, "SOS" => Self::SOS,
            "SRD" => Self::SRD, "SSP" => Self::SSP, "STN" => Self::STN,
            "SVC" => Self::SVC, "SYP" => Self::SYP, "SZL" => Self::SZL,
            "THB" => Self::THB, "TJS" => Self::TJS, "TMT" => Self::TMT,
            "TND" => Self::TND, "TOP" => Self::TOP, "TRY" => Self::TRY,
            "TTD" => Self::TTD, "TWD" => Self::TWD, "TZS" => Self::TZS,
            "UAH" => Self::UAH, "UGX" => Self::UGX, "USD" => Self::USD,
            "UYU" => Self::UYU, "UZS" => Self::UZS,
            "VES" => Self::VES, "VND" => Self::VND, "VUV" => Self::VUV,
            "WST" => Self::WST,
            "XAF" => Self::XAF, "XCD" => Self::XCD, "XOF" => Self::XOF,
            "XPF" => Self::XPF,
            "YER" => Self::YER,
            "ZAR" => Self::ZAR, "ZMW" => Self::ZMW, "ZWG" => Self::ZWG,
            _ => Self::Unknown,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cur(s: &str) -> Currency { s.parse().unwrap() }

    #[test]
    fn known_codes_parse() {
        assert_eq!(cur("AUD"), Currency::AUD);
        assert_eq!(cur("USD"), Currency::USD);
        assert_eq!(cur("EUR"), Currency::EUR);
        assert_eq!(cur("GBP"), Currency::GBP);
        assert_eq!(cur("KES"), Currency::KES);
        assert_eq!(cur("JPY"), Currency::JPY);
        assert_eq!(cur("ZWG"), Currency::ZWG);
    }

    #[test]
    fn case_insensitive() {
        assert_eq!(cur("aud"), Currency::AUD);
        assert_eq!(cur("Usd"), Currency::USD);
        assert_eq!(cur("kes"), Currency::KES);
    }

    #[test]
    fn empty_and_unknown_give_unknown() {
        assert_eq!(cur(""),        Currency::Unknown);
        assert_eq!(cur("  "),      Currency::Unknown);
        assert_eq!(cur("XYZ"),     Currency::Unknown);
        assert_eq!(cur("DOLLARS"), Currency::Unknown);
    }

    #[test]
    fn serialises_as_iso_code() {
        assert_eq!(serde_json::to_string(&Currency::AUD).unwrap(), "\"AUD\"");
        assert_eq!(serde_json::to_string(&Currency::KES).unwrap(), "\"KES\"");
        assert_eq!(serde_json::to_string(&Currency::Unknown).unwrap(), "\"Unknown\"");
    }

    #[test]
    fn roundtrip_deserialise() {
        for c in [Currency::USD, Currency::EUR, Currency::KES, Currency::Unknown] {
            let json = serde_json::to_string(&c).unwrap();
            let back: Currency = serde_json::from_str(&json).unwrap();
            assert_eq!(back, c);
        }
    }
}
