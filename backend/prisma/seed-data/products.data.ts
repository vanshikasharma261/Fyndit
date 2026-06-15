import type { ProductSeed } from './types';

/**
 * Product catalog. This is the ONLY file to edit when adding a product —
 * variants, SKUs, prices and images are all derived automatically by
 * `prisma/seed.ts` from `colors` x `options`.
 *
 * Keep `colors.length * product(options.values.length)` within 2-8 (see
 * MIN/MAX_VARIANTS_PER_PRODUCT) so every product has an allowed variant count.
 */
export const products: ProductSeed[] = [
  // ---------------------------------------------------------------- Mobile Phones
  {
    name: 'Samsung Galaxy S25',
    slug: 'samsung-galaxy-s25',
    brand: 'Samsung',
    description:
      'Flagship Android smartphone with a brilliant AMOLED display, pro-grade camera system and all-day battery life.',
    categorySlug: 'mobile-phones',
    basePrice: 799.0,
    discount: 50.0,
    stock: 40,
    colors: ['blue', 'violet'],
    options: [{ name: 'storage', values: ['128GB', '256GB'] }],
    priceModifiers: { '256GB': 100 },
  },
  {
    name: 'Apple iPhone 16',
    slug: 'apple-iphone-16',
    brand: 'Apple',
    description:
      'The latest iPhone featuring the A18 chip, an advanced dual-camera system and a durable aerospace-grade design.',
    categorySlug: 'mobile-phones',
    basePrice: 899.0,
    discount: 0.0,
    stock: 35,
    colors: ['black', 'blue'],
    options: [{ name: 'storage', values: ['128GB', '256GB'] }],
    priceModifiers: { '256GB': 150 },
  },
  {
    name: 'Google Pixel 9',
    slug: 'google-pixel-9',
    brand: 'Google',
    description:
      'Pure Android experience with the Tensor G4 chip and a computational photography camera that excels in any light.',
    categorySlug: 'mobile-phones',
    basePrice: 699.0,
    discount: 40.0,
    stock: 30,
    colors: ['obsidian', 'porcelain'],
    options: [{ name: 'storage', values: ['128GB'] }],
  },

  // ---------------------------------------------------------------------- Laptops
  {
    name: 'Dell XPS 15',
    slug: 'dell-xps-15',
    brand: 'Dell',
    description:
      'Premium 15-inch laptop with a stunning InfinityEdge display, powerful performance and a machined aluminum chassis.',
    categorySlug: 'laptops',
    basePrice: 1499.0,
    discount: 100.0,
    stock: 20,
    colors: ['silver', 'white'],
    options: [{ name: 'storage', values: ['512GB', '1TB'] }],
    priceModifiers: { '1TB': 200 },
  },
  {
    name: 'Apple MacBook Air',
    slug: 'apple-macbook-air',
    brand: 'Apple',
    description:
      'Strikingly thin and light laptop powered by the M-series chip, with a silent fanless design and long battery life.',
    categorySlug: 'laptops',
    basePrice: 1099.0,
    discount: 0.0,
    stock: 25,
    colors: ['midnight', 'starlight'],
    options: [{ name: 'storage', values: ['256GB', '512GB'] }],
    priceModifiers: { '512GB': 200 },
  },
  {
    name: 'Lenovo ThinkPad X1 Carbon',
    slug: 'lenovo-thinkpad-x1-carbon',
    brand: 'Lenovo',
    description:
      'Business-class ultrabook with a legendary keyboard, robust security features and a lightweight carbon-fiber build.',
    categorySlug: 'laptops',
    basePrice: 1299.0,
    discount: 120.0,
    stock: 18,
    colors: ['black', 'silver'],
    options: [{ name: 'storage', values: ['512GB', '1TB'] }],
    priceModifiers: { '1TB': 180 },
  },

  // ------------------------------------------------------------------- Headphones
  {
    name: 'Sony WH-1000XM5',
    slug: 'sony-wh-1000xm5',
    brand: 'Sony',
    description:
      'Industry-leading noise-cancelling over-ear headphones with pristine sound and a comfortable lightweight design.',
    categorySlug: 'headphones',
    basePrice: 349.0,
    discount: 30.0,
    stock: 50,
    colors: ['black', 'silver'],
  },
  {
    name: 'Bose QuietComfort Ultra',
    slug: 'bose-quietcomfort-ultra',
    brand: 'Bose',
    description:
      'Premium wireless headphones delivering immersive spatial audio and world-class active noise cancellation.',
    categorySlug: 'headphones',
    basePrice: 379.0,
    discount: 0.0,
    stock: 45,
    colors: ['black', 'white', 'blue'],
  },
  {
    name: 'Apple AirPods Max',
    slug: 'apple-airpods-max',
    brand: 'Apple',
    description:
      'High-fidelity over-ear headphones with adaptive EQ, spatial audio and a premium knit-mesh canopy.',
    categorySlug: 'headphones',
    basePrice: 549.0,
    discount: 0.0,
    stock: 22,
    colors: ['space-gray', 'sky-blue'],
  },

  // ----------------------------------------------------------------- Smart Watches
  {
    name: 'Apple Watch Series 10',
    slug: 'apple-watch-series-10',
    brand: 'Apple',
    description:
      'Advanced health and fitness companion with a brighter display, fast charging and comprehensive workout tracking.',
    categorySlug: 'smart-watches',
    basePrice: 399.0,
    discount: 20.0,
    stock: 38,
    colors: ['black', 'silver'],
    options: [{ name: 'size', values: ['41mm', '45mm'] }],
    priceModifiers: { '45mm': 30 },
  },
  {
    name: 'Samsung Galaxy Watch 7',
    slug: 'samsung-galaxy-watch-7',
    brand: 'Samsung',
    description:
      'Sleek smartwatch with detailed sleep insights, body composition analysis and seamless Android integration.',
    categorySlug: 'smart-watches',
    basePrice: 329.0,
    discount: 25.0,
    stock: 36,
    colors: ['green', 'silver'],
    options: [{ name: 'size', values: ['40mm', '44mm'] }],
    priceModifiers: { '44mm': 30 },
  },

  // --------------------------------------------------------------- Men's Clothing
  {
    name: 'Classic Cotton T-Shirt',
    slug: 'classic-cotton-t-shirt',
    brand: 'Urban Basics',
    description:
      'Soft 100% combed-cotton crew-neck tee with a relaxed fit — an everyday wardrobe essential.',
    categorySlug: 'mens-clothing',
    basePrice: 24.99,
    discount: 5.0,
    stock: 120,
    colors: ['red', 'blue'],
    options: [{ name: 'size', values: ['S', 'M'] }],
  },
  {
    name: 'Slim Fit Jeans',
    slug: 'slim-fit-jeans',
    brand: 'Denim Co',
    description:
      'Stretch-denim slim-fit jeans that move with you, finished with a classic five-pocket styling.',
    categorySlug: 'mens-clothing',
    basePrice: 59.99,
    discount: 10.0,
    stock: 80,
    colors: ['blue'],
    options: [{ name: 'size', values: ['30', '32', '34'] }],
  },
  {
    name: 'Hooded Sweatshirt',
    slug: 'hooded-sweatshirt',
    brand: 'Urban Basics',
    description:
      'Cozy fleece-lined pullover hoodie with a kangaroo pocket and adjustable drawstring hood.',
    categorySlug: 'mens-clothing',
    basePrice: 44.99,
    discount: 8.0,
    stock: 90,
    colors: ['gray', 'blue'],
    options: [{ name: 'size', values: ['M', 'L'] }],
  },

  // ------------------------------------------------------------- Women's Clothing
  {
    name: 'Floral Summer Dress',
    slug: 'floral-summer-dress',
    brand: 'Bloom',
    description:
      'Lightweight floral-print midi dress with a flattering A-line silhouette, perfect for warm days.',
    categorySlug: 'womens-clothing',
    basePrice: 49.99,
    discount: 7.0,
    stock: 70,
    colors: ['red', 'yellow'],
    options: [{ name: 'size', values: ['S', 'M', 'L'] }],
  },
  {
    name: 'Knit Cardigan',
    slug: 'knit-cardigan',
    brand: 'Bloom',
    description:
      'Soft chunky-knit open-front cardigan with ribbed cuffs — an effortless layering piece.',
    categorySlug: 'womens-clothing',
    basePrice: 54.99,
    discount: 0.0,
    stock: 65,
    colors: ['beige', 'navy'],
    options: [{ name: 'size', values: ['M', 'L'] }],
  },
  {
    name: 'High-Waist Leggings',
    slug: 'high-waist-leggings',
    brand: 'FlexFit',
    description:
      'Squat-proof high-waist leggings with four-way stretch and a hidden waistband pocket.',
    categorySlug: 'womens-clothing',
    basePrice: 34.99,
    discount: 5.0,
    stock: 110,
    colors: ['black', 'charcoal'],
    options: [{ name: 'size', values: ['S', 'M'] }],
  },

  // -------------------------------------------------------------------- Footwear
  {
    name: 'Nike Air Max',
    slug: 'nike-air-max',
    brand: 'Nike',
    description:
      'Iconic running-inspired sneakers with visible Air cushioning and a breathable mesh upper.',
    categorySlug: 'footwear',
    basePrice: 129.99,
    discount: 15.0,
    stock: 60,
    colors: ['white', 'black'],
    options: [{ name: 'size', values: ['9', '10'] }],
  },
  {
    name: 'Adidas Ultraboost',
    slug: 'adidas-ultraboost',
    brand: 'Adidas',
    description:
      'Responsive performance running shoe with Boost midsole energy return and a supportive Primeknit fit.',
    categorySlug: 'footwear',
    basePrice: 149.99,
    discount: 20.0,
    stock: 55,
    colors: ['black'],
    options: [{ name: 'size', values: ['8', '9', '10'] }],
  },
  {
    name: 'Puma Running Shoes',
    slug: 'puma-running-shoes',
    brand: 'Puma',
    description:
      'Lightweight everyday running shoes with cushioned support and a sporty, modern profile.',
    categorySlug: 'footwear',
    basePrice: 89.99,
    discount: 10.0,
    stock: 75,
    colors: ['black', 'red'],
    options: [{ name: 'size', values: ['9', '10'] }],
  },

  // -------------------------------------------------------------------- Cookware
  {
    name: 'Stainless Steel Pan Set',
    slug: 'stainless-steel-pan-set',
    brand: 'ChefLine',
    description:
      'Tri-ply stainless steel cookware set with even heat distribution and ergonomic stay-cool handles.',
    categorySlug: 'cookware',
    basePrice: 159.99,
    discount: 20.0,
    stock: 40,
    colors: ['silver', 'black'],
  },
  {
    name: 'Non-Stick Frypan',
    slug: 'non-stick-frypan',
    brand: 'ChefLine',
    description:
      'Durable non-stick frypan with a scratch-resistant coating and an oven-safe riveted handle.',
    categorySlug: 'cookware',
    basePrice: 39.99,
    discount: 5.0,
    stock: 85,
    colors: ['black', 'red'],
  },

  // ------------------------------------------------------------------ Home Decor
  {
    name: 'Ceramic Table Vase',
    slug: 'ceramic-table-vase',
    brand: 'Casa',
    description:
      'Hand-glazed ceramic vase with a minimalist matte finish — a refined accent for any room.',
    categorySlug: 'home-decor',
    basePrice: 29.99,
    discount: 0.0,
    stock: 95,
    colors: ['white', 'blue', 'green'],
  },
  {
    name: 'Scented Candle Set',
    slug: 'scented-candle-set',
    brand: 'Casa',
    description:
      'Set of natural soy-wax candles with calming fragrances and a long, clean burn time.',
    categorySlug: 'home-decor',
    basePrice: 34.99,
    discount: 6.0,
    stock: 100,
    colors: ['ivory', 'amber'],
  },

  // -------------------------------------------------------------------- Furniture
  {
    name: 'Ergonomic Office Chair',
    slug: 'ergonomic-office-chair',
    brand: 'WorkWell',
    description:
      'Breathable mesh office chair with adjustable lumbar support, armrests and a smooth-rolling base.',
    categorySlug: 'furniture',
    basePrice: 229.99,
    discount: 30.0,
    stock: 28,
    colors: ['black', 'gray'],
  },
  {
    name: 'Wooden Coffee Table',
    slug: 'wooden-coffee-table',
    brand: 'WorkWell',
    description:
      'Solid-wood coffee table with a warm natural finish and a sturdy lower storage shelf.',
    categorySlug: 'furniture',
    basePrice: 199.99,
    discount: 25.0,
    stock: 24,
    colors: ['walnut', 'oak'],
  },
];
