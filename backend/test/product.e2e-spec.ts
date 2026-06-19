/**
 * E2E tests for ProductController
 * (GET /product/detail/:slug, GET /product/:category/filters, GET /product/:category).
 *
 * PrismaService is overridden with a jest mock. JwtModule uses a test secret so
 * real tokens can be signed without a database.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { ProductController } from '../src/product/product.controller';
import { ProductService } from '../src/product/product.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import {
  ProductListResponse,
  ProductDetailResponse,
  ProductFiltersResponse,
} from '../src/product/types/product.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-product-secret';
const TEST_USER_ID = 'usr-prod-001';
const TEST_EMAIL = 'prod@example.com';

// ---------------------------------------------------------------------------
// Mock PrismaService — covers both ProductService and AuthService.isUserActive
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
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

// ---------------------------------------------------------------------------
// Mock ConfigService
// ---------------------------------------------------------------------------

const mockConfigService = {
  get: (key: string) => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
    };
    return values[key];
  },
  getOrThrow: (key: string) => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
    };
    if (!(key in values)) throw new Error(`Missing config key: ${key}`);
    return values[key];
  },
};

// ---------------------------------------------------------------------------
// Decimal stub — mirrors the Prisma.Decimal shape used by the service
// ---------------------------------------------------------------------------

function decimal(n: number) {
  return {
    toFixed: (dp = 2) => n.toFixed(dp),
    toNumber: () => n,
    toString: () => String(n),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authCookie(token: string): string {
  return `access_token=${token}`;
}

/** Seeds the user.findUnique mock so AuthService.isUserActive returns true. */
function seedActiveUser() {
  mockPrisma.user.findUnique.mockResolvedValueOnce({
    is_active: true,
    is_deleted: false,
    deleted_at: null,
  });
}

