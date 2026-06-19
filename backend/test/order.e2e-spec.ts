/**
 * E2E tests for OrderController (POST /order, GET /order, GET /order/:orderId,
 * PATCH /order/:orderId/cancel).
 *
 * Pattern: fully mocked OrderService + real JWT auth guard + GlobalValidationPipe.
 * Port is NOT opened — Supertest uses the in-process app.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { OrderController } from '../src/order/order.controller';
import { OrderService } from '../src/order/order.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { OrderMessages } from '../src/constants/messages.constant';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  AddressType,
} from '../src/generated/prisma/enums';
import type {
  OrderDetail,
  OrderListResponse,
} from '../src/order/types/order.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-order-test-secret';
const TEST_USER_ID = 'usr-e2e-order-001';
const TEST_EMAIL = 'order-e2e@example.com';
const ORDER_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADDRESS_UUID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const NON_UUID = 'not-a-uuid';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: { findUnique: jest.fn() },
};

const mockOrderService = {
  placeCodOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrder: jest.fn(),
  cancelOrder: jest.fn(),
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

const containing = (obj: object): unknown => expect.objectContaining(obj);
const anyOf = (ctor: unknown): unknown => expect.any(ctor);

function makeOrderDetail(): OrderDetail {
  return {
    order_id: ORDER_UUID,
    order_number: '#A0EEBC99',
    created_at: new Date('2024-01-15T10:00:00Z').toISOString(),
    status: OrderStatus.PENDING,
    payment_method: PaymentMethod.COD,
    payment_status: PaymentStatus.PENDING,
    sub_total: '1000.00',
    coupon_discount: '0.00',
    shipping_fee: '0.00',
    total_amount: '1000.00',
    shipping_address: {
      address_id: ADDRESS_UUID,
      address_type: AddressType.HOME,
      line1: '123 Main St',
      line2: null,
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      zip: '400001',
      is_default: true,
    },
    items: [
      {
        product_name: 'Shirt',
        brand: 'FashionCo',
        image_url: '/img/shirt.jpg',
        attributes: { color: 'Blue' },
        purchase_price: '500.00',
        quantity: 2,
        line_total: '1000.00',
      },
    ],
    can_cancel: true,
  };
}

function makeOrderListResponse(): OrderListResponse {
  return {
    orders: [
      {
        order_id: ORDER_UUID,
        order_number: '#A0EEBC99',
        product_name: 'Shirt',
        brand: 'FashionCo',
        image_url: '/img/shirt.jpg',
        attributes: { color: 'Blue' },
        item_count: 1,
        total_amount: '1000.00',
        status: OrderStatus.PENDING,
        created_at: new Date('2024-01-15T10:00:00Z').toISOString(),
        can_cancel: true,
      },
    ],
    meta: {
      page: 1,
      limit: 10,
      total: 1,
      total_pages: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

describe('OrderController (e2e)', () => {
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
      controllers: [OrderController],
      providers: [
        { provide: OrderService, useValue: mockOrderService },
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
    mockPrisma.user.findUnique.mockResolvedValue({
      is_active: true,
      is_deleted: false,
      deleted_at: null,
    });
  });

  // =========================================================================
  // Auth guard enforcement
  // =========================================================================

  describe('Auth guard — all routes require JWT', () => {
    it('POST /order → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/order')
        .send({ address_id: ADDRESS_UUID });
      expect(res.status).toBe(401);
    });

    it('GET /order → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).get('/order');
      expect(res.status).toBe(401);
    });

    it('GET /order/:orderId → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).get(
        `/order/${ORDER_UUID}`,
      );
      expect(res.status).toBe(401);
    });

    it('PATCH /order/:orderId/cancel → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/order/${ORDER_UUID}/cancel`,
      );
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // ParseUUIDPipe — :orderId param
  // =========================================================================

  describe('ParseUUIDPipe — :orderId param', () => {
    it('GET /order/:id returns 400 when orderId is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/order/${NON_UUID}`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(400);
    });

    it('PATCH /order/:id/cancel returns 400 when orderId is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/order/${NON_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(400);
    });

    it('GET /order/:id accepts a valid UUID', async () => {
      mockOrderService.getOrder.mockResolvedValue(makeOrderDetail());

      const res = await request(app.getHttpServer())
        .get(`/order/${ORDER_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
    });

    it('PATCH /order/:id/cancel accepts a valid UUID', async () => {
      mockOrderService.cancelOrder.mockResolvedValue({
        message: OrderMessages.cancelSuccess,
      });

      const res = await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // POST /order — PlaceOrderDto validation
  // =========================================================================

  describe('POST /order', () => {
    it('returns 201 with OrderDetail on valid request', async () => {
      mockOrderService.placeCodOrder.mockResolvedValue(makeOrderDetail());

      const res = await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(res.status).toBe(201);
      const body = res.body as OrderDetail;
      expect(body.order_id).toBe(ORDER_UUID);
      expect(body.payment_method).toBe(PaymentMethod.COD);
    });

    it('returns 400 when address_id is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when address_id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: NON_UUID });

      expect(res.status).toBe(400);
    });

    it('returns 400 when extra fields are sent', async () => {
      const res = await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID, payment_method: 'COD' });

      expect(res.status).toBe(400);
    });

    it('calls placeCodOrder with user id and the DTO', async () => {
      mockOrderService.placeCodOrder.mockResolvedValue(makeOrderDetail());

      await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(mockOrderService.placeCodOrder).toHaveBeenCalledWith(
        TEST_USER_ID,
        containing({ address_id: ADDRESS_UUID }),
      );
    });

    it('forwards 404 from OrderService (address not found)', async () => {
      mockOrderService.placeCodOrder.mockRejectedValue(
        new NotFoundException('Address not found'),
      );

      const res = await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(res.status).toBe(404);
    });

    it('forwards 400 from OrderService (empty cart)', async () => {
      mockOrderService.placeCodOrder.mockRejectedValue(
        new BadRequestException('emptyCart'),
      );

      const res = await request(app.getHttpServer())
        .post('/order')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /order — list with pagination
  // =========================================================================

  describe('GET /order', () => {
    it('returns 200 with OrderListResponse when authenticated', async () => {
      mockOrderService.listOrders.mockResolvedValue(makeOrderListResponse());

      const res = await request(app.getHttpServer())
        .get('/order')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as OrderListResponse;
      expect(body.orders).toHaveLength(1);
      expect(body.meta).toMatchObject({
        page: anyOf(Number),
        limit: anyOf(Number),
        total: anyOf(Number),
        total_pages: anyOf(Number),
      });
    });

    it('calls listOrders with user id and the query DTO', async () => {
      mockOrderService.listOrders.mockResolvedValue(makeOrderListResponse());

      await request(app.getHttpServer())
        .get('/order?page=2')
        .set('Cookie', cookieHeader(validToken));

      expect(mockOrderService.listOrders).toHaveBeenCalledWith(
        TEST_USER_ID,
        containing({ page: 2 }),
      );
    });

    it('returns 400 when page is not a number (DTO validation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/order?page=abc')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(400);
    });

    it('returns 400 when page is below Min(1)', async () => {
      const res = await request(app.getHttpServer())
        .get('/order?page=0')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(400);
    });

    it('accepts page=1 (minimum valid page)', async () => {
      mockOrderService.listOrders.mockResolvedValue(makeOrderListResponse());

      const res = await request(app.getHttpServer())
        .get('/order?page=1')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
    });

    it('returns empty orders array when no orders exist', async () => {
      mockOrderService.listOrders.mockResolvedValue({
        orders: [],
        meta: { page: 1, limit: 10, total: 0, total_pages: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/order')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as OrderListResponse;
      expect(body.orders).toHaveLength(0);
    });
  });

  // =========================================================================
  // GET /order/:orderId — ownership + 404
  // =========================================================================

  describe('GET /order/:orderId', () => {
    it('returns 200 with OrderDetail when order is owned by user', async () => {
      mockOrderService.getOrder.mockResolvedValue(makeOrderDetail());

      const res = await request(app.getHttpServer())
        .get(`/order/${ORDER_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as OrderDetail;
      expect(body.order_id).toBe(ORDER_UUID);
      expect(body.items).toHaveLength(1);
      expect(body.shipping_address).toBeDefined();
    });

    it('returns 404 when order does not exist or belongs to another user', async () => {
      mockOrderService.getOrder.mockRejectedValue(
        new NotFoundException(OrderMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .get(`/order/${ORDER_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(404);
      const body = res.body as { message: string };
      expect(body.message).toContain(OrderMessages.notFound);
    });

    it('calls getOrder with user id and orderId param', async () => {
      mockOrderService.getOrder.mockResolvedValue(makeOrderDetail());

      await request(app.getHttpServer())
        .get(`/order/${ORDER_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(mockOrderService.getOrder).toHaveBeenCalledWith(
        TEST_USER_ID,
        ORDER_UUID,
      );
    });

    it('response includes correct money string shapes', async () => {
      mockOrderService.getOrder.mockResolvedValue(makeOrderDetail());

      const res = await request(app.getHttpServer())
        .get(`/order/${ORDER_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      const body = res.body as OrderDetail;
      expect(body.total_amount).toMatch(/^\d+\.\d{2}$/);
      expect(body.sub_total).toMatch(/^\d+\.\d{2}$/);
      expect(body.items[0].purchase_price).toMatch(/^\d+\.\d{2}$/);
    });
  });

  // =========================================================================
  // PATCH /order/:orderId/cancel
  // =========================================================================

  describe('PATCH /order/:orderId/cancel', () => {
    it('returns 200 with cancelSuccess message for a COD order', async () => {
      mockOrderService.cancelOrder.mockResolvedValue({
        message: OrderMessages.cancelSuccess,
      });

      const res = await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as { message: string };
      expect(body.message).toBe(OrderMessages.cancelSuccess);
    });

    it('returns 200 with refundInitiated message for a Stripe order', async () => {
      mockOrderService.cancelOrder.mockResolvedValue({
        message: OrderMessages.refundInitiated,
      });

      const res = await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as { message: string };
      expect(body.message).toBe(OrderMessages.refundInitiated);
    });

    it('returns 404 when order is not found', async () => {
      mockOrderService.cancelOrder.mockRejectedValue(
        new NotFoundException(OrderMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(404);
    });

    it('returns 400 when order is not cancellable (notCancellable)', async () => {
      mockOrderService.cancelOrder.mockRejectedValue(
        new BadRequestException(OrderMessages.notCancellable),
      );

      const res = await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(400);
      const body = res.body as { message: string };
      expect(body.message).toContain(OrderMessages.notCancellable);
    });

    it('calls cancelOrder with user id and orderId', async () => {
      mockOrderService.cancelOrder.mockResolvedValue({
        message: OrderMessages.cancelSuccess,
      });

      await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(mockOrderService.cancelOrder).toHaveBeenCalledWith(
        TEST_USER_ID,
        ORDER_UUID,
      );
    });

    it('returns 401 when order service throws UnauthorizedException', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockOrderService.cancelOrder.mockRejectedValue(
        new UnauthorizedException('inactive'),
      );

      const res = await request(app.getHttpServer())
        .patch(`/order/${ORDER_UUID}/cancel`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // matcher sanity check
  // =========================================================================

  it('containing and anyOf wrappers are defined', () => {
    expect(containing({ x: 1 })).toBeDefined();
    expect(anyOf(String)).toBeDefined();
  });
});
