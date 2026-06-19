import { ConfigMessages } from "../../constants/messages.constant";
import type {
  AddToCartResponse,
  CartErrorResponse,
  CartResponse,
  RemoveCartResponse,
  UpdateCartResponse,
} from "../../types/cart.types";

/**
 * Cart API integration. Per the frontend rules all network logic lives here in
 * the service layer — slices/thunks call these functions, components never do.
 *
 * Every request sends `credentials: "include"` so the HTTP-only auth cookie is
 * attached; the backend gates each route behind the JWT guard + an
 * active-session check.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  // Fail loudly at startup rather than firing requests at `/undefined/cart`.
  throw new Error(ConfigMessages.missingApiUrl);
}

/** Normalised result of a fetch call — the thunk branches on `ok`. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Parsed body: the success payload on 2xx, an error envelope otherwise. */
  data: T | CartErrorResponse;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Sends a request and parses the body once. `fetch` does not reject on 4xx/5xx,
 * so callers inspect `ok`/`status`; it throws only on true network failures,
 * which the thunks catch.
 */
async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json()) as T | CartErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

export const cartService = {
  /** The whole cart: summary + every line. */
  get: () => request<CartResponse>("GET", "/cart"),

  /** Add a variant (new line at qty 1, or +1 on an existing line). */
  add: (productVariantId: string) =>
    request<AddToCartResponse>("POST", "/cart", {
      product_variant_id: productVariantId,
    }),

  /** Set a line's quantity. */
  update: (cartItemId: string, quantity: number) =>
    request<UpdateCartResponse>(
      "PATCH",
      `/cart/${encodeURIComponent(cartItemId)}`,
      { quantity },
    ),

  /** Remove a line. */
  remove: (cartItemId: string) =>
    request<RemoveCartResponse>(
      "DELETE",
      `/cart/${encodeURIComponent(cartItemId)}`,
    ),
};
