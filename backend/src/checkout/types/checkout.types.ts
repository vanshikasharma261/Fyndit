import { Prisma } from '../../generated/prisma/client';
import { DiscountType } from '../../generated/prisma/enums';

/**
 * Response contracts for the Checkout module. Money fields are always
 * serialized as 2-decimal **strings** (`"1023.00"`) so no `Prisma.Decimal`/float
 * ever leaks to the client — identical to the cart contract.
 */

export interface CheckoutItem {
  cart_item_id: string;
  product_variant_id: string;
  product_name: string;
  brand: string;
  image_url: string | null;
  attributes: Record<string, string>;
  /** Per-unit list price. */
  price: string;
  /** Per-unit flat discount amount. */
  discount: string;
  /** Per-unit price after the variant discount, `max(0, price - discount)`. */
  final_price: string;
  quantity: number;
  stock: number;
  /** `stock === 0` — shown with an overlay and excluded from the totals/order. */
  out_of_stock: boolean;
}

/** The coupon currently applied to the cart, reflected in the summary. */
export interface AppliedCoupon {
  code: string;
  discount_type: DiscountType;
  /** The raw coupon value (a percentage or a flat amount), as a string. */
  discount_value: string;
  /** The actual rupee discount this coupon yields on the current subtotal. */
  discount_amount: string;
}

/** Billing details pre-filled from the user's profile (read-only on checkout). */
export interface CheckoutPersonal {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
}

/** `GET /checkout` (and the coupon endpoints) — the full checkout summary. */
export interface CheckoutSummary {
  items: CheckoutItem[];
  /** Σ quantities of in-stock lines (out-of-stock lines excluded). */
  total_items: number;
  /** Σ final_price × qty over in-stock lines (before coupon). */
  sub_total: string;
  /** Coupon discount applied to the subtotal (`"0.00"` when none). */
  coupon_discount: string;
  /** Flat shipping fee (`"100.00"` when sub_total < threshold, else `"0.00"`). */
  shipping_fee: string;
  /** sub_total − coupon_discount + shipping_fee. */
  total: string;
  applied_coupon: AppliedCoupon | null;
  personal: CheckoutPersonal;
}

/** `POST /checkout/payment-intent` — the Stripe client secret + charged total. */
export interface PaymentIntentResponse {
  client_secret: string;
  total: string;
}

// ----- Internal (shared with the order module for placement) -----

/** A validated coupon plus the discount it yields on a given subtotal. */
export interface CouponEvaluation {
  coupon_id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: Prisma.Decimal;
  discount_amount: Prisma.Decimal;
}

/** One snapshot line to persist as an `OrderItem` (name + final unit price). */
export interface OrderLine {
  product_variant_id: string;
  product_name: string;
  /** Final unit price charged, `max(0, price - variant.discount)`. */
  purchase_price: Prisma.Decimal;
  quantity: number;
}

/**
 * The authoritative, re-validated order breakdown built from the cart. Produced
 * by `CheckoutService.buildOrderContext` inside a transaction and consumed by
 * the order-placement paths (COD + Stripe webhook). All amounts are 2-decimal
 * `Prisma.Decimal`s. Throws (empty cart / insufficient stock) rather than
 * returning a non-placeable context.
 */
export interface OrderContext {
  lines: OrderLine[];
  sub_total: Prisma.Decimal;
  coupon: CouponEvaluation | null;
  coupon_discount: Prisma.Decimal;
  shipping_fee: Prisma.Decimal;
  total: Prisma.Decimal;
}
