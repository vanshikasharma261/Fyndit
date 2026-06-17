/**
 * Browseable category scopes, mirroring the seeded hierarchy in
 * `backend/prisma/seed-data/categories.data.ts`. Each entry maps a display
 * label to the `:category` slug used by `/product/:category`.
 *
 * `clothing` is a curated alias the backend resolves to both clothing children
 * (there is no real `clothing` category). There is no Books category — the
 * navbar "Books" item is replaced with "Furniture".
 */

export interface CategoryLink {
  label: string;
  /** Slug used in `/product/:slug`, or `All` for the global scope. */
  slug: string;
}

/** Top navbar items. "For You" returns home and triggers no product fetch. */
export const NAV_LINKS: { label: string; to: string }[] = [
  { label: 'For You', to: '/' },
  { label: 'Clothing', to: '/product/clothing' },
  { label: 'Electronics', to: '/product/electronics' },
  { label: 'Mobile', to: '/product/mobile-phones' },
  { label: 'Furniture', to: '/product/furniture' },
];

/** Footer "Shop" column — same scopes as the navbar (minus For You). */
export const FOOTER_SHOP_LINKS: CategoryLink[] = [
  { label: 'Clothing', slug: 'clothing' },
  { label: 'Electronics', slug: 'electronics' },
  { label: 'Mobile', slug: 'mobile-phones' },
  { label: 'Furniture', slug: 'furniture' },
];

/**
 * Full list for the "Select Category" dropdown — every category that holds
 * products (parents include their descendants; `clothing` is the curated scope).
 */
export const SELECT_CATEGORIES: CategoryLink[] = [
  // `All` spans every category with no attribute facets — only the price range.
  { label: 'All Products', slug: 'All' },
  { label: 'Electronics', slug: 'electronics' },
  { label: 'Mobile Phones', slug: 'mobile-phones' },
  { label: 'Laptops', slug: 'laptops' },
  { label: 'Headphones', slug: 'headphones' },
  { label: 'Smart Watches', slug: 'smart-watches' },
  { label: 'Clothing', slug: 'clothing' },
  { label: "Men's Clothing", slug: 'mens-clothing' },
  { label: "Women's Clothing", slug: 'womens-clothing' },
  { label: 'Footwear', slug: 'footwear' },
  { label: 'Cookware', slug: 'cookware' },
  { label: 'Home Decor', slug: 'home-decor' },
  { label: 'Furniture', slug: 'furniture' },
];
