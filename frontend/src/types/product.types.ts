/**
 * Product browsing contracts shared between the products slice, thunks, service
 * and pages. These mirror the backend `004-products-listing` payloads exactly.
 * Money fields are strings (`"799.00"`) — the API never leaks Decimal/float.
 */

// ----- Listing -----

export interface ProductListItem {
  product_id: string;
  product_name: string;
  slug: string;
  brand: string;
  description: string;
  price: string;
  discount: string;
  image_url: string | null;
  category_slug: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
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
  name: string;
  label: string;
  values: string[];
}

export interface ProductFiltersResponse {
  price: { min: string; max: string };
  attributes: AttributeFacet[];
}

// ----- Request params -----

export interface ListProductsParams {
  category: string;
  search?: string;
  page?: number;
  minPrice?: number;
  maxPrice?: number;
  /** e.g. { color: ["blue"], size: ["32"] } */
  attributes?: Record<string, string[]>;
}

// ----- Errors -----

/** Standard NestJS exception envelope for non-2xx product responses. */
export interface ProductErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
