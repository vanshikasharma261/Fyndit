import { CURRENCY_LOCALE } from "../constants/values.constant";

/**
 * Display formatters for catalog money. Prices/discounts arrive from the API as
 * 2-decimal strings (`"799.00"`); the UI renders rupees with Indian grouping
 * and no decimals (e.g. `₹2,999`), matching the screenshots.
 */

const rupeeFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  maximumFractionDigits: 0,
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
