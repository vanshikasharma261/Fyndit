import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { categories } from './seed-data/categories.data';
import { products } from './seed-data/products.data';
import { coupons } from './seed-data/coupons.data';
import { generateVariants } from './seed-data/variant-generator';
import { buildVariantImages } from './seed-data/product-images.data';

/**
 * Database seed (Prisma 7).
 *
 * Standalone scripts run outside the NestJS DI container, so this is the one
 * sanctioned place — besides `PrismaService` — that constructs a client. The
 * application code never instantiates `PrismaClient` directly.
 *
 * The whole script is data-driven and idempotent: re-running it creates no
 * duplicates (upsert by unique slug / sku / code; images are rebuilt per run).
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Convert a number to a 2-decimal string for Decimal columns. */
function money(value: number): string {
  return value.toFixed(2);
}

async function seedCategories(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();

  for (const parent of categories) {
    const parentRow = await prisma.category.upsert({
      where: { slug: parent.slug },
      update: { category_name: parent.name, parent_id: null },
      create: { category_name: parent.name, slug: parent.slug },
    });
    idBySlug.set(parent.slug, parentRow.category_id);
    await seedCategoryAttributes(parentRow.category_id, parent.attributes);

    for (const child of parent.children) {
      const childRow = await prisma.category.upsert({
        where: { slug: child.slug },
        update: {
          category_name: child.name,
          parent_id: parentRow.category_id,
        },
        create: {
          category_name: child.name,
          slug: child.slug,
          parent_id: parentRow.category_id,
        },
      });
      idBySlug.set(child.slug, childRow.category_id);
      await seedCategoryAttributes(childRow.category_id, child.attributes);
    }
  }

  return idBySlug;
}

async function seedCategoryAttributes(
  categoryId: string,
  attributes: string[],
): Promise<void> {
  for (const attribute_name of attributes) {
    await prisma.categoryAttribute.upsert({
      where: {
        category_id_attribute_name: {
          category_id: categoryId,
          attribute_name,
        },
      },
      update: {},
      create: { category_id: categoryId, attribute_name },
    });
  }
}

async function seedProducts(categoryIdBySlug: Map<string, string>): Promise<{
  productCount: number;
  variantCount: number;
  imageCount: number;
}> {
  let variantCount = 0;
  let imageCount = 0;

  for (const product of products) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Product "${product.slug}" references unknown category "${product.categorySlug}"`,
      );
    }

    const productRow = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        product_name: product.name,
        brand: product.brand,
        description: product.description,
        category_id: categoryId,
        is_active: true,
      },
      create: {
        product_name: product.name,
        slug: product.slug,
        brand: product.brand,
        description: product.description,
        category_id: categoryId,
      },
    });

    for (const variant of generateVariants(product)) {
      const variantRow = await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          stock: variant.stock,
          price: money(variant.price),
          discount: money(variant.discount),
          attributes: variant.attributes,
          product_id: productRow.product_id,
        },
        create: {
          sku: variant.sku,
          stock: variant.stock,
          price: money(variant.price),
          discount: money(variant.discount),
          attributes: variant.attributes,
          product_id: productRow.product_id,
        },
      });
      variantCount += 1;

      // Rebuild images each run so every variant always has exactly 3.
      // Atomic: a variant is never left with zero images mid-run.
      const images = buildVariantImages(
        product.slug,
        product.name,
        variant.color,
      );
      await prisma.$transaction([
        prisma.productImage.deleteMany({
          where: { product_variant_id: variantRow.product_variant_id },
        }),
        prisma.productImage.createMany({
          data: images.map((image) => ({
            product_variant_id: variantRow.product_variant_id,
            image_url: image.imageUrl,
            alt_text: image.altText,
            is_primary: image.isPrimary,
            sort_order: image.sortOrder,
          })),
        }),
      ]);
      imageCount += images.length;
    }
  }

  return { productCount: products.length, variantCount, imageCount };
}

async function seedCoupons(): Promise<number> {
  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        discount_type: coupon.discountType,
        discount_value: money(coupon.discountValue),
        minimum_order:
          coupon.minimumOrder === undefined ? null : money(coupon.minimumOrder),
        usage_limit: coupon.usageLimit ?? null,
        used_count: 0,
        is_active: coupon.isActive,
      },
      create: {
        code: coupon.code,
        discount_type: coupon.discountType,
        discount_value: money(coupon.discountValue),
        minimum_order:
          coupon.minimumOrder === undefined
            ? null
            : money(coupon.minimumOrder),
        usage_limit: coupon.usageLimit ?? null,
        is_active: coupon.isActive,
      },
    });
  }
  return coupons.length;
}

async function main(): Promise<void> {
  console.log('Seeding database...');

  const categoryIdBySlug = await seedCategories();
  console.log(`  Categories seeded: ${categoryIdBySlug.size}`);

  const { productCount, variantCount, imageCount } =
    await seedProducts(categoryIdBySlug);
  console.log(`  Products seeded:   ${productCount}`);
  console.log(`  Variants seeded:   ${variantCount}`);
  console.log(`  Images seeded:     ${imageCount}`);

  const couponCount = await seedCoupons();
  console.log(`  Coupons seeded:    ${couponCount}`);

  console.log('Seeding complete.');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
