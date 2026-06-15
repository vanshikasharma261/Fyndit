/** Shared constants for the seed/asset pipeline. */

/** Exactly how many images every variant must have (1 primary + 2 thumbnails). */
export const IMAGES_PER_VARIANT = 3;

/** Base public path under which product assets are served. */
export const ASSET_BASE = '/assets/products';

/** Allowed number of variants per product (cartesian of colors x options). */
export const MIN_VARIANTS_PER_PRODUCT = 2;
export const MAX_VARIANTS_PER_PRODUCT = 8;
