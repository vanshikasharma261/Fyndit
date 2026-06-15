import type { ParentCategorySeed } from './types';

/**
 * Category hierarchy: 3 parent categories, each with 2-4 children.
 * Child `slug` values are referenced by products in `products.data.ts`.
 */
export const categories: ParentCategorySeed[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    attributes: ['brand'],
    children: [
      {
        name: 'Mobile Phones',
        slug: 'mobile-phones',
        attributes: ['color', 'storage', 'ram'],
      },
      {
        name: 'Laptops',
        slug: 'laptops',
        attributes: ['color', 'storage', 'ram'],
      },
      {
        name: 'Headphones',
        slug: 'headphones',
        attributes: ['color', 'connectivity'],
      },
      {
        name: 'Smart Watches',
        slug: 'smart-watches',
        attributes: ['color', 'size'],
      },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    attributes: ['brand'],
    children: [
      {
        name: "Men's Clothing",
        slug: 'mens-clothing',
        attributes: ['color', 'size'],
      },
      {
        name: "Women's Clothing",
        slug: 'womens-clothing',
        attributes: ['color', 'size'],
      },
      {
        name: 'Footwear',
        slug: 'footwear',
        attributes: ['color', 'size'],
      },
    ],
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    attributes: ['brand'],
    children: [
      {
        name: 'Cookware',
        slug: 'cookware',
        attributes: ['color', 'material'],
      },
      {
        name: 'Home Decor',
        slug: 'home-decor',
        attributes: ['color', 'material'],
      },
      {
        name: 'Furniture',
        slug: 'furniture',
        attributes: ['color', 'material'],
      },
    ],
  },
];
