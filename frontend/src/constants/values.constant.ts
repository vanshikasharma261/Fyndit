/**
 * Shared, non-message constant values (defaults, tunables). Human-facing copy
 * lives in `messages.constant.ts`; behavioural constants live here.
 */

/** Synthetic status code used when `fetch` itself throws (offline/DNS/CORS). */
export const NETWORK_ERROR_STATUS = 0;

/** HTTP 401 — an authenticated request whose session is missing/expired. */
export const UNAUTHORIZED_STATUS = 401;

/** Debounce delay (ms) before a typed search term triggers navigation. */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * Maximum active addresses a user may keep (mirrors the backend
 * `MAX_ACTIVE_ADDRESSES`). The "Add Address" button is hidden once reached; the
 * backend is the real guard (rejects a sixth with a 400).
 */
export const MAX_ACTIVE_ADDRESSES = 5;

/** Default page size used when the listing meta is not yet available. */
export const DEFAULT_PAGE_SIZE = 12;

/** Currency formatting for displayed prices (₹, no decimals — matches design). */
export const CURRENCY_LOCALE = "en-IN";
export const CURRENCY_CODE = "INR";
