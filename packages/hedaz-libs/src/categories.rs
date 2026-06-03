use serde::{Deserialize, Serialize};

/// Normalise a category string from a CSV field:
///  1. Collapse internal whitespace runs to a single space.
///  2. Remove spaces immediately before commas (artifact of column-aligned CSV
///     exports where e.g. `"Shower       , Bath & Soap"` is the raw value).
fn normalize(s: &str) -> String {
    let collapsed = s.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.replace(" ,", ",")
}

// ── Primary Category ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum PrimaryCategory {
    #[default]
    #[serde(rename = "Unclassified")]
    Unclassified,
    #[serde(rename = "Food & Grocery")]
    FoodAndGrocery,
    #[serde(rename = "Health & Beauty")]
    HealthAndBeauty,
    #[serde(rename = "Baby & Maternity")]
    BabyAndMaternity,
    #[serde(rename = "Pets")]
    Pets,
    #[serde(rename = "Home & Living")]
    HomeAndLiving,
    #[serde(rename = "Kitchen & Dining")]
    KitchenAndDining,
    #[serde(rename = "Appliances")]
    Appliances,
    #[serde(rename = "Electronics & Technology")]
    ElectronicsAndTechnology,
    #[serde(rename = "Software & Apps")]
    SoftwareAndApps,
    #[serde(rename = "Gaming")]
    Gaming,
    #[serde(rename = "Outdoor Living & Garden")]
    OutdoorLivingAndGarden,
    #[serde(rename = "Tools & Hardware")]
    ToolsAndHardware,
    #[serde(rename = "Furniture & Office")]
    FurnitureAndOffice,
    #[serde(rename = "Clothing, Shoes & Accessories")]
    ClothingShoesAndAccessories,
    #[serde(rename = "Sports & Fitness")]
    SportsAndFitness,
    #[serde(rename = "Toys, Games & Hobbies")]
    ToysGamesAndHobbies,
    #[serde(rename = "Books, Movies & Music")]
    BooksMoviesAndMusic,
    #[serde(rename = "Stationery & Office Supplies")]
    StationeryAndOfficeSupplies,
    #[serde(rename = "Automotive")]
    Automotive,
    #[serde(rename = "Electrical & Smart Home")]
    ElectricalAndSmartHome,
    #[serde(rename = "Assisted Living & Accessibility")]
    AssistedLivingAndAccessibility,
    #[serde(rename = "Party, Celebrations & Gifts")]
    PartyCelebrationsAndGifts,
    #[serde(rename = "Food Service & Commercial")]
    FoodServiceAndCommercial,
    #[serde(rename = "Business Service")]
    BusinessService,
    #[serde(rename = "Utilities")]
    Utilities
}

impl std::str::FromStr for PrimaryCategory {
    type Err = std::convert::Infallible;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match normalize(s).as_str() {
            "Food & Grocery"                  => Self::FoodAndGrocery,
            "Health & Beauty"                 => Self::HealthAndBeauty,
            "Baby & Maternity"                => Self::BabyAndMaternity,
            "Pets"                            => Self::Pets,
            "Home & Living"                   => Self::HomeAndLiving,
            "Kitchen & Dining"                => Self::KitchenAndDining,
            "Appliances"                      => Self::Appliances,
            "Electronics & Technology"        => Self::ElectronicsAndTechnology,
            "Software & Apps"                 => Self::SoftwareAndApps,
            "Gaming"                          => Self::Gaming,
            "Outdoor Living & Garden"         => Self::OutdoorLivingAndGarden,
            "Tools & Hardware"                => Self::ToolsAndHardware,
            "Furniture & Office"              => Self::FurnitureAndOffice,
            "Clothing, Shoes & Accessories"   => Self::ClothingShoesAndAccessories,
            "Sports & Fitness"                => Self::SportsAndFitness,
            "Toys, Games & Hobbies"           => Self::ToysGamesAndHobbies,
            "Books, Movies & Music"           => Self::BooksMoviesAndMusic,
            "Stationery & Office Supplies"    => Self::StationeryAndOfficeSupplies,
            "Automotive"                      => Self::Automotive,
            "Electrical & Smart Home"         => Self::ElectricalAndSmartHome,
            "Assisted Living & Accessibility" => Self::AssistedLivingAndAccessibility,
            "Party, Celebrations & Gifts"     => Self::PartyCelebrationsAndGifts,
            "Food Service & Commercial"       => Self::FoodServiceAndCommercial,
            "Business Service"                => Self::BusinessService,
            "Utilities"                       => Self::Utilities,
            _                                 => Self::Unclassified,
        })
    }
}

