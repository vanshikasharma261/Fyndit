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
 * Curated navbar scopes that are not real category slugs but span specific
 * child categories. Keyed by the lower-cased path param.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  clothing: ['mens-clothing', 'womens-clothing'],
};
