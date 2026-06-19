/**
 * E2E tests for CheckoutController (GET /checkout, POST /checkout/coupon,
 * DELETE /checkout/coupon, POST /checkout/payment-intent) and
 * OrderWebhookController (POST /payment/webhook).
 *
 * Pattern follows cart.e2e-spec.ts:
 *  - ConfigService provided via useValue with STRIPE keys so StripeService
 *    can instantiate without real config.
 *  - PrismaService mocked with jest.fn() stubs.
 *  - CheckoutService and StripeService fully mocked (no real DB/Stripe).
 *  - JwtModule.register with a fixed test secret for real JWT signing.
 *  - GlobalValidationPipe attached for DTO rejection tests.
 *  - Supertest runs in-process (no real port needed).
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

import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { OrderWebhookController } from '../src/order/order-webhook.controller';
import { OrderService } from '../src/order/order.service';
import { StripeService } from '../src/payment/stripe.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import {
  CheckoutMessages,
  CouponMessages,
  OrderMessages,
} from '../src/constants/messages.constant';
import type { CheckoutSummary } from '../src/checkout/types/checkout.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-checkout-test-secret';
const TEST_USER_ID = 'usr-e2e-checkout-001';
const TEST_EMAIL = 'checkout-e2e@example.com';
const ADDRESS_UUID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
const NON_UUID = 'not-a-uuid';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: { findUnique: jest.fn() },
  cart: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  cartItem: { findMany: jest.fn() },
  coupon: { findUnique: jest.fn() },
  couponUsage: { findUnique: jest.fn() },
  address: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

const mockCheckoutService = {
  getSummary: jest.fn(),
  applyCoupon: jest.fn(),
  removeCoupon: jest.fn(),
  createPaymentIntent: jest.fn(),
};

const mockOrderService = {
  placeStripeOrder: jest.fn(),
  finalizeRefund: jest.fn(),
};

const mockStripeService = {
  constructWebhookEvent: jest.fn(),
  createPaymentIntent: jest.fn(),
  refundPaymentIntent: jest.fn(),
};

const mockConfigService = {
  get: (key: string): string | undefined => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
      STRIPE_SECRET_KEY: 'sk_test_mock',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
    };
    return values[key];
  },
  getOrThrow: (key: string): string => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
      STRIPE_SECRET_KEY: 'sk_test_mock',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
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

function checkoutSummaryFixture(): CheckoutSummary {
  return {
    items: [
      {
        cart_item_id: 'ci-001',
        product_variant_id: 'var-001',
        product_name: 'Shirt',
        brand: 'FashionCo',
        image_url: '/img/shirt.jpg',
        attributes: { color: 'Blue' },
        price: '600.00',
        discount: '100.00',
        final_price: '500.00',
        quantity: 2,
        stock: 10,
        out_of_stock: false,
      },
    ],
    total_items: 2,
    sub_total: '1000.00',
    coupon_discount: '0.00',
    shipping_fee: '0.00',
    total: '1000.00',
    applied_coupon: null,
    personal: {
      first_name: 'Test',
      last_name: 'User',
      phone: '9876543210',
      email: TEST_EMAIL,
    },
  };
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

describe('CheckoutController + OrderWebhookController (e2e)', () => {
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
      controllers: [CheckoutController, OrderWebhookController],
      providers: [
        { provide: CheckoutService, useValue: mockCheckoutService },
        { provide: OrderService, useValue: mockOrderService },
        { provide: StripeService, useValue: mockStripeService },
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    // rawBody: true is required so req.rawBody is populated for the webhook
    app = module.createNestApplication({ rawBody: true });
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
  // Auth guard enforcement — all checkout routes need JWT
  // =========================================================================

  describe('Auth guard — checkout routes require JWT', () => {
    it('GET /checkout → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).get('/checkout');
      expect(res.status).toBe(401);
    });

    it('POST /checkout/coupon → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .send({ code: 'SAVE10' });
      expect(res.status).toBe(401);
    });

    it('DELETE /checkout/coupon → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer()).delete('/checkout/coupon');
      expect(res.status).toBe(401);
    });

    it('POST /checkout/payment-intent → 401 when no cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .send({ address_id: ADDRESS_UUID });
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is malformed', async () => {
      const res = await request(app.getHttpServer())
        .get('/checkout')
        .set('Cookie', 'access_token=not.a.real.jwt');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /checkout
  // =========================================================================

  describe('GET /checkout', () => {
    it('returns 200 with CheckoutSummary when authenticated', async () => {
      mockCheckoutService.getSummary.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      const res = await request(app.getHttpServer())
        .get('/checkout')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      const body = res.body as CheckoutSummary;
      expect(body).toMatchObject({
        items: anyOf(Array),
        sub_total: anyOf(String),
        shipping_fee: anyOf(String),
        total: anyOf(String),
        total_items: anyOf(Number),
      });
    });

    it('calls checkoutService.getSummary with the user id from the JWT', async () => {
      mockCheckoutService.getSummary.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      await request(app.getHttpServer())
        .get('/checkout')
        .set('Cookie', cookieHeader(validToken));

      expect(mockCheckoutService.getSummary).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('forwards 401 from CheckoutService (inactive user)', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockCheckoutService.getSummary.mockRejectedValue(
        new UnauthorizedException('inactive'),
      );

      const res = await request(app.getHttpServer())
        .get('/checkout')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /checkout/coupon — ApplyCouponDto validation
  // =========================================================================

  describe('POST /checkout/coupon', () => {
    it('returns 200 with refreshed summary on valid coupon code', async () => {
      mockCheckoutService.applyCoupon.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'SAVE10' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sub_total');
    });

    it('returns 400 when code is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when code is an empty string', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when code exceeds MaxLength(50)', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'A'.repeat(51) });

      expect(res.status).toBe(400);
    });

    it('accepts a code exactly at MaxLength (50 chars)', async () => {
      mockCheckoutService.applyCoupon.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'A'.repeat(50) });

      expect(res.status).toBe(200);
    });

    it('returns 400 when an extra field is sent (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'SAVE10', extra: 'field' });

      expect(res.status).toBe(400);
    });

    it('forwards 400 from CheckoutService (emptyCart) with the message', async () => {
      mockCheckoutService.applyCoupon.mockRejectedValue(
        new BadRequestException(CheckoutMessages.emptyCart),
      );

      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'SAVE10' });

      expect(res.status).toBe(400);
      const body = res.body as { message: string };
      expect(body.message).toContain(CheckoutMessages.emptyCart);
    });

    it('forwards 400 from CheckoutService (coupon invalid) with the message', async () => {
      mockCheckoutService.applyCoupon.mockRejectedValue(
        new BadRequestException(CouponMessages.invalid),
      );

      const res = await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'BADCODE' });

      expect(res.status).toBe(400);
      const body = res.body as { message: string };
      expect(body.message).toContain(CouponMessages.invalid);
    });

    it('calls applyCoupon with user id and the DTO', async () => {
      mockCheckoutService.applyCoupon.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: 'SAVE10' });

      expect(mockCheckoutService.applyCoupon).toHaveBeenCalledWith(
        TEST_USER_ID,
        containing({ code: 'SAVE10' }),
      );
    });

    it('trims whitespace from coupon code (Transform)', async () => {
      mockCheckoutService.applyCoupon.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      await request(app.getHttpServer())
        .post('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken))
        .send({ code: '  SAVE10  ' });

      expect(mockCheckoutService.applyCoupon).toHaveBeenCalledWith(
        TEST_USER_ID,
        containing({ code: 'SAVE10' }), // trimmed
      );
    });
  });

  // =========================================================================
  // DELETE /checkout/coupon
  // =========================================================================

  describe('DELETE /checkout/coupon', () => {
    it('returns 200 with refreshed summary', async () => {
      mockCheckoutService.removeCoupon.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      const res = await request(app.getHttpServer())
        .delete('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('applied_coupon', null);
    });

    it('calls removeCoupon with the user id from the JWT', async () => {
      mockCheckoutService.removeCoupon.mockResolvedValue(
        checkoutSummaryFixture(),
      );

      await request(app.getHttpServer())
        .delete('/checkout/coupon')
        .set('Cookie', cookieHeader(validToken));

      expect(mockCheckoutService.removeCoupon).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
    });
  });

  // =========================================================================
  // POST /checkout/payment-intent — CreatePaymentIntentDto validation
  // =========================================================================

  describe('POST /checkout/payment-intent', () => {
    it('returns 200 with client_secret and total on valid request', async () => {
      mockCheckoutService.createPaymentIntent.mockResolvedValue({
        client_secret: 'pi_test_secret',
        total: '1000.00',
      });

      const res = await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(res.status).toBe(200);
      const body = res.body as { client_secret: string; total: string };
      expect(body.client_secret).toBe('pi_test_secret');
      expect(body.total).toBe('1000.00');
    });

    it('returns 400 when address_id is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .set('Cookie', cookieHeader(validToken))
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when address_id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: NON_UUID });

      expect(res.status).toBe(400);
    });

    it('returns 400 when an extra field is sent', async () => {
      const res = await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID, extra: 'bad' });

      expect(res.status).toBe(400);
    });

    it('forwards 404 from CheckoutService (address not owned)', async () => {
      mockCheckoutService.createPaymentIntent.mockRejectedValue(
        new NotFoundException('Address not found'),
      );

      const res = await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(res.status).toBe(404);
    });

    it('calls createPaymentIntent with user id and the DTO', async () => {
      mockCheckoutService.createPaymentIntent.mockResolvedValue({
        client_secret: 'pi_test_secret',
        total: '1000.00',
      });

      await request(app.getHttpServer())
        .post('/checkout/payment-intent')
        .set('Cookie', cookieHeader(validToken))
        .send({ address_id: ADDRESS_UUID });

      expect(mockCheckoutService.createPaymentIntent).toHaveBeenCalledWith(
        TEST_USER_ID,
        containing({ address_id: ADDRESS_UUID }),
      );
    });
  });

  // =========================================================================
  // POST /payment/webhook — signature verify + event routing
  // =========================================================================

  describe('POST /payment/webhook', () => {
    it('returns 400 when no stripe-signature header is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('Content-Type', 'application/json')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(400);
    });

    it('returns 400 when StripeService.constructWebhookEvent throws', async () => {
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new BadRequestException(OrderMessages.webhookSignatureInvalid);
      });

      const res = await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'bad-signature')
        .set('Content-Type', 'application/json')
        .send(Buffer.from('bad-payload'));

      expect(res.status).toBe(400);
    });

    it('returns 200 with { received: true } on payment_intent.succeeded event', async () => {
      const fakeEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            metadata: {
              user_id: TEST_USER_ID,
              address_id: ADDRESS_UUID,
              coupon_code: '',
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);
      mockOrderService.placeStripeOrder.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'valid-sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify(fakeEvent)));

      expect(res.status).toBe(200);
      const body = res.body as { received: boolean };
      expect(body.received).toBe(true);
    });

    it('calls orderService.placeStripeOrder on payment_intent.succeeded', async () => {
      const intentId = 'pi_test_456';
      const fakeEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: intentId,
            metadata: {
              user_id: TEST_USER_ID,
              address_id: ADDRESS_UUID,
              coupon_code: '',
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);
      mockOrderService.placeStripeOrder.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'valid-sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify(fakeEvent)));

      expect(mockOrderService.placeStripeOrder).toHaveBeenCalledWith(
        containing({
          user_id: TEST_USER_ID,
          address_id: ADDRESS_UUID,
          coupon_code: '',
        }),
        intentId,
      );
    });

    it('returns 200 with { received: true } on charge.refunded event', async () => {
      const fakeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            payment_intent: 'pi_test_789',
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);
      mockOrderService.finalizeRefund.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'valid-sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify(fakeEvent)));

      expect(res.status).toBe(200);
      const body = res.body as { received: boolean };
      expect(body.received).toBe(true);
    });

    it('calls orderService.finalizeRefund on charge.refunded with the paymentIntentId', async () => {
      const fakeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            payment_intent: 'pi_test_789',
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);
      mockOrderService.finalizeRefund.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'valid-sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify(fakeEvent)));

      expect(mockOrderService.finalizeRefund).toHaveBeenCalledWith(
        'pi_test_789',
      );
    });

    it('returns 200 and ignores unknown event types (no-op)', async () => {
      const fakeEvent = {
        type: 'customer.created',
        data: { object: {} },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);

      const res = await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'valid-sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify(fakeEvent)));

      expect(res.status).toBe(200);
      expect(mockOrderService.placeStripeOrder).not.toHaveBeenCalled();
      expect(mockOrderService.finalizeRefund).not.toHaveBeenCalled();
    });

    it('does not call finalizeRefund when charge.payment_intent is null', async () => {
      const fakeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            payment_intent: null, // no payment intent reference
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(fakeEvent);

      const res = await request(app.getHttpServer())
        .post('/payment/webhook')
        .set('stripe-signature', 'valid-sig')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify(fakeEvent)));

      expect(res.status).toBe(200);
      expect(mockOrderService.finalizeRefund).not.toHaveBeenCalled();
    });
  });
});
