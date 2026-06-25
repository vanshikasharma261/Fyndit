/**
 * Unit tests for OrderService.
 *
 * Covers: placeCodOrder, listOrders pagination, getOrder ownership/404,
 * cancelOrder COD-sync vs Stripe-refund branch, placeStripeOrder idempotency
 * + refund-on-stock-fail, finalizeRefund idempotency + restock.
 *
 * New (email-notification feature): placeCodOrder and placeStripeOrder email
 * dispatch — fire-and-forget verified via MailService mock assertions.
 *
 * Uses jest.resetAllMocks() in beforeEach so Once-queue values don't leak
 * (per the address-module pattern in testing-patterns.md).
 *
 * $transaction has two forms here:
 *  1. Callback form (Serializable): mock invokes callback with mockTx.
 *  2. Array form (list count+findMany): mock resolves the array.
 *
 * MailService is module-mocked so mail.service.ts (and its ESM `puppeteer`
 * dependency) never gets loaded in the CommonJS Jest environment.
 */

// ---------------------------------------------------------------------------
// Module-level mock for MailService — must precede all imports that
// transitively import puppeteer (an ESM-only package).
// ---------------------------------------------------------------------------
jest.mock('../mail/mail.service');

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client-runtime-utils';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CheckoutService } from '../checkout/checkout.service';
import { CouponService } from '../checkout/coupon.service';
import { StripeService } from '../payment/stripe.service';
import { MailService } from '../mail/mail.service';
import { AuthMessages, OrderMessages } from '../constants/messages.constant';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  AddressType,
} from '../generated/prisma/enums';
import { DiscountType } from '../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function d(value: number | string): InstanceType<typeof Decimal> {
  return new Decimal(String(value));
}

const containing = (obj: object): unknown => expect.objectContaining(obj);
const anyOf = (ctor: unknown): unknown => expect.any(ctor);

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ADDRESS_ID = 'a0000000-0000-4000-8000-000000000002';
const VARIANT_ID = 'var-001';
const CART_ID = 'cart-001';
const PAYMENT_ID = 'pay-001';
const STRIPE_INTENT_ID = 'pi_test_123';
const COUPON_ID = 'coupon-001';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** The tx object the callback form of $transaction is called with */
const mockTx = {
  order: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  address: { findFirst: jest.fn() },
  cartItem: { deleteMany: jest.fn() },
  cart: { findUnique: jest.fn(), update: jest.fn() },
  payment: { findFirst: jest.fn(), update: jest.fn() },
  productVariant: { update: jest.fn() },
  coupon: { update: jest.fn() },
  couponUsage: { create: jest.fn() },
};

