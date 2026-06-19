import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { StripeService } from '../payment/stripe.service';
import { Prisma } from '../generated/prisma/client';
import {
  AddressMessages,
  AuthMessages,
  CheckoutMessages,
} from '../constants/messages.constant';
import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_FEE,
} from '../constants/values.constant';
import { CouponService } from './coupon.service';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import {
  AppliedCoupon,
  CheckoutItem,
  CheckoutSummary,
  CouponEvaluation,
  OrderContext,
  OrderLine,
  PaymentIntentResponse,
} from './types/checkout.types';

/** Full row for the displayed checkout line (variant + product + images). */
const CHECKOUT_ITEM_SELECT = {
  cart_item_id: true,
  product_variant_id: true,
  quantity: true,
  product_variant: {
    select: {
      stock: true,
      price: true,
      discount: true,
      attributes: true,
      product: { select: { product_name: true, brand: true } },
      images: {
        select: { image_url: true, is_primary: true, sort_order: true },
      },
    },
  },
} as const;

type CheckoutItemRow = Prisma.CartItemGetPayload<{
  select: typeof CHECKOUT_ITEM_SELECT;
}>;

/** Minimal row to build the authoritative order breakdown at placement. */
const ORDER_LINE_SELECT = {
  product_variant_id: true,
  quantity: true,
  product_variant: {
    select: {
      stock: true,
      price: true,
      discount: true,
      product: { select: { product_name: true } },
    },
  },
} as const;

