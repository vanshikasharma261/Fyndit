import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { AuthMessages, ProductMessages } from '../constants/messages.constant';
import {
  CATEGORY_ALIASES,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
} from '../constants/values.constant';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import {
  AttributeFacet,
  ProductDetailResponse,
  ProductFiltersResponse,
  ProductListItem,
  ProductListResponse,
  ProductVariantDetail,
  ProductWhereOptions,
} from './types/product.types';

/** Minimal category row used to resolve a scope to its descendant ids. */
interface CategoryNode {
  category_id: string;
  slug: string;
  parent_id: string | null;
}

/** A variant as selected for the listing card (price-ascending). */
type ListVariant = {
  price: Prisma.Decimal;
  discount: Prisma.Decimal;
  attributes: Prisma.JsonValue;
  images: { image_url: string; is_primary: boolean; sort_order: number }[];
};

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Paginated, searchable, filterable product listing for a category scope.
   * `category` is a slug, a curated alias (`clothing`), or the literal `All`.
   */
  async listProducts(
    userId: string,
    category: string,
    query: ListProductsQueryDto,
  ): Promise<ProductListResponse> {
    await this.assertActiveUser(userId);

    const categoryIds = await this.resolveScopeIds(category);
    const validKeys = await this.getValidAttributeKeys(categoryIds);

    const options: ProductWhereOptions = {
      categoryIds,
      search: query.search,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      attributes: this.sanitizeAttributes(query.attributes, validKeys),
    };

    const where = this.buildWhere(options);
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'asc' },
        select: {
          product_id: true,
          product_name: true,
          slug: true,
          brand: true,
          description: true,
          category: { select: { slug: true } },
          variants: {
            orderBy: { price: 'asc' },
            select: {
              price: true,
              discount: true,
              attributes: true,
              images: {
                select: {
                  image_url: true,
                  is_primary: true,
                  sort_order: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const items: ProductListItem[] = products.map((product) =>
      this.toListItem(
        {
          product_id: product.product_id,
          product_name: product.product_name,
          slug: product.slug,
          brand: product.brand,
          description: product.description,
          category_slug: product.category.slug,
        },
        product.variants,
        options,
      ),
    );

    return {
      items,
      meta: {
        page,
        limit,
        total,
        total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /** Full product detail by slug, including every variant and its images. */
  async getProductDetail(
    userId: string,
    slug: string,
  ): Promise<ProductDetailResponse> {
    await this.assertActiveUser(userId);

    // `slug` is unique, so look it up directly and assert `is_active` in code
    // (a unique lookup cannot carry a non-unique `is_active` predicate).
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: {
        product_id: true,
        product_name: true,
        slug: true,
        brand: true,
        description: true,
        is_active: true,
        category: {
          select: { category_id: true, category_name: true, slug: true },
        },
        variants: {
          orderBy: { created_at: 'asc' },
          select: {
            product_variant_id: true,
            sku: true,
            stock: true,
            price: true,
            discount: true,
            attributes: true,
            images: {
              orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
              select: { image_url: true, alt_text: true, is_primary: true },
            },
          },
        },
      },
    });

    if (!product || !product.is_active) {
      throw new NotFoundException(ProductMessages.productNotFound);
    }

    const variants: ProductVariantDetail[] = product.variants.map(
      (variant) => ({
        product_variant_id: variant.product_variant_id,
        sku: variant.sku,
        stock: variant.stock,
        price: this.serializeMoney(variant.price),
        discount: this.serializeMoney(variant.discount),
        attributes: this.asAttributeRecord(variant.attributes),
        images: variant.images.map((image) => ({
          image_url: image.image_url,
          alt_text: image.alt_text,
          is_primary: image.is_primary,
        })),
      }),
    );

    return {
      product_id: product.product_id,
      product_name: product.product_name,
      slug: product.slug,
      brand: product.brand,
      description: product.description,
      category: product.category,
      variants,
    };
  }

  /**
   * Available filter options for a category scope: the price range plus one
   * facet per attribute the scope's categories define, listing the distinct
   * values actually present. Facets reflect the unfiltered scope (search may
   * apply) so toggling a value never removes other options.
   */
  async getCategoryFilters(
    userId: string,
    category: string,
    search?: string,
  ): Promise<ProductFiltersResponse> {
    await this.assertActiveUser(userId);

    const categoryIds = await this.resolveScopeIds(category);
    const scopeWhere = this.buildProductScopeWhere(categoryIds, search);

    const [priceRange, attributeNames, variants] = await Promise.all([
      this.prisma.productVariant.aggregate({
        where: { product: scopeWhere },
        _min: { price: true },
        _max: { price: true },
      }),
      this.getValidAttributeKeys(categoryIds),
      this.prisma.productVariant.findMany({
        where: { product: scopeWhere },
        select: { attributes: true },
      }),
    ]);

    const attributes = this.buildFacets(attributeNames, variants);

    return {
      price: {
        min: this.serializeMoney(priceRange._min.price),
        max: this.serializeMoney(priceRange._max.price),
      },
      attributes,
    };
  }

  /**
   * Browsing is gated behind an active session. A valid JWT can outlive a
   * logout or soft-delete, so every entry point re-checks `is_active` via the
   * shared {@link AuthService.isUserActive} utility before any DB access.
   */
  private async assertActiveUser(userId: string): Promise<void> {
    const active = await this.authService.isUserActive(userId);
    if (!active) {
      throw new ForbiddenException(AuthMessages.inactiveAccountMessage);
    }
  }

  // ----- Scope resolution -----

  /**
   * Resolves the category path param to the set of category ids it spans.
   * `null` → no category constraint (`All`); `[]` → unknown slug (empty result).
   */
  private async resolveScopeIds(category: string): Promise<string[] | null> {
    const slug = category.trim().toLowerCase();
    if (slug === 'all') {
      return null;
    }

    const nodes = await this.prisma.category.findMany({
      select: { category_id: true, slug: true, parent_id: true },
    });

    const alias = CATEGORY_ALIASES[slug];
    if (alias) {
      return nodes
        .filter((node) => alias.includes(node.slug))
        .map((node) => node.category_id);
    }

    const root = nodes.find((node) => node.slug === slug);
    if (!root) {
      return [];
    }

    return this.collectDescendantIds(root, nodes);
  }

  /** The category and all of its descendants (any depth), via the parent map. */
  private collectDescendantIds(
    root: CategoryNode,
    nodes: CategoryNode[],
  ): string[] {
    const childrenByParent = new Map<string, CategoryNode[]>();
    for (const node of nodes) {
      if (node.parent_id) {
        const siblings = childrenByParent.get(node.parent_id) ?? [];
        siblings.push(node);
        childrenByParent.set(node.parent_id, siblings);
      }
    }

    const ids: string[] = [];
    const queue: CategoryNode[] = [root];
    while (queue.length > 0) {
      const current = queue.shift() as CategoryNode;
      ids.push(current.category_id);
      queue.push(...(childrenByParent.get(current.category_id) ?? []));
    }
    return ids;
  }

  private async getValidAttributeKeys(
    categoryIds: string[] | null,
  ): Promise<Set<string>> {
    if (categoryIds === null || categoryIds.length === 0) {
      return new Set<string>();
    }
    const rows = await this.prisma.categoryAttribute.findMany({
      where: { category_id: { in: categoryIds } },
      select: { attribute_name: true },
    });
    return new Set(rows.map((row) => row.attribute_name));
  }

  // ----- Where building -----

  private buildWhere(options: ProductWhereOptions): Prisma.ProductWhereInput {
    const where = this.buildProductScopeWhere(
      options.categoryIds,
      options.search,
    );
    const variantWhere = this.buildVariantWhere(options);
    if (variantWhere) {
      where.variants = { some: variantWhere };
    }
    return where;
  }

  /** Product-level scope: active products, the category constraint and search. */
  private buildProductScopeWhere(
    categoryIds: string[] | null,
    search?: string,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { is_active: true };
    if (categoryIds !== null) {
      where.category_id = { in: categoryIds };
    }
    const or = this.buildSearchOr(search);
    if (or) {
      where.OR = or;
    }
    return where;
  }

  private buildSearchOr(
    search?: string,
  ): Prisma.ProductWhereInput[] | undefined {
    const term = search?.trim();
    if (!term) {
      return undefined;
    }

    const or: Prisma.ProductWhereInput[] = [
      { product_name: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      // Also match by category so terms like "mobile", "clothing", "men",
      // "footwear" surface the relevant products (leaf + parent name/slug).
      { category: { category_name: { contains: term, mode: 'insensitive' } } },
      { category: { slug: { contains: term, mode: 'insensitive' } } },
      {
        category: {
          parent: { category_name: { contains: term, mode: 'insensitive' } },
        },
      },
      {
        category: { parent: { slug: { contains: term, mode: 'insensitive' } } },
      },
    ];

    // "under 300" / "under 400" style phrases also match by price.
    const underMatch = /under\s+(\d+(?:\.\d+)?)/i.exec(term);
    if (underMatch) {
      const cap = Number(underMatch[1]);
      if (Number.isFinite(cap)) {
        or.push({ variants: { some: { price: { lte: cap } } } });
      }
    }

    return or;
  }

  /**
   * Variant-level filter: price range + attribute map. All constraints must be
   * met by the **same** variant. Values OR within a key, keys AND across each
   * other. Returns `null` when no variant filter is active.
   */
  private buildVariantWhere(
    options: ProductWhereOptions,
  ): Prisma.ProductVariantWhereInput | null {
    const variantWhere: Prisma.ProductVariantWhereInput = {};

    const price: Prisma.DecimalFilter = {};
    if (options.minPrice !== undefined) {
      price.gte = options.minPrice;
    }
    const maxPrice = this.resolveMaxPrice(options.minPrice, options.maxPrice);
    if (maxPrice !== undefined) {
      price.lte = maxPrice;
    }
    if (Object.keys(price).length > 0) {
      variantWhere.price = price;
    }

    if (options.attributes) {
      const attrConditions = Object.entries(options.attributes).map(
        ([key, values]) => ({
          OR: values.map((value) => ({
            attributes: { path: [key], equals: value },
          })),
        }),
      );
      if (attrConditions.length > 0) {
        variantWhere.AND = attrConditions;
      }
    }

    return Object.keys(variantWhere).length > 0 ? variantWhere : null;
  }

  /** `maxPrice` is ignored when it is below `minPrice`. */
  private resolveMaxPrice(
    minPrice?: number,
    maxPrice?: number,
  ): number | undefined {
    if (maxPrice === undefined) {
      return undefined;
    }
    if (minPrice !== undefined && maxPrice < minPrice) {
      return undefined;
    }
    return maxPrice;
  }

  // ----- Serialization helpers -----

  private toListItem(
    base: Omit<ProductListItem, 'price' | 'discount' | 'image_url'>,
    variants: ListVariant[],
    options: ProductWhereOptions,
  ): ProductListItem {
    const representative =
      variants.find((variant) =>
        this.variantMatchesFilters(variant, options),
      ) ?? variants[0];

    return {
      ...base,
      price: this.serializeMoney(representative?.price ?? null),
      discount: this.serializeMoney(representative?.discount ?? null),
      image_url: representative ? this.pickPrimaryImage(representative) : null,
    };
  }

  /** Does a variant satisfy the active price + attribute filters? */
  private variantMatchesFilters(
    variant: ListVariant,
    options: ProductWhereOptions,
  ): boolean {
    const price = variant.price.toNumber();
    if (options.minPrice !== undefined && price < options.minPrice) {
      return false;
    }
    const maxPrice = this.resolveMaxPrice(options.minPrice, options.maxPrice);
    if (maxPrice !== undefined && price > maxPrice) {
      return false;
    }

    if (options.attributes) {
      const attrs = this.asAttributeRecord(variant.attributes);
      for (const [key, values] of Object.entries(options.attributes)) {
        if (!values.includes(attrs[key])) {
          return false;
        }
      }
    }

    return true;
  }

  /** The primary image url (`is_primary`, else lowest `sort_order`), or null. */
  private pickPrimaryImage(variant: ListVariant): string | null {
    if (variant.images.length === 0) {
      return null;
    }
    const ordered = [...variant.images].sort((a, b) => {
      if (a.is_primary !== b.is_primary) {
        return a.is_primary ? -1 : 1;
      }
      return a.sort_order - b.sort_order;
    });
    return ordered[0].image_url;
  }

  private buildFacets(
    attributeNames: Set<string>,
    variants: { attributes: Prisma.JsonValue }[],
  ): AttributeFacet[] {
    if (attributeNames.size === 0) {
      return [];
    }

    const valuesByKey = new Map<string, Set<string>>();
    for (const name of attributeNames) {
      valuesByKey.set(name, new Set<string>());
    }

    for (const variant of variants) {
      const attrs = this.asAttributeRecord(variant.attributes);
      for (const [key, value] of Object.entries(attrs)) {
        valuesByKey.get(key)?.add(value);
      }
    }

    return [...valuesByKey.entries()]
      .map(([name, values]) => ({
        name,
        label: this.titleCase(name),
        values: [...values].sort(),
      }))
      .filter((facet) => facet.values.length > 0);
  }

  private titleCase(value: string): string {
    return value
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /** Money → `"0.00"` string. Null (e.g. empty aggregate) becomes `"0.00"`. */
  private serializeMoney(value: Prisma.Decimal | null): string {
    // Explicit null check — a `Decimal(0)` is a valid price and must serialize
    // to "0.00", not be collapsed by a truthiness test.
    return value !== null ? value.toFixed(2) : '0.00';
  }

  private asAttributeRecord(value: Prisma.JsonValue): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw === 'string') {
        out[key] = raw;
      }
    }
    return out;
  }

  private sanitizeAttributes(
    attributes: Record<string, string[]> | undefined,
    validKeys: Set<string>,
  ): Record<string, string[]> | undefined {
    if (!attributes) {
      return undefined;
    }
    const result: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(attributes)) {
      if (validKeys.has(key) && values.length > 0) {
        result[key] = values;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
}
