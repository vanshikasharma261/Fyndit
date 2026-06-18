/**
 * Unit tests for CartService.
 *
 * PrismaService and AuthService are replaced with jest mocks so no real database
 * connection is required. Fixture data uses real `Prisma.Decimal` objects (from
 * `@prisma/client-runtime-utils`) because `computeSummary` inside the service
 * uses `Prisma.Decimal.min()` / `Prisma.Decimal.max()` static factories, which
 * reject plain JS objects.
 *
 * Key changes from the review-fix implementation:
 * - addToCart wraps the existence-check/count/upsert in a $transaction callback.
 *   The mock stubs prisma.$transaction to invoke its callback with a tx object
 *   that exposes cartItem.findUnique, cartItem.count, and cartItem.upsert.
 * - New MAX_CART_ITEM_QUANTITY (20) cap: incrementing an existing line whose
 *   quantity + 1 > 20 throws BadRequestException(CartMessages.maxQuantityReached).
 * - updateItem now uses cartItem.updateMany + cartItem.findUnique (not update).
 * - removeItem now uses cartItem.deleteMany (not findFirst + delete).
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client-runtime-utils';

import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CartMessages, AuthMessages } from '../constants/messages.constant';
import { MAX_CART_ITEMS, MAX_CART_ITEM_QUANTITY } from '../constants/values.constant';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

// ---------------------------------------------------------------------------
// Helper — create a real Prisma.Decimal from a number string
// ---------------------------------------------------------------------------

function d(value: number | string): InstanceType<typeof Decimal> {
  return new Decimal(String(value));
}

// ---------------------------------------------------------------------------
// tx object — passed into the $transaction callback for addToCart
// ---------------------------------------------------------------------------

const mockTx = {
  cartItem: {
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Mock PrismaService — all model operations are jest.fn()
// ---------------------------------------------------------------------------

const mockPrisma = {
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
  // $transaction invokes the callback immediately with mockTx, forwarding the
  // options object (isolationLevel) without error.
  $transaction: jest.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
    callback(mockTx),
  ),
};

// ---------------------------------------------------------------------------
// Mock AuthService
// ---------------------------------------------------------------------------

const mockAuthService = {
  isUserActive: jest.fn(),
};

// ---------------------------------------------------------------------------
// Shared fixture IDs
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const CART_ID = 'cart-001';
const ITEM_ID = 'item-001';
const VARIANT_ID = 'var-001';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Builds a full CART_ITEM_SELECT row using real Prisma.Decimal values so the
 * service's `computeSummary` and `toCartItem` can do their real arithmetic.
 */
function makeCartItemRow(overrides: {
  cart_item_id?: string;
  product_variant_id?: string;
  quantity?: number;
  stock?: number;
  price?: number;
  discount?: number;
  images?: { image_url: string; is_primary: boolean; sort_order: number }[];
  attributes?: unknown;
} = {}) {
  return {
    cart_item_id: overrides.cart_item_id ?? ITEM_ID,
    product_variant_id: overrides.product_variant_id ?? VARIANT_ID,
    quantity: overrides.quantity ?? 2,
    product_variant: {
      stock: overrides.stock ?? 10,
      price: d(overrides.price ?? 1100),
      discount: d(overrides.discount ?? 77),
      attributes:
        overrides.attributes !== undefined
          ? overrides.attributes
          : { color: 'Silver', ram: '16GB' },
      product: {
        product_name: 'Laptop Pro',
        brand: 'TechCo',
        description: 'A great laptop',
      },
      images: overrides.images ?? [
        { image_url: '/img/primary.jpg', is_primary: true, sort_order: 2 },
        { image_url: '/img/secondary.jpg', is_primary: false, sort_order: 1 },
      ],
    },
  };
}

/**
 * Builds a SUMMARY_SELECT row (subset of fields) with real Decimals.
 */
