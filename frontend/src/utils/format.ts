import { CURRENCY_LOCALE } from "../constants/values.constant";

/**
 * Display formatters for catalog money. Prices/discounts arrive from the API as
 * 2-decimal strings (`"799.00"`); the UI renders rupees with Indian grouping
 * and no decimals (e.g. `₹2,999`), matching the screenshots.
 */

const rupeeFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  maximumFractionDigits: 0,
});

/**
 * Exact-amount formatter (2 decimals) for checkout/order money, where every
 * paisa matters — e.g. `₹1,178.56`. Distinct from `formatPrice`, which rounds
 * for catalog display.
 */
const rupeeExactFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toNumber(value: string | number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

/** `"color"` → `"Color"`, `"smart-watch"` → `"Smart Watch"`. */
export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** `"2999.00"` → `"₹2,999"`. */
export function formatPrice(value: string | number): string {
  return `₹${rupeeFormatter.format(Math.round(toNumber(value)))}`;
}

/** `"1178.56"` → `"₹1,178.56"` — exact 2-decimal amount (checkout/orders). */
export function formatMoney(value: string | number): string {
  return `₹${rupeeExactFormatter.format(toNumber(value))}`;
}

const orderDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** ISO timestamp → `"01 Jun 2026"` (matches the order screenshots). */
export function formatOrderDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : orderDateFormatter.format(date);
}

/**
 * A short, display-friendly order code derived from the order's uuid — the
 * first 8 hex chars, upper-cased and `#`-prefixed (e.g. `"#A2224894"`). Mirrors
 * the backend `OrderService.orderNumber`; the API also returns `order_number`,
 * so prefer that when present and use this only as a fallback.
 */
export function formatOrderNumber(orderId: string): string {
  return `#${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * The discount badge text, e.g. `"15 % off"`, derived from the flat discount
 * amount relative to the price. Returns `null` when there is no discount.
 */
export function formatDiscountBadge(
  price: string | number,
  discount: string | number,
): string | null {
  const priceNum = toNumber(price);
  const discountNum = toNumber(discount);
  if (priceNum <= 0 || discountNum <= 0) {
    return null;
  }
  const percent = Math.round((discountNum / priceNum) * 100);
  if (percent <= 0) {
    return null;
  }
  return `${percent} % off`;
}
