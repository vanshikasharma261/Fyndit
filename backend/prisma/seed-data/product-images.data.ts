import type { VariantImageSeed } from './types';
import { ASSET_BASE, IMAGES_PER_VARIANT } from './constants';

/**
 * Builds the local, relative image paths persisted to `ProductImage.image_url`.
 *
 * Physical files live under `backend/assets/products/<slug>/<color>/{1,2,3}.jpg`
 * (downloaded by `prisma/download-assets.ts` from `image-sources.data.ts`).
 * Only these relative paths are stored in the database — images are served
 * locally with no runtime internet dependency.
 *
 * Every variant always gets exactly {@link IMAGES_PER_VARIANT} images:
 * the first is primary, the rest are thumbnails.
 */

/** Build the relative URL for a single image. */
export function buildImagePath(
  productSlug: string,
  color: string,
  index: number,
): string {
  return `${ASSET_BASE}/${productSlug}/${color}/${index}.jpg`;
}

/** Build the 3 image rows for a variant of the given product/color. */
export function buildVariantImages(
  productSlug: string,
  productName: string,
  color: string,
): VariantImageSeed[] {
  return Array.from({ length: IMAGES_PER_VARIANT }, (_, i) => {
    const sortOrder = i + 1;
    return {
      imageUrl: buildImagePath(productSlug, color, sortOrder),
      altText: `${productName} - ${color} (${sortOrder})`,
      isPrimary: sortOrder === 1,
      sortOrder,
    };
  });
}
