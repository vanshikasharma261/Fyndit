/**
 * Unit tests for CheckoutService.
 *
 * Covers: getSummary, applyCoupon, removeCoupon, createPaymentIntent,
 * buildOrderContext, assertOwnedAddress — all public methods.
 *
 * PrismaService, AuthService, CouponService, and StripeService are replaced
 * with jest mocks. Real Prisma.Decimal is used for money arithmetic because
 * CheckoutService calls Decimal.max/min static factories.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client-runtime-utils';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CouponService } from './coupon.service';
import { StripeService } from '../payment/stripe.service';
import {
  AddressMessages,
  AuthMessages,
  CheckoutMessages,
} from '../constants/messages.constant';
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

const USER_ID = 'user-001';
const CART_ID = 'cart-001';
const CART_ITEM_ID = 'item-001';
const VARIANT_ID = 'var-001';
const ADDRESS_ID = 'addr-001';
const COUPON_ID = 'coupon-001';
const COUPON_CODE = 'SAVE10';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTx = {
  cart: { findUnique: jest.fn() },
  cartItem: { findMany: jest.fn() },
  address: { findFirst: jest.fn() },
  coupon: { findUnique: jest.fn() },
  couponUsage: { findUnique: jest.fn() },
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  cart: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  cartItem: { findMany: jest.fn() },
  address: { findFirst: jest.fn() },
  $transaction: jest.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
    callback(mockTx),
  ),
};

const mockAuthService = {
  isUserActive: jest.fn(),
};

const mockCouponService = {
  evaluate: jest.fn(),
  recordUsage: jest.fn(),
};

const mockStripeService = {
  createPaymentIntent: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeUser() {
  return {
    first_name: 'Riya',
    last_name: 'Sharma',
    phone: '9876543210',
    email: 'riya@example.com',
  };
}

function makeCartItem(
  overrides: {
    cart_item_id?: string;
    product_variant_id?: string;
    quantity?: number;
    stock?: number;
    price?: number;
    discount?: number;
    images?: { image_url: string; is_primary: boolean; sort_order: number }[];
    attributes?: unknown;
  } = {},
) {
  return {
    cart_item_id: overrides.cart_item_id ?? CART_ITEM_ID,
    product_variant_id: overrides.product_variant_id ?? VARIANT_ID,
    quantity: overrides.quantity ?? 2,
    product_variant: {
      stock: overrides.stock ?? 10,
      price: d(overrides.price ?? 600),
      discount: d(overrides.discount ?? 100),
      attributes:
        overrides.attributes !== undefined
          ? overrides.attributes
          : { color: 'Blue' },
      product: { product_name: 'Shirt', brand: 'FashionCo' },
      images: overrides.images ?? [
        { image_url: '/img/shirt.jpg', is_primary: true, sort_order: 1 },
      ],
    },
  };
}

/** OrderLine-select-shaped item (used by buildOrderContext's cartItem.findMany) */
function makeOrderLineRow(
  overrides: {
    product_variant_id?: string;
    quantity?: number;
    stock?: number;
    price?: number;
    discount?: number;
    product_name?: string;
  } = {},
) {
  return {
    product_variant_id: overrides.product_variant_id ?? VARIANT_ID,
    quantity: overrides.quantity ?? 2,
    product_variant: {
      stock: overrides.stock ?? 10,
      price: d(overrides.price ?? 600),
      discount: d(overrides.discount ?? 100),
      product: { product_name: overrides.product_name ?? 'Shirt' },
    },
  };
}

