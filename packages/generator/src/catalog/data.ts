/**
 * Curated, fictional CPG catalog data (ADR-0008: no Faker, so output never shifts between versions).
 * Any resemblance to real brands is unintended.
 */

export interface ProductSpec {
  name: string;
  variants: readonly string[];
  /** Size label and its price multiplier relative to the base price. */
  sizes: readonly (readonly [label: string, factor: number])[];
  /** Price per unit of measure at factor 1.0, in dollars. */
  basePrice: number;
  packSize: number;
}

export interface VendorSpec {
  code: string;
  name: string;
  brand: string;
  category: string;
  address: string;
  uom: 'CS' | 'EA';
  products: readonly ProductSpec[];
}

export const BUYER = {
  name: 'Harbor & Pine Distribution',
  address: '1200 Wharf Road, Portland, ME 04101',
  shipTo: [
    'Harbor & Pine DC-1, 88 Industrial Way, Westbrook, ME 04092',
    'Harbor & Pine DC-2, 410 Commerce Dr, Nashua, NH 03063',
  ],
} as const;

const OZ = (n: number) => `${n} oz`;

export const VENDORS: readonly VendorSpec[] = [
  {
    code: 'SNPK',
    name: 'Sunpeak Foods Co.',
    brand: 'Sunpeak',
    category: 'Nut butters & spreads',
    address: '455 Orchard Ave, Fresno, CA 93721',
    uom: 'CS',
    products: [
      {
        name: 'Almond Butter',
        variants: ['Creamy', 'Crunchy', 'Organic Creamy'],
        sizes: [
          [OZ(12), 1],
          [OZ(16), 1.28],
        ],
        basePrice: 58.2,
        packSize: 12,
      },
      {
        name: 'Peanut Butter',
        variants: ['Creamy', 'Crunchy', 'Honey Roasted'],
        sizes: [
          [OZ(16), 1],
          [OZ(28), 1.6],
        ],
        basePrice: 31.8,
        packSize: 12,
      },
      {
        name: 'Cashew Spread',
        variants: ['Original', 'Maple', 'Cinnamon'],
        sizes: [[OZ(10), 1]],
        basePrice: 64.5,
        packSize: 6,
      },
    ],
  },
  {
    code: 'BRKC',
    name: 'Brookcrest Dairy Alternatives',
    brand: 'Brookcrest',
    category: 'Plant-based milks',
    address: '72 Mill Pond Rd, Burlington, VT 05401',
    uom: 'CS',
    products: [
      {
        name: 'Oat Milk',
        variants: ['Original', 'Unsweetened', 'Barista', 'Chocolate'],
        sizes: [
          ['32 fl oz', 1],
          ['64 fl oz', 1.7],
        ],
        basePrice: 21.6,
        packSize: 6,
      },
      {
        name: 'Almond Milk',
        variants: ['Original', 'Unsweetened Vanilla', 'Vanilla'],
        sizes: [
          ['32 fl oz', 0.6],
          ['64 fl oz', 1],
        ],
        basePrice: 23.4,
        packSize: 6,
      },
    ],
  },
  {
    code: 'TDLB',
    name: 'Tideline Beverage Company',
    brand: 'Tideline',
    category: 'Sparkling water & juice',
    address: '9 Harborview Pkwy, Charleston, SC 29401',
    uom: 'CS',
    products: [
      {
        name: 'Sparkling Water',
        variants: ['Lime', 'Grapefruit', 'Black Cherry', 'Unflavored'],
        sizes: [
          ['12 fl oz 8-pk', 1],
          ['12 fl oz 12-pk', 1.42],
        ],
        basePrice: 14.4,
        packSize: 3,
      },
      {
        name: 'Cold-Pressed Juice',
        variants: ['Orange', 'Green Apple', 'Carrot Ginger'],
        sizes: [
          ['12 fl oz', 0.4],
          ['52 fl oz', 1],
        ],
        basePrice: 38.9,
        packSize: 6,
      },
    ],
  },
  {
    code: 'HRVM',
    name: 'Harvest Mill Bakery Inc.',
    brand: 'Harvest Mill',
    category: 'Crackers & granola',
    address: '310 Grain Exchange St, Minneapolis, MN 55415',
    uom: 'CS',
    products: [
      {
        name: 'Granola',
        variants: ['Honey Almond', 'Maple Pecan', 'Dark Chocolate', 'Coconut Cashew'],
        sizes: [
          [OZ(12), 1],
          [OZ(24), 1.75],
        ],
        basePrice: 42.0,
        packSize: 8,
      },
      {
        name: 'Seed Crackers',
        variants: ['Sea Salt', 'Rosemary', 'Everything'],
        sizes: [
          [OZ(5), 1],
          [OZ(9), 1.6],
        ],
        basePrice: 33.6,
        packSize: 12,
      },
    ],
  },
  {
    code: 'CPRC',
    name: 'Copperleaf Coffee Roasters',
    brand: 'Copperleaf',
    category: 'Coffee',
    address: '1880 SE Division St, Portland, OR 97202',
    uom: 'CS',
    products: [
      {
        name: 'Whole Bean Coffee',
        variants: ['House Blend', 'French Roast', 'Ethiopia Single Origin', 'Colombia Supremo'],
        sizes: [
          [OZ(12), 1],
          ['2 lb', 2.4],
        ],
        basePrice: 61.2,
        packSize: 6,
      },
      {
        name: 'Ground Coffee',
        variants: ['Breakfast Blend', 'Decaf', 'Espresso Roast'],
        sizes: [
          [OZ(12), 1],
          ['2 lb', 2.3],
        ],
        basePrice: 57.0,
        packSize: 6,
      },
    ],
  },
  {
    code: 'GRNV',
    name: 'Greenvale Snacks LLC',
    brand: 'Greenvale',
    category: 'Chips & popcorn',
    address: '600 Prairie Center Dr, Omaha, NE 68114',
    uom: 'CS',
    products: [
      {
        name: 'Kettle Chips',
        variants: ['Sea Salt', 'Salt & Vinegar', 'Jalapeno', 'BBQ'],
        sizes: [
          [OZ(5), 1],
          [OZ(8), 1.45],
        ],
        basePrice: 27.6,
        packSize: 12,
      },
      {
        name: 'Popcorn',
        variants: ['White Cheddar', 'Lightly Salted', 'Kettle Corn'],
        sizes: [
          [OZ(4.4), 1],
          [OZ(10), 1.8],
        ],
        basePrice: 30.0,
        packSize: 12,
      },
    ],
  },
  {
    code: 'LMNH',
    name: 'Lumen Home Care',
    brand: 'Lumen',
    category: 'Household cleaning',
    address: '2200 Riverside Blvd, Columbus, OH 43215',
    uom: 'CS',
    products: [
      {
        name: 'All-Purpose Cleaner',
        variants: ['Lavender', 'Citrus', 'Unscented'],
        sizes: [
          ['32 fl oz', 1],
          ['128 fl oz refill', 2.6],
        ],
        basePrice: 34.8,
        packSize: 8,
      },
      {
        name: 'Dish Soap',
        variants: ['Lemon', 'Free & Clear', 'Grapefruit'],
        sizes: [
          ['22 fl oz', 1],
          ['44 fl oz', 1.7],
        ],
        basePrice: 29.4,
        packSize: 9,
      },
      {
        name: 'Laundry Detergent',
        variants: ['Fresh Linen', 'Free & Clear'],
        sizes: [['64 loads', 1]],
        basePrice: 71.5,
        packSize: 4,
      },
    ],
  },
  {
    code: 'PRLB',
    name: 'Pearl & Birch Personal Care',
    brand: 'Pearl & Birch',
    category: 'Personal care',
    address: '18 Cedar Lane, Asheville, NC 28801',
    uom: 'EA',
    products: [
      {
        name: 'Bar Soap',
        variants: ['Oatmeal', 'Eucalyptus', 'Charcoal'],
        sizes: [[OZ(5), 1]],
        basePrice: 3.95,
        packSize: 1,
      },
      {
        name: 'Body Lotion',
        variants: ['Unscented', 'Coconut'],
        sizes: [
          ['8 fl oz', 1],
          ['16 fl oz', 1.65],
        ],
        basePrice: 7.4,
        packSize: 1,
      },
      {
        name: 'Shampoo',
        variants: ['Daily', 'Volumizing', 'Moisture'],
        sizes: [
          ['12 fl oz', 1],
          ['24 fl oz', 1.7],
        ],
        basePrice: 6.85,
        packSize: 1,
      },
    ],
  },
  {
    code: 'MSNT',
    name: 'Mesa Norte Pantry',
    brand: 'Mesa Norte',
    category: 'Mexican pantry',
    address: '77 Camino Real, Tucson, AZ 85701',
    uom: 'CS',
    products: [
      {
        name: 'Salsa',
        variants: ['Mild', 'Medium', 'Roja Hot', 'Verde'],
        sizes: [[OZ(16), 1]],
        basePrice: 26.4,
        packSize: 12,
      },
      {
        name: 'Refried Beans',
        variants: ['Pinto', 'Black', 'Vegetarian Pinto'],
        sizes: [
          [OZ(16), 1],
          [OZ(29), 1.6],
        ],
        basePrice: 18.0,
        packSize: 12,
      },
      {
        name: 'Corn Tortillas',
        variants: ['Yellow', 'White'],
        sizes: [
          ['30 ct', 1],
          ['80 ct', 2.3],
        ],
        basePrice: 22.8,
        packSize: 12,
      },
    ],
  },
  {
    code: 'NRTF',
    name: 'Northfield Frozen Foods',
    brand: 'Northfield',
    category: 'Frozen meals',
    address: '5100 Lakeshore Dr, Green Bay, WI 54301',
    uom: 'CS',
    products: [
      {
        name: 'Frozen Burrito',
        variants: ['Bean & Cheese', 'Chicken Verde', 'Breakfast', 'Steak Fajita'],
        sizes: [
          [OZ(6), 1],
          ['6 oz 8-pk', 6.4],
        ],
        basePrice: 36.0,
        packSize: 12,
      },
      {
        name: 'Veggie Fried Rice',
        variants: ['Original', 'Teriyaki', 'Spicy Kimchi'],
        sizes: [
          [OZ(16), 1],
          [OZ(32), 1.8],
        ],
        basePrice: 41.4,
        packSize: 8,
      },
    ],
  },
  {
    code: 'BLWT',
    name: 'Bluewater Seafood Co.',
    brand: 'Bluewater',
    category: 'Canned seafood',
    address: '1 Pier Street, Gloucester, MA 01930',
    uom: 'CS',
    products: [
      {
        name: 'Albacore Tuna',
        variants: ['in Water', 'in Olive Oil', 'No Salt Added'],
        sizes: [
          [OZ(5), 1],
          [OZ(12), 2.1],
        ],
        basePrice: 46.8,
        packSize: 12,
      },
      {
        name: 'Wild Sardines',
        variants: ['in Olive Oil', 'Lemon Pepper', 'Smoked'],
        sizes: [[OZ(4.4), 1]],
        basePrice: 39.6,
        packSize: 12,
      },
      {
        name: 'Pink Salmon',
        variants: ['Skinless Boneless', 'Smoked'],
        sizes: [
          [OZ(6), 1],
          [OZ(14.75), 2.2],
        ],
        basePrice: 52.2,
        packSize: 12,
      },
    ],
  },
  {
    code: 'KLPS',
    name: 'Kelp & Stone Naturals',
    brand: 'Kelp & Stone',
    category: 'Seaweed snacks & broth',
    address: '240 Coast Hwy, Santa Cruz, CA 95060',
    uom: 'CS',
    products: [
      {
        name: 'Seaweed Snacks',
        variants: ['Sea Salt', 'Teriyaki', 'Wasabi', 'Sesame'],
        sizes: [
          ['0.35 oz 6-pk', 1],
          ['0.17 oz 12-pk', 1.15],
        ],
        basePrice: 28.8,
        packSize: 12,
      },
      {
        name: 'Bone Broth',
        variants: ['Chicken', 'Beef', 'Mushroom Miso'],
        sizes: [
          ['32 fl oz', 1],
          ['16 fl oz', 0.6],
        ],
        basePrice: 44.4,
        packSize: 6,
      },
    ],
  },
  {
    code: 'ORCH',
    name: 'Orchard Lane Preserves',
    brand: 'Orchard Lane',
    category: 'Jams & preserves',
    address: '33 Hillcrest Rd, Hood River, OR 97031',
    uom: 'CS',
    products: [
      {
        name: 'Fruit Preserves',
        variants: ['Strawberry', 'Apricot', 'Blackberry', 'Wild Blueberry'],
        sizes: [
          [OZ(10), 1],
          [OZ(18), 1.6],
        ],
        basePrice: 37.2,
        packSize: 12,
      },
      {
        name: 'Raw Honey',
        variants: ['Wildflower', 'Clover', 'Orange Blossom'],
        sizes: [
          [OZ(12), 1],
          [OZ(24), 1.8],
        ],
        basePrice: 55.2,
        packSize: 12,
      },
    ],
  },
  {
    code: 'SPRK',
    name: 'Sprout Kids Nutrition',
    brand: 'Sprout Kids',
    category: "Kids' snacks",
    address: '900 Maple Commons, Boulder, CO 80302',
    uom: 'CS',
    products: [
      {
        name: 'Fruit & Veggie Pouch',
        variants: ['Apple Spinach', 'Pear Kale', 'Mango Carrot', 'Berry Beet'],
        sizes: [
          ['3.5 oz 4-pk', 1],
          ['3.5 oz 12-pk', 2.8],
        ],
        basePrice: 32.4,
        packSize: 6,
      },
      {
        name: 'Puffs',
        variants: ['Banana', 'Strawberry Beet', 'Sweet Potato'],
        sizes: [['1.5 oz', 1]],
        basePrice: 25.2,
        packSize: 6,
      },
      {
        name: 'Oat Bars',
        variants: ['Blueberry', 'Cocoa'],
        sizes: [['5 ct', 1]],
        basePrice: 29.4,
        packSize: 6,
      },
    ],
  },
  {
    code: 'ASHP',
    name: 'Ashpoint Paper Goods',
    brand: 'Ashpoint',
    category: 'Paper goods',
    address: '4500 Timberline Rd, Spokane, WA 99201',
    uom: 'CS',
    products: [
      {
        name: 'Paper Towels',
        variants: ['Select-a-Size', 'Recycled'],
        sizes: [
          ['6 roll', 1],
          ['12 roll', 1.85],
        ],
        basePrice: 48.0,
        packSize: 4,
      },
      {
        name: 'Napkins',
        variants: ['White', 'Kraft', 'Dinner 3-Ply'],
        sizes: [
          ['250 ct', 1],
          ['500 ct', 1.85],
        ],
        basePrice: 33.0,
        packSize: 12,
      },
      {
        name: 'Bath Tissue',
        variants: ['2-Ply', 'Recycled 2-Ply'],
        sizes: [
          ['12 roll', 1],
          ['24 roll', 1.9],
        ],
        basePrice: 39.6,
        packSize: 4,
      },
    ],
  },
];

