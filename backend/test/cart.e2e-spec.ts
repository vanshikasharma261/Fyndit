/**
 * E2E tests for CartController (GET /cart, POST /cart, PATCH /cart/:cartItemId,
 * DELETE /cart/:cartItemId).
 *
 * PrismaService is replaced with jest mocks (no real DB). JwtModule is
 * configured with a fixed test secret so we can sign real tokens and exercise
 * the full JWT-cookie auth flow. The GlobalValidationPipe (whitelist +
 * forbidNonWhitelisted + transform) is attached so DTO and ParseUUIDPipe
 * validation rejections are tested with real 400 responses.
 *
 * Key changes from review-fix implementation:
 * - POST /cart now returns 200 (was 201): @HttpCode(HttpStatus.OK) added.
 * - UpdateCartItemDto now has @Max(20): quantity=21+ must be rejected with 400.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { CartController } from '../src/cart/cart.controller';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { CartMessages } from '../src/constants/messages.constant';
import { MAX_CART_ITEM_QUANTITY } from '../src/constants/values.constant';
import { CartResponse, UpdateCartResponse } from '../src/cart/types/cart.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-cart-test-secret';
const TEST_USER_ID = 'usr-e2e-cart-001';
const TEST_EMAIL = 'cart-e2e@example.com';
const CART_ITEM_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const VARIANT_UUID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const NON_UUID_ID = 'not-a-uuid';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  cart: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  cartItem: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  productVariant: {
    findUnique: jest.fn(),
  },
};

/** CartService mock that delegates every call to jest.fn() stubs. */
const mockCartService = {
  getCart: jest.fn(),
  addToCart: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
};

