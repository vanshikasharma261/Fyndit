/**
 * Cart API contracts, shared between the cart slice, thunks, service and pages.
 * Mirror the backend `007-cart-feature` payloads exactly. Money fields are
 * strings (`"1023.00"`) — the API never leaks Decimal/float. Coupons are not
 * part of the cart (applied at checkout), and the cart is returned whole (no
 * pagination; bounded to 25 distinct lines server-side).
 *
 * The error envelopes are reused from the auth contracts — the backend emits
 * the same NestJS exception shapes everywhere.
 */

import type { ErrorResponse, ValidationErrorResponse } from "./auth.types";

export interface CartItem {
  cart_item_id: string;
  product_variant_id: string;
  product_name: string;
  brand: string;
  description: string;
  image_url: string | null;
  price: string;
  discount: string;
  final_price: string;
  quantity: number;
  stock: number;
  attributes: Record<string, string>;
}

export interface CartSummary {
  total_items: number;
  total_price: string;
  total_discount: string;
  final_amount: string;
}

/** `GET /cart` — the summary (over all items) and the whole item list. */
export interface CartResponse {
  summary: CartSummary;
  items: CartItem[];
}

/** `POST /cart` — the single added/updated line plus the refreshed summary. */
export interface AddToCartResponse {
  item: CartItem;
  summary: CartSummary;
}

/** `PATCH /cart/:cartItemId` — message + the updated line and summary. */
export interface UpdateCartResponse {
  message: string;
  item: CartItem;
  summary: CartSummary;
}

/** `DELETE /cart/:cartItemId`. */
export interface RemoveCartResponse {
  message: string;
}

/** Union accepted by every cart thunk's `rejectValue`. */
export type CartErrorResponse = ValidationErrorResponse | ErrorResponse;
