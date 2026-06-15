import type {
  GeneratedVariant,
  ProductSeed,
  VariantDimension,
} from './types';
import {
  MAX_VARIANTS_PER_PRODUCT,
  MIN_VARIANTS_PER_PRODUCT,
} from './constants';

/** Build a stable, unique SKU from the product slug and the chosen values. */
function buildSku(slug: string, values: string[]): string {
  const suffix = values
    .map((v) => v.toUpperCase().replace(/[^A-Z0-9]+/g, ''))
    .join('-');
  return `${slug.toUpperCase()}-${suffix}`;
}

/** Cartesian product of an array of dimensions, preserving order. */
function cartesian(dimensions: VariantDimension[]): Record<string, string>[] {
  return dimensions.reduce<Record<string, string>[]>(
    (acc, dimension) =>
      acc.flatMap((combo) =>
        dimension.values.map((value) => ({ ...combo, [dimension.name]: value })),
      ),
    [{}],
  );
}

/**
 * Generate all variants for a product from the cartesian product of its
 * `colors` x every `options` dimension. Pure and deterministic — the seed
 * script never hard-codes variants.
 */
export function generateVariants(product: ProductSeed): GeneratedVariant[] {
  const dimensions: VariantDimension[] = [
    { name: 'color', values: product.colors },
    ...(product.options ?? []),
  ];

  const combinations = cartesian(dimensions);

  // Enforce the business rule at seed time to catch bad data early.
  if (
    combinations.length < MIN_VARIANTS_PER_PRODUCT ||
    combinations.length > MAX_VARIANTS_PER_PRODUCT
  ) {
    throw new Error(
      `Product "${product.slug}" generates ${combinations.length} variants; ` +
        `expected ${MIN_VARIANTS_PER_PRODUCT}-${MAX_VARIANTS_PER_PRODUCT}. ` +
        'Adjust its colors/options.',
    );
  }

  const modifiers = product.priceModifiers ?? {};

  return combinations.map((attributes) => {
    const values = Object.values(attributes);
    const priceDelta = values.reduce(
      (sum, value) => sum + (modifiers[value] ?? 0),
      0,
    );

    return {
      sku: buildSku(product.slug, values),
      price: product.basePrice + priceDelta,
      discount: product.discount,
      stock: product.stock,
      color: attributes.color,
      attributes,
    };
  });
}