const mockConfigService = {
  get: (key: string): string | undefined => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
    };
    return values[key];
  },
  getOrThrow: (key: string): string => {
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
// Helpers
// ---------------------------------------------------------------------------

function cookieHeader(token: string): string {
  return `access_token=${token}`;
}

/**
 * Thin wrappers over jest's asymmetric matchers. The built-in `expect.*`
 * matchers are typed as `any`, which trips `no-unsafe-assignment` when nested
 * as a property value. Re-typing the result as `unknown` keeps behavior
 * identical while satisfying the type checker.
 */
const containing = (obj: object): unknown => expect.objectContaining(obj);
const anyOf = (ctor: unknown): unknown => expect.any(ctor);

/** Minimal CartResponse fixture for happy-path tests. */
function cartResponse() {
  return {
    summary: {
      total_items: 2,
      total_price: '2200.00',
      total_discount: '154.00',
      final_amount: '2046.00',
    },
    items: [
      {
        cart_item_id: CART_ITEM_UUID,
        product_variant_id: VARIANT_UUID,
        product_name: 'Laptop Pro',
        brand: 'TechCo',
        description: 'A great laptop',
        image_url: '/img/laptop.jpg',
        price: '1100.00',
        discount: '77.00',
        final_price: '1023.00',
        quantity: 2,
        stock: 10,
        attributes: { color: 'Silver' },
      },
    ],
  };
}

function addToCartResponse() {
  return {
    item: cartResponse().items[0],
    summary: cartResponse().summary,
  };
}

function updateCartResponse() {
  return {
    message: CartMessages.updateSuccess,
    item: { ...cartResponse().items[0], quantity: 3 },
    summary: { ...cartResponse().summary, total_items: 3 },
  };
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

describe('CartController (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let validToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [CartController],
      providers: [
        // Use the mock service — avoids the full Prisma wiring for controller e2e
        { provide: CartService, useValue: mockCartService },
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
    validToken = await jwtService.signAsync({
      sub: TEST_USER_ID,
      email: TEST_EMAIL,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // isUserActive is called by AuthService.getProfile/isUserActive;
    // since CartService is fully mocked here, this mock is only hit when
    // the JwtStrategy validates the token (it does not call isUserActive directly).
    mockPrisma.user.findUnique.mockResolvedValue({
      is_active: true,
      is_deleted: false,
      deleted_at: null,
    });
  });

  // =========================================================================
  // Auth guard enforcement — every route must reject without a valid token
  // =========================================================================

  describe('Auth guard — all routes require JWT', () => {
    it('GET /cart → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).get('/cart');
      expect(res.status).toBe(401);
    });

    it('POST /cart → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart')
        .send({ product_variant_id: VARIANT_UUID });
      expect(res.status).toBe(401);
    });

    it('PATCH /cart/:id → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .send({ quantity: 2 });
      expect(res.status).toBe(401);
    });

    it('DELETE /cart/:id → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/cart/${CART_ITEM_UUID}`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is malformed', async () => {
      const res = await request(app.getHttpServer())
        .get('/cart')
        .set('Cookie', 'access_token=not.a.real.jwt');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // ParseUUIDPipe — :cartItemId param validation
  // =========================================================================

  describe('ParseUUIDPipe — :cartItemId param', () => {
    it('PATCH /cart/:id returns 400 when cartItemId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${NON_UUID_ID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 2 });
      expect(res.status).toBe(400);
    });

    it('DELETE /cart/:id returns 400 when cartItemId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/cart/${NON_UUID_ID}`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(400);
    });

    it('PATCH /cart/:id accepts a valid UUID', async () => {
      mockCartService.updateItem.mockResolvedValue(updateCartResponse());

      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 2 });
      expect(res.status).toBe(200);
    });

    it('DELETE /cart/:id accepts a valid UUID', async () => {
      mockCartService.removeItem.mockResolvedValue({
        message: CartMessages.removeSuccess,
      });

      const res = await request(app.getHttpServer())
        .delete(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /cart
  // =========================================================================

  describe('GET /cart', () => {
    it('returns 200 with CartResponse when authenticated', async () => {
      mockCartService.getCart.mockResolvedValue(cartResponse());

      const res = await request(app.getHttpServer())
        .get('/cart')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as CartResponse;
      expect(body).toMatchObject({
        summary: containing({
          total_items: anyOf(Number),
          total_price: anyOf(String),
          total_discount: anyOf(String),
          final_amount: anyOf(String),
        }),
        items: anyOf(Array),
      });
    });

    it('calls cartService.getCart with the user id from the JWT', async () => {
      mockCartService.getCart.mockResolvedValue(cartResponse());

      await request(app.getHttpServer())
        .get('/cart')
        .set('Cookie', cookieHeader(validToken));

      expect(mockCartService.getCart).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('returns 200 with empty items array when cart is empty', async () => {
      mockCartService.getCart.mockResolvedValue({
        summary: {
          total_items: 0,
          total_price: '0.00',
          total_discount: '0.00',
          final_amount: '0.00',
        },
        items: [],
      });

      const res = await request(app.getHttpServer())
        .get('/cart')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as CartResponse;
      expect(body.items).toHaveLength(0);
      expect(body.summary.total_items).toBe(0);
    });
  });

  // =========================================================================
  // POST /cart — AddCartItemDto validation + HTTP 200 (not 201)
  // =========================================================================

  describe('POST /cart', () => {
    it('returns 200 (not 201) with AddToCartResponse on valid request', async () => {
      // POST /cart uses @HttpCode(HttpStatus.OK) because it is an upsert that
      // may increment an existing line rather than always creating a new resource.
      mockCartService.addToCart.mockResolvedValue(addToCartResponse());

      const res = await request(app.getHttpServer())
        .post('/cart')
        .set('Cookie', cookieHeader(validToken))
        .send({ product_variant_id: VARIANT_UUID });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('item');
      expect(res.body).toHaveProperty('summary');
    });

    it('returns 400 when product_variant_id is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart')
        .set('Cookie', cookieHeader(validToken))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when product_variant_id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart')
        .set('Cookie', cookieHeader(validToken))
        .send({ product_variant_id: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when an extra (non-whitelisted) key is sent', async () => {
      const res = await request(app.getHttpServer())
        .post('/cart')
        .set('Cookie', cookieHeader(validToken))
        .send({
          product_variant_id: VARIANT_UUID,
          quantity: 5, // extra field — not in AddCartItemDto
        });

      expect(res.status).toBe(400);
    });

    it('calls cartService.addToCart with user id and the DTO', async () => {
      mockCartService.addToCart.mockResolvedValue(addToCartResponse());

      await request(app.getHttpServer())
        .post('/cart')
        .set('Cookie', cookieHeader(validToken))
        .send({ product_variant_id: VARIANT_UUID });

      expect(mockCartService.addToCart).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ product_variant_id: VARIANT_UUID }),
      );
    });

    it('forwards 400 from CartService (e.g. cartFull) to the response', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockCartService.addToCart.mockRejectedValue(
        new BadRequestException(CartMessages.cartFull),
      );

      const res = await request(app.getHttpServer())
        .post('/cart')
        .set('Cookie', cookieHeader(validToken))
        .send({ product_variant_id: VARIANT_UUID });

      expect(res.status).toBe(400);
      const body = res.body as { message: string };
      expect(body.message).toContain(CartMessages.cartFull);
    });
  });

  // =========================================================================
  // PATCH /cart/:cartItemId — UpdateCartItemDto validation
  // =========================================================================

  describe('PATCH /cart/:cartItemId', () => {
    it('returns 200 with UpdateCartResponse on valid request', async () => {
      mockCartService.updateItem.mockResolvedValue(updateCartResponse());

      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 3 });

      expect(res.status).toBe(200);
      const body = res.body as UpdateCartResponse;
      expect(body).toMatchObject({
        message: CartMessages.updateSuccess,
        item: anyOf(Object),
        summary: anyOf(Object),
      });
    });

    it('returns 400 when quantity is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when quantity is 0 (below @Min(1))', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 0 });

      expect(res.status).toBe(400);
    });

    it('returns 400 when quantity is negative', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: -1 });

      expect(res.status).toBe(400);
    });

    it('returns 400 when quantity is a float', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 1.5 });

      expect(res.status).toBe(400);
    });

    it('returns 400 when quantity is a string that cannot be coerced to int', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 'many' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when quantity exceeds MAX_CART_ITEM_QUANTITY (20) — @Max(20) on DTO', async () => {
      // UpdateCartItemDto has @Max(MAX_CART_ITEM_QUANTITY) where MAX_CART_ITEM_QUANTITY=20.
      // Sending quantity=21 must be rejected at the DTO layer before reaching the service.
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: MAX_CART_ITEM_QUANTITY + 1 }); // 21

      expect(res.status).toBe(400);
    });

    it('accepts quantity equal to MAX_CART_ITEM_QUANTITY (20) — boundary: still valid', async () => {
      mockCartService.updateItem.mockResolvedValue(updateCartResponse());

      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: MAX_CART_ITEM_QUANTITY }); // 20

      expect(res.status).toBe(200);
    });

    it('returns 400 when an extra (non-whitelisted) key is sent', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 2, note: 'surprise' });

      expect(res.status).toBe(400);
    });

    it('forwards 404 from CartService (ownership failure) to the response', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockCartService.updateItem.mockRejectedValue(
        new NotFoundException(CartMessages.cartItemNotFound),
      );

      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 2 });

      expect(res.status).toBe(404);
    });

    it('accepts quantity=1 (minimum valid value)', async () => {
      mockCartService.updateItem.mockResolvedValue(updateCartResponse());

      const res = await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 1 });

      expect(res.status).toBe(200);
    });

    it('calls cartService.updateItem with user id, UUID param, and DTO', async () => {
      mockCartService.updateItem.mockResolvedValue(updateCartResponse());

      await request(app.getHttpServer())
        .patch(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ quantity: 3 });

      expect(mockCartService.updateItem).toHaveBeenCalledWith(
        TEST_USER_ID,
        CART_ITEM_UUID,
        expect.objectContaining({ quantity: 3 }),
      );
    });
  });

  // =========================================================================
  // DELETE /cart/:cartItemId
  // =========================================================================

  describe('DELETE /cart/:cartItemId', () => {
    it('returns 200 with removeSuccess message when authenticated', async () => {
      mockCartService.removeItem.mockResolvedValue({
        message: CartMessages.removeSuccess,
      });

      const res = await request(app.getHttpServer())
        .delete(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: CartMessages.removeSuccess });
    });

    it('calls cartService.removeItem with user id and the cartItemId', async () => {
      mockCartService.removeItem.mockResolvedValue({
        message: CartMessages.removeSuccess,
      });

      await request(app.getHttpServer())
        .delete(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(mockCartService.removeItem).toHaveBeenCalledWith(
        TEST_USER_ID,
        CART_ITEM_UUID,
      );
    });

    it('forwards 404 from CartService (ownership failure) to the response', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockCartService.removeItem.mockRejectedValue(
        new NotFoundException(CartMessages.cartItemNotFound),
      );

      const res = await request(app.getHttpServer())
        .delete(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(404);
    });

    it('forwards 401 from CartService (inactive user) to the response', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockCartService.removeItem.mockRejectedValue(
        new UnauthorizedException(CartMessages.cartItemNotFound),
      );

      const res = await request(app.getHttpServer())
        .delete(`/cart/${CART_ITEM_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });
});