function makeCouponEval(discount_amount = 50) {
  return {
    coupon_id: COUPON_ID,
    code: COUPON_CODE,
    discount_type: DiscountType.PERCENTAGE,
    discount_value: d(10),
    discount_amount: d(discount_amount),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CheckoutService', () => {
  let service: CheckoutService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Re-apply $transaction implementation after resetAllMocks clears it
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
        { provide: CouponService, useValue: mockCouponService },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  // =========================================================================
  // assertActiveUser (tested through every public method)
  // =========================================================================

  describe('assertActiveUser', () => {
    it('throws UnauthorizedException when isUserActive returns false', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.getSummary(USER_ID)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.inactiveAccountMessage),
      );
    });
  });

  // =========================================================================
  // getSummary
  // =========================================================================

  describe('getSummary', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns a summary with correct totals for a single in-stock item', async () => {
      // item: price=600, discount=100, qty=2 → final_unit=500, sub_total=1000
      // sub_total=1000 >= 500 → shipping_fee=0
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([makeCartItem()]);

      const result = await service.getSummary(USER_ID);

      expect(result.sub_total).toBe('1000.00');
      expect(result.shipping_fee).toBe('0.00');
      expect(result.coupon_discount).toBe('0.00');
      expect(result.total).toBe('1000.00');
      expect(result.total_items).toBe(2);
      expect(result.applied_coupon).toBeNull();
    });

    it('charges shipping fee (₹100) when sub_total < 500', async () => {
      // price=200, discount=0, qty=1 → sub_total=200 < 500 → shipping=100
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({ quantity: 1, price: 200, discount: 0 }),
      ]);

      const result = await service.getSummary(USER_ID);

      expect(result.sub_total).toBe('200.00');
      expect(result.shipping_fee).toBe('100.00');
      expect(result.total).toBe('300.00');
    });

    it('excludes out-of-stock items from sub_total and total_items', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({
          cart_item_id: 'i1',
          quantity: 1,
          price: 600,
          discount: 100,
          stock: 0, // out of stock
        }),
        makeCartItem({
          cart_item_id: 'i2',
          product_variant_id: 'var-002',
          quantity: 2,
          price: 300,
          discount: 0,
          stock: 5,
        }),
      ]);

      const result = await service.getSummary(USER_ID);

      // Only the in-stock item counts: 300 * 2 = 600
      expect(result.sub_total).toBe('600.00');
      expect(result.total_items).toBe(2); // only in-stock qty
      // Both items appear in the list
      expect(result.items).toHaveLength(2);
      expect(result.items[0].out_of_stock).toBe(true);
      expect(result.items[1].out_of_stock).toBe(false);
    });

    it('includes personal info from user profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([]);

      const result = await service.getSummary(USER_ID);

      expect(result.personal).toEqual({
        first_name: 'Riya',
        last_name: 'Sharma',
        phone: '9876543210',
        email: 'riya@example.com',
      });
    });

    it('returns empty items and zero totals when cart is empty', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([]);

      const result = await service.getSummary(USER_ID);

      expect(result.items).toHaveLength(0);
      expect(result.sub_total).toBe('0.00');
      expect(result.total).toBe('0.00');
      expect(result.shipping_fee).toBe('0.00'); // 0 subtotal → no fee
    });

    it('returns empty items when user has no cart at all', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.getSummary(USER_ID);

      expect(result.items).toHaveLength(0);
      expect(result.sub_total).toBe('0.00');
    });

    it('throws UnauthorizedException when user record is not found (deleted mid-session)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getSummary(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('applies an active coupon and returns AppliedCoupon in the summary', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: COUPON_CODE,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({ quantity: 2, price: 600, discount: 100 }),
      ]);
      mockCouponService.evaluate.mockResolvedValue(makeCouponEval(100));

      const result = await service.getSummary(USER_ID);

      expect(result.coupon_discount).toBe('100.00');
      expect(result.applied_coupon).not.toBeNull();
      expect(result.applied_coupon?.code).toBe(COUPON_CODE);
      // sub_total=1000, coupon_discount=100, shipping=0, total=900
      expect(result.total).toBe('900.00');
    });

    it('clears the applied_coupon from the cart when coupon evaluation fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: 'EXPIRED',
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({ quantity: 1, price: 600, discount: 100 }),
      ]);
      mockCouponService.evaluate.mockRejectedValue(
        new BadRequestException('expired'),
      );
      mockPrisma.cart.update.mockResolvedValue({ cart_id: CART_ID });

      const result = await service.getSummary(USER_ID);

      expect(mockPrisma.cart.update).toHaveBeenCalledWith(
        containing({
          where: containing({ user_id: USER_ID }),
          data: containing({ applied_coupon: null }),
        }),
      );
      expect(result.applied_coupon).toBeNull();
    });

    it('serializes money as 2-decimal strings', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({ quantity: 1, price: 600, discount: 100 }),
      ]);

      const result = await service.getSummary(USER_ID);

      expect(result.sub_total).toMatch(/^\d+\.\d{2}$/);
      expect(result.total).toMatch(/^\d+\.\d{2}$/);
      expect(result.shipping_fee).toMatch(/^\d+\.\d{2}$/);
      expect(result.items[0].price).toMatch(/^\d+\.\d{2}$/);
      expect(result.items[0].final_price).toMatch(/^\d+\.\d{2}$/);
    });

    it('picks the primary image when multiple images present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({
          images: [
            {
              image_url: '/img/secondary.jpg',
              is_primary: false,
              sort_order: 1,
            },
            { image_url: '/img/primary.jpg', is_primary: true, sort_order: 99 },
          ],
        }),
      ]);

      const result = await service.getSummary(USER_ID);

      expect(result.items[0].image_url).toBe('/img/primary.jpg');
    });
  });

  // =========================================================================
  // applyCoupon
  // =========================================================================

  describe('applyCoupon', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('throws BadRequestException(emptyCart) when the cart has nothing purchasable', async () => {
      // No cart at all → purchasable=false
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      await expect(
        service.applyCoupon(USER_ID, { code: COUPON_CODE }),
      ).rejects.toThrow(new BadRequestException(CheckoutMessages.emptyCart));
    });

    it('throws BadRequestException(emptyCart) when all items are out of stock', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({ quantity: 1, price: 600, discount: 0, stock: 0 }),
      ]);

      await expect(
        service.applyCoupon(USER_ID, { code: COUPON_CODE }),
      ).rejects.toThrow(new BadRequestException(CheckoutMessages.emptyCart));
    });

    it('surfaces the coupon evaluation error (e.g. invalid) directly', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({ quantity: 1, price: 600, discount: 0, stock: 5 }),
      ]);
      mockCouponService.evaluate.mockRejectedValue(
        new BadRequestException('coupon invalid'),
      );

      await expect(
        service.applyCoupon(USER_ID, { code: 'BADCODE' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores the coupon code on the cart and returns the refreshed summary', async () => {
      // First call: loadSubtotal (cart.findUnique + cartItem.findMany)
      mockPrisma.cart.findUnique
        .mockResolvedValueOnce({ cart_id: CART_ID }) // loadSubtotal
        .mockResolvedValueOnce({
          cart_id: CART_ID,
          applied_coupon: COUPON_CODE,
        }); // getSummary
      mockPrisma.cartItem.findMany
        .mockResolvedValueOnce([
          makeCartItem({ quantity: 1, price: 600, discount: 0, stock: 5 }),
        ]) // loadSubtotal
        .mockResolvedValueOnce([
          makeCartItem({ quantity: 1, price: 600, discount: 0, stock: 5 }),
        ]); // getSummary

      mockCouponService.evaluate.mockResolvedValue(makeCouponEval(50));
      mockPrisma.cart.update.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.applyCoupon(USER_ID, { code: COUPON_CODE });

      expect(mockPrisma.cart.update).toHaveBeenCalledWith(
        containing({
          where: containing({ user_id: USER_ID }),
          data: containing({ applied_coupon: COUPON_CODE }),
        }),
      );
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('sub_total');
    });
  });

  // =========================================================================
  // removeCoupon
  // =========================================================================

  describe('removeCoupon', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('clears applied_coupon from the cart and returns the refreshed summary', async () => {
      mockPrisma.cart.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.findUnique.mockResolvedValue(makeUser());
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([]);

      const result = await service.removeCoupon(USER_ID);

      expect(mockPrisma.cart.updateMany).toHaveBeenCalledWith(
        containing({
          where: containing({ user_id: USER_ID }),
          data: containing({ applied_coupon: null }),
        }),
      );
      expect(result).toHaveProperty('applied_coupon', null);
    });
  });

  // =========================================================================
  // createPaymentIntent
  // =========================================================================

  describe('createPaymentIntent', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('throws NotFoundException when address does not belong to user', async () => {
      // assertOwnedAddress uses this.prisma directly (not a tx) in createPaymentIntent
      mockPrisma.address.findFirst.mockResolvedValue(null); // not found/not owned

      await expect(
        service.createPaymentIntent(USER_ID, { address_id: ADDRESS_ID }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns client_secret and total when all checks pass', async () => {
      // assertOwnedAddress and buildOrderContext both use this.prisma in createPaymentIntent
      mockPrisma.address.findFirst.mockResolvedValue({
        address_id: ADDRESS_ID,
      });
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 1, price: 600, discount: 100, stock: 5 }),
      ]);
      mockCouponService.evaluate.mockRejectedValue(new Error('no coupon'));
      mockStripeService.createPaymentIntent.mockResolvedValue({
        client_secret: 'pi_test_secret',
        id: 'pi_test_123',
      });

      const result = await service.createPaymentIntent(USER_ID, {
        address_id: ADDRESS_ID,
      });

      expect(result.client_secret).toBe('pi_test_secret');
      expect(result.total).toMatch(/^\d+\.\d{2}$/);
    });

    it('throws InternalServerErrorException when Stripe returns no client_secret', async () => {
      mockPrisma.address.findFirst.mockResolvedValue({
        address_id: ADDRESS_ID,
      });
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 1, price: 600, discount: 100, stock: 5 }),
      ]);
      mockStripeService.createPaymentIntent.mockResolvedValue({
        client_secret: null, // no secret
        id: 'pi_test_123',
      });

      await expect(
        service.createPaymentIntent(USER_ID, { address_id: ADDRESS_ID }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('calls stripe.createPaymentIntent with the rupee total string', async () => {
      // price=600, discount=100, qty=1 → final=500, shipping=0 (500>=500), total=500
      mockPrisma.address.findFirst.mockResolvedValue({
        address_id: ADDRESS_ID,
      });
      mockPrisma.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 1, price: 600, discount: 100, stock: 5 }),
      ]);
      mockStripeService.createPaymentIntent.mockResolvedValue({
        client_secret: 'pi_test_secret',
        id: 'pi_test',
      });

      await service.createPaymentIntent(USER_ID, { address_id: ADDRESS_ID });

      expect(mockStripeService.createPaymentIntent).toHaveBeenCalledWith(
        '500.00',
        containing({
          user_id: USER_ID,
          address_id: ADDRESS_ID,
        }),
      );
    });
  });

  // =========================================================================
  // buildOrderContext
  // =========================================================================

  describe('buildOrderContext', () => {
    it('throws BadRequestException(emptyCart) when cart does not exist', async () => {
      mockTx.cart.findUnique.mockResolvedValue(null);

      await expect(
        service.buildOrderContext(mockTx as never, USER_ID),
      ).rejects.toThrow(new BadRequestException(CheckoutMessages.emptyCart));
    });

    it('throws BadRequestException(emptyCart) when all items are out of stock (skipped)', async () => {
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ stock: 0 }), // out of stock, skipped
      ]);

      await expect(
        service.buildOrderContext(mockTx as never, USER_ID),
      ).rejects.toThrow(new BadRequestException(CheckoutMessages.emptyCart));
    });

    it('throws BadRequestException(insufficientStock) when line qty > stock', async () => {
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 5, stock: 2, price: 600, discount: 0 }),
      ]);

      await expect(
        service.buildOrderContext(mockTx as never, USER_ID),
      ).rejects.toThrow(
        new BadRequestException(CheckoutMessages.insufficientStock),
      );
    });

    it('returns correct OrderContext with lines and totals', async () => {
      // price=600, discount=100, qty=2 → final_unit=500, sub_total=1000
      // sub_total >= 500 → shipping=0
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 2, price: 600, discount: 100, stock: 10 }),
      ]);

      const ctx = await service.buildOrderContext(mockTx as never, USER_ID);

      expect(ctx.lines).toHaveLength(1);
      expect(ctx.lines[0].quantity).toBe(2);
      expect(ctx.lines[0].purchase_price.toFixed(2)).toBe('500.00');
      expect(ctx.sub_total.toFixed(2)).toBe('1000.00');
      expect(ctx.shipping_fee.toFixed(2)).toBe('0.00');
      expect(ctx.total.toFixed(2)).toBe('1000.00');
      expect(ctx.coupon).toBeNull();
    });

    it('applies a valid coupon and reflects the discount in total', async () => {
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: COUPON_CODE,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 2, price: 600, discount: 100, stock: 10 }),
      ]);
      mockCouponService.evaluate.mockResolvedValue(makeCouponEval(100));

      const ctx = await service.buildOrderContext(mockTx as never, USER_ID);

      expect(ctx.coupon?.code).toBe(COUPON_CODE);
      expect(ctx.coupon_discount.toFixed(2)).toBe('100.00');
      expect(ctx.total.toFixed(2)).toBe('900.00');
    });

    it('drops coupon tolerantly when coupon evaluation throws', async () => {
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: COUPON_CODE,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 2, price: 600, discount: 100, stock: 10 }),
      ]);
      mockCouponService.evaluate.mockRejectedValue(
        new BadRequestException('expired'),
      );

      const ctx = await service.buildOrderContext(mockTx as never, USER_ID);

      expect(ctx.coupon).toBeNull();
      expect(ctx.coupon_discount.toFixed(2)).toBe('0.00');
    });

    it('adds shipping fee (100) when sub_total < 500', async () => {
      // price=200, discount=0, qty=1 → sub_total=200 → shipping=100
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 1, price: 200, discount: 0, stock: 5 }),
      ]);

      const ctx = await service.buildOrderContext(mockTx as never, USER_ID);

      expect(ctx.shipping_fee.toFixed(2)).toBe('100.00');
      expect(ctx.total.toFixed(2)).toBe('300.00');
    });

    it('clamps purchase_price to 0 when discount > price', async () => {
      // price=100, discount=200 → max(0, 100-200)=0 → purchase_price=0
      mockTx.cart.findUnique.mockResolvedValue({
        cart_id: CART_ID,
        applied_coupon: null,
      });
      mockTx.cartItem.findMany.mockResolvedValue([
        makeOrderLineRow({ quantity: 1, price: 100, discount: 200, stock: 5 }),
      ]);

      const ctx = await service.buildOrderContext(mockTx as never, USER_ID);

      expect(ctx.lines[0].purchase_price.toFixed(2)).toBe('0.00');
    });
  });

  // =========================================================================
  // assertOwnedAddress
  // =========================================================================

  describe('assertOwnedAddress', () => {
    it('throws NotFoundException when address is not found or not owned', async () => {
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(
        service.assertOwnedAddress(mockTx as never, USER_ID, ADDRESS_ID),
      ).rejects.toThrow(new NotFoundException(AddressMessages.notFound));
    });

    it('does not throw when address is found and owned', async () => {
      mockTx.address.findFirst.mockResolvedValue({ address_id: ADDRESS_ID });

      await expect(
        service.assertOwnedAddress(mockTx as never, USER_ID, ADDRESS_ID),
      ).resolves.toBeUndefined();
    });

    it('queries address with user_id and is_removed=false for scoping', async () => {
      mockTx.address.findFirst.mockResolvedValue({ address_id: ADDRESS_ID });

      await service.assertOwnedAddress(mockTx as never, USER_ID, ADDRESS_ID);

      expect(mockTx.address.findFirst).toHaveBeenCalledWith(
        containing({
          where: containing({
            address_id: ADDRESS_ID,
            user_id: USER_ID,
            is_removed: false,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // sanity check for matcher wrappers
  // =========================================================================

  it('anyOf and containing matchers do not throw', () => {
    expect(anyOf(String)).toBeDefined();
    expect(containing({ x: 1 })).toBeDefined();
  });
});