// ── Secondary Category ────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum SecondaryCategory {
    #[default]
    #[serde(rename = "Unclassified")]
    Unclassified,

    // Food & Grocery
    #[serde(rename = "Fresh Produce")]
    FreshProduce,
    #[serde(rename = "Meat & Seafood")]
    MeatAndSeafood,
    #[serde(rename = "Dairy & Eggs")]
    DairyAndEggs,
    #[serde(rename = "Bakery & Bread")]
    BakeryAndBread,
    #[serde(rename = "Deli & Charcuterie")]
    DeliAndCharcuterie,
    #[serde(rename = "Pantry & Dry Goods")]
    PantryAndDryGoods,
    #[serde(rename = "Snacks & Confectionery")]
    SnacksAndConfectionery,
    #[serde(rename = "Breakfast & Cereal")]
    BreakfastAndCereal,
    #[serde(rename = "Beverages")]
    Beverages,
    #[serde(rename = "Frozen Food")]
    FrozenFood,
    #[serde(rename = "International & World Foods")]
    InternationalAndWorldFoods,
    #[serde(rename = "Organic & Specialty Foods")]
    OrganicAndSpecialtyFoods,
    #[serde(rename = "Baby & Toddler Food")]
    BabyAndToddlerFood,
    #[serde(rename = "Condiments, Sauces & Spreads")]
    CondimentsSaucesAndSpreads,
    #[serde(rename = "Ready Meals & Meal Kits")]
    ReadyMealsAndMealKits,
    #[serde(rename = "Vegetarian & Vegan")]
    VegetarianAndVegan,

    // Health & Beauty
    #[serde(rename = "Vitamins & Supplements")]
    VitaminsAndSupplements,
    #[serde(rename = "Skincare")]
    Skincare,
    #[serde(rename = "Hair Care")]
    HairCare,
    #[serde(rename = "Cosmetics & Makeup")]
    CosmeticsAndMakeup,
    #[serde(rename = "Dental Care")]
    DentalCare,
    #[serde(rename = "Deodorants & Fragrances")]
    DeodorantsAndFragrances,
    #[serde(rename = "Shaving & Hair Removal")]
    ShavingAndHairRemoval,
    #[serde(rename = "Shower, Bath & Soap")]
    ShowerBathAndSoap,
    #[serde(rename = "Sun Protection")]
    SunProtection,
    #[serde(rename = "Period & Continence Care")]
    PeriodAndContinenceCare,
    #[serde(rename = "First Aid & Medicinal")]
    FirstAidAndMedicinal,
    #[serde(rename = "Sexual Health & Family Planning")]
    SexualHealthAndFamilyPlanning,
    #[serde(rename = "Travel & Minis")]
    TravelAndMinis,

    // Baby & Maternity
    #[serde(rename = "Nappies & Changing")]
    NappiesAndChanging,
    #[serde(rename = "Baby Formula & Feeding")]
    BabyFormulaAndFeeding,
    #[serde(rename = "Baby Bath & Skincare")]
    BabyBathAndSkincare,
    #[serde(rename = "Baby Health & Medicinal")]
    BabyHealthAndMedicinal,
    #[serde(rename = "Baby Clothing & Accessories")]
    BabyClothingAndAccessories,
    #[serde(rename = "Dummies, Teethers & Soothers")]
    DummiesTeethersAndSoothers,
    #[serde(rename = "Postpartum & Maternity Care")]
    PostpartumAndMaternityCare,
    #[serde(rename = "Baby Monitors & Safety")]
    BabyMonitorsAndSafety,

    // Pets
    #[serde(rename = "Dog & Puppy")]
    DogAndPuppy,
    #[serde(rename = "Cat & Kitten")]
    CatAndKitten,
    #[serde(rename = "Bird")]
    Bird,
    #[serde(rename = "Fish & Aquatic")]
    FishAndAquatic,
    #[serde(rename = "Small Animals & Reptiles")]
    SmallAnimalsAndReptiles,
    #[serde(rename = "Pet Accessories & Grooming")]
    PetAccessoriesAndGrooming,
    #[serde(rename = "Pet Health & Flea Control")]
    PetHealthAndFleaControl,

    // Home & Living
    #[serde(rename = "Furniture")]
    Furniture,
    #[serde(rename = "Bedding & Manchester")]
    BeddingAndManchester,
    #[serde(rename = "Home Decor & Accessories")]
    HomeDecorAndAccessories,
    #[serde(rename = "Lighting")]
    Lighting,
    #[serde(rename = "Rugs & Flooring")]
    RugsAndFlooring,
    #[serde(rename = "Storage & Organisation")]
    StorageAndOrganisation,
    #[serde(rename = "Cleaning Supplies & Equipment")]
    CleaningSuppliesAndEquipment,
    #[serde(rename = "Laundry")]
    Laundry,
    #[serde(rename = "Kitchenware & Tableware")]
    KitchenwareAndTableware,
    #[serde(rename = "Bathroom Accessories")]
    BathroomAccessories,
    #[serde(rename = "Air Fresheners & Home Fragrance")]
    AirFreshenersAndHomeFragrance,
    #[serde(rename = "Candles & Diffusers")]
    CandlesAndDiffusers,
    #[serde(rename = "Pest Control")]
    PestControl,

    // Kitchen & Dining
    #[serde(rename = "Kitchen Appliances")]
    KitchenAppliances,
    #[serde(rename = "Cookware & Bakeware")]
    CookwareAndBakeware,
    #[serde(rename = "Kitchen Storage & Organisation")]
    KitchenStorageAndOrganisation,
    #[serde(rename = "Knives & Utensils")]
    KnivesAndUtensils,
    #[serde(rename = "Tableware & Servingware")]
    TablewareAndServingware,
    #[serde(rename = "Coffee & Tea")]
    CoffeeAndTea,
    #[serde(rename = "Beverage Makers")]
    BeverageMakers,
    #[serde(rename = "Kitchen Cleaning")]
    KitchenCleaning,

    // Appliances
    #[serde(rename = "Refrigerators & Freezers")]
    RefrigeratorsAndFreezers,
    #[serde(rename = "Washing Machines & Dryers")]
    WashingMachinesAndDryers,
    #[serde(rename = "Dishwashers")]
    Dishwashers,
    #[serde(rename = "Vacuum Cleaners & Floor Care")]
    VacuumCleanersAndFloorCare,
    #[serde(rename = "Microwaves & Ovens")]
    MicrowavesAndOvens,
    #[serde(rename = "Air Conditioners & Fans")]
    AirConditionersAndFans,
    #[serde(rename = "Heaters & Air Treatment")]
    HeatersAndAirTreatment,
    #[serde(rename = "Irons & Steamers")]
    IronsAndSteamers,
    #[serde(rename = "Personal Care Appliances")]
    PersonalCareAppliances,

    // Electronics & Technology
    #[serde(rename = "Mobile Phones & Accessories")]
    MobilePhonesAndAccessories,
    #[serde(rename = "Computers & Laptops")]
    ComputersAndLaptops,
    #[serde(rename = "Tablets & eReaders")]
    TabletsAndEReaders,
    #[serde(rename = "TVs & Home Theatre")]
    TVsAndHomeTheatre,
    #[serde(rename = "Audio, Headphones & Speakers")]
    AudioHeadphonesAndSpeakers,
    #[serde(rename = "Cameras & Photography")]
    CamerasAndPhotography,
    #[serde(rename = "Smart Home")]
    SmartHome,
    #[serde(rename = "Wearables & Smartwatches")]
    WearablesAndSmartwatches,
    #[serde(rename = "Gaming Consoles & Accessories")]
    GamingConsolesAndAccessories,
    #[serde(rename = "PC Components & IT Accessories")]
    PCComponentsAndITAccessories,
    #[serde(rename = "Batteries & Power")]
    BatteriesAndPower,
    #[serde(rename = "Drones & Action Cameras")]
    DronesAndActionCameras,
    #[serde(rename = "Networking & Internet")]
    NetworkingAndInternet,
    #[serde(rename = "Printers & Office Tech")]
    PrintersAndOfficeTech,

    // Software & Apps
    #[serde(rename = "Business")]
    Business,
    #[serde(rename = "Games")]
    Games,
    #[serde(rename = "Developer Tools")]
    DeveloperTools,
    #[serde(rename = "Education")]
    Education,
    #[serde(rename = "Entertainment")]
    Entertainment,
    #[serde(rename = "Finance")]
    Finance,
    #[serde(rename = "Graphics & Design")]
    GraphicsAndDesign,
    #[serde(rename = "Health & Fitness")]
    HealthAndFitness,
    #[serde(rename = "Lifestyle")]
    Lifestyle,
    #[serde(rename = "Medical")]
    Medical,
    #[serde(rename = "Music")]
    Music,
    #[serde(rename = "Photo & Video")]
    PhotoAndVideo,
    #[serde(rename = "Productivity")]
    Productivity,
    #[serde(rename = "Social Networking")]
    SocialNetworking,
    #[serde(rename = "Sports")]
    Sports,
    #[serde(rename = "Travel")]
    Travel,
    #[serde(rename = "Utilities & Weather")]
    UtilitiesAndWeather,

    // Gaming
    #[serde(rename = "PlayStation")]
    PlayStation,
    #[serde(rename = "Xbox")]
    Xbox,
    #[serde(rename = "Nintendo")]
    Nintendo,
    #[serde(rename = "PC Gaming")]
    PCGaming,
    #[serde(rename = "Virtual Reality & Mixed Reality")]
    VirtualRealityAndMixedReality,
    #[serde(rename = "Handheld & Mobile Gaming")]
    HandheldAndMobileGaming,
    #[serde(rename = "Retro & Arcade Gaming")]
    RetroAndArcadeGaming,
    #[serde(rename = "Gaming Accessories & Furniture")]
    GamingAccessoriesAndFurniture,
    #[serde(rename = "Digital Games & Gift Cards")]
    DigitalGamesAndGiftCards,

    // Outdoor Living & Garden
    #[serde(rename = "BBQs & Outdoor Cooking")]
    BBQsAndOutdoorCooking,
    #[serde(rename = "Outdoor Furniture & Shade")]
    OutdoorFurnitureAndShade,
    #[serde(rename = "Gardening Tools & Equipment")]
    GardeningToolsAndEquipment,
    #[serde(rename = "Plants, Seeds & Lawn Care")]
    PlantsSeedsAndLawnCare,
    #[serde(rename = "Garden Decor & Structures")]
    GardenDecorAndStructures,
    #[serde(rename = "Outdoor Heating & Cooling")]
    OutdoorHeatingAndCooling,
    #[serde(rename = "Irrigation & Water Conservation")]
    IrrigationAndWaterConservation,
    #[serde(rename = "Pest Control (Outdoor)")]
    PestControlOutdoor,
    #[serde(rename = "Camping & Recreation")]
    CampingAndRecreation,
    #[serde(rename = "Swimming Pools, Spas & Saunas")]
    SwimmingPoolsSpasAndSaunas,
    #[serde(rename = "Sheds & Storage")]
    ShedsAndStorage,

    // Tools & Hardware
    #[serde(rename = "Power Tools")]
    PowerTools,
    #[serde(rename = "Hand Tools")]
    HandTools,
    #[serde(rename = "Tool Storage & Accessories")]
    ToolStorageAndAccessories,
    #[serde(rename = "Safety Equipment & Workwear")]
    SafetyEquipmentAndWorkwear,
    #[serde(rename = "Building & Construction Materials")]
    BuildingAndConstructionMaterials,
    #[serde(rename = "Electrical & Wiring")]
    ElectricalAndWiring,
    #[serde(rename = "Plumbing & Bathroom Fittings")]
    PlumbingAndBathroomFittings,
    #[serde(rename = "Flooring & Tiling")]
    FlooringAndTiling,
    #[serde(rename = "Paint, Woodcare & Wallpaper")]
    PaintWoodcareAndWallpaper,
    #[serde(rename = "Fencing & Gates")]
    FencingAndGates,
    #[serde(rename = "Roofing & Insulation")]
    RoofingAndInsulation,
    #[serde(rename = "Welding & Soldering")]
    WeldingAndSoldering,
    #[serde(rename = "Heavy Lifting Equipment")]
    HeavyLiftingEquipment,

    // Furniture & Office
    #[serde(rename = "Office Chairs & Desks")]
    OfficeChairsAndDesks,
    #[serde(rename = "Home Office Furniture")]
    HomeOfficeFurniture,
    #[serde(rename = "Living Room Furniture")]
    LivingRoomFurniture,
    #[serde(rename = "Bedroom Furniture")]
    BedroomFurniture,
    #[serde(rename = "Dining Furniture")]
    DiningFurniture,
    #[serde(rename = "Kids Furniture")]
    KidsFurniture,
    #[serde(rename = "Bookshelves & Storage Units")]
    BookshelvesAndStorageUnits,
    #[serde(rename = "Outdoor Furniture")]
    OutdoorFurniture,

    // Clothing, Shoes & Accessories
    #[serde(rename = "Women's Clothing")]
    WomensClothing,
    #[serde(rename = "Men's Clothing")]
    MensClothing,
    #[serde(rename = "Kids' Clothing")]
    KidsClothing,
    #[serde(rename = "Baby Clothing")]
    BabyClothing,
    #[serde(rename = "Footwear")]
    Footwear,
    #[serde(rename = "Underwear & Socks")]
    UnderwearAndSocks,
    #[serde(rename = "Jewellery & Watches")]
    JewelleryAndWatches,
    #[serde(rename = "Bags & Luggage")]
    BagsAndLuggage,
    #[serde(rename = "Accessories & Hats")]
    AccessoriesAndHats,

    // Sports & Fitness
    #[serde(rename = "Fitness Equipment")]
    FitnessEquipment,
    #[serde(rename = "Cycling")]
    Cycling,
    #[serde(rename = "Golf")]
    Golf,
    #[serde(rename = "Running & Yoga")]
    RunningAndYoga,
    #[serde(rename = "Outdoor & Adventure Sports")]
    OutdoorAndAdventureSports,
    #[serde(rename = "Team Sports")]
    TeamSports,
    #[serde(rename = "Water Sports")]
    WaterSports,
    #[serde(rename = "Camping & Hiking")]
    CampingAndHiking,
    #[serde(rename = "Wearables & Fitness Trackers")]
    WearablesAndFitnessTrackers,

    // Toys, Games & Hobbies
    #[serde(rename = "Action Figures & Collectibles")]
    ActionFiguresAndCollectibles,
    #[serde(rename = "Board Games & Puzzles")]
    BoardGamesAndPuzzles,
    #[serde(rename = "Building & Construction Toys")]
    BuildingAndConstructionToys,
    #[serde(rename = "Remote Control & Drones")]
    RemoteControlAndDrones,
    #[serde(rename = "Outdoor Play Equipment")]
    OutdoorPlayEquipment,
    #[serde(rename = "Educational Toys")]
    EducationalToys,
    #[serde(rename = "Arts & Crafts")]
    ArtsAndCrafts,
    #[serde(rename = "Model Kits & Trains")]
    ModelKitsAndTrains,
    #[serde(rename = "Trading Card Games")]
    TradingCardGames,
    #[serde(rename = "Plush & Stuffed Toys")]
    PlushAndStuffedToys,

    // Books, Movies & Music
    #[serde(rename = "Books")]
    Books,
    #[serde(rename = "DVDs & Blu-ray")]
    DVDsAndBluRay,
    #[serde(rename = "Vinyl & Music")]
    VinylAndMusic,
    #[serde(rename = "Digital Media & Streaming")]
    DigitalMediaAndStreaming,
    #[serde(rename = "Music Collectibles & Merchandise")]
    MusicCollectiblesAndMerchandise,

    // Stationery & Office Supplies
    #[serde(rename = "Pens, Pencils & Markers")]
    PensPencilsAndMarkers,
    #[serde(rename = "Notebooks, Journals & Planners")]
    NotebooksJournalsAndPlanners,
    #[serde(rename = "Filing & Organisation")]
    FilingAndOrganisation,
    #[serde(rename = "Labels & Stickers")]
    LabelsAndStickers,
    #[serde(rename = "Sticky Notes & Accessories")]
    StickyNotesAndAccessories,
    #[serde(rename = "Correction Products")]
    CorrectionProducts,

    // Automotive
    #[serde(rename = "Car Parts & Accessories")]
    CarPartsAndAccessories,
    #[serde(rename = "Car Care & Cleaning")]
    CarCareAndCleaning,
    #[serde(rename = "Motorcycles & Parts")]
    MotorcyclesAndParts,
    #[serde(rename = "Boats & Marine")]
    BoatsAndMarine,
    #[serde(rename = "Car Electronics & Dash Cams")]
    CarElectronicsAndDashCams,
    #[serde(rename = "Tyres & Wheels")]
    TyresAndWheels,

    // Electrical & Smart Home
    #[serde(rename = "Smart Lighting & Power")]
    SmartLightingAndPower,
    #[serde(rename = "Smart Security & Doorbells")]
    SmartSecurityAndDoorbells,
    #[serde(rename = "Smart Speakers & Displays")]
    SmartSpeakersAndDisplays,
    #[serde(rename = "Home Automation")]
    HomeAutomation,
    #[serde(rename = "Solar & EV Charging")]
    SolarAndEVCharging,
    #[serde(rename = "Electrical Accessories & Wiring")]
    ElectricalAccessoriesAndWiring,

    // Assisted Living & Accessibility
    #[serde(rename = "Mobility Aids")]
    MobilityAids,
    #[serde(rename = "Bathroom Safety")]
    BathroomSafety,
    #[serde(rename = "Daily Living Aids")]
    DailyLivingAids,
    #[serde(rename = "Home Safety & Modifications")]
    HomeSafetyAndModifications,
    #[serde(rename = "Bedroom Support")]
    BedroomSupport,
    #[serde(rename = "Health & Wellness Aids")]
    HealthAndWellnessAids,

    // Party, Celebrations & Gifts
    #[serde(rename = "Party Supplies & Decorations")]
    PartySuppliesAndDecorations,
    #[serde(rename = "Gift Wrap & Cards")]
    GiftWrapAndCards,
    #[serde(rename = "Seasonal & Holiday Decor")]
    SeasonalAndHolidayDecor,
    #[serde(rename = "Disposable Tableware")]
    DisposableTableware,
    #[serde(rename = "Celebration Cakes & Candles")]
    CelebrationCakesAndCandles,

    // Food Service & Commercial
    #[serde(rename = "Commercial Kitchen Equipment")]
    CommercialKitchenEquipment,
    #[serde(rename = "Catering Supplies")]
    CateringSupplies,
    #[serde(rename = "Industrial Cleaning")]
    IndustrialCleaning,
    #[serde(rename = "Business Supplies")]
    BusinessSupplies,
    #[serde(rename = "Restaurant")]
    Restaurant,

    // Business Service
    #[serde(rename = "Accommodation and food services industry")]
    AccommodationAndFoodServicesIndustry,
    #[serde(rename = "Administrative and support services industry")]
    AdministrativeAndSupportServicesIndustry,
    #[serde(rename = "Agriculture, forestry and fishing industry")]
    AgricultureForestryAndFishingIndustry,
    #[serde(rename = "Arts and recreation services industry")]
    ArtsAndRecreationServicesIndustry,
    #[serde(rename = "Construction industry")]
    ConstructionIndustry,
    #[serde(rename = "Education and training industry")]
    EducationAndTrainingIndustry,
    #[serde(rename = "Financial and insurance services industry")]
    FinancialAndInsuranceServicesIndustry,
    #[serde(rename = "Health care and social assistance industry")]
    HealthCareAndSocialAssistanceIndustry,
    #[serde(rename = "Information media and telecommunications industry")]
    InformationMediaAndTelecommunicationsIndustry,
    #[serde(rename = "Manufacturing industry")]
    ManufacturingIndustry,
    #[serde(rename = "Mining industry")]
    MiningIndustry,
    #[serde(rename = "Professional, scientific and technical services industry")]
    ProfessionalScientificAndTechnicalServicesIndustry,
    #[serde(rename = "Rental, hiring and real estate services industry")]
    RentalHiringAndRealEstateServicesIndustry,
    #[serde(rename = "Retail and wholesale trade industry")]
    RetailAndWholesaleTradeIndustry,
    #[serde(rename = "Tourism industry")]
    TourismIndustry,
    #[serde(rename = "Transport, postal and warehousing industry")]
    TransportPostalAndWarehousingIndustry,

    // Utilities
    #[serde(rename = "Gas")]
    Gas,
    #[serde(rename = "Electricity and Energy")]
    ElectricityAndEnergy,
    #[serde(rename = "Water and Sewerage")]
    WaterAndSewerage,
    #[serde(rename = "Internet, Telecommunications and Cable")]
    InternetTelecommunicationsAndCable,
    #[serde(rename = "Waste and Recycling")]
    WasteAndRecycling
}

