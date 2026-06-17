/**
 * Response contracts for the public Product module.
 *
 * Money fields (`price`, `discount`) are always serialized as 2-decimal
 * **strings** (`"799.00"`) so no `Prisma.Decimal`/float ever leaks to the client.
 */

// ----- Listing -----

export interface ProductListItem {
  product_id: string;
  product_name: string;
  slug: string;
  brand: string;
  description: string;
  /** Representative variant price, e.g. "799.00". */
  price: string;
  /** Representative variant discount, e.g. "50.00". */
  discount: string;
  image_url: string | null;
  category_slug: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  /** ceil(total / limit). */
  total_pages: number;
}

export interface ProductListResponse {
  items: ProductListItem[];
  meta: PaginationMeta;
}

// ----- Detail -----

export interface ProductVariantImage {
  image_url: string;
  alt_text: string | null;
  is_primary: boolean;
}

export interface ProductVariantDetail {
  product_variant_id: string;
  sku: string;
  stock: number;
  price: string;
  discount: string;
  /** Dynamic per-category attribute map, e.g. { color: "blue", storage: "256GB" }. */
  attributes: Record<string, string>;
  images: ProductVariantImage[];
}

export interface ProductDetailResponse {
  product_id: string;
  product_name: string;
  slug: string;
  brand: string;
  description: string;
  category: { category_id: string; category_name: string; slug: string };
  variants: ProductVariantDetail[];
}

// ----- Filters (facets) -----

export interface AttributeFacet {
  /** Raw attribute key, e.g. "color". */
  name: string;
  /** Display label, e.g. "Color". */
  label: string;
  /** Distinct available values, e.g. ["blue", "black"]. */
  values: string[];
}

export interface ProductFiltersResponse {
  price: { min: string; max: string };
  attributes: AttributeFacet[];
}

// ----- Internal where-builder options -----

/**
 * Typed options the service translates into a Prisma `where` clause. Filters are
 * composed from this object (never a hardcoded literal) so they stay extensible.
 *
 * - `categoryIds === null` → no category constraint (the `All` scope).
 * - `categoryIds === []`   → an unknown slug; matches nothing (valid empty page).
 */
export interface ProductWhereOptions {
  categoryIds: string[] | null;
  search?: string;
  minPrice?: number;
  /** Ignored when `< minPrice`. */
  maxPrice?: number;
  /** Sanitized attribute map (only keys valid for the scope, non-empty arrays). */
  attributes?: Record<string, string[]>;
}
