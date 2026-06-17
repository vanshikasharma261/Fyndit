import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { ProductMessages } from '../constants/messages.constant';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps a JS number as a Prisma.Decimal-like object (toFixed / toNumber). */
function decimal(n: number): Prisma.Decimal {
  return {
    toFixed: (dp = 2) => n.toFixed(dp),
    toNumber: () => n,
    toString: () => String(n),
  } as unknown as Prisma.Decimal;
}

interface VariantOverrides {
  product_variant_id?: string;
  sku?: string;
  stock?: number;
  price?: number;
  discount?: number;
  /** Use `undefined` to omit the key (raw null cannot be expressed via Partial here) */
  attributes?: Prisma.JsonValue;
  images?: { image_url: string; alt_text: string | null; is_primary: boolean }[];
}

function makeVariant(overrides: VariantOverrides = {}) {
  return {
    product_variant_id: overrides.product_variant_id ?? 'v-001',
    sku: overrides.sku ?? 'SKU-001',
    stock: overrides.stock ?? 10,
    price: decimal(overrides.price ?? 799),
    discount: decimal(overrides.discount ?? 50),
    attributes:
      overrides.attributes !== undefined
        ? overrides.attributes
        : { color: 'red', size: 'M' },
    images: overrides.images ?? [
      { image_url: '/img/1.jpg', alt_text: 'front', is_primary: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = {
  product: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  productVariant: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
  categoryAttribute: {
    findMany: jest.fn(),
  },
};

const mockAuthService = {
  isUserActive: jest.fn(),
};

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  // -------------------------------------------------------------------------
  // assertActiveUser (via every public method)
  // -------------------------------------------------------------------------

  describe('auth gate', () => {
    it('throws ForbiddenException when user is not active (listProducts)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);
      mockPrisma.category.findMany.mockResolvedValue([]);

      await expect(
        service.listProducts('user-1', 'All', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is not active (getProductDetail)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(
        service.getProductDetail('user-1', 'some-slug'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is not active (getCategoryFilters)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(
        service.getCategoryFilters('user-1', 'All'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // listProducts
  // -------------------------------------------------------------------------

  describe('listProducts', () => {
    const userId = 'user-1';

    function seedActive() {
      mockAuthService.isUserActive.mockResolvedValue(true);
      // "All" category → no category lookup needed; attribute keys empty for All
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
    }

    const sampleProduct = {
      product_id: 'p-001',
      product_name: 'Test Shirt',
      slug: 'test-shirt',
      brand: 'BrandX',
      description: 'A great shirt',
      category: { slug: 'mens-clothing' },
      variants: [
        {
          price: decimal(500),
          discount: decimal(0),
          attributes: { color: 'blue', size: 'L' },
          images: [
            { image_url: '/img/blue.jpg', is_primary: true, sort_order: 0 },
          ],
        },
      ],
    };

    it('returns paginated product list with meta', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([sampleProduct]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.listProducts(userId, 'All', {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].product_id).toBe('p-001');
      expect(result.items[0].price).toBe('500.00');
      expect(result.items[0].discount).toBe('0.00');
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 12,
        total: 1,
        total_pages: 1,
      });
    });

    it('defaults page=1, limit=12 when not provided', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.listProducts(userId, 'All', {});

      const findCall = mockPrisma.product.findMany.mock.calls[0][0] as {
        skip: number;
        take: number;
      };
      expect(findCall.skip).toBe(0); // (page 1 - 1) * 12
      expect(findCall.take).toBe(12);
    });

    it('respects custom page and limit from query', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      const query: ListProductsQueryDto = { page: 2, limit: 5 };
      await service.listProducts(userId, 'All', query);

      const findCall = mockPrisma.product.findMany.mock.calls[0][0] as {
        skip: number;
        take: number;
      };
      expect(findCall.skip).toBe(5); // (2 - 1) * 5
      expect(findCall.take).toBe(5);
    });

    it('returns empty items and total_pages=0 when there are no products', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      const result = await service.listProducts(userId, 'All', {});

      expect(result.items).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.total_pages).toBe(0);
    });

    it('resolves the "clothing" alias to the correct category ids', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      // Simulate DB returning categories including the aliased slugs
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-m', slug: 'mens-clothing', parent_id: null },
        { category_id: 'cat-w', slug: 'womens-clothing', parent_id: null },
        { category_id: 'cat-e', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.listProducts(userId, 'clothing', {});

      const findCall = mockPrisma.product.findMany.mock.calls[0][0] as {
        where: { category_id?: { in: string[] } };
      };
      expect(findCall.where.category_id?.in).toEqual(
        expect.arrayContaining(['cat-m', 'cat-w']),
      );
      expect(findCall.where.category_id?.in).not.toContain('cat-e');
    });

    it('returns empty list for an unknown category slug', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      const result = await service.listProducts(userId, 'unknown-slug', {});

      // findMany receives an in: [] filter that matches nothing
      const findCall = mockPrisma.product.findMany.mock.calls[0][0] as {
        where: { category_id?: { in: string[] } };
      };
      expect(findCall.where.category_id?.in).toEqual([]);
      expect(result.items).toHaveLength(0);
    });

    it('includes search OR clause when search param is provided', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.listProducts(userId, 'All', { search: 'nike' });

      const findCall = mockPrisma.product.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(findCall.where.OR).toBeDefined();
      expect(findCall.where.OR).not.toHaveLength(0);
    });

    it('adds a price lte clause for "under N" style search terms', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.listProducts(userId, 'All', { search: 'under 500' });

      const findCall = mockPrisma.product.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      const pricePredicate = (findCall.where.OR ?? []).find(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          'variants' in c,
      );
      expect(pricePredicate).toBeDefined();
    });

    it('picks the primary image url for the list card', async () => {
      seedActive();
      const productWithImages = {
        ...sampleProduct,
        variants: [
          {
            price: decimal(200),
            discount: decimal(0),
            attributes: {},
            images: [
              { image_url: '/img/secondary.jpg', is_primary: false, sort_order: 1 },
              { image_url: '/img/primary.jpg', is_primary: true, sort_order: 2 },
            ],
          },
        ],
      };
      mockPrisma.product.findMany.mockResolvedValue([productWithImages]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.listProducts(userId, 'All', {});
      expect(result.items[0].image_url).toBe('/img/primary.jpg');
    });

    it('returns image_url=null when variant has no images', async () => {
      seedActive();
      const productNoImages = {
        ...sampleProduct,
        variants: [
          { price: decimal(100), discount: decimal(0), attributes: {}, images: [] },
        ],
      };
      mockPrisma.product.findMany.mockResolvedValue([productNoImages]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.listProducts(userId, 'All', {});
      expect(result.items[0].image_url).toBeNull();
    });

    it('calculates total_pages correctly for partial last page', async () => {
      seedActive();
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(25);

      const result = await service.listProducts(userId, 'All', {
        page: 1,
        limit: 12,
      });
      expect(result.meta.total_pages).toBe(3); // ceil(25/12) = 3
    });
  });

  // -------------------------------------------------------------------------
  // getProductDetail
  // -------------------------------------------------------------------------

  describe('getProductDetail', () => {
    const userId = 'user-1';
    const slug = 'iphone-16';

    const dbProduct = {
      product_id: 'p-001',
      product_name: 'iPhone 16',
      slug,
      brand: 'Apple',
      description: 'Flagship phone',
      is_active: true,
      category: {
        category_id: 'cat-1',
        category_name: 'Electronics',
        slug: 'electronics',
      },
      variants: [makeVariant()],
    };

    it('returns full product detail when product is active', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.product.findUnique.mockResolvedValue(dbProduct);

      const result = await service.getProductDetail(userId, slug);

      expect(result.product_id).toBe('p-001');
      expect(result.product_name).toBe('iPhone 16');
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].price).toBe('799.00');
      expect(result.variants[0].discount).toBe('50.00');
      expect(result.variants[0].sku).toBe('SKU-001');
    });

    it('serializes variant attributes as a string record', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.product.findUnique.mockResolvedValue(dbProduct);

      const result = await service.getProductDetail(userId, slug);

      expect(result.variants[0].attributes).toEqual({ color: 'red', size: 'M' });
    });

    it('throws NotFoundException when product is not found', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.getProductDetail(userId, slug)).rejects.toThrow(
        new NotFoundException(ProductMessages.productNotFound),
      );
    });

    it('throws NotFoundException when product is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.product.findUnique.mockResolvedValue({
        ...dbProduct,
        is_active: false,
      });

      await expect(service.getProductDetail(userId, slug)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('serializes images correctly', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.product.findUnique.mockResolvedValue({
        ...dbProduct,
        variants: [
          makeVariant({
            images: [
              { image_url: '/img/1.jpg', alt_text: 'front view', is_primary: true },
              { image_url: '/img/2.jpg', alt_text: null, is_primary: false },
            ],
          }),
        ],
      });

      const result = await service.getProductDetail(userId, slug);
      expect(result.variants[0].images).toHaveLength(2);
      expect(result.variants[0].images[0]).toMatchObject({
        image_url: '/img/1.jpg',
        alt_text: 'front view',
        is_primary: true,
      });
    });

    it('handles a variant with null/non-object attributes gracefully', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      // Pass null as a Prisma.JsonValue directly (not through makeVariant defaults)
      mockPrisma.product.findUnique.mockResolvedValue({
        ...dbProduct,
        variants: [makeVariant({ attributes: null })],
      });

      const result = await service.getProductDetail(userId, slug);
      expect(result.variants[0].attributes).toEqual({});
    });

    it('handles a variant with array attributes gracefully', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.product.findUnique.mockResolvedValue({
        ...dbProduct,
        variants: [makeVariant({ attributes: ['wrong', 'shape'] })],
      });

      const result = await service.getProductDetail(userId, slug);
      expect(result.variants[0].attributes).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // getCategoryFilters
  // -------------------------------------------------------------------------

  describe('getCategoryFilters', () => {
    const userId = 'user-1';

    it('returns price range and attribute facets for a category scope', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([
        { attribute_name: 'color' },
        { attribute_name: 'storage' },
      ]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: decimal(300) },
        _max: { price: decimal(1200) },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([
        { attributes: { color: 'black', storage: '128GB' } },
        { attributes: { color: 'white', storage: '256GB' } },
      ]);

      const result = await service.getCategoryFilters(userId, 'electronics');

      expect(result.price.min).toBe('300.00');
      expect(result.price.max).toBe('1200.00');
      expect(result.attributes).toHaveLength(2);
      const colorFacet = result.attributes.find((f) => f.name === 'color');
      expect(colorFacet?.values).toContain('black');
      expect(colorFacet?.values).toContain('white');
    });

    it('returns 0.00 / 0.00 price range when aggregate returns null (empty scope)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([]);

      const result = await service.getCategoryFilters(userId, 'electronics');

      expect(result.price.min).toBe('0.00');
      expect(result.price.max).toBe('0.00');
      expect(result.attributes).toHaveLength(0);
    });

    it('returns empty attributes when no categoryAttributes defined (All scope)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      // "All" resolves to null → no categoryAttribute lookup
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([]);

      const result = await service.getCategoryFilters(userId, 'All');

      expect(result.attributes).toEqual([]);
    });

    it('facet label is title-cased from the attribute_name key', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      // Use a real slug that is not an alias - 'mens-clothing' is a concrete slug
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'mens-clothing', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([
        { attribute_name: 'shoe_size' },
      ]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([
        { attributes: { shoe_size: '10' } },
      ]);

      const result = await service.getCategoryFilters(userId, 'mens-clothing');

      const facet = result.attributes.find((f) => f.name === 'shoe_size');
      expect(facet?.label).toBe('Shoe Size');
    });

    it('facet values are sorted alphabetically', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([
        { attribute_name: 'color' },
      ]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([
        { attributes: { color: 'red' } },
        { attributes: { color: 'black' } },
        { attributes: { color: 'blue' } },
      ]);

      const result = await service.getCategoryFilters(userId, 'electronics');

      const colors = result.attributes.find((f) => f.name === 'color')?.values;
      expect(colors).toEqual(['black', 'blue', 'red']);
    });
  });
});