/**
 * Checkout for the authenticated user: the order summary built from the cart,
 * coupon apply/remove (re-verified on every read), and Stripe PaymentIntent
 * creation. Like the cart/address services, every method acts only on the JWT
 * id and re-checks the active session first. Money is serialized as 2-decimal
 * strings. The authoritative breakdown (`buildOrderContext`) is shared with the
 * order module so checkout and placement can never diverge.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly couponService: CouponService,
    private readonly stripe: StripeService,
  ) {}

  /**
   * The full checkout summary: every cart line (out-of-stock flagged, kept in
   * the list), the totals over in-stock lines, the re-verified coupon, and the
   * billing details from the profile. Re-verifies `cart.applied_coupon` and
   * **clears it from the cart** when it is no longer valid.
   */
  async getSummary(userId: string): Promise<CheckoutSummary> {
    await this.assertActiveUser(userId);
    return this.composeSummary(userId);
  }

  /**
   * Builds the summary without the active-session precheck — callers that have
   * already asserted (applyCoupon / removeCoupon) reuse this to avoid a second
   * `is_active` round trip.
   */
  private async composeSummary(userId: string): Promise<CheckoutSummary> {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        first_name: true,
        last_name: true,
        phone: true,
        email: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }

    const cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      select: { cart_id: true, applied_coupon: true },
    });

    const rows = cart
      ? await this.prisma.cartItem.findMany({
          where: { cart_id: cart.cart_id },
          orderBy: { cart_item_id: 'asc' },
          select: CHECKOUT_ITEM_SELECT,
        })
      : [];

    const items: CheckoutItem[] = [];
    let subTotal = new Prisma.Decimal(0);
    let totalItems = 0;

    for (const row of rows) {
      const variant = row.product_variant;
      const outOfStock = variant.stock <= 0;
      const finalUnit = Prisma.Decimal.max(
        0,
        variant.price.minus(variant.discount),
      );
      if (!outOfStock) {
        subTotal = subTotal.plus(finalUnit.times(row.quantity));
        totalItems += row.quantity;
      }
      items.push(this.toCheckoutItem(row, finalUnit, outOfStock));
    }

    // Re-verify the cart coupon; clear it if it has become invalid.
    let coupon: CouponEvaluation | null = null;
    if (cart?.applied_coupon) {
      try {
        coupon = await this.couponService.evaluate(
          this.prisma,
          userId,
          cart.applied_coupon,
          subTotal,
        );
      } catch {
        await this.prisma.cart.update({
          where: { user_id: userId },
          data: { applied_coupon: null },
          select: { cart_id: true },
        });
        coupon = null;
      }
    }

    const couponDiscount = coupon
      ? coupon.discount_amount
      : new Prisma.Decimal(0);
    const shippingFee = this.resolveShipping(subTotal);
    const total = subTotal.minus(couponDiscount).plus(shippingFee);

    return {
      items,
      total_items: totalItems,
      sub_total: subTotal.toFixed(2),
      coupon_discount: couponDiscount.toFixed(2),
      shipping_fee: shippingFee.toFixed(2),
      total: total.toFixed(2),
      applied_coupon: coupon ? this.toAppliedCoupon(coupon) : null,
      personal: {
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email: user.email,
      },
    };
  }

  /**
   * Validates a coupon against the current subtotal and registers it on the
   * cart (`applied_coupon`) so it persists if the user leaves before ordering.
   * A bad coupon surfaces its specific 400 reason. Returns the refreshed summary.
   */
  async applyCoupon(
    userId: string,
    dto: ApplyCouponDto,
  ): Promise<CheckoutSummary> {
    await this.assertActiveUser(userId);

    const { subTotal, purchasable } = await this.loadSubtotal(userId);
    if (!purchasable) {
      throw new BadRequestException(CheckoutMessages.emptyCart);
    }

    // Throws the specific reason (invalid/expired/used/min-order) on failure.
    await this.couponService.evaluate(this.prisma, userId, dto.code, subTotal);

    await this.prisma.cart.update({
      where: { user_id: userId },
      data: { applied_coupon: dto.code },
      select: { cart_id: true },
    });

    return this.composeSummary(userId);
  }

  /** Removes any applied coupon from the cart. Returns the refreshed summary. */
  async removeCoupon(userId: string): Promise<CheckoutSummary> {
    await this.assertActiveUser(userId);

    await this.prisma.cart.updateMany({
      where: { user_id: userId },
      data: { applied_coupon: null },
    });

    return this.composeSummary(userId);
  }

  /**
   * Creates a Stripe PaymentIntent for the card flow. Validates the active user,
   * the owned address, and a purchasable cart, then computes the authoritative
   * total. No order is created here — the checkout context rides in the
   * PaymentIntent metadata and the order is placed by the webhook on success.
   */
  async createPaymentIntent(
    userId: string,
    dto: CreatePaymentIntentDto,
  ): Promise<PaymentIntentResponse> {
    await this.assertActiveUser(userId);
    await this.assertOwnedAddress(this.prisma, userId, dto.address_id);

    const ctx = await this.buildOrderContext(this.prisma, userId);

    const intent = await this.stripe.createPaymentIntent(ctx.total.toFixed(2), {
      user_id: userId,
      address_id: dto.address_id,
      coupon_code: ctx.coupon?.code ?? '',
    });

    if (!intent.client_secret) {
      throw new InternalServerErrorException();
    }

    return { client_secret: intent.client_secret, total: ctx.total.toFixed(2) };
  }

  /**
   * Builds the authoritative, re-validated order breakdown from the cart. Used
   * by both placement paths inside their transaction. Throws when there is
   * nothing purchasable (empty/all out of stock) or a line can no longer be
   * fulfilled at its quantity. The coupon is evaluated tolerantly — an invalid
   * coupon is simply dropped (no discount), never an error here.
   */
  async buildOrderContext(
    client: Prisma.TransactionClient,
    userId: string,
  ): Promise<OrderContext> {
    const cart = await client.cart.findUnique({
      where: { user_id: userId },
      select: { cart_id: true, applied_coupon: true },
    });
    if (!cart) {
      throw new BadRequestException(CheckoutMessages.emptyCart);
    }

    const rows = await client.cartItem.findMany({
      where: { cart_id: cart.cart_id },
      orderBy: { cart_item_id: 'asc' },
      select: ORDER_LINE_SELECT,
    });

    const lines: OrderLine[] = [];
    let subTotal = new Prisma.Decimal(0);

    for (const row of rows) {
      const variant = row.product_variant;
      if (variant.stock <= 0) {
        continue; // out of stock — excluded from the order
      }
      if (variant.stock < row.quantity) {
        throw new BadRequestException(CheckoutMessages.insufficientStock);
      }
      const finalUnit = Prisma.Decimal.max(
        0,
        variant.price.minus(variant.discount),
      );
      subTotal = subTotal.plus(finalUnit.times(row.quantity));
      lines.push({
        product_variant_id: row.product_variant_id,
        product_name: variant.product.product_name,
        purchase_price: finalUnit,
        quantity: row.quantity,
      });
    }

    if (lines.length === 0) {
      throw new BadRequestException(CheckoutMessages.emptyCart);
    }

    let coupon: CouponEvaluation | null = null;
    if (cart.applied_coupon) {
      try {
        coupon = await this.couponService.evaluate(
          client,
          userId,
          cart.applied_coupon,
          subTotal,
        );
      } catch {
        coupon = null;
      }
    }

    const couponDiscount = coupon
      ? coupon.discount_amount
      : new Prisma.Decimal(0);
    const shippingFee = this.resolveShipping(subTotal);
    const total = new Prisma.Decimal(
      subTotal.minus(couponDiscount).plus(shippingFee).toFixed(2),
    );

    return {
      lines,
      sub_total: new Prisma.Decimal(subTotal.toFixed(2)),
      coupon,
      coupon_discount: new Prisma.Decimal(couponDiscount.toFixed(2)),
      shipping_fee: new Prisma.Decimal(shippingFee.toFixed(2)),
      total,
    };
  }

  /** Asserts the address exists, is active, and belongs to the user (else 404). */
  async assertOwnedAddress(
    client: Prisma.TransactionClient,
    userId: string,
    addressId: string,
  ): Promise<void> {
    const address = await client.address.findFirst({
      where: { address_id: addressId, user_id: userId, is_removed: false },
      select: { address_id: true },
    });
    if (!address) {
      throw new NotFoundException(AddressMessages.notFound);
    }
  }

  // ----- Helpers -----

  private async assertActiveUser(userId: string): Promise<void> {
    const active = await this.authService.isUserActive(userId);
    if (!active) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }
  }

  /** Σ final_price × qty over in-stock lines, plus whether anything is buyable. */
  private async loadSubtotal(
    userId: string,
  ): Promise<{ subTotal: Prisma.Decimal; purchasable: boolean }> {
    const cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      select: { cart_id: true },
    });
    if (!cart) {
      return { subTotal: new Prisma.Decimal(0), purchasable: false };
    }

    const rows = await this.prisma.cartItem.findMany({
      where: { cart_id: cart.cart_id },
      select: {
        quantity: true,
        product_variant: {
          select: { stock: true, price: true, discount: true },
        },
      },
    });

    let subTotal = new Prisma.Decimal(0);
    let purchasable = false;
    for (const row of rows) {
      const variant = row.product_variant;
      if (variant.stock <= 0) {
        continue;
      }
      purchasable = true;
      const finalUnit = Prisma.Decimal.max(
        0,
        variant.price.minus(variant.discount),
      );
      subTotal = subTotal.plus(finalUnit.times(row.quantity));
    }
    return { subTotal, purchasable };
  }

  /** ₹100 when there is a buyable subtotal below the free-shipping threshold. */
  private resolveShipping(subTotal: Prisma.Decimal): Prisma.Decimal {
    const free =
      subTotal.lessThanOrEqualTo(0) ||
      subTotal.greaterThanOrEqualTo(FREE_SHIPPING_THRESHOLD);
    return free ? new Prisma.Decimal(0) : new Prisma.Decimal(SHIPPING_FEE);
  }

  private toCheckoutItem(
    row: CheckoutItemRow,
    finalUnit: Prisma.Decimal,
    outOfStock: boolean,
  ): CheckoutItem {
    const variant = row.product_variant;
    return {
      cart_item_id: row.cart_item_id,
      product_variant_id: row.product_variant_id,
      product_name: variant.product.product_name,
      brand: variant.product.brand,
      image_url: this.pickPrimaryImage(variant.images),
      attributes: this.asAttributeRecord(variant.attributes),
      price: variant.price.toFixed(2),
      discount: variant.discount.toFixed(2),
      final_price: finalUnit.toFixed(2),
      quantity: row.quantity,
      stock: variant.stock,
      out_of_stock: outOfStock,
    };
  }

  private toAppliedCoupon(coupon: CouponEvaluation): AppliedCoupon {
    return {
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value.toFixed(2),
      discount_amount: coupon.discount_amount.toFixed(2),
    };
  }

  /** The primary image url (`is_primary`, else lowest `sort_order`), or null. */
  private pickPrimaryImage(
    images: { image_url: string; is_primary: boolean; sort_order: number }[],
  ): string | null {
    if (images.length === 0) {
      return null;
    }
    const ordered = [...images].sort((a, b) => {
      if (a.is_primary !== b.is_primary) {
        return a.is_primary ? -1 : 1;
      }
      return a.sort_order - b.sort_order;
    });
    return ordered[0].image_url;
  }

  private asAttributeRecord(value: Prisma.JsonValue): Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw === 'string') {
        out[key] = raw;
      }
    }
    return out;
  }
}