describe('ProductController (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let token: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [ProductController],
      providers: [
        ProductService,
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );

    await app.init();

    jwtService = module.get<JwtService>(JwtService);
    token = await jwtService.signAsync({
      sub: TEST_USER_ID,
      email: TEST_EMAIL,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auth guard enforcement (no cookie → 401 on every route)
  // -------------------------------------------------------------------------

  describe('auth guard', () => {
    it('GET /product/All returns 401 without cookie', async () => {
      const res = await request(app.getHttpServer()).get('/product/All');
      expect(res.status).toBe(401);
    });

    it('GET /product/detail/some-slug returns 401 without cookie', async () => {
      const res = await request(app.getHttpServer()).get(
        '/product/detail/some-slug',
      );
      expect(res.status).toBe(401);
    });

    it('GET /product/All/filters returns 401 without cookie', async () => {
      const res = await request(app.getHttpServer()).get(
        '/product/All/filters',
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /product/:category  (listProducts)
  // -------------------------------------------------------------------------

  describe('GET /product/:category', () => {
    const sampleProduct = {
      product_id: 'p-1',
      product_name: 'Test Product',
      slug: 'test-product',
      brand: 'BrandX',
      description: 'desc',
      category: { slug: 'electronics' },
      variants: [
        {
          price: decimal(500),
          discount: decimal(0),
          attributes: { color: 'blue' },
          images: [
            { image_url: '/img/1.jpg', is_primary: true, sort_order: 0 },
          ],
        },
      ],
    };

    it('returns 200 with items and meta for the All scope', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([sampleProduct]);
      mockPrisma.product.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/product/All')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
      const body = res.body as ProductListResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0].product_id).toBe('p-1');
      expect(body.meta).toMatchObject({
        page: 1,
        limit: 12,
        total: 1,
        total_pages: 1,
      });
    });

    it('returns 200 with empty items when no products match', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .get('/product/All')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
      const body = res.body as ProductListResponse;
      expect(body.items).toHaveLength(0);
      expect(body.meta.total).toBe(0);
    });

    it('returns 400 when page is 0 (min is 1)', async () => {
      const res = await request(app.getHttpServer())
        .get('/product/All?page=0')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(400);
    });

    it('returns 400 when limit exceeds 50', async () => {
      const res = await request(app.getHttpServer())
        .get('/product/All?limit=51')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(400);
    });

    it('returns 400 when minPrice is negative', async () => {
      const res = await request(app.getHttpServer())
        .get('/product/All?minPrice=-1')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(400);
    });

    it('returns 400 when attributes is not valid JSON', async () => {
      const res = await request(app.getHttpServer())
        .get('/product/All?attributes=not-json')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(400);
    });

    it('returns 400 when search exceeds max length (200 chars)', async () => {
      const longSearch = 'a'.repeat(201);
      const res = await request(app.getHttpServer())
        .get(`/product/All?search=${longSearch}`)
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(400);
    });

    it('respects page and limit query params in the meta', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(100);

      const res = await request(app.getHttpServer())
        .get('/product/All?page=2&limit=5')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
      const body = res.body as ProductListResponse;
      expect(body.meta.page).toBe(2);
      expect(body.meta.limit).toBe(5);
      expect(body.meta.total_pages).toBe(20);
    });

    it('money fields are serialized as 2-decimal strings', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([sampleProduct]);
      mockPrisma.product.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/product/All')
        .set('Cookie', authCookie(token));

      const body = res.body as ProductListResponse;
      expect(typeof body.items[0].price).toBe('string');
      expect(body.items[0].price).toMatch(/^\d+\.\d{2}$/);
    });
  });

  // -------------------------------------------------------------------------
  // GET /product/detail/:slug
  // -------------------------------------------------------------------------

  describe('GET /product/detail/:slug', () => {
    const activeProduct = {
      product_id: 'p-001',
      product_name: 'iPhone 16',
      slug: 'iphone-16',
      brand: 'Apple',
      description: 'Flagship phone',
      is_active: true,
      category: {
        category_id: 'cat-1',
        category_name: 'Electronics',
        slug: 'electronics',
      },
      variants: [
        {
          product_variant_id: 'v-001',
          sku: 'SKU-001',
          stock: 50,
          price: decimal(799),
          discount: decimal(50),
          attributes: { color: 'black', storage: '128GB' },
          images: [
            { image_url: '/img/1.jpg', alt_text: 'front', is_primary: true },
          ],
        },
      ],
    };

    it('returns 200 with full product detail for an active product', async () => {
      seedActiveUser();
      mockPrisma.product.findUnique.mockResolvedValue(activeProduct);

      const res = await request(app.getHttpServer())
        .get('/product/detail/iphone-16')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
      const body = res.body as ProductDetailResponse;
      expect(body.product_id).toBe('p-001');
      expect(body.product_name).toBe('iPhone 16');
      expect(body.variants).toHaveLength(1);
      expect(body.variants[0].price).toBe('799.00');
      expect(body.variants[0].discount).toBe('50.00');
      expect(body.variants[0].stock).toBe(50);
      expect(body.variants[0].attributes).toEqual({
        color: 'black',
        storage: '128GB',
      });
    });

    it('returns 404 when product does not exist', async () => {
      seedActiveUser();
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/product/detail/non-existent')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(404);
    });

    it('returns 404 when product is inactive (not visible per business rules)', async () => {
      seedActiveUser();
      mockPrisma.product.findUnique.mockResolvedValue({
        ...activeProduct,
        is_active: false,
      });

      const res = await request(app.getHttpServer())
        .get('/product/detail/iphone-16')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth cookie', async () => {
      const res = await request(app.getHttpServer()).get(
        '/product/detail/iphone-16',
      );
      expect(res.status).toBe(401);
    });

    it('response never exposes is_active field', async () => {
      seedActiveUser();
      mockPrisma.product.findUnique.mockResolvedValue(activeProduct);

      const res = await request(app.getHttpServer())
        .get('/product/detail/iphone-16')
        .set('Cookie', authCookie(token));

      expect(res.body).not.toHaveProperty('is_active');
    });
  });

  // -------------------------------------------------------------------------
  // GET /product/:category/filters
  // -------------------------------------------------------------------------

  describe('GET /product/:category/filters', () => {
    it('returns 200 with price range and attribute facets', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([
        { attribute_name: 'color' },
      ]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: decimal(100) },
        _max: { price: decimal(2000) },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([
        { attributes: { color: 'black' } },
        { attributes: { color: 'white' } },
      ]);

      const res = await request(app.getHttpServer())
        .get('/product/electronics/filters')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
      const body = res.body as ProductFiltersResponse;
      expect(body.price.min).toBe('100.00');
      expect(body.price.max).toBe('2000.00');
      expect(body.attributes).toHaveLength(1);
      expect(body.attributes[0].name).toBe('color');
      expect(body.attributes[0].label).toBe('Color');
      expect(body.attributes[0].values).toEqual(
        expect.arrayContaining(['black', 'white']),
      );
    });

    it('returns 200 with 0.00 prices when no products exist in scope', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/product/electronics/filters')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
      const body = res.body as ProductFiltersResponse;
      expect(body.price.min).toBe('0.00');
      expect(body.price.max).toBe('0.00');
      expect(body.attributes).toEqual([]);
    });

    it('returns 400 when search param exceeds max length', async () => {
      const longSearch = 'x'.repeat(201);
      const res = await request(app.getHttpServer())
        .get(`/product/All/filters?search=${longSearch}`)
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth cookie', async () => {
      const res = await request(app.getHttpServer()).get(
        '/product/electronics/filters',
      );
      expect(res.status).toBe(401);
    });

    it('accepts a valid search param and returns 200', async () => {
      seedActiveUser();
      mockPrisma.category.findMany.mockResolvedValue([
        { category_id: 'cat-1', slug: 'electronics', parent_id: null },
      ]);
      mockPrisma.categoryAttribute.findMany.mockResolvedValue([]);
      mockPrisma.productVariant.aggregate.mockResolvedValue({
        _min: { price: null },
        _max: { price: null },
      });
      mockPrisma.productVariant.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/product/electronics/filters?search=apple')
        .set('Cookie', authCookie(token));

      expect(res.status).toBe(200);
    });
  });
});
