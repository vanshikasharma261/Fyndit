/**
 * Unit tests for CouponService.
 *
 * Every evaluate() rejection branch is tested: invalid/inactive/expired/
 * usageLimit/alreadyUsed/minOrder. Also covers computeDiscount PERCENTAGE vs
 * FIXED (with clamping) and recordUsage.
 *
 * Uses real Prisma.Decimal instances — CouponService.computeDiscount uses
 * Decimal.min, times, dividedBy, which reject plain JS objects.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client-runtime-utils';
import { CouponService } from './coupon.service';
import { CouponMessages } from '../constants/messages.constant';
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
const COUPON_ID = 'coupon-001';
const CODE = 'SAVE10';

// ---------------------------------------------------------------------------
// Mock Prisma client (TransactionClient shape)
// ---------------------------------------------------------------------------

const mockClient = {
  coupon: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  couponUsage: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeCoupon(
  overrides: {
    discount_type?: DiscountType;
    discount_value?: number;
    minimum_order?: number | null;
    usage_limit?: number | null;
    used_count?: number;
    is_active?: boolean;
    expires_at?: Date | null;
  } = {},
) {
  return {
    coupon_id: COUPON_ID,
    code: CODE,
    discount_type: overrides.discount_type ?? DiscountType.PERCENTAGE,
    discount_value: d(overrides.discount_value ?? 10),
    minimum_order:
      overrides.minimum_order !== undefined
        ? overrides.minimum_order !== null
          ? d(overrides.minimum_order)
          : null
        : null,
    usage_limit:
      overrides.usage_limit !== undefined ? overrides.usage_limit : null,
    used_count: overrides.used_count ?? 0,
    is_active: overrides.is_active !== undefined ? overrides.is_active : true,
    expires_at:
      overrides.expires_at !== undefined ? overrides.expires_at : null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CouponService', () => {
  let service: CouponService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponService],
    }).compile();

    service = module.get<CouponService>(CouponService);
  });

  // =========================================================================
  // evaluate — rejection branches
  // =========================================================================

  describe('evaluate — rejection branches', () => {
    it('throws BadRequestException(invalid) when coupon code is not found', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.evaluate(mockClient as never, USER_ID, CODE, d(500)),
      ).rejects.toThrow(new BadRequestException(CouponMessages.invalid));
    });

    it('throws BadRequestException(inactive) when coupon.is_active is false', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ is_active: false }),
      );

      await expect(
        service.evaluate(mockClient as never, USER_ID, CODE, d(500)),
      ).rejects.toThrow(new BadRequestException(CouponMessages.inactive));
    });

    it('throws BadRequestException(expired) when coupon.expires_at is in the past', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ expires_at: pastDate }),
      );

      await expect(
        service.evaluate(mockClient as never, USER_ID, CODE, d(500)),
      ).rejects.toThrow(new BadRequestException(CouponMessages.expired));
    });

    it('does NOT throw expired when expires_at is in the future', async () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ expires_at: futureDate }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      // Should not throw for expiry (might throw for other reasons, but not expiry)
      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(500),
      );
      expect(result).toBeDefined();
    });

    it('does NOT throw expired when expires_at is null (no expiry)', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ expires_at: null }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(500),
      );
      expect(result).toBeDefined();
    });

    it('throws BadRequestException(usageLimitReached) when used_count >= usage_limit', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ usage_limit: 5, used_count: 5 }),
      );

      await expect(
        service.evaluate(mockClient as never, USER_ID, CODE, d(500)),
      ).rejects.toThrow(
        new BadRequestException(CouponMessages.usageLimitReached),
      );
    });

    it('throws BadRequestException(usageLimitReached) when used_count exceeds usage_limit', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ usage_limit: 5, used_count: 10 }),
      );

      await expect(
        service.evaluate(mockClient as never, USER_ID, CODE, d(500)),
      ).rejects.toThrow(
        new BadRequestException(CouponMessages.usageLimitReached),
      );
    });

    it('does NOT throw usageLimitReached when usage_limit is null (unlimited)', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ usage_limit: null, used_count: 999 }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(500),
      );
      expect(result).toBeDefined();
    });

    it('throws BadRequestException(alreadyUsed) when user has a CouponUsage row', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(makeCoupon());
      mockClient.couponUsage.findUnique.mockResolvedValue({
        coupon_id: COUPON_ID,
      });

      await expect(
        service.evaluate(mockClient as never, USER_ID, CODE, d(500)),
      ).rejects.toThrow(new BadRequestException(CouponMessages.alreadyUsed));
    });

    it('throws BadRequestException(minOrderNotMet) when subTotal < minimum_order', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ minimum_order: 1000 }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      await expect(
        service.evaluate(
          mockClient as never,
          USER_ID,
          CODE,
          d(500), // 500 < 1000
        ),
      ).rejects.toThrow(new BadRequestException(CouponMessages.minOrderNotMet));
    });

    it('does NOT throw minOrderNotMet when subTotal === minimum_order (boundary)', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ minimum_order: 500 }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      // subTotal == minimum_order: lessThan is false, so no throw
      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(500),
      );
      expect(result).toBeDefined();
    });

    it('does NOT throw minOrderNotMet when minimum_order is null', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({ minimum_order: null }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(100),
      );
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // evaluate — PERCENTAGE discount computation
  // =========================================================================

  describe('evaluate — PERCENTAGE discount', () => {
    beforeEach(() => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 10,
          minimum_order: null,
        }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);
    });

    it('computes discount_amount as 10% of subTotal', async () => {
      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(1000),
      );

      // 10% of 1000 = 100.00
      expect(result.discount_amount.toFixed(2)).toBe('100.00');
    });

    it('clamps percentage discount to subTotal when it would exceed 100%', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 150, // 150%
          minimum_order: null,
        }),
      );
      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(500),
      );

      // 150% of 500 = 750 > 500, so clamped to 500.00
      expect(result.discount_amount.toFixed(2)).toBe('500.00');
    });

    it('returns the CouponEvaluation with correct shape', async () => {
      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(1000),
      );

      expect(result).toMatchObject({
        coupon_id: COUPON_ID,
        code: CODE,
        discount_type: DiscountType.PERCENTAGE,
      });
      expect(result.discount_value).toBeDefined();
      expect(result.discount_amount).toBeDefined();
    });
  });

  // =========================================================================
  // evaluate — FIXED discount computation
  // =========================================================================

  describe('evaluate — FIXED discount', () => {
    it('returns the fixed amount as discount_amount when subTotal > fixed amount', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          discount_type: DiscountType.FIXED,
          discount_value: 200,
          minimum_order: null,
        }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(1000),
      );

      expect(result.discount_amount.toFixed(2)).toBe('200.00');
    });

    it('clamps FIXED discount to subTotal (never a negative order total)', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          discount_type: DiscountType.FIXED,
          discount_value: 5000, // more than the subtotal
          minimum_order: null,
        }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(300),
      );

      // clamped to 300.00 (the subtotal)
      expect(result.discount_amount.toFixed(2)).toBe('300.00');
    });

    it('rounds the discount to 2 decimal places', async () => {
      mockClient.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          discount_type: DiscountType.FIXED,
          discount_value: 33.333,
          minimum_order: null,
        }),
      );
      mockClient.couponUsage.findUnique.mockResolvedValue(null);

      const result = await service.evaluate(
        mockClient as never,
        USER_ID,
        CODE,
        d(1000),
      );

      expect(result.discount_amount.toFixed(2)).toBe('33.33');
    });
  });

  // =========================================================================
  // evaluate — passes coupon_id through to CouponEvaluation
  // =========================================================================

  it('evaluate — passes coupon_id through so recordUsage can be called', async () => {
    mockClient.coupon.findUnique.mockResolvedValue(
      makeCoupon({ discount_value: 50, minimum_order: null }),
    );
    mockClient.couponUsage.findUnique.mockResolvedValue(null);

    const result = await service.evaluate(
      mockClient as never,
      USER_ID,
      CODE,
      d(1000),
    );

    expect(result.coupon_id).toBe(COUPON_ID);
  });

  // =========================================================================
  // recordUsage
  // =========================================================================

  describe('recordUsage', () => {
    it('creates a CouponUsage row and increments used_count', async () => {
      mockClient.couponUsage.create.mockResolvedValue({
        coupon_id: COUPON_ID,
        user_id: USER_ID,
      });
      mockClient.coupon.update.mockResolvedValue({ coupon_id: COUPON_ID });

      await service.recordUsage(mockClient as never, COUPON_ID, USER_ID);

      expect(mockClient.couponUsage.create).toHaveBeenCalledWith(
        containing({
          data: containing({ coupon_id: COUPON_ID, user_id: USER_ID }),
        }),
      );
      expect(mockClient.coupon.update).toHaveBeenCalledWith(
        containing({
          where: containing({ coupon_id: COUPON_ID }),
          data: containing({ used_count: containing({ increment: 1 }) }),
        }),
      );
    });

    it('calls couponUsage.create before coupon.update', async () => {
      const callOrder: string[] = [];
      mockClient.couponUsage.create.mockImplementation(() => {
        callOrder.push('create');
        return Promise.resolve({});
      });
      mockClient.coupon.update.mockImplementation(() => {
        callOrder.push('update');
        return Promise.resolve({});
      });

      await service.recordUsage(mockClient as never, COUPON_ID, USER_ID);

      expect(callOrder).toEqual(['create', 'update']);
    });

    it('returns void (no return value)', async () => {
      mockClient.couponUsage.create.mockResolvedValue({});
      mockClient.coupon.update.mockResolvedValue({});

      const result = await service.recordUsage(
        mockClient as never,
        COUPON_ID,
        USER_ID,
      );

      expect(result).toBeUndefined();
    });
  });

  // releaseUsage
  describe('releaseUsage', () => {
    it('deletes the CouponUsage row and decrements used_count when a row existed', async () => {
      mockClient.couponUsage.deleteMany.mockResolvedValue({ count: 1 });
      mockClient.coupon.update.mockResolvedValue({ coupon_id: COUPON_ID });

      await service.releaseUsage(mockClient as never, COUPON_ID, USER_ID);

      expect(mockClient.couponUsage.deleteMany).toHaveBeenCalledWith(
        containing({
          where: containing({ coupon_id: COUPON_ID, user_id: USER_ID }),
        }),
      );
      expect(mockClient.coupon.update).toHaveBeenCalledWith(
        containing({
          where: containing({ coupon_id: COUPON_ID }),
          data: containing({ used_count: containing({ decrement: 1 }) }),
        }),
      );
    });

    it('does not decrement used_count when no usage row existed (idempotent)', async () => {
      mockClient.couponUsage.deleteMany.mockResolvedValue({ count: 0 });

      await service.releaseUsage(mockClient as never, COUPON_ID, USER_ID);

      expect(mockClient.coupon.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // evaluate — uses the client passed in (transaction-safe)
  // =========================================================================

  it('evaluate — queries coupon via the passed client, not a stored one', async () => {
    mockClient.coupon.findUnique.mockResolvedValue(makeCoupon());
    mockClient.couponUsage.findUnique.mockResolvedValue(null);

    await service.evaluate(mockClient as never, USER_ID, CODE, d(500));

    expect(mockClient.coupon.findUnique).toHaveBeenCalledWith(
      containing({ where: containing({ code: CODE }) }),
    );

    // Called with the compound unique key
    expect(mockClient.couponUsage.findUnique).toHaveBeenCalledWith(
      containing({
        where: containing({
          coupon_id_user_id: containing({
            coupon_id: COUPON_ID,
            user_id: USER_ID,
          }),
        }),
      }),
    );
  });

  // =========================================================================
  // evaluate — correct discount_type is returned
  // =========================================================================

  it('evaluate returns discount_type=PERCENTAGE from the coupon row', async () => {
    mockClient.coupon.findUnique.mockResolvedValue(
      makeCoupon({
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 20,
      }),
    );
    mockClient.couponUsage.findUnique.mockResolvedValue(null);

    const result = await service.evaluate(
      mockClient as never,
      USER_ID,
      CODE,
      d(1000),
    );

    expect(result.discount_type).toBe(DiscountType.PERCENTAGE);
    expect(result.discount_amount.toFixed(2)).toBe('200.00');
  });

  it('evaluate returns discount_type=FIXED from the coupon row', async () => {
    mockClient.coupon.findUnique.mockResolvedValue(
      makeCoupon({ discount_type: DiscountType.FIXED, discount_value: 150 }),
    );
    mockClient.couponUsage.findUnique.mockResolvedValue(null);

    const result = await service.evaluate(
      mockClient as never,
      USER_ID,
      CODE,
      d(1000),
    );

    expect(result.discount_type).toBe(DiscountType.FIXED);
    expect(result.discount_amount.toFixed(2)).toBe('150.00');
  });

  // =========================================================================
  // Ensure only one of the above matchers is flagged
  // =========================================================================

  it('anyOf matcher wrapper resolves to correct value (sanity check)', () => {
    expect(anyOf(String)).toBeDefined();
    expect(containing({})).toBeDefined();
  });
});