/** Abbreviations real systems use; applied by the `description_typo` planted error. */
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
  Organic: 'Org',
  Butter: 'Btr',
  Creamy: 'Crmy',
  Crunchy: 'Crnchy',
  Chocolate: 'Choc',
  Original: 'Orig',
  Unsweetened: 'Unswt',
  Vanilla: 'Van',
  Sparkling: 'Spkl',
  Water: 'Wtr',
  Strawberry: 'Strwb',
  Blueberry: 'Blubry',
  Coffee: 'Cof',
  Roasted: 'Rstd',
  Detergent: 'Det',
  Cleaner: 'Clnr',
  Unscented: 'Unscnt',
  Preserves: 'Prsv',
  Crackers: 'Crkrs',
  Tortillas: 'Tort',
  Breakfast: 'Bkfst',
  Chicken: 'Chkn',
  Salmon: 'Slmn',
  Sardines: 'Sard',
  Napkins: 'Npkn',
  Towels: 'Twl',
  Lotion: 'Ltn',
  Shampoo: 'Shmp',
  Granola: 'Gran',
  Seaweed: 'Swd',
  'fl oz': 'FZ',
  ' oz': 'OZ',
};

/**
 * How vendors name our products on their own invoices (M4 AC-15): same item, different words.
 * A person would recognize them; a word-overlap matcher mostly won't. Keyed by product name.
 */
