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

export const ConfigMessages = {
  missingApiUrl:
    "VITE_API_URL is not defined. Set it in frontend/.env (e.g. http://localhost:3000).",
} as const;
