import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DiscountType } from '../generated/prisma/enums';
import { CouponMessages } from '../constants/messages.constant';
import { CouponEvaluation } from './types/checkout.types';

const COUPON_SELECT = {
  coupon_id: true,
  code: true,
  discount_type: true,
  discount_value: true,
  minimum_order: true,
  usage_limit: true,
  used_count: true,
  is_active: true,
  expires_at: true,
} as const;

/**
 * Coupon validation + usage accounting, shared by the checkout summary/apply
 * paths and order placement. Lives in the checkout module (exported) so the
 * order module reuses the exact same rules without duplication.
 *
 * `evaluate` is intentionally a throwing validator: the apply endpoint surfaces
 * its specific 400 reason directly, while the summary/placement paths call it
 * inside a try/catch to tolerantly drop an invalid coupon.
 */
@Injectable()
export class CouponService {
  /**
   * Validates a coupon for a user against a given (pre-coupon) subtotal and
   * returns the discount it yields. Throws a `BadRequestException` with the
   * specific reason on any failure (not found / inactive / expired / usage
   * limit / already used / minimum not met). Runs on the passed client so it can
   * participate in a placement transaction.
   */
  async evaluate(
    client: Prisma.TransactionClient,
    userId: string,
    code: string,
    subTotal: Prisma.Decimal,
  ): Promise<CouponEvaluation> {
    const coupon = await client.coupon.findUnique({
      where: { code },
      select: COUPON_SELECT,
    });

    if (!coupon) {
      throw new BadRequestException(CouponMessages.invalid);
    }
    if (!coupon.is_active) {
      throw new BadRequestException(CouponMessages.inactive);
    }
    if (
      coupon.expires_at !== null &&
      coupon.expires_at.getTime() < Date.now()
    ) {
      throw new BadRequestException(CouponMessages.expired);
    }
    if (
      coupon.usage_limit !== null &&
      coupon.used_count >= coupon.usage_limit
    ) {
      throw new BadRequestException(CouponMessages.usageLimitReached);
    }

    const alreadyUsed = await client.couponUsage.findUnique({
      where: {
        coupon_id_user_id: { coupon_id: coupon.coupon_id, user_id: userId },
      },
      select: { coupon_id: true },
    });
    if (alreadyUsed) {
      throw new BadRequestException(CouponMessages.alreadyUsed);
    }

    if (
      coupon.minimum_order !== null &&
      subTotal.lessThan(coupon.minimum_order)
    ) {
      throw new BadRequestException(CouponMessages.minOrderNotMet);
    }

    return {
      coupon_id: coupon.coupon_id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_amount: this.computeDiscount(
        coupon.discount_type,
        coupon.discount_value,
        subTotal,
      ),
    };
  }

  /**
   * Records a coupon use inside a placement transaction: writes the per-user
   * `CouponUsage` row (one-use-per-user via the compound key) and bumps the
   * coupon's global `used_count`. Released on cancellation via
   * {@link releaseUsage} (the order persists its `coupon_id`).
   */
  async recordUsage(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
  ): Promise<void> {
    await tx.couponUsage.create({
      data: { coupon_id: couponId, user_id: userId },
    });
    await tx.coupon.update({
      where: { coupon_id: couponId },
      data: { used_count: { increment: 1 } },
      select: { coupon_id: true },
    });
  }

  /**
   * Releases a coupon use on order cancellation/refund: deletes the per-user
   * `CouponUsage` row and decrements the coupon's `used_count` — but only when a
   * usage row actually existed, so a double cancel (idempotent retry) can't
   * drive `used_count` negative.
   */
  async releaseUsage(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
  ): Promise<void> {
    const { count } = await tx.couponUsage.deleteMany({
      where: { coupon_id: couponId, user_id: userId },
    });
    if (count > 0) {
      await tx.coupon.update({
        where: { coupon_id: couponId },
        data: { used_count: { decrement: 1 } },
        select: { coupon_id: true },
      });
    }
  }

  /**
   * The rupee discount a coupon yields on a subtotal: a percentage of it, or a
   * flat amount — clamped to the subtotal (never negative total) and rounded to
   * 2 decimals.
   */
  private computeDiscount(
    type: DiscountType,
    value: Prisma.Decimal,
    subTotal: Prisma.Decimal,
  ): Prisma.Decimal {
    const raw =
      type === DiscountType.PERCENTAGE
        ? subTotal.times(value).dividedBy(100)
        : value;
    const clamped = Prisma.Decimal.min(raw, subTotal);
    return new Prisma.Decimal(clamped.toFixed(2));
  }
}
