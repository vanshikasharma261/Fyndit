/**
 * Checkout API contracts, shared between the checkout slice, thunks, service and
 * the Checkout page. Mirror the backend `009-checkout-order` payloads exactly.
 * Money fields are 2-decimal strings (`"1023.00"`) — the API never leaks
 * Decimal/float.
 */

import type { ErrorResponse, ValidationErrorResponse } from "./auth.types";

export type DiscountType = "PERCENTAGE" | "FIXED";

export interface CheckoutItem {
  cart_item_id: string;
  product_variant_id: string;
  product_name: string;
  brand: string;
  image_url: string | null;
  attributes: Record<string, string>;
  price: string;
  discount: string;
  final_price: string;
  quantity: number;
  stock: number;
  out_of_stock: boolean;
}

export interface AppliedCoupon {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  discount_amount: string;
}

export interface CheckoutPersonal {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
}

/** `GET /checkout`, `POST`/`DELETE /checkout/coupon`. */
export interface CheckoutSummary {
  items: CheckoutItem[];
  total_items: number;
  sub_total: string;
  coupon_discount: string;
  shipping_fee: string;
  total: string;
  applied_coupon: AppliedCoupon | null;
  personal: CheckoutPersonal;
}

/** `POST /checkout/payment-intent`. */
export interface PaymentIntentResponse {
  client_secret: string;
  total: string;
}

/** Union accepted by every checkout thunk's `rejectValue`. */
export type CheckoutErrorResponse = ValidationErrorResponse | ErrorResponse;
