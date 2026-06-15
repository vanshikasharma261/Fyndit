/**
 * Shared contracts for the data-driven seed system.
 *
 * The seed script (`prisma/seed.ts`) is generic: it never hard-codes products
 * or variants. Adding a new product means appending one {@link ProductSeed} to
 * `products.data.ts` — no seed-logic changes are required. Variants are derived
 * automatically from the cartesian product of `colors` x every `options`
 * dimension.
 */

/** A category attribute used for future product filtering/search. */
export type CategoryAttribute = string;

/** A child category nested under a parent. */
export interface ChildCategorySeed {
  name: string;
  slug: string;
  attributes: CategoryAttribute[];
}

/** A top-level category with its children. */
export interface ParentCategorySeed {
  name: string;
  slug: string;
  attributes: CategoryAttribute[];
  children: ChildCategorySeed[];
}

/**
 * A secondary variant dimension (besides color), e.g. storage or size.
 * The dimension `name` becomes a key in the variant's `attributes` JSON.
 */
export interface VariantDimension {
  name: string;
  values: string[];
}

/**
 * A single product. Variants are generated from the cartesian product of
 * `colors` x each dimension in `options`. Keep the resulting count within
 * MIN/MAX_VARIANTS_PER_PRODUCT (enforced at seed time).
 */
export interface ProductSeed {
  name: string;
  slug: string;
  brand: string;
  description: string;
  /** Slug of the (child) category this product belongs to. */
  categorySlug: string;
  /** Base price in the store currency, before per-option modifiers. */
  basePrice: number;
  /** Flat discount amount applied to every variant of this product. */
  discount: number;
  /** Stock assigned to every generated variant. */
  stock: number;
  /** Color dimension — always present, drives the image folders. */
  colors: string[];
  /** Optional extra dimensions (size, storage, ...) crossed with colors. */
  options?: VariantDimension[];
  /**
   * Optional price deltas keyed by an option value (e.g. `{ "256GB": 100 }`).
   * Added to `basePrice` when that value is part of the variant.
   */
  priceModifiers?: Record<string, number>;
}

/** A fully resolved variant produced by the cartesian generator. */
export interface GeneratedVariant {
  sku: string;
  price: number;
  discount: number;
  stock: number;
  color: string;
  attributes: Record<string, string>;
}

/** One image row for a variant. */
export interface VariantImageSeed {
  imageUrl: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
}

/** A seedable coupon. */
export interface CouponSeed {
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minimumOrder?: number;
  usageLimit?: number;
  isActive: boolean;
}
