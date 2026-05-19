const List<String> kPrimaryCategories = [
  'Food & Grocery',
  'Health & Beauty',
  'Baby & Maternity',
  'Pets',
  'Home & Living',
  'Kitchen & Dining',
  'Appliances',
  'Electronics & Technology',
  'Software & Apps',
  'Gaming',
  'Outdoor Living & Garden',
  'Tools & Hardware',
  'Furniture & Office',
  'Clothing, Shoes & Accessories',
  'Sports & Fitness',
  'Toys, Games & Hobbies',
  'Books, Movies & Music',
  'Stationery & Office Supplies',
  'Automotive',
  'Electrical & Smart Home',
  'Assisted Living & Accessibility',
  'Party, Celebrations & Gifts',
  'Food Service & Commercial',
];

const Map<String, List<String>> kSecondaryCategories = {
  'Food & Grocery': [
    'Fresh Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread',
    'Deli & Charcuterie', 'Pantry & Dry Goods', 'Snacks & Confectionery',
    'Breakfast & Cereal', 'Beverages', 'Frozen Food', 'International & World Foods',
    'Organic & Specialty Foods', 'Baby & Toddler Food', 'Condiments, Sauces & Spreads',
    'Ready Meals & Meal Kits', 'Vegetarian & Vegan',
  ],
  'Health & Beauty': [
    'Vitamins & Supplements', 'Skincare', 'Hair Care', 'Cosmetics & Makeup',
    'Dental Care', 'Deodorants & Fragrances', 'Shaving & Hair Removal',
    'Shower, Bath & Soap', 'Sun Protection', 'Period & Continence Care',
    'First Aid & Medicinal', 'Sexual Health & Family Planning', 'Travel & Minis',
  ],
  'Baby & Maternity': [
    'Nappies & Changing', 'Baby Formula & Feeding', 'Baby Bath & Skincare',
    'Baby Health & Medicinal', 'Baby Clothing & Accessories', 'Dummies, Teethers & Soothers',
    'Postpartum & Maternity Care', 'Baby Monitors & Safety',
  ],
  'Pets': [
    'Dog & Puppy', 'Cat & Kitten', 'Bird', 'Fish & Aquatic',
    'Small Animals & Reptiles', 'Pet Accessories & Grooming', 'Pet Health & Flea Control',
  ],
  'Home & Living': [
    'Furniture', 'Bedding & Manchester', 'Home Decor & Accessories', 'Lighting',
    'Rugs & Flooring', 'Storage & Organisation', 'Cleaning Supplies & Equipment',
    'Laundry', 'Kitchenware & Tableware', 'Bathroom Accessories',
    'Air Fresheners & Home Fragrance', 'Candles & Diffusers', 'Pest Control',
  ],
  'Kitchen & Dining': [
    'Kitchen Appliances', 'Cookware & Bakeware', 'Kitchen Storage & Organisation',
    'Knives & Utensils', 'Tableware & Servingware', 'Coffee & Tea',
    'Beverage Makers', 'Kitchen Cleaning',
  ],
  'Appliances': [
    'Refrigerators & Freezers', 'Washing Machines & Dryers', 'Dishwashers',
    'Vacuum Cleaners & Floor Care', 'Microwaves & Ovens', 'Air Conditioners & Fans',
    'Heaters & Air Treatment', 'Irons & Steamers', 'Personal Care Appliances',
  ],
  'Electronics & Technology': [
    'Mobile Phones & Accessories', 'Computers & Laptops', 'Tablets & eReaders',
    'TVs & Home Theatre', 'Audio, Headphones & Speakers', 'Cameras & Photography',
    'Smart Home', 'Wearables & Smartwatches', 'Gaming Consoles & Accessories',
    'PC Components & IT Accessories', 'Batteries & Power', 'Drones & Action Cameras',
    'Networking & Internet', 'Printers & Office Tech',
  ],
  'Software & Apps': [
    'Business', 'Games', 'Developer Tools', 'Education', 'Entertainment',
    'Finance', 'Graphics & Design', 'Health & Fitness', 'Lifestyle', 'Medical',
    'Music', 'Photo & Video', 'Productivity', 'Social Networking', 'Sports',
    'Travel', 'Utilities & Weather',
  ],
  'Gaming': [
    'PlayStation', 'Xbox', 'Nintendo', 'PC Gaming', 'Virtual Reality & Mixed Reality',
    'Handheld & Mobile Gaming', 'Retro & Arcade Gaming', 'Gaming Accessories & Furniture',
    'Digital Games & Gift Cards',
  ],
  'Outdoor Living & Garden': [
    'BBQs & Outdoor Cooking', 'Outdoor Furniture & Shade', 'Gardening Tools & Equipment',
    'Plants, Seeds & Lawn Care', 'Garden Decor & Structures', 'Outdoor Heating & Cooling',
    'Irrigation & Water Conservation', 'Pest Control (Outdoor)', 'Camping & Recreation',
    'Swimming Pools, Spas & Saunas', 'Sheds & Storage',
  ],
  'Tools & Hardware': [
    'Power Tools', 'Hand Tools', 'Tool Storage & Accessories', 'Safety Equipment & Workwear',
    'Building & Construction Materials', 'Electrical & Wiring', 'Plumbing & Bathroom Fittings',
    'Flooring & Tiling', 'Paint, Woodcare & Wallpaper', 'Fencing & Gates',
    'Roofing & Insulation', 'Welding & Soldering', 'Heavy Lifting Equipment',
  ],
  'Furniture & Office': [
    'Office Chairs & Desks', 'Home Office Furniture', 'Living Room Furniture',
    'Bedroom Furniture', 'Dining Furniture', 'Kids Furniture',
    'Bookshelves & Storage Units', 'Outdoor Furniture',
  ],
  'Clothing, Shoes & Accessories': [
    "Women's Clothing", "Men's Clothing", "Kids' Clothing", 'Baby Clothing',
    'Footwear', 'Underwear & Socks', 'Jewellery & Watches', 'Bags & Luggage',
    'Accessories & Hats',
  ],
  'Sports & Fitness': [
    'Fitness Equipment', 'Cycling', 'Golf', 'Running & Yoga', 'Outdoor & Adventure Sports',
    'Team Sports', 'Water Sports', 'Camping & Hiking', 'Wearables & Fitness Trackers',
  ],
  'Toys, Games & Hobbies': [
    'Action Figures & Collectibles', 'Board Games & Puzzles', 'Building & Construction Toys',
    'Remote Control & Drones', 'Outdoor Play Equipment', 'Educational Toys', 'Arts & Crafts',
    'Model Kits & Trains', 'Trading Card Games', 'Plush & Stuffed Toys',
  ],
  'Books, Movies & Music': [
    'Books', 'DVDs & Blu-ray', 'Vinyl & Music', 'Digital Media & Streaming',
    'Music Collectibles & Merchandise',
  ],
  'Stationery & Office Supplies': [
    'Pens, Pencils & Markers', 'Notebooks, Journals & Planners', 'Filing & Organisation',
    'Labels & Stickers', 'Sticky Notes & Accessories', 'Correction Products',
  ],
  'Automotive': [
    'Car Parts & Accessories', 'Car Care & Cleaning', 'Motorcycles & Parts',
    'Boats & Marine', 'Car Electronics & Dash Cams', 'Tyres & Wheels',
  ],
  'Electrical & Smart Home': [
    'Smart Lighting & Power', 'Smart Security & Doorbells', 'Smart Speakers & Displays',
    'Home Automation', 'Solar & EV Charging', 'Electrical Accessories & Wiring',
  ],
  'Assisted Living & Accessibility': [
    'Mobility Aids', 'Bathroom Safety', 'Daily Living Aids', 'Home Safety & Modifications',
    'Bedroom Support', 'Health & Wellness Aids',
  ],
  'Party, Celebrations & Gifts': [
    'Party Supplies & Decorations', 'Gift Wrap & Cards', 'Seasonal & Holiday Decor',
    'Disposable Tableware', 'Celebration Cakes & Candles',
  ],
  'Food Service & Commercial': [
    'Commercial Kitchen Equipment', 'Catering Supplies', 'Industrial Cleaning',
    'Business Supplies',
  ],
};

List<String> secondaryOptionsFor(String? primary) {
  if (primary == null || primary.isEmpty || primary == 'General') return const [];
  return kSecondaryCategories[primary] ?? const [];
}
