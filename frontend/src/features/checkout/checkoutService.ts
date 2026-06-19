import { ConfigMessages } from "../../constants/messages.constant";
import type {
  CheckoutErrorResponse,
  CheckoutSummary,
  PaymentIntentResponse,
} from "../../types/checkout.types";

/**
 * Checkout API integration. All network logic lives here in the service layer
 * (frontend rules); slices/thunks call these functions, components never do.
 * Every request sends `credentials: "include"` for the HTTP-only auth cookie.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error(ConfigMessages.missingApiUrl);
}

/** Normalised result of a fetch call — the thunk branches on `ok`. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | CheckoutErrorResponse;
}

type Method = "GET" | "POST" | "DELETE";

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

  const data = (await res.json()) as T | CheckoutErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

export const checkoutService = {
  /** The full checkout summary (items, totals, re-verified coupon, personal). */
  getSummary: () => request<CheckoutSummary>("GET", "/checkout"),

  /** Validate + apply a coupon code; returns the refreshed summary. */
  applyCoupon: (code: string) =>
    request<CheckoutSummary>("POST", "/checkout/coupon", { code }),

  /** Remove the applied coupon; returns the refreshed summary. */
  removeCoupon: () => request<CheckoutSummary>("DELETE", "/checkout/coupon"),

  /** Create a Stripe PaymentIntent for the card flow (no order yet). */
  createPaymentIntent: (addressId: string) =>
    request<PaymentIntentResponse>("POST", "/checkout/payment-intent", {
      address_id: addressId,
    }),
};