impl std::str::FromStr for SecondaryCategory {
    type Err = std::convert::Infallible;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match normalize(s).as_str() {
            // Food & Grocery
            "Fresh Produce"                    => Self::FreshProduce,
            "Meat & Seafood"                   => Self::MeatAndSeafood,
            "Dairy & Eggs"                     => Self::DairyAndEggs,
            "Bakery & Bread"                   => Self::BakeryAndBread,
            "Deli & Charcuterie"               => Self::DeliAndCharcuterie,
            "Pantry & Dry Goods"               => Self::PantryAndDryGoods,
            "Snacks & Confectionery"           => Self::SnacksAndConfectionery,
            "Breakfast & Cereal"               => Self::BreakfastAndCereal,
            "Beverages"                        => Self::Beverages,
            "Frozen Food"                      => Self::FrozenFood,
            "International & World Foods"      => Self::InternationalAndWorldFoods,
            "Organic & Specialty Foods"        => Self::OrganicAndSpecialtyFoods,
            "Baby & Toddler Food"              => Self::BabyAndToddlerFood,
            "Condiments, Sauces & Spreads"     => Self::CondimentsSaucesAndSpreads,
            "Ready Meals & Meal Kits"          => Self::ReadyMealsAndMealKits,
            "Vegetarian & Vegan"               => Self::VegetarianAndVegan,
            // Health & Beauty
            "Vitamins & Supplements"           => Self::VitaminsAndSupplements,
            "Skincare"                         => Self::Skincare,
            "Hair Care"                        => Self::HairCare,
            "Cosmetics & Makeup"               => Self::CosmeticsAndMakeup,
            "Dental Care"                      => Self::DentalCare,
            "Deodorants & Fragrances"          => Self::DeodorantsAndFragrances,
            "Shaving & Hair Removal"           => Self::ShavingAndHairRemoval,
            "Shower, Bath & Soap"              => Self::ShowerBathAndSoap,
            "Sun Protection"                   => Self::SunProtection,
            "Period & Continence Care"         => Self::PeriodAndContinenceCare,
            "First Aid & Medicinal"            => Self::FirstAidAndMedicinal,
            "Sexual Health & Family Planning"  => Self::SexualHealthAndFamilyPlanning,
            "Travel & Minis"                   => Self::TravelAndMinis,
            // Baby & Maternity
            "Nappies & Changing"               => Self::NappiesAndChanging,
            "Baby Formula & Feeding"           => Self::BabyFormulaAndFeeding,
            "Baby Bath & Skincare"             => Self::BabyBathAndSkincare,
            "Baby Health & Medicinal"          => Self::BabyHealthAndMedicinal,
            "Baby Clothing & Accessories"      => Self::BabyClothingAndAccessories,
            "Dummies, Teethers & Soothers"     => Self::DummiesTeethersAndSoothers,
            "Postpartum & Maternity Care"      => Self::PostpartumAndMaternityCare,
            "Baby Monitors & Safety"           => Self::BabyMonitorsAndSafety,
            // Pets
            "Dog & Puppy"                      => Self::DogAndPuppy,
            "Cat & Kitten"                     => Self::CatAndKitten,
            "Bird"                             => Self::Bird,
            "Fish & Aquatic"                   => Self::FishAndAquatic,
            "Small Animals & Reptiles"         => Self::SmallAnimalsAndReptiles,
            "Pet Accessories & Grooming"       => Self::PetAccessoriesAndGrooming,
            "Pet Health & Flea Control"        => Self::PetHealthAndFleaControl,
            // Home & Living
            "Furniture"                        => Self::Furniture,
            "Bedding & Manchester"             => Self::BeddingAndManchester,
            "Home Decor & Accessories"         => Self::HomeDecorAndAccessories,
            "Lighting"                         => Self::Lighting,
            "Rugs & Flooring"                  => Self::RugsAndFlooring,
            "Storage & Organisation"           => Self::StorageAndOrganisation,
            "Cleaning Supplies & Equipment"    => Self::CleaningSuppliesAndEquipment,
            "Laundry"                          => Self::Laundry,
            "Kitchenware & Tableware"          => Self::KitchenwareAndTableware,
            "Bathroom Accessories"             => Self::BathroomAccessories,
            "Air Fresheners & Home Fragrance"  => Self::AirFreshenersAndHomeFragrance,
            "Candles & Diffusers"              => Self::CandlesAndDiffusers,
            "Pest Control"                     => Self::PestControl,
            // Kitchen & Dining
            "Kitchen Appliances"               => Self::KitchenAppliances,
            "Cookware & Bakeware"              => Self::CookwareAndBakeware,
            "Kitchen Storage & Organisation"   => Self::KitchenStorageAndOrganisation,
            "Knives & Utensils"                => Self::KnivesAndUtensils,
            "Tableware & Servingware"          => Self::TablewareAndServingware,
            "Coffee & Tea"                     => Self::CoffeeAndTea,
            "Beverage Makers"                  => Self::BeverageMakers,
            "Kitchen Cleaning"                 => Self::KitchenCleaning,
            // Appliances
            "Refrigerators & Freezers"         => Self::RefrigeratorsAndFreezers,
            "Washing Machines & Dryers"        => Self::WashingMachinesAndDryers,
            "Dishwashers"                      => Self::Dishwashers,
            "Vacuum Cleaners & Floor Care"     => Self::VacuumCleanersAndFloorCare,
            "Microwaves & Ovens"               => Self::MicrowavesAndOvens,
            "Air Conditioners & Fans"          => Self::AirConditionersAndFans,
            "Heaters & Air Treatment"          => Self::HeatersAndAirTreatment,
            "Irons & Steamers"                 => Self::IronsAndSteamers,
            "Personal Care Appliances"         => Self::PersonalCareAppliances,
            // Electronics & Technology
            "Mobile Phones & Accessories"      => Self::MobilePhonesAndAccessories,
            "Computers & Laptops"              => Self::ComputersAndLaptops,
            "Tablets & eReaders"               => Self::TabletsAndEReaders,
            "TVs & Home Theatre"               => Self::TVsAndHomeTheatre,
            "Audio, Headphones & Speakers"     => Self::AudioHeadphonesAndSpeakers,
            "Cameras & Photography"            => Self::CamerasAndPhotography,
            "Smart Home"                       => Self::SmartHome,
            "Wearables & Smartwatches"         => Self::WearablesAndSmartwatches,
            "Gaming Consoles & Accessories"    => Self::GamingConsolesAndAccessories,
            "PC Components & IT Accessories"   => Self::PCComponentsAndITAccessories,
            "Batteries & Power"                => Self::BatteriesAndPower,
            "Drones & Action Cameras"          => Self::DronesAndActionCameras,
            "Networking & Internet"            => Self::NetworkingAndInternet,
            "Printers & Office Tech"           => Self::PrintersAndOfficeTech,
            // Software & Apps
            "Business"                         => Self::Business,
            "Games"                            => Self::Games,
            "Developer Tools"                  => Self::DeveloperTools,
            "Education"                        => Self::Education,
            "Entertainment"                    => Self::Entertainment,
            "Finance"                          => Self::Finance,
            "Graphics & Design"                => Self::GraphicsAndDesign,
            "Health & Fitness"                 => Self::HealthAndFitness,
            "Lifestyle"                        => Self::Lifestyle,
            "Medical"                          => Self::Medical,
            "Music"                            => Self::Music,
            "Photo & Video"                    => Self::PhotoAndVideo,
            "Productivity"                     => Self::Productivity,
            "Social Networking"                => Self::SocialNetworking,
            "Sports"                           => Self::Sports,
            "Travel"                           => Self::Travel,
            "Utilities & Weather"              => Self::UtilitiesAndWeather,
            // Gaming
            "PlayStation"                      => Self::PlayStation,
            "Xbox"                             => Self::Xbox,
            "Nintendo"                         => Self::Nintendo,
            "PC Gaming"                        => Self::PCGaming,
            "Virtual Reality & Mixed Reality"  => Self::VirtualRealityAndMixedReality,
            "Handheld & Mobile Gaming"         => Self::HandheldAndMobileGaming,
            "Retro & Arcade Gaming"            => Self::RetroAndArcadeGaming,
            "Gaming Accessories & Furniture"   => Self::GamingAccessoriesAndFurniture,
            "Digital Games & Gift Cards"       => Self::DigitalGamesAndGiftCards,
            // Outdoor Living & Garden
            "BBQs & Outdoor Cooking"           => Self::BBQsAndOutdoorCooking,
            "Outdoor Furniture & Shade"        => Self::OutdoorFurnitureAndShade,
            "Gardening Tools & Equipment"      => Self::GardeningToolsAndEquipment,
            "Plants, Seeds & Lawn Care"        => Self::PlantsSeedsAndLawnCare,
            "Garden Decor & Structures"        => Self::GardenDecorAndStructures,
            "Outdoor Heating & Cooling"        => Self::OutdoorHeatingAndCooling,
            "Irrigation & Water Conservation"  => Self::IrrigationAndWaterConservation,
            "Pest Control (Outdoor)"           => Self::PestControlOutdoor,
            "Camping & Recreation"             => Self::CampingAndRecreation,
            "Swimming Pools, Spas & Saunas"    => Self::SwimmingPoolsSpasAndSaunas,
            "Sheds & Storage"                  => Self::ShedsAndStorage,
            // Tools & Hardware
            "Power Tools"                      => Self::PowerTools,
            "Hand Tools"                       => Self::HandTools,
            "Tool Storage & Accessories"       => Self::ToolStorageAndAccessories,
            "Safety Equipment & Workwear"      => Self::SafetyEquipmentAndWorkwear,
            "Building & Construction Materials"=> Self::BuildingAndConstructionMaterials,
            "Electrical & Wiring"              => Self::ElectricalAndWiring,
            "Plumbing & Bathroom Fittings"     => Self::PlumbingAndBathroomFittings,
            "Flooring & Tiling"                => Self::FlooringAndTiling,
            "Paint, Woodcare & Wallpaper"      => Self::PaintWoodcareAndWallpaper,
            "Fencing & Gates"                  => Self::FencingAndGates,
            "Roofing & Insulation"             => Self::RoofingAndInsulation,
            "Welding & Soldering"              => Self::WeldingAndSoldering,
            "Heavy Lifting Equipment"          => Self::HeavyLiftingEquipment,
            // Furniture & Office
            "Office Chairs & Desks"            => Self::OfficeChairsAndDesks,
            "Home Office Furniture"            => Self::HomeOfficeFurniture,
            "Living Room Furniture"            => Self::LivingRoomFurniture,
            "Bedroom Furniture"                => Self::BedroomFurniture,
            "Dining Furniture"                 => Self::DiningFurniture,
            "Kids Furniture"                   => Self::KidsFurniture,
            "Bookshelves & Storage Units"      => Self::BookshelvesAndStorageUnits,
            "Outdoor Furniture"                => Self::OutdoorFurniture,
            // Clothing, Shoes & Accessories
            "Women's Clothing"                 => Self::WomensClothing,
            "Men's Clothing"                   => Self::MensClothing,
            "Kids' Clothing"                   => Self::KidsClothing,
            "Baby Clothing"                    => Self::BabyClothing,
            "Footwear"                         => Self::Footwear,
            "Underwear & Socks"                => Self::UnderwearAndSocks,
            "Jewellery & Watches"              => Self::JewelleryAndWatches,
            "Bags & Luggage"                   => Self::BagsAndLuggage,
            "Accessories & Hats"               => Self::AccessoriesAndHats,
            // Sports & Fitness
            "Fitness Equipment"                => Self::FitnessEquipment,
            "Cycling"                          => Self::Cycling,
            "Golf"                             => Self::Golf,
            "Running & Yoga"                   => Self::RunningAndYoga,
            "Outdoor & Adventure Sports"       => Self::OutdoorAndAdventureSports,
            "Team Sports"                      => Self::TeamSports,
            "Water Sports"                     => Self::WaterSports,
            "Camping & Hiking"                 => Self::CampingAndHiking,
            "Wearables & Fitness Trackers"     => Self::WearablesAndFitnessTrackers,
            // Toys, Games & Hobbies
            "Action Figures & Collectibles"    => Self::ActionFiguresAndCollectibles,
            "Board Games & Puzzles"            => Self::BoardGamesAndPuzzles,
            "Building & Construction Toys"     => Self::BuildingAndConstructionToys,
            "Remote Control & Drones"          => Self::RemoteControlAndDrones,
            "Outdoor Play Equipment"           => Self::OutdoorPlayEquipment,
            "Educational Toys"                 => Self::EducationalToys,
            "Arts & Crafts"                    => Self::ArtsAndCrafts,
            "Model Kits & Trains"              => Self::ModelKitsAndTrains,
            "Trading Card Games"               => Self::TradingCardGames,
            "Plush & Stuffed Toys"             => Self::PlushAndStuffedToys,
            // Books, Movies & Music
            "Books"                            => Self::Books,
            "DVDs & Blu-ray"                   => Self::DVDsAndBluRay,
            "Vinyl & Music"                    => Self::VinylAndMusic,
            "Digital Media & Streaming"        => Self::DigitalMediaAndStreaming,
            "Music Collectibles & Merchandise" => Self::MusicCollectiblesAndMerchandise,
            // Stationery & Office Supplies
            "Pens, Pencils & Markers"          => Self::PensPencilsAndMarkers,
            "Notebooks, Journals & Planners"   => Self::NotebooksJournalsAndPlanners,
            "Filing & Organisation"            => Self::FilingAndOrganisation,
            "Labels & Stickers"                => Self::LabelsAndStickers,
            "Sticky Notes & Accessories"       => Self::StickyNotesAndAccessories,
            "Correction Products"              => Self::CorrectionProducts,
            // Automotive
            "Car Parts & Accessories"          => Self::CarPartsAndAccessories,
            "Car Care & Cleaning"              => Self::CarCareAndCleaning,
            "Motorcycles & Parts"              => Self::MotorcyclesAndParts,
            "Boats & Marine"                   => Self::BoatsAndMarine,
            "Car Electronics & Dash Cams"      => Self::CarElectronicsAndDashCams,
            "Tyres & Wheels"                   => Self::TyresAndWheels,
            // Electrical & Smart Home
            "Smart Lighting & Power"           => Self::SmartLightingAndPower,
            "Smart Security & Doorbells"       => Self::SmartSecurityAndDoorbells,
            "Smart Speakers & Displays"        => Self::SmartSpeakersAndDisplays,
            "Home Automation"                  => Self::HomeAutomation,
            "Solar & EV Charging"              => Self::SolarAndEVCharging,
            "Electrical Accessories & Wiring"  => Self::ElectricalAccessoriesAndWiring,
            // Assisted Living & Accessibility
            "Mobility Aids"                    => Self::MobilityAids,
            "Bathroom Safety"                  => Self::BathroomSafety,
            "Daily Living Aids"                => Self::DailyLivingAids,
            "Home Safety & Modifications"      => Self::HomeSafetyAndModifications,
            "Bedroom Support"                  => Self::BedroomSupport,
            "Health & Wellness Aids"           => Self::HealthAndWellnessAids,
            // Party, Celebrations & Gifts
            "Party Supplies & Decorations"     => Self::PartySuppliesAndDecorations,
            "Gift Wrap & Cards"                => Self::GiftWrapAndCards,
            "Seasonal & Holiday Decor"         => Self::SeasonalAndHolidayDecor,
            "Disposable Tableware"             => Self::DisposableTableware,
            "Celebration Cakes & Candles"      => Self::CelebrationCakesAndCandles,
            // Food Service & Commercial
            "Commercial Kitchen Equipment"     => Self::CommercialKitchenEquipment,
            "Catering Supplies"                => Self::CateringSupplies,
            "Industrial Cleaning"              => Self::IndustrialCleaning,
            "Business Supplies"                => Self::BusinessSupplies,
            "Restaurant"                       => Self::Restaurant,
            // Business Service
            "Accommodation and food services industry"
                => Self::AccommodationAndFoodServicesIndustry,
            "Administrative and support services industry"
                => Self::AdministrativeAndSupportServicesIndustry,
            "Agriculture, forestry and fishing industry"
                => Self::AgricultureForestryAndFishingIndustry,
            "Arts and recreation services industry"
                => Self::ArtsAndRecreationServicesIndustry,
            "Construction industry"
                => Self::ConstructionIndustry,
            "Education and training industry"
                => Self::EducationAndTrainingIndustry,
            "Financial and insurance services industry"
                => Self::FinancialAndInsuranceServicesIndustry,
            "Health care and social assistance industry"
                => Self::HealthCareAndSocialAssistanceIndustry,
            "Information media and telecommunications industry"
                => Self::InformationMediaAndTelecommunicationsIndustry,
            "Manufacturing industry"
                => Self::ManufacturingIndustry,
            "Mining industry"
                => Self::MiningIndustry,
            "Professional, scientific and technical services industry"
                => Self::ProfessionalScientificAndTechnicalServicesIndustry,
            "Rental, hiring and real estate services industry"
                => Self::RentalHiringAndRealEstateServicesIndustry,
            "Retail and wholesale trade industry"
                => Self::RetailAndWholesaleTradeIndustry,
            "Tourism industry"
                => Self::TourismIndustry,
            "Transport, postal and warehousing industry"
                => Self::TransportPostalAndWarehousingIndustry,
            "Gas" => Self::Gas,
            "Electricity and Energy"                 => Self::ElectricityAndEnergy,
            "Water and Sewerage"                     => Self::WaterAndSewerage,
            "Internet, Telecommunications and Cable" => Self::InternetTelecommunicationsAndCable, 
            "Waste and Recycling"                    => Self::WasteAndRecycling,
            _                                        => Self::Unclassified,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prim(s: &str) -> PrimaryCategory { s.parse().unwrap() }
    fn sec(s: &str) -> SecondaryCategory { s.parse().unwrap() }

    #[test]
    fn primary_known_values_parse() {
        assert_eq!(prim("Food & Grocery"), PrimaryCategory::FoodAndGrocery);
        assert_eq!(prim("Business Service"), PrimaryCategory::BusinessService);
        assert_eq!(prim("Food Service & Commercial"), PrimaryCategory::FoodServiceAndCommercial);
    }

    #[test]
    fn primary_empty_and_unknown_give_unclassified() {
        assert_eq!(prim(""), PrimaryCategory::Unclassified);
        assert_eq!(prim("  "), PrimaryCategory::Unclassified);
        assert_eq!(prim("Completely Unknown"), PrimaryCategory::Unclassified);
    }

    #[test]
    fn primary_trims_whitespace() {
        assert_eq!(prim("  Home & Living  "), PrimaryCategory::HomeAndLiving);
    }

    #[test]
    fn secondary_known_values_parse() {
        assert_eq!(sec("Bakery & Bread"), SecondaryCategory::BakeryAndBread);
        assert_eq!(sec("Shower, Bath & Soap"), SecondaryCategory::ShowerBathAndSoap);
        assert_eq!(sec("Transport, postal and warehousing industry"), SecondaryCategory::TransportPostalAndWarehousingIndustry);
        assert_eq!(sec("Condiments, Sauces & Spreads"), SecondaryCategory::CondimentsSaucesAndSpreads);
    }

    #[test]
    fn secondary_empty_and_unknown_give_unclassified() {
        assert_eq!(sec(""), SecondaryCategory::Unclassified);
        assert_eq!(sec("Not a real category"), SecondaryCategory::Unclassified);
    }

    #[test]
    fn secondary_trims_whitespace() {
        assert_eq!(sec("  Restaurant  "), SecondaryCategory::Restaurant);
    }

    #[test]
    fn primary_serialises_as_original_string() {
        let json = serde_json::to_string(&PrimaryCategory::FoodAndGrocery).unwrap();
        assert_eq!(json, "\"Food & Grocery\"");
        let json = serde_json::to_string(&PrimaryCategory::Unclassified).unwrap();
        assert_eq!(json, "\"Unclassified\"");
    }

    #[test]
    fn secondary_serialises_as_original_string() {
        let json = serde_json::to_string(&SecondaryCategory::ShowerBathAndSoap).unwrap();
        assert_eq!(json, "\"Shower, Bath & Soap\"");
        let json = serde_json::to_string(&SecondaryCategory::TransportPostalAndWarehousingIndustry).unwrap();
        assert_eq!(json, "\"Transport, postal and warehousing industry\"");
    }

    #[test]
    fn roundtrip_deserialise() {
        let original = PrimaryCategory::ElectronicsAndTechnology;
        let json = serde_json::to_string(&original).unwrap();
        let back: PrimaryCategory = serde_json::from_str(&json).unwrap();
        assert_eq!(back, original);
    }
}
