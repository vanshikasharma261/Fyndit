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