export const VENDOR_PRODUCT_NAMES: Readonly<Record<string, readonly string[]>> = {
  'Almond Butter': ['Nut Spread, Almond', 'Almond Nut Paste'],
  'Peanut Butter': ['Groundnut Spread', 'Nut Spread, Peanut'],
  'Cashew Spread': ['Cashew Nut Paste', 'Cashew Cream'],
  'Oat Milk': ['Oat Drink', 'Oat Beverage'],
  'Almond Milk': ['Almond Drink', 'Almond Beverage'],
  'Sparkling Water': ['Seltzer', 'Carbonated Water'],
  'Cold-Pressed Juice': ['Fresh Juice', 'Pressed Juice Bottle'],
  Granola: ['Clusters Cereal', 'Baked Oat Clusters'],
  'Seed Crackers': ['Seeded Crispbread', 'Seed Crisps'],
  'Whole Bean Coffee': ['Coffee Beans', 'Roasted Beans'],
  'Ground Coffee': ['Drip Grind Coffee', 'Fine Grind Roast'],
  'Kettle Chips': ['Kettle-Cooked Crisps', 'Potato Crisps'],
  Popcorn: ['Popped Corn Snack', 'Popped Kernels'],
  'All-Purpose Cleaner': ['Multi-Surface Spray', 'Household Spray'],
  'Dish Soap': ['Dishwashing Liquid', 'Washing-Up Liquid'],
  'Laundry Detergent': ['Clothes Wash', 'Washing Liquid'],
  'Bar Soap': ['Soap Bar', 'Cleansing Bar'],
  'Body Lotion': ['Moisturizing Cream', 'Body Moisturizer'],
  Shampoo: ['Hair Wash', 'Hair Cleanser'],
  Salsa: ['Dip Sauce', 'Tomato Dip'],
  'Refried Beans': ['Bean Mash', 'Mashed Beans'],
  'Corn Tortillas': ['Maize Wraps', 'Corn Flatbreads'],
  'Frozen Burrito': ['Frozen Wrap', 'Handheld Wrap, Frozen'],
  'Veggie Fried Rice': ['Vegetable Rice Bowl', 'Stir-Fry Rice'],
  'Albacore Tuna': ['White Tuna', 'Tuna Fillets'],
  'Wild Sardines': ['Sardine Fillets', 'Small Fish Tin'],
  'Pink Salmon': ['Salmon Fillet Tin', 'Wild Salmon Can'],
  'Seaweed Snacks': ['Nori Crisps', 'Roasted Seaweed Sheets'],
  'Bone Broth': ['Stock', 'Simmered Broth'],
  'Fruit Preserves': ['Jam', 'Fruit Spread'],
  'Raw Honey': ['Unfiltered Honey', 'Natural Honey'],
  'Fruit & Veggie Pouch': ['Squeeze Pouch', 'Puree Pouch'],
  Puffs: ['Melts', 'Baby Puff Snack'],
  'Oat Bars': ['Snack Bars', 'Oat Squares'],
  'Paper Towels': ['Kitchen Roll', 'Paper Wipes Roll'],
  Napkins: ['Serviettes', 'Table Napkins'],
  'Bath Tissue': ['Toilet Paper', 'Toilet Roll'],
};

/** How vendors reword variant words (applied word by word; unknown words stay as they are). */
export const VENDOR_VARIANT_WORDS: Readonly<Record<string, string>> = {
  Creamy: 'Smooth',
  Crunchy: 'Chunky',
  Original: 'Classic',
  Unsweetened: 'No Sugar Added',
  Chocolate: 'Cocoa',
  Unflavored: 'Plain',
  Lightly: 'Lightly',
  Salted: 'Salt',
  'Sea Salt': 'Salted',
  Barista: 'Cafe Style',
  Decaf: 'Decaffeinated',
  Mild: 'Gentle',
  Medium: 'Mid Heat',
  Hot: 'Spicy',
  Breakfast: 'Morning',
  Unscented: 'Fragrance Free',
  'Free & Clear': 'Sensitive',
  White: 'Bright White',
  Recycled: 'Eco',
};
