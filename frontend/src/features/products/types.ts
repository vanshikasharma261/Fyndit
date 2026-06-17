import type {
  PaginationMeta,
  ProductDetailResponse,
  ProductFiltersResponse,
  ProductListItem,
} from "../../types/product.types";

/**
 * Redux state owned by the products feature. (API contract types live in
 * `src/types/product.types.ts` since they are shared with pages and the service.)
 *
 * The URL query string remains the source of truth for the active
 * category/search/page/filters; the echoed values here simply reflect the most
 * recent successful list request.
 */
export interface ProductsState {
  // ----- Listing -----
  items: ProductListItem[];
  meta: PaginationMeta | null;
  listLoading: boolean;
  listError: string | null;

  // ----- Facets -----
  filters: ProductFiltersResponse | null;
  filtersLoading: boolean;

  // ----- Detail -----
  detail: ProductDetailResponse | null;
  detailLoading: boolean;
  detailError: string | null;
}
