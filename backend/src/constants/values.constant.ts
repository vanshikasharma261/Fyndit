/**
 * Shared, non-message constant values (defaults, tunables, curated mappings).
 *
 * Human-facing copy lives in `messages.constant.ts`; this file holds the
 * behavioural constants modules reuse so they are defined in exactly one place.
 */

/** Product listing pagination defaults. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 12;

/** Upper bound on the free-text `search` query param (guards oversized queries). */
export const SEARCH_MAX_LENGTH = 200;

/**
 * Maximum number of distinct line items a single cart may hold. Adding a NEW
 * variant beyond this is refused (the user must checkout or remove an item);
 * incrementing an item already in the cart is unaffected. This bounds the
 * (unpaginated) cart query in place of pagination.
 */
export const MAX_CART_ITEMS = 25;

/**
 * Maximum quantity allowed for a single cart line. The variant's current stock
 * is still the real ceiling (enforced in `CartService`); the effective cap is
 * `min(MAX_CART_ITEM_QUANTITY, stock)`. Enforced at the DTO layer via `@Max`.
 */
export const MAX_CART_ITEM_QUANTITY = 20;

/**
 * Curated navbar scopes that are not real category slugs but span specific
 * child categories. Keyed by the lower-cased path param.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  clothing: ['mens-clothing', 'womens-clothing'],
};
