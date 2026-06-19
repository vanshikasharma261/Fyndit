/**
 * Centralised, human-facing copy for the frontend. Mirrors the backend's
 * `messages.constant.ts` convention so strings live in exactly one place.
 */

export const ProductMessages = {
  networkError: "Unable to reach the server. Please check your connection.",
  genericError: "Something went wrong. Please try again.",
  emptyResults: "No products found",
  detailNotFound: "This product is no longer available.",
  loading: "Loading…",
  clearFilters: "Clear filters",
} as const;

export const CartMessages = {
  /** Heading on the populated cart page. */
  heading: "Shopping Cart",
  /** Summary panel heading. */
  priceDetails: "PRICE DETAILS",
  /** Empty-cart heading (matches `empty_cart_ui.png`). */
  empty: "Your Cart is empty",
  /** Shown while the cart is loading. */
  loading: "Loading…",
  /** Brief confirmation after a successful add-to-cart. */
  addSuccess: "Added to cart",
  /** Remove-item action label. */
  removeItem: "Remove Item",
  /** Checkout button label (checkout itself is a later feature). */
  checkout: "CHECKOUT",
  /** Stock status labels on a cart line. */
  inStock: "In Stock",
  outOfStock: "Out of Stock",
  /** Per-line delivery note (capitalization matches cart_ui.png). */
  deliveryNote: "Item Will be delivered within 5 days.",
  /** Trust line under the price summary. */
  trust: "Safe and Secure payments. Easy returns. 100% Authentic products.",
  /** Fallback when a cart request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
} as const;

export const AuthGateMessages = {
  /** Shown while the initial `GET /auth/me` session check is in flight. */
  checkingSession: "Loading…",
} as const;

export const UserMessages = {
  /** Shown after a successful inline field update. */
  updateSuccess: "Profile updated successfully",
  /** Toast/banner copy for a 400 validation failure (per-field errors render inline). */
  validationFailed: "Validation Failed",
  /** Fallback when a non-validation request fails without a server message. */
  genericError: "Something went wrong. Please try again.",
  /** Shown while the profile is being loaded. */
  loading: "Loading…",
} as const;

/**
 * Shared envelope copy for when `fetch` itself throws (offline/DNS/CORS). Lives
 * on its own so any feature can build a synthetic network-error response
 * without reusing another feature's namespaced message.
 */
export const NetworkErrorMessages = {
  title: "Network Error",
  message: "Unable to reach the server. Please check your connection.",
} as const;

export const ConfigMessages = {
  missingApiUrl:
    "VITE_API_URL is not defined. Set it in frontend/.env (e.g. http://localhost:3000).",
} as const;
