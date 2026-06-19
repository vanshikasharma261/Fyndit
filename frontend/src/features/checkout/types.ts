import type { CheckoutSummary } from "../../types/checkout.types";

/**
 * Checkout slice state. Operational feedback (coupon applied/removed, errors) is
 * surfaced as a toast by the component via `.unwrap()`; the slice owns the
 * summary data + busy flags only. The order itself is placed via the `order`
 * slice (COD) or Stripe Elements (card).
 */
export interface CheckoutState {
  summary: CheckoutSummary | null;
  /** `GET /checkout` in flight (initial load / refresh). */
  loading: boolean;
  /** A coupon apply request is in flight. */
  applyingCoupon: boolean;
  /** A coupon remove request is in flight. */
  removingCoupon: boolean;
  /** A Stripe PaymentIntent creation is in flight (guards double-submit). */
  creatingIntent: boolean;
  /** Summary load failed (no summary to show). */
  error: string | null;
}
