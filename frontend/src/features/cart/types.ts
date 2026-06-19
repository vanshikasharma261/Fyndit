import type { CartItem, CartSummary } from "../../types/cart.types";

/**
 * Redux state owned by the cart feature. `summary` drives both the PRICE
 * DETAILS panel and the navbar badge (`summary.total_items`). Mutations keep
 * `summary` in sync so the badge stays live without a refetch.
 *
 * (API contract types live in `src/types/cart.types.ts` since they are shared
 * with the page and service.)
 */
export interface CartState {
  items: CartItem[];
  summary: CartSummary | null;
  /** `GET /cart` in flight (initial load / refresh). */
  loading: boolean;
  /** A failed cart load (network/server) — shown on the cart page. */
  error: string | null;
  /** The `cart_item_id` whose quantity/removal is in flight, or null. */
  mutatingId: string | null;
  /** `POST /cart` in flight (add-to-cart, e.g. from the product page). */
  adding: boolean;
}
