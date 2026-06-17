import { ConfigMessages } from "../../constants/messages.constant";
import type {
  ListProductsParams,
  ProductDetailResponse,
  ProductErrorResponse,
  ProductFiltersResponse,
  ProductListResponse,
} from "../../types/product.types";

/**
 * Product API integration. Per the frontend rules all network logic lives here
 * in the service layer — slices/thunks call these functions, components never do.
 *
 * The whole app is protected, so these `GET`s send `credentials: "include"`
 * to attach the HTTP-only auth cookie; the backend gates each route behind the
 * JWT guard + an active-session check.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  // Fail loudly at startup rather than firing requests at `/undefined/product/...`.
  throw new Error(ConfigMessages.missingApiUrl);
}

/** Normalised result of a fetch call — the thunk branches on `ok`. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | ProductErrorResponse;
}

/**
 * GETs JSON and parses the body once. `fetch` does NOT reject on 4xx/5xx, so
 * callers inspect `ok`/`status`. Throws only on true network failures, which
 * the thunks catch.
 */
async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const data = (await res.json()) as T | ProductErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Assembles `/product/{category}?search=&page=&minPrice=&maxPrice=&attributes=`.
 * Empty/absent params are omitted; `attributes` is JSON-encoded only when set.
 */
export function buildProductListPath(params: ListProductsParams): string {
  const query = new URLSearchParams();

  if (params.search) query.set("search", params.search);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.minPrice !== undefined)
    query.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined)
    query.set("maxPrice", String(params.maxPrice));
  if (params.attributes && Object.keys(params.attributes).length > 0)
    query.set("attributes", JSON.stringify(params.attributes));

  const qs = query.toString();
  return `/product/${encodeURIComponent(params.category)}${qs ? `?${qs}` : ""}`;
}

/** Builds `/product/{category}/filters?search=`. */
export function buildFiltersPath(category: string, search?: string): string {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return `/product/${encodeURIComponent(category)}/filters${qs}`;
}

export const productService = {
  list: (params: ListProductsParams) =>
    getJson<ProductListResponse>(buildProductListPath(params)),

  filters: (category: string, search?: string) =>
    getJson<ProductFiltersResponse>(buildFiltersPath(category, search)),

  detail: (slug: string) =>
    getJson<ProductDetailResponse>(`/product/detail/${encodeURIComponent(slug)}`),
};