function makeSummaryRow(quantity: number, price: number, discount: number) {
  return {
    quantity,
    product_variant: {
      price: d(price),
      discount: d(discount),
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CartService', () => {
  let service: CartService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-set the $transaction implementation after clearAllMocks resets it.
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  // =========================================================================
  // assertActiveUser — tested through every public method
  // =========================================================================

  describe('assertActiveUser', () => {
    it('throws UnauthorizedException with inactiveAccountMessage when isUserActive returns false', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.getCart(USER_ID)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.inactiveAccountMessage),
      );
    });

    it('does not throw when isUserActive returns true (no cart row)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.getCart(USER_ID)).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // getCart
  // =========================================================================

  describe('getCart', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns empty summary and empty items when no cart row exists for the user', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.getCart(USER_ID);

      expect(result).toEqual({
        summary: {
          total_items: 0,
          total_price: '0.00',
          total_discount: '0.00',
          final_amount: '0.00',
        },
        items: [],
      });
    });

    it('returns empty summary and empty items when cart exists but has no line items', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([]);

      const result = await service.getCart(USER_ID);

      expect(result.items).toHaveLength(0);
      expect(result.summary.total_items).toBe(0);
      expect(result.summary.total_price).toBe('0.00');
      expect(result.summary.total_discount).toBe('0.00');
      expect(result.summary.final_amount).toBe('0.00');
    });

    it('returns a populated cart with all items mapped to CartItem shape', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ quantity: 2, price: 1100, discount: 77 }),
      ]);

      const result = await service.getCart(USER_ID);

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.cart_item_id).toBe(ITEM_ID);
      expect(item.product_variant_id).toBe(VARIANT_ID);
      expect(item.product_name).toBe('Laptop Pro');
      expect(item.brand).toBe('TechCo');
      expect(item.quantity).toBe(2);
      expect(item.stock).toBe(10);
    });

    it('serializes money fields as 2-decimal strings — never numbers', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ quantity: 1, price: 1100, discount: 77 }),
      ]);

      const result = await service.getCart(USER_ID);
      const item = result.items[0];

      expect(item.price).toBe('1100.00');
      expect(item.discount).toBe('77.00');
      expect(item.final_price).toBe('1023.00'); // 1100 - 77
      expect(typeof item.price).toBe('string');
      expect(typeof item.discount).toBe('string');
      expect(typeof item.final_price).toBe('string');
    });

    it('computes final_price = max(0, price - discount) — clamps to 0 when discount > price', async () => {
      // discount (200) > price (100) → final_price should be 0.00, not negative
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ quantity: 1, price: 100, discount: 200 }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].final_price).toBe('0.00');
    });

    it('computes total_items as the sum of all line quantities', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ cart_item_id: 'i1', quantity: 3, price: 500, discount: 0 }),
        makeCartItemRow({ cart_item_id: 'i2', product_variant_id: 'var-002', quantity: 2, price: 200, discount: 0 }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.summary.total_items).toBe(5); // 3 + 2
    });

    it('computes summary totals correctly across multiple lines', async () => {
      // Line 1: price=500, discount=50, qty=2  → price×qty=1000, disc×qty=100
      // Line 2: price=200, discount=0,  qty=3  → price×qty=600,  disc×qty=0
      // totals: total_price=1600, total_discount=100, final_amount=1500
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ cart_item_id: 'i1', quantity: 2, price: 500, discount: 50 }),
        makeCartItemRow({ cart_item_id: 'i2', product_variant_id: 'var-002', quantity: 3, price: 200, discount: 0 }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.summary.total_price).toBe('1600.00');
      expect(result.summary.total_discount).toBe('100.00');
      expect(result.summary.final_amount).toBe('1500.00');
      expect(result.summary.total_items).toBe(5); // 2 + 3
    });

    it('clamps per-unit discount to price when computing total_discount (no negative totals)', async () => {
      // price=100, discount=300 per unit, qty=2
      // unitDiscount = min(300,100) = 100; total_discount = 100 * 2 = 200
      // total_price = 100 * 2 = 200; final_amount = 200 - 200 = 0
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ quantity: 2, price: 100, discount: 300 }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.summary.total_discount).toBe('200.00');
      expect(result.summary.final_amount).toBe('0.00');
    });

    it('picks the primary image (is_primary=true) regardless of sort_order', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({
          images: [
            { image_url: '/img/secondary.jpg', is_primary: false, sort_order: 1 },
            { image_url: '/img/primary.jpg', is_primary: true, sort_order: 99 },
          ],
        }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].image_url).toBe('/img/primary.jpg');
    });

    it('picks the lowest sort_order image when no image is marked primary', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({
          images: [
            { image_url: '/img/sort3.jpg', is_primary: false, sort_order: 3 },
            { image_url: '/img/sort1.jpg', is_primary: false, sort_order: 1 },
            { image_url: '/img/sort2.jpg', is_primary: false, sort_order: 2 },
          ],
        }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].image_url).toBe('/img/sort1.jpg');
    });

    it('returns image_url=null when the variant has no images', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ images: [] }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].image_url).toBeNull();
    });

    it('deserializes attributes JSON into a Record<string, string>', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({}), // default attributes = { color: 'Silver', ram: '16GB' }
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].attributes).toEqual({ color: 'Silver', ram: '16GB' });
    });

    it('returns empty attributes record when variant attributes is null', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ attributes: null }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].attributes).toEqual({});
    });

    it('returns empty attributes record when variant attributes is an array', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeCartItemRow({ attributes: ['wrong', 'shape'] }),
      ]);

      const result = await service.getCart(USER_ID);
      expect(result.items[0].attributes).toEqual({});
    });
  });

  // =========================================================================
  // addToCart
  // =========================================================================
  //
  // The service wraps existence-check → count/stock-check → upsert inside a
  // Serializable $transaction. The mock above stubs $transaction to call its
  // callback with mockTx (which exposes cartItem.findUnique, cartItem.count,
  // cartItem.upsert). Assertions target mockTx.cartItem.* for the inner ops
  // and mockPrisma.productVariant.findUnique for the outer variant lookup.

  describe('addToCart', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      // getOrCreateCartId → upsert returns { cart_id }
      mockPrisma.cart.upsert.mockResolvedValue({ cart_id: CART_ID });
    });

    const dto: AddCartItemDto = { product_variant_id: VARIANT_ID };

    /** Seeds the loadSummary findMany call after upsert. */
    function seedSummaryFindMany(qty: number, price: number, discount: number) {
      mockPrisma.cartItem.findMany.mockResolvedValue([
        makeSummaryRow(qty, price, discount),
      ]);
    }

    it('creates a new line at quantity 1 when the variant is not yet in the cart', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 5,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue(null); // no existing line
      mockTx.cartItem.count.mockResolvedValue(0);
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: 1 }));
      seedSummaryFindMany(1, 1100, 77);

      const result = await service.addToCart(USER_ID, dto);

      expect(mockTx.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ quantity: 1 }),
          update: expect.objectContaining({ quantity: { increment: 1 } }),
        }),
      );
      expect(result.item.quantity).toBe(1);
    });

    it('increments an existing line by 1 (uses upsert update clause)', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 10,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue({ quantity: 3 }); // existing
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: 4 }));
      seedSummaryFindMany(4, 1100, 77);

      const result = await service.addToCart(USER_ID, dto);

      const upsertCall = mockTx.cartItem.upsert.mock.calls[0][0] as {
        update: { quantity: { increment: number } };
      };
      expect(upsertCall.update.quantity.increment).toBe(1);
      expect(result.item.quantity).toBe(4);
    });

    it('invokes $transaction once per addToCart call', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 5,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue(null);
      mockTx.cartItem.count.mockResolvedValue(0);
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: 1 }));
      seedSummaryFindMany(1, 1100, 77);

      await service.addToCart(USER_ID, dto);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('the variant lookup (productVariant.findUnique) runs OUTSIDE the transaction', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 5,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue(null);
      mockTx.cartItem.count.mockResolvedValue(0);
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: 1 }));
      seedSummaryFindMany(1, 1100, 77);

      await service.addToCart(USER_ID, dto);

      // productVariant lives on the outer mockPrisma, NOT on mockTx
      expect(mockPrisma.productVariant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException exceedsStock when incrementing an existing line would exceed stock', async () => {
      // existing.quantity = stock → increment would exceed
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 3,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue({ quantity: 3 });

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.exceedsStock),
      );
      expect(mockTx.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException maxQuantityReached when incrementing an existing line would exceed MAX_CART_ITEM_QUANTITY (20)', async () => {
      // existing.quantity = 20, stock = 100 → stock allows it but per-line cap rejects
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 100,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue({ quantity: MAX_CART_ITEM_QUANTITY }); // 20

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.maxQuantityReached),
      );
      expect(mockTx.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('allows incrementing when existing.quantity + 1 equals MAX_CART_ITEM_QUANTITY exactly (boundary)', async () => {
      // existing.quantity = 19, MAX_CART_ITEM_QUANTITY = 20 → 19+1 = 20, still allowed
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 100,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue({ quantity: MAX_CART_ITEM_QUANTITY - 1 }); // 19
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: MAX_CART_ITEM_QUANTITY }));
      seedSummaryFindMany(MAX_CART_ITEM_QUANTITY, 1100, 77);

      await expect(service.addToCart(USER_ID, dto)).resolves.toBeDefined();
      expect(mockTx.cartItem.upsert).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException outOfStock when variant stock is 0', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 0,
        product: { is_active: true },
      });

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.outOfStock),
      );
    });

    it('throws BadRequestException outOfStock when variant stock is negative', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: -1,
        product: { is_active: true },
      });

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.outOfStock),
      );
    });

    it('throws BadRequestException productUnavailable when the product is inactive', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 5,
        product: { is_active: false },
      });

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.productUnavailable),
      );
    });

    it('throws BadRequestException productUnavailable when the variant does not exist', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue(null);

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.productUnavailable),
      );
    });

    it('throws BadRequestException cartFull when adding a NEW line to a full cart (25 lines)', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 5,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue(null); // brand-new line
      mockTx.cartItem.count.mockResolvedValue(MAX_CART_ITEMS); // already at cap

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        new BadRequestException(CartMessages.cartFull),
      );
      expect(mockTx.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('does NOT enforce the cap when incrementing an EXISTING line (count is never called)', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 10,
        product: { is_active: true },
      });
      // Line already exists — cap check path is skipped entirely
      mockTx.cartItem.findUnique.mockResolvedValue({ quantity: 2 });
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: 3 }));
      seedSummaryFindMany(3, 1100, 77);

      await expect(service.addToCart(USER_ID, dto)).resolves.toBeDefined();
      expect(mockTx.cartItem.count).not.toHaveBeenCalled();
    });

    it('returns the upserted CartItem and a refreshed summary on success', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValue({
        stock: 10,
        product: { is_active: true },
      });
      mockTx.cartItem.findUnique.mockResolvedValue(null);
      mockTx.cartItem.count.mockResolvedValue(0);
      mockTx.cartItem.upsert.mockResolvedValue(makeCartItemRow({ quantity: 1 }));
      seedSummaryFindMany(1, 1100, 77);

      const result = await service.addToCart(USER_ID, dto);

      expect(result).toHaveProperty('item');
      expect(result).toHaveProperty('summary');
      expect(result.summary).toMatchObject({
        total_items: expect.any(Number),
        total_price: expect.any(String),
        total_discount: expect.any(String),
        final_amount: expect.any(String),
      });
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.addToCart(USER_ID, dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =========================================================================
  // updateItem
  // =========================================================================
  //
  // Implementation change: updateItem now calls cartItem.updateMany (not update)
  // and then cartItem.findUnique to re-read the item. Tests updated accordingly.

  describe('updateItem', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    const dto: UpdateCartItemDto = { quantity: 3 };

    it('throws NotFoundException when the item does not belong to the caller (ownership check via findFirst)', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(service.updateItem(USER_ID, ITEM_ID, dto)).rejects.toThrow(
        new NotFoundException(CartMessages.cartItemNotFound),
      );
    });

    it('throws NotFoundException when the user has no cart at all', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.updateItem(USER_ID, ITEM_ID, dto)).rejects.toThrow(
        new NotFoundException(CartMessages.cartItemNotFound),
      );
    });

    it('throws BadRequestException exceedsStock when the requested quantity exceeds stock', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 2 },
      });

      await expect(
        service.updateItem(USER_ID, ITEM_ID, { quantity: 5 }),
      ).rejects.toThrow(new BadRequestException(CartMessages.exceedsStock));
      // updateMany must NOT be called when stock check fails
      expect(mockPrisma.cartItem.updateMany).not.toHaveBeenCalled();
    });

    it('allows quantity exactly equal to stock (boundary — max valid value)', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 5 },
      });
      // updateMany returns { count: 1 }
      mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
      // findUnique re-reads the updated row
      mockPrisma.cartItem.findUnique.mockResolvedValue(makeCartItemRow({ quantity: 5 }));
      mockPrisma.cartItem.findMany.mockResolvedValue([makeSummaryRow(5, 1100, 77)]);

      await expect(
        service.updateItem(USER_ID, ITEM_ID, { quantity: 5 }),
      ).resolves.toBeDefined();
    });

    it('updates the quantity and returns updateSuccess message + item + summary', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 10 },
      });
      mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.cartItem.findUnique.mockResolvedValue(makeCartItemRow({ quantity: 3 }));
      mockPrisma.cartItem.findMany.mockResolvedValue([makeSummaryRow(3, 1100, 77)]);

      const result = await service.updateItem(USER_ID, ITEM_ID, dto);

      expect(result.message).toBe(CartMessages.updateSuccess);
      expect(result.item).toBeDefined();
      expect(result.item.quantity).toBe(3);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.total_price).toBe('string');
    });

    it('calls cartItem.updateMany with cart_item_id + cart_id scope and the new quantity', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 10 },
      });
      mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.cartItem.findUnique.mockResolvedValue(makeCartItemRow({ quantity: 3 }));
      mockPrisma.cartItem.findMany.mockResolvedValue([makeSummaryRow(3, 1100, 77)]);

      await service.updateItem(USER_ID, ITEM_ID, { quantity: 3 });

      expect(mockPrisma.cartItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cart_item_id: ITEM_ID, cart_id: CART_ID },
          data: { quantity: 3 },
        }),
      );
    });

    it('calls cartItem.findUnique after updateMany to re-read the updated row', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 10 },
      });
      mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.cartItem.findUnique.mockResolvedValue(makeCartItemRow({ quantity: 3 }));
      mockPrisma.cartItem.findMany.mockResolvedValue([makeSummaryRow(3, 1100, 77)]);

      await service.updateItem(USER_ID, ITEM_ID, { quantity: 3 });

      expect(mockPrisma.cartItem.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cart_item_id: ITEM_ID },
        }),
      );
    });

    it('throws NotFoundException when updateMany returns count=0 (race: item deleted between check and write)', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 10 },
      });
      mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 0 }); // race condition

      await expect(
        service.updateItem(USER_ID, ITEM_ID, { quantity: 3 }),
      ).rejects.toThrow(new NotFoundException(CartMessages.cartItemNotFound));
    });

    it('throws NotFoundException when findUnique returns null after updateMany (defensive 404)', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.findFirst.mockResolvedValue({
        product_variant: { stock: 10 },
      });
      mockPrisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.cartItem.findUnique.mockResolvedValue(null); // item vanished after write

      await expect(
        service.updateItem(USER_ID, ITEM_ID, { quantity: 3 }),
      ).rejects.toThrow(new NotFoundException(CartMessages.cartItemNotFound));
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.updateItem(USER_ID, ITEM_ID, dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =========================================================================
  // removeItem
  // =========================================================================
  //
  // Implementation change: removeItem now calls cartItem.deleteMany (not
  // findFirst + delete). The ownership + race-safety is handled in one query:
  // deleteMany with { cart_item_id, cart_id }; count===0 → 404.

  describe('removeItem', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('throws NotFoundException when the item does not belong to the caller (deleteMany count=0)', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeItem(USER_ID, ITEM_ID)).rejects.toThrow(
        new NotFoundException(CartMessages.cartItemNotFound),
      );
    });

    it('throws NotFoundException when the user has no cart at all', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.removeItem(USER_ID, ITEM_ID)).rejects.toThrow(
        new NotFoundException(CartMessages.cartItemNotFound),
      );
    });

    it('deletes the item and returns removeSuccess message when deleteMany count=1', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeItem(USER_ID, ITEM_ID);

      expect(result).toEqual({ message: CartMessages.removeSuccess });
    });

    it('calls cartItem.deleteMany with cart_item_id AND cart_id for ownership scoping', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeItem(USER_ID, ITEM_ID);

      expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cart_item_id: ITEM_ID, cart_id: CART_ID },
      });
    });

    it('calls cartItem.deleteMany exactly once on a successful remove', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeItem(USER_ID, ITEM_ID);

      expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('does NOT call the legacy cartItem.delete or cartItem.findFirst', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({ cart_id: CART_ID });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeItem(USER_ID, ITEM_ID);

      expect(mockPrisma.cartItem.delete).not.toHaveBeenCalled();
      expect(mockPrisma.cartItem.findFirst).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.removeItem(USER_ID, ITEM_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