const mockPrisma = {
  order: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAuthService = {
  isUserActive: jest.fn(),
};

const mockCheckoutService = {
  assertOwnedAddress: jest.fn(),
  buildOrderContext: jest.fn(),
};

const mockCouponService = {
  recordUsage: jest.fn(),
  releaseUsage: jest.fn(),
};

const mockStripeService = {
  refundPaymentIntent: jest.fn(),
};

const mockMailService = {
  sendOrderConfirmation: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeOrderContext(coupon = false) {
  const lines = [
    {
      product_variant_id: VARIANT_ID,
      product_name: 'Shirt',
      purchase_price: d(500),
      quantity: 2,
    },
  ];
  return {
    lines,
    sub_total: d(1000),
    coupon: coupon
      ? {
          coupon_id: COUPON_ID,
          code: 'SAVE10',
          discount_type: DiscountType.PERCENTAGE,
          discount_value: d(10),
          discount_amount: d(100),
        }
      : null,
    coupon_discount: coupon ? d(100) : d(0),
    shipping_fee: d(0),
    total: coupon ? d(900) : d(1000),
  };
}

function makeAddress() {
  return {
    address_id: ADDRESS_ID,
    address_type: AddressType.HOME,
    line1: '123 Main St',
    line2: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    zip: '400001',
    is_default: true,
  };
}

function makeOrderDetailRow() {
  return {
    order_id: ORDER_ID,
    status: OrderStatus.PENDING,
    created_at: new Date('2024-01-15T10:00:00Z'),
    sub_total: d(1000),
    coupon_discount: d(0),
    shipping_fee: d(0),
    total_amount: d(1000),
    address_id: ADDRESS_ID,
    payment: {
      payment_method: PaymentMethod.COD,
      payment_status: PaymentStatus.PENDING,
    },
    items: [
      {
        order_item_id: 'item-001',
        product_name: 'Shirt',
        purchase_price: d(500),
        quantity: 2,
        product_variant: {
          product: { brand: 'FashionCo' },
          attributes: { color: 'Blue' },
          images: [
            { image_url: '/img/shirt.jpg', is_primary: true, sort_order: 1 },
          ],
        },
      },
    ],
  };
}

function makeOrderListRow() {
  return {
    order_id: ORDER_ID,
    total_amount: d(1000),
    status: OrderStatus.PENDING,
    created_at: new Date('2024-01-15T10:00:00Z'),
    _count: { items: 1 },
    items: [
      {
        product_name: 'Shirt',
        product_variant: {
          product: { brand: 'FashionCo' },
          attributes: { color: 'Blue' },
          images: [
            { image_url: '/img/shirt.jpg', is_primary: true, sort_order: 1 },
          ],
        },
      },
    ],
  };
}

function makeOrderWithPayment(
  paymentMethod = PaymentMethod.COD,
  paymentStatus = PaymentStatus.PENDING,
  stripeId: string | null = null,
  status = OrderStatus.PENDING,
) {
  return {
    order_id: ORDER_ID,
    status,
    payment: {
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      stripe_payment_id: stripeId,
    },
  };
}

// ---------------------------------------------------------------------------
// Transaction mock helpers
// ---------------------------------------------------------------------------

/**
 * Configures $transaction to invoke its callback with mockTx (Serializable form).
 */
function setCallbackTransaction() {
  mockPrisma.$transaction.mockImplementation(
    (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx),
  );
}

/**
 * Configures $transaction to resolve the array passed to it (array form).
 * The mock receives the promise array and resolves each item.
 */
function setArrayTransaction(results: unknown[]) {
  mockPrisma.$transaction.mockResolvedValue(results);
}

// ---------------------------------------------------------------------------
// COD order setup helper — shared by placeCodOrder tests
// ---------------------------------------------------------------------------

function setupCodOrderMocks() {
  mockCheckoutService.assertOwnedAddress.mockResolvedValue(undefined);
  mockCheckoutService.buildOrderContext.mockResolvedValue(makeOrderContext());
  mockTx.order.create.mockResolvedValue({ order_id: ORDER_ID });
  mockTx.productVariant.update.mockResolvedValue({});
  mockTx.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
  mockTx.cartItem.deleteMany.mockResolvedValue({ count: 1 });
  mockTx.cart.update.mockResolvedValue({});
  mockPrisma.order.findFirst.mockResolvedValue(makeOrderDetailRow());
  mockPrisma.user.findUnique.mockResolvedValue({
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
  });
  (mockPrisma as unknown as Record<string, unknown>)['address'] = {
    findFirst: jest.fn().mockResolvedValue(makeAddress()),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Default: callback transaction (can be overridden per test)
    setCallbackTransaction();

    // Restore default resolved value for mockMailService after resetAllMocks.
    mockMailService.sendOrderConfirmation.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
        { provide: CheckoutService, useValue: mockCheckoutService },
        { provide: CouponService, useValue: mockCouponService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // =========================================================================
  // assertActiveUser (tested via each public method)
  // =========================================================================

  describe('assertActiveUser', () => {
    it('throws UnauthorizedException when isUserActive returns false', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.listOrders(USER_ID, {})).rejects.toThrow(
        new UnauthorizedException(AuthMessages.inactiveAccountMessage),
      );
    });
  });

  // =========================================================================
  // placeCodOrder
  // =========================================================================

  describe('placeCodOrder', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('places a COD order and returns OrderDetail', async () => {
      setupCodOrderMocks();

      const result = await service.placeCodOrder(USER_ID, {
        address_id: ADDRESS_ID,
      });

      expect(result.order_id).toBe(ORDER_ID);
      expect(result.payment_method).toBe(PaymentMethod.COD);
      expect(result.payment_status).toBe(PaymentStatus.PENDING);
      expect(result.total_amount).toMatch(/^\d+\.\d{2}$/);
    });

    it('wraps placement in a $transaction', async () => {
      setupCodOrderMocks();

      await service.placeCodOrder(USER_ID, { address_id: ADDRESS_ID });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('decrements stock for each order line inside the transaction', async () => {
      setupCodOrderMocks();

      await service.placeCodOrder(USER_ID, { address_id: ADDRESS_ID });

      expect(mockTx.productVariant.update).toHaveBeenCalledWith(
        containing({
          where: containing({ product_variant_id: VARIANT_ID }),
          data: containing({ stock: containing({ decrement: 2 }) }),
        }),
      );
    });

    it('records coupon usage when a coupon is applied', async () => {
      mockCheckoutService.assertOwnedAddress.mockResolvedValue(undefined);
      mockCheckoutService.buildOrderContext.mockResolvedValue(
        makeOrderContext(true), // with coupon
      );
      mockTx.order.create.mockResolvedValue({ order_id: ORDER_ID });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockTx.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.cart.update.mockResolvedValue({});
      mockCouponService.recordUsage.mockResolvedValue(undefined);
      mockPrisma.order.findFirst.mockResolvedValue(makeOrderDetailRow());
      mockPrisma.user.findUnique.mockResolvedValue({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
      });
      (mockPrisma as unknown as Record<string, unknown>)['address'] = {
        findFirst: jest.fn().mockResolvedValue(makeAddress()),
      };

      await service.placeCodOrder(USER_ID, { address_id: ADDRESS_ID });

      expect(mockCouponService.recordUsage).toHaveBeenCalledWith(
        mockTx,
        COUPON_ID,
        USER_ID,
      );
    });

    it('clears the cart after creating the order', async () => {
      setupCodOrderMocks();

      await service.placeCodOrder(USER_ID, { address_id: ADDRESS_ID });

      expect(mockTx.cartItem.deleteMany).toHaveBeenCalled();
      expect(mockTx.cart.update).toHaveBeenCalledWith(
        containing({
          data: containing({ applied_coupon: null }),
        }),
      );
    });

    // -----------------------------------------------------------------------
    // Email notification tests [email-notification]
    // -----------------------------------------------------------------------

    it('calls mailService.sendOrderConfirmation after successful placement (fire-and-forget)', async () => {
      setupCodOrderMocks();

      await service.placeCodOrder(USER_ID, { address_id: ADDRESS_ID });

      // Fire-and-forget: the call is made asynchronously. Give the micro-task
      // queue a chance to settle by awaiting a resolved promise.
      await Promise.resolve();

      expect(mockMailService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendOrderConfirmation).toHaveBeenCalledWith(
        containing({ order_id: ORDER_ID }),
        containing({ email: 'jane@example.com' }),
      );
    });

    it('returns the order response even when sendOrderConfirmation rejects (email failure does not throw)', async () => {
      setupCodOrderMocks();
      // Make email fail
      mockMailService.sendOrderConfirmation.mockRejectedValueOnce(
        new Error('SMTP down'),
      );

      const result = await service.placeCodOrder(USER_ID, {
        address_id: ADDRESS_ID,
      });

      // The order must still be returned despite email failure.
      expect(result.order_id).toBe(ORDER_ID);
    });

    it('returns the order response even when fetchUserBasic rejects (email failure does not throw)', async () => {
      setupCodOrderMocks();
      // Make user lookup fail (the promise chain that feeds sendOrderConfirmation)
      mockPrisma.user.findUnique.mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      const result = await service.placeCodOrder(USER_ID, {
        address_id: ADDRESS_ID,
      });

      // The order must still be returned despite the user lookup failure.
      expect(result.order_id).toBe(ORDER_ID);
    });
  });

  // =========================================================================
  // listOrders — pagination
  // =========================================================================

  describe('listOrders', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns paginated orders with correct meta', async () => {
      const rows = [makeOrderListRow()];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.orders).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.total_pages).toBe(1);
    });

    it('defaults page to 1 when not provided', async () => {
      setArrayTransaction([0, []]);

      const result = await service.listOrders(USER_ID, {});

      expect(result.meta.page).toBe(1);
    });

    it('calculates total_pages = ceil(total / ORDER_PAGE_SIZE)', async () => {
      // 25 orders, page size=10 → 3 pages
      setArrayTransaction([25, []]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.meta.total_pages).toBe(3);
    });

    it('returns total_pages=1 when there are no orders (min 1)', async () => {
      setArrayTransaction([0, []]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.meta.total_pages).toBe(1);
    });

    it('maps each row to OrderListItem with order_number format', async () => {
      const rows = [makeOrderListRow()];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      // ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      // order_number = '#' + first 8 hex chars uppercased = '#A1B2C3D4'
      expect(result.orders[0].order_number).toBe('#A1B2C3D4');
    });

    it('uses the array form of $transaction (count + findMany)', async () => {
      setArrayTransaction([0, []]);

      await service.listOrders(USER_ID, { page: 1 });

      // Array form: $transaction receives an array, not a callback
      const calls = mockPrisma.$transaction.mock.calls as Array<[unknown]>;
      expect(Array.isArray(calls[0][0])).toBe(true);
    });

    it('sets can_cancel=true for PENDING orders', async () => {
      const rows = [{ ...makeOrderListRow(), status: OrderStatus.PENDING }];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.orders[0].can_cancel).toBe(true);
    });

    it('sets can_cancel=false for SHIPPED orders', async () => {
      const rows = [{ ...makeOrderListRow(), status: OrderStatus.SHIPPED }];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.orders[0].can_cancel).toBe(false);
    });

    it('sets can_cancel=false for DELIVERED orders', async () => {
      const rows = [{ ...makeOrderListRow(), status: OrderStatus.DELIVERED }];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.orders[0].can_cancel).toBe(false);
    });

    it('sets can_cancel=false for CANCELLED orders', async () => {
      const rows = [{ ...makeOrderListRow(), status: OrderStatus.CANCELLED }];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      expect(result.orders[0].can_cancel).toBe(false);
    });
  });

  // =========================================================================
  // getOrder — ownership + 404
  // =========================================================================

  describe('getOrder', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('throws NotFoundException when order belongs to a different user', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrder(USER_ID, ORDER_ID)).rejects.toThrow(
        new NotFoundException(OrderMessages.notFound),
      );
    });

    it('throws NotFoundException when order_id does not exist', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.getOrder(USER_ID, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns OrderDetail when order exists and belongs to the user', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrderDetailRow());
      (mockPrisma as unknown as Record<string, unknown>)['address'] = {
        findFirst: jest.fn().mockResolvedValue(makeAddress()),
      };

      const result = await service.getOrder(USER_ID, ORDER_ID);

      expect(result.order_id).toBe(ORDER_ID);
      expect(result.order_number).toMatch(/^#[A-F0-9]{8}$/);
      expect(result.shipping_address).toBeDefined();
      expect(result.items).toHaveLength(1);
    });

    it('serializes all money fields as 2-decimal strings', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrderDetailRow());
      (mockPrisma as unknown as Record<string, unknown>)['address'] = {
        findFirst: jest.fn().mockResolvedValue(makeAddress()),
      };

      const result = await service.getOrder(USER_ID, ORDER_ID);

      expect(result.total_amount).toMatch(/^\d+\.\d{2}$/);
      expect(result.sub_total).toMatch(/^\d+\.\d{2}$/);
      expect(result.shipping_fee).toMatch(/^\d+\.\d{2}$/);
      expect(result.items[0].purchase_price).toMatch(/^\d+\.\d{2}$/);
      expect(result.items[0].line_total).toMatch(/^\d+\.\d{2}$/);
    });

    it('throws NotFoundException when address lookup fails (mismatched ownership)', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(makeOrderDetailRow());
      (mockPrisma as unknown as Record<string, unknown>)['address'] = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await expect(service.getOrder(USER_ID, ORDER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // cancelOrder — COD/synchronous branch
  // =========================================================================

  describe('cancelOrder — COD sync cancellation', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns cancelSuccess for a PENDING COD order', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(PaymentMethod.COD, PaymentStatus.PENDING, null),
      );
      // restockAndCancel needs order.findUnique inside tx
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PENDING,
        items: [{ product_variant_id: VARIANT_ID, quantity: 2 }],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(result.message).toBe(OrderMessages.cancelSuccess);
    });

    it('releases the coupon when the cancelled order used one', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(PaymentMethod.COD, PaymentStatus.PENDING, null),
      );
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PENDING,
        user_id: USER_ID,
        coupon_id: COUPON_ID,
        items: [{ product_variant_id: VARIANT_ID, quantity: 2 }],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});
      mockCouponService.releaseUsage.mockResolvedValue(undefined);

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(mockCouponService.releaseUsage).toHaveBeenCalledWith(
        mockTx,
        COUPON_ID,
        USER_ID,
      );
    });

    it('does not release a coupon when the order had none', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(PaymentMethod.COD, PaymentStatus.PENDING, null),
      );
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PENDING,
        user_id: USER_ID,
        coupon_id: null,
        items: [{ product_variant_id: VARIANT_ID, quantity: 1 }],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(mockCouponService.releaseUsage).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order does not exist', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(service.cancelOrder(USER_ID, ORDER_ID)).rejects.toThrow(
        new NotFoundException(OrderMessages.notFound),
      );
    });

    it('throws BadRequestException(notCancellable) for a SHIPPED order', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.COD,
          PaymentStatus.PENDING,
          null,
          OrderStatus.SHIPPED,
        ),
      );

      await expect(service.cancelOrder(USER_ID, ORDER_ID)).rejects.toThrow(
        new BadRequestException(OrderMessages.notCancellable),
      );
    });

    it('throws BadRequestException(notCancellable) for DELIVERED orders', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.COD,
          PaymentStatus.PENDING,
          null,
          OrderStatus.DELIVERED,
        ),
      );

      await expect(service.cancelOrder(USER_ID, ORDER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException(notCancellable) for already CANCELLED orders', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.COD,
          PaymentStatus.PENDING,
          null,
          OrderStatus.CANCELLED,
        ),
      );

      await expect(service.cancelOrder(USER_ID, ORDER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows cancellation for CONFIRMED orders', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.COD,
          PaymentStatus.PENDING,
          null,
          OrderStatus.CONFIRMED,
        ),
      );
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.CONFIRMED,
        items: [{ product_variant_id: VARIANT_ID, quantity: 1 }],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(result.message).toBe(OrderMessages.cancelSuccess);
    });

    it('allows cancellation for PACKED orders', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.COD,
          PaymentStatus.PENDING,
          null,
          OrderStatus.PACKED,
        ),
      );
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PACKED,
        items: [{ product_variant_id: VARIANT_ID, quantity: 1 }],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(result.message).toBe(OrderMessages.cancelSuccess);
    });

    it('restores stock for each item on COD cancellation', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(PaymentMethod.COD, PaymentStatus.PENDING, null),
      );
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PENDING,
        items: [
          { product_variant_id: VARIANT_ID, quantity: 2 },
          { product_variant_id: 'var-002', quantity: 3 },
        ],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(mockTx.productVariant.update).toHaveBeenCalledTimes(2);
      expect(mockTx.productVariant.update).toHaveBeenCalledWith(
        containing({
          where: containing({ product_variant_id: VARIANT_ID }),
          data: containing({ stock: containing({ increment: 2 }) }),
        }),
      );
    });
  });

  // =========================================================================
  // cancelOrder — Stripe-refund branch
  // =========================================================================

  describe('cancelOrder — Stripe refund branch', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns refundInitiated for a paid Stripe order', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.STRIPE,
          PaymentStatus.PAID,
          STRIPE_INTENT_ID,
        ),
      );
      mockStripeService.refundPaymentIntent.mockResolvedValue({});

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(result.message).toBe(OrderMessages.refundInitiated);
    });

    it('calls stripe.refundPaymentIntent with the stripe_payment_id', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.STRIPE,
          PaymentStatus.PAID,
          STRIPE_INTENT_ID,
        ),
      );
      mockStripeService.refundPaymentIntent.mockResolvedValue({});

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(mockStripeService.refundPaymentIntent).toHaveBeenCalledWith(
        STRIPE_INTENT_ID,
      );
    });

    it('does NOT call $transaction for a Stripe-paid order (webhook handles it)', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        makeOrderWithPayment(
          PaymentMethod.STRIPE,
          PaymentStatus.PAID,
          STRIPE_INTENT_ID,
        ),
      );
      mockStripeService.refundPaymentIntent.mockResolvedValue({});

      await service.cancelOrder(USER_ID, ORDER_ID);

      // $transaction should NOT be called for the Stripe refund path
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // placeStripeOrder — idempotency + refund-on-stock-fail + email notification
  // =========================================================================

  describe('placeStripeOrder', () => {
    it('returns early (no-op) when metadata has no user_id', async () => {
      await service.placeStripeOrder(
        { user_id: '', address_id: ADDRESS_ID, coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns early (no-op) when metadata has no address_id', async () => {
      await service.placeStripeOrder(
        { user_id: USER_ID, address_id: '', coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      expect(mockPrisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('is idempotent: returns early when payment already exists (duplicate webhook)', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        payment_id: PAYMENT_ID,
      });

      await service.placeStripeOrder(
        { user_id: USER_ID, address_id: ADDRESS_ID, coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('places the order when payment does not yet exist', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockCheckoutService.assertOwnedAddress.mockResolvedValue(undefined);
      mockCheckoutService.buildOrderContext.mockResolvedValue(
        makeOrderContext(),
      );
      mockTx.order.create.mockResolvedValue({ order_id: ORDER_ID });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockTx.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.cart.update.mockResolvedValue({});

      await service.placeStripeOrder(
        { user_id: USER_ID, address_id: ADDRESS_ID, coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refunds the payment when buildOrderContext throws (stock vanished)', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      // Make the transaction callback throw (simulating stock failure)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockTx) => Promise<unknown>) => {
          // simulate the service calling assertOwnedAddress OK but buildOrderContext throws
          await callback(mockTx);
        },
      );
      mockCheckoutService.assertOwnedAddress.mockResolvedValue(undefined);
      mockCheckoutService.buildOrderContext.mockRejectedValue(
        new BadRequestException('insufficient stock'),
      );
      mockStripeService.refundPaymentIntent.mockResolvedValue({});

      await service.placeStripeOrder(
        { user_id: USER_ID, address_id: ADDRESS_ID, coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      expect(mockStripeService.refundPaymentIntent).toHaveBeenCalledWith(
        STRIPE_INTENT_ID,
      );
    });

    // -----------------------------------------------------------------------
    // Email notification tests [email-notification]
    // -----------------------------------------------------------------------

    it('calls mailService.sendOrderConfirmation after successful Stripe order placement', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockCheckoutService.assertOwnedAddress.mockResolvedValue(undefined);
      mockCheckoutService.buildOrderContext.mockResolvedValue(
        makeOrderContext(),
      );
      mockTx.order.create.mockResolvedValue({ order_id: ORDER_ID });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockTx.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      mockTx.cart.update.mockResolvedValue({});
      mockPrisma.order.findFirst.mockResolvedValue(makeOrderDetailRow());
      mockPrisma.user.findUnique.mockResolvedValue({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
      });
      (mockPrisma as unknown as Record<string, unknown>)['address'] = {
        findFirst: jest.fn().mockResolvedValue(makeAddress()),
      };

      await service.placeStripeOrder(
        { user_id: USER_ID, address_id: ADDRESS_ID, coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      // Allow the fire-and-forget Promise.all chain to settle.
      // buildOrderDetail makes 2 async calls inside Promise.all, so we need to
      // drain the full microtask queue (more than one tick).
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(mockMailService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
    });

    it('does NOT call sendOrderConfirmation when the transaction fails (BadRequestException path)', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockTx) => Promise<unknown>) => {
          await callback(mockTx);
        },
      );
      mockCheckoutService.assertOwnedAddress.mockResolvedValue(undefined);
      mockCheckoutService.buildOrderContext.mockRejectedValue(
        new BadRequestException('insufficient stock'),
      );
      mockStripeService.refundPaymentIntent.mockResolvedValue({});

      await service.placeStripeOrder(
        { user_id: USER_ID, address_id: ADDRESS_ID, coupon_code: '' },
        STRIPE_INTENT_ID,
      );

      // Allow any pending microtasks to settle
      await Promise.resolve();

      expect(mockMailService.sendOrderConfirmation).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // finalizeRefund — idempotency + restock
  // =========================================================================

  describe('finalizeRefund', () => {
    it('is idempotent: does nothing when payment is already REFUNDED', async () => {
      mockTx.payment.findFirst.mockResolvedValue({
        payment_id: PAYMENT_ID,
        payment_status: PaymentStatus.REFUNDED,
        order: { order_id: ORDER_ID },
      });

      await service.finalizeRefund(STRIPE_INTENT_ID);

      // restockAndCancel should NOT be called
      expect(mockTx.order.findUnique).not.toHaveBeenCalled();
    });

    it('is idempotent: does nothing when payment record does not exist', async () => {
      mockTx.payment.findFirst.mockResolvedValue(null);

      await service.finalizeRefund(STRIPE_INTENT_ID);

      expect(mockTx.order.findUnique).not.toHaveBeenCalled();
    });

    it('cancels the order and marks payment REFUNDED when payment is PAID', async () => {
      mockTx.payment.findFirst.mockResolvedValue({
        payment_id: PAYMENT_ID,
        payment_status: PaymentStatus.PAID,
        order: { order_id: ORDER_ID },
      });
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PENDING,
        items: [{ product_variant_id: VARIANT_ID, quantity: 2 }],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});
      mockTx.payment.update.mockResolvedValue({});

      await service.finalizeRefund(STRIPE_INTENT_ID);

      expect(mockTx.order.update).toHaveBeenCalledWith(
        containing({
          data: containing({ status: OrderStatus.CANCELLED }),
        }),
      );
      expect(mockTx.payment.update).toHaveBeenCalledWith(
        containing({
          where: containing({ payment_id: PAYMENT_ID }),
          data: containing({ payment_status: PaymentStatus.REFUNDED }),
        }),
      );
    });

    it('restores stock for all order items', async () => {
      mockTx.payment.findFirst.mockResolvedValue({
        payment_id: PAYMENT_ID,
        payment_status: PaymentStatus.PAID,
        order: { order_id: ORDER_ID },
      });
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.PENDING,
        items: [
          { product_variant_id: VARIANT_ID, quantity: 3 },
          { product_variant_id: 'var-002', quantity: 1 },
        ],
      });
      mockTx.productVariant.update.mockResolvedValue({});
      mockTx.order.update.mockResolvedValue({});
      mockTx.payment.update.mockResolvedValue({});

      await service.finalizeRefund(STRIPE_INTENT_ID);

      expect(mockTx.productVariant.update).toHaveBeenCalledTimes(2);
    });

    it('runs in a $transaction', async () => {
      mockTx.payment.findFirst.mockResolvedValue(null);

      await service.finalizeRefund(STRIPE_INTENT_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does NOT restock an already-cancelled order (restockAndCancel idempotent)', async () => {
      mockTx.payment.findFirst.mockResolvedValue({
        payment_id: PAYMENT_ID,
        payment_status: PaymentStatus.PAID,
        order: { order_id: ORDER_ID },
      });
      // Order is already CANCELLED
      mockTx.order.findUnique.mockResolvedValue({
        status: OrderStatus.CANCELLED,
        items: [{ product_variant_id: VARIANT_ID, quantity: 2 }],
      });
      mockTx.payment.update.mockResolvedValue({});

      await service.finalizeRefund(STRIPE_INTENT_ID);

      // restockAndCancel should return early without touching productVariant
      expect(mockTx.productVariant.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // orderNumber derivation
  // =========================================================================

  describe('order_number format', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('listOrders: order_number is # + first 8 hex chars of uuid (uppercased)', async () => {
      const rows = [makeOrderListRow()];
      setArrayTransaction([1, rows]);

      const result = await service.listOrders(USER_ID, { page: 1 });

      // ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      // hex without dashes: 'a1b2c3d4e5f678...', first 8 = 'a1b2c3d4' → '#A1B2C3D4'
      expect(result.orders[0].order_number).toBe('#A1B2C3D4');
    });
  });

  // =========================================================================
  // matcher sanity check
  // =========================================================================

  it('containing and anyOf wrappers are callable', () => {
    expect(containing({ x: 1 })).toBeDefined();
    expect(anyOf(Number)).toBeDefined();
  });
});
