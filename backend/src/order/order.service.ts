import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CheckoutService } from '../checkout/checkout.service';
import { CouponService } from '../checkout/coupon.service';
import { StripeService } from '../payment/stripe.service';
import { Prisma } from '../generated/prisma/client';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../generated/prisma/enums';
import { AuthMessages, OrderMessages } from '../constants/messages.constant';
import { ORDER_PAGE_SIZE } from '../constants/values.constant';
import { AddressResponse } from '../address/types/address.types';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import {
  OrderDetail,
  OrderItemView,
  OrderListItem,
  OrderListResponse,
} from './types/order.types';
import type { PaymentIntentMetadata } from '../payment/stripe.service';
import { MailService } from '../mail/mail.service';

/** Statuses from which the user may still cancel (before the order ships). */
const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PACKED,
];

/** Variant fields read live for display (brand/attributes/images). */
const ITEM_VARIANT_SELECT = {
  product: { select: { brand: true } },
  attributes: true,
  images: { select: { image_url: true, is_primary: true, sort_order: true } },
} as const;

const ORDER_LIST_SELECT = {
  order_id: true,
  total_amount: true,
  status: true,
  created_at: true,
  _count: { select: { items: true } },
  items: {
    take: 1,
    orderBy: { order_item_id: 'asc' },
    select: {
      product_name: true,
      product_variant: { select: ITEM_VARIANT_SELECT },
    },
  },
} as const;

type OrderListRow = Prisma.OrderGetPayload<{
  select: typeof ORDER_LIST_SELECT;
}>;

const ORDER_DETAIL_SELECT = {
  order_id: true,
  status: true,
  created_at: true,
  sub_total: true,
  coupon_discount: true,
  shipping_fee: true,
  total_amount: true,
  address_id: true,
  payment: { select: { payment_method: true, payment_status: true } },
  items: {
    orderBy: { order_item_id: 'asc' },
    select: {
      order_item_id: true,
      product_name: true,
      purchase_price: true,
      quantity: true,
      product_variant: { select: ITEM_VARIANT_SELECT },
    },
  },
} as const;

type OrderDetailRow = Prisma.OrderGetPayload<{
  select: typeof ORDER_DETAIL_SELECT;
}>;

/** Address columns for the order's shipping snapshot (removed rows still show). */
const ORDER_ADDRESS_SELECT = {
  address_id: true,
  address_type: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  country: true,
  zip: true,
  is_default: true,
} as const;

type OrderAddressRow = Prisma.AddressGetPayload<{
  select: typeof ORDER_ADDRESS_SELECT;
}>;

/**
 * Orders for the authenticated user: place (COD), list, detail, cancel. Card
 * orders are placed by the Stripe webhook (`placeStripeOrder`), and a paid
 * order's cancellation is finalised by the refund webhook (`finalizeRefund`).
 *
 * Placement/cancel/refund all run in Serializable transactions: totals are
 * re-validated via `CheckoutService.buildOrderContext`, stock is decremented on
 * placement and restored on cancellation, and the coupon's one-use-per-user
 * accounting is recorded on placement. Money is serialized as 2-decimal strings;
 * identity is always the JWT id (foreign order ids resolve to 404).
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly checkoutService: CheckoutService,
    private readonly couponService: CouponService,
    private readonly stripe: StripeService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Places a Cash-on-Delivery order: payment `PENDING`, order `PENDING`. The
   * cart is validated, stock decremented, coupon usage recorded, and the cart
   * cleared — all atomically.
   */
  async placeCodOrder(
    userId: string,
    dto: PlaceOrderDto,
  ): Promise<OrderDetail> {
    await this.assertActiveUser(userId);

    const orderId = await this.prisma.$transaction(
      async (tx) => {
        await this.checkoutService.assertOwnedAddress(
          tx,
          userId,
          dto.address_id,
        );
        return this.placeOrderTx(
          tx,
          userId,
          dto.address_id,
          PaymentMethod.COD,
          PaymentStatus.PENDING,
          null,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const order = await this.buildOrderDetail(this.prisma, userId, orderId);

    // Fire-and-forget: email failure must never surface to the caller.
    this.fetchUserBasic(userId)
      .then((user) => this.mailService.sendOrderConfirmation(order, user))
      .catch((err) =>
        this.logger.error(
          `Email dispatch failed for COD order ${orderId}: ${String(err)}`,
        ),
      );

    return order;
  }

  /** Paginated order history (newest first), with a representative item each. */
  async listOrders(
    userId: string,
    query: ListOrdersQueryDto,
  ): Promise<OrderListResponse> {
    await this.assertActiveUser(userId);

    const page = query.page ?? 1;
    const limit = ORDER_PAGE_SIZE;
    const skip = (page - 1) * limit;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { user_id: userId } }),
      this.prisma.order.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: ORDER_LIST_SELECT,
      }),
    ]);

    return {
      orders: rows.map((row) => this.toListItem(row)),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** A single order's full detail (ownership-scoped — foreign id → 404). */
  async getOrder(userId: string, orderId: string): Promise<OrderDetail> {
    await this.assertActiveUser(userId);
    return this.buildOrderDetail(this.prisma, userId, orderId);
  }

  /**
   * Cancels an eligible order. A Cash-on-Delivery / unpaid order is cancelled
   * synchronously (status `CANCELLED` + stock restored). A Stripe-paid order
   * requests a refund and returns immediately; the `charge.refunded` webhook
   * finalises the cancellation (see {@link finalizeRefund}).
   */
  async cancelOrder(
    userId: string,
    orderId: string,
  ): Promise<{ message: string }> {
    await this.assertActiveUser(userId);

    const order = await this.prisma.order.findFirst({
      where: { order_id: orderId, user_id: userId },
      select: {
        order_id: true,
        status: true,
        payment: {
          select: {
            payment_method: true,
            payment_status: true,
            stripe_payment_id: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException(OrderMessages.notFound);
    }
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(OrderMessages.notCancellable);
    }

    const paidViaStripe =
      order.payment?.payment_method === PaymentMethod.STRIPE &&
      order.payment.payment_status === PaymentStatus.PAID &&
      order.payment.stripe_payment_id !== null;

    if (paidViaStripe && order.payment?.stripe_payment_id) {
      // Webhook-driven: request the refund; the order/payment/stock changes land
      // when the charge.refunded webhook arrives (idempotent).
      await this.stripe.refundPaymentIntent(order.payment.stripe_payment_id);
      return { message: OrderMessages.refundInitiated };
    }

    await this.prisma.$transaction(
      async (tx) => {
        await this.restockAndCancel(tx, orderId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { message: OrderMessages.cancelSuccess };
  }

  // ----- Stripe webhook entry points (trusted; no JWT) -----

  /**
   * Places the order behind a succeeded PaymentIntent (card flow), from the
   * intent metadata. Idempotent: a duplicate delivery (payment already recorded)
   * is a no-op. If the cart can no longer be fulfilled (stock vanished), the
   * captured payment is refunded and no order is created.
   */
  async placeStripeOrder(
    metadata: PaymentIntentMetadata,
    paymentIntentId: string,
  ): Promise<void> {
    if (!isUUID(metadata.user_id) || !isUUID(metadata.address_id)) {
      this.logger.warn(
        `placeStripeOrder skipped ${paymentIntentId}: metadata is not a checkout intent (user_id/address_id not UUIDs)`,
      );
      return; // not one of our checkout intents (missing/malformed metadata)
    }

    const existing = await this.prisma.payment.findFirst({
      where: { stripe_payment_id: paymentIntentId },
      select: { payment_id: true },
    });
    if (existing) {
      this.logger.log(
        `placeStripeOrder skipped ${paymentIntentId}: order already placed (idempotent)`,
      );
      return; // already placed — idempotent
    }

    try {
      const newOrderId = await this.prisma.$transaction(
        async (tx) => {
          await this.checkoutService.assertOwnedAddress(
            tx,
            metadata.user_id,
            metadata.address_id,
          );
          return this.placeOrderTx(
            tx,
            metadata.user_id,
            metadata.address_id,
            PaymentMethod.STRIPE,
            PaymentStatus.PAID,
            paymentIntentId,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      this.logger.log(
        `placeStripeOrder placed order for ${paymentIntentId} (user ${metadata.user_id})`,
      );

      // Fire-and-forget: email failure must never surface to the webhook.
      Promise.all([
        this.buildOrderDetail(this.prisma, metadata.user_id, newOrderId),
        this.fetchUserBasic(metadata.user_id),
      ])
        .then(([order, user]) =>
          this.mailService.sendOrderConfirmation(order, user),
        )
        .catch((err) =>
          this.logger.error(
            `Email dispatch failed for stripe order ${paymentIntentId}: ${String(err)}`,
          ),
        );
    } catch (error) {
      // Only refund when the order is genuinely unfulfillable (out of stock /
      // empty cart / address gone) — a BadRequestException from buildOrderContext
      // or assertOwnedAddress. A duplicate-delivery unique violation (P2002) or a
      // transient serialization failure (P2034) must NOT refund a placed order;
      // re-throw so Stripe retries the webhook.
      if (error instanceof BadRequestException) {
        this.logger.warn(
          `placeStripeOrder refunding ${paymentIntentId}: order unfulfillable — ${error.message}`,
        );
        await this.stripe.refundPaymentIntent(paymentIntentId);
        return;
      }
      this.logger.error(
        `placeStripeOrder failed ${paymentIntentId} (will let Stripe retry): ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Finalises a refund (charge.refunded): marks the order `CANCELLED`, the
   * payment `REFUNDED`, and restores stock. Idempotent — a payment already
   * `REFUNDED` is a no-op.
   */
  async finalizeRefund(paymentIntentId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findFirst({
          where: { stripe_payment_id: paymentIntentId },
          select: {
            payment_id: true,
            payment_status: true,
            order: { select: { order_id: true } },
          },
        });
        if (!payment || payment.payment_status === PaymentStatus.REFUNDED) {
          return;
        }

        await this.restockAndCancel(tx, payment.order.order_id);
        await tx.payment.update({
          where: { payment_id: payment.payment_id },
          data: { payment_status: PaymentStatus.REFUNDED },
          select: { payment_id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ----- Shared transaction bodies -----

  /**
   * Core placement, shared by COD and Stripe. Re-validates the cart, creates the
   * order + items + payment, decrements stock, records coupon usage, and clears
   * the cart — all on the passed transaction client. Returns the new order id.
   */
  private async placeOrderTx(
    tx: Prisma.TransactionClient,
    userId: string,
    addressId: string,
    method: PaymentMethod,
    paymentStatus: PaymentStatus,
    stripePaymentId: string | null,
  ): Promise<string> {
    const ctx = await this.checkoutService.buildOrderContext(tx, userId);

    const order = await tx.order.create({
      data: {
        user_id: userId,
        address_id: addressId,
        coupon_id: ctx.coupon?.coupon_id ?? null,
        sub_total: ctx.sub_total,
        coupon_discount: ctx.coupon_discount,
        shipping_fee: ctx.shipping_fee,
        total_amount: ctx.total,
        status: OrderStatus.PENDING,
        items: {
          create: ctx.lines.map((line) => ({
            product_name: line.product_name,
            product_variant_id: line.product_variant_id,
            purchase_price: line.purchase_price,
            quantity: line.quantity,
          })),
        },
        payment: {
          create: {
            payment_method: method,
            payment_status: paymentStatus,
            amount: ctx.total,
            stripe_payment_id: stripePaymentId,
          },
        },
      },
      select: { order_id: true },
    });

    // Deduct inventory only after the order exists (Serializable: the stock read
    // in buildOrderContext and this decrement can't be raced into an oversell).
    for (const line of ctx.lines) {
      await tx.productVariant.update({
        where: { product_variant_id: line.product_variant_id },
        data: { stock: { decrement: line.quantity } },
        select: { product_variant_id: true },
      });
    }

    if (ctx.coupon) {
      await this.couponService.recordUsage(tx, ctx.coupon.coupon_id, userId);
    }

    const cart = await tx.cart.findUnique({
      where: { user_id: userId },
      select: { cart_id: true },
    });
    if (cart) {
      await tx.cartItem.deleteMany({ where: { cart_id: cart.cart_id } });
      await tx.cart.update({
        where: { cart_id: cart.cart_id },
        data: { applied_coupon: null },
        select: { cart_id: true },
      });
    }

    return order.order_id;
  }

  /**
   * Marks an order `CANCELLED` and restores the stock of its items. Idempotent:
   * an already-cancelled order is left untouched (no double restock).
   */
  private async restockAndCancel(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const order = await tx.order.findUnique({
      where: { order_id: orderId },
      select: {
        status: true,
        user_id: true,
        coupon_id: true,
        items: { select: { product_variant_id: true, quantity: true } },
      },
    });
    if (!order || order.status === OrderStatus.CANCELLED) {
      return;
    }

    for (const item of order.items) {
      await tx.productVariant.update({
        where: { product_variant_id: item.product_variant_id },
        data: { stock: { increment: item.quantity } },
        select: { product_variant_id: true },
      });
    }

    // Release the coupon so the user can reuse it (and recover the global count).
    if (order.coupon_id) {
      await this.couponService.releaseUsage(tx, order.coupon_id, order.user_id);
    }

    await tx.order.update({
      where: { order_id: orderId },
      data: { status: OrderStatus.CANCELLED },
      select: { order_id: true },
    });
  }

  // ----- Read helpers -----

  private async fetchUserBasic(
    userId: string,
  ): Promise<{ name: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: { first_name: true, last_name: true, email: true },
    });
    if (!user) {
      throw new Error(
        `User ${userId} not found — cannot send order confirmation email`,
      );
    }
    return {
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
    };
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const active = await this.authService.isUserActive(userId);
    if (!active) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }
  }

  private async buildOrderDetail(
    client: Prisma.TransactionClient,
    userId: string,
    orderId: string,
  ): Promise<OrderDetail> {
    const order = await client.order.findFirst({
      where: { order_id: orderId, user_id: userId },
      select: ORDER_DETAIL_SELECT,
    });
    if (!order || !order.payment) {
      throw new NotFoundException(OrderMessages.notFound);
    }

    const address = await client.address.findFirst({
      where: { address_id: order.address_id, user_id: userId },
      select: ORDER_ADDRESS_SELECT,
    });
    if (!address) {
      throw new NotFoundException(OrderMessages.notFound);
    }

    return this.toOrderDetail(order, address);
  }

  private toListItem(row: OrderListRow): OrderListItem {
    const first = row.items[0];
    const variant = first?.product_variant;
    return {
      order_id: row.order_id,
      order_number: this.orderNumber(row.order_id),
      product_name: first?.product_name ?? '',
      brand: variant?.product.brand ?? '',
      image_url: variant ? this.pickPrimaryImage(variant.images) : null,
      attributes: variant ? this.asAttributeRecord(variant.attributes) : {},
      item_count: row._count.items,
      total_amount: row.total_amount.toFixed(2),
      status: row.status,
      created_at: row.created_at.toISOString(),
      can_cancel: CANCELLABLE_STATUSES.includes(row.status),
    };
  }

  private toOrderDetail(
    row: OrderDetailRow,
    address: OrderAddressRow,
  ): OrderDetail {
    const payment = row.payment;
    if (!payment) {
      throw new InternalServerErrorException();
    }

    const items: OrderItemView[] = row.items.map((item) => {
      const variant = item.product_variant;
      return {
        order_item_id: item.order_item_id,
        product_name: item.product_name,
        brand: variant.product.brand,
        image_url: this.pickPrimaryImage(variant.images),
        attributes: this.asAttributeRecord(variant.attributes),
        purchase_price: item.purchase_price.toFixed(2),
        quantity: item.quantity,
        line_total: item.purchase_price.times(item.quantity).toFixed(2),
      };
    });

    return {
      order_id: row.order_id,
      order_number: this.orderNumber(row.order_id),
      created_at: row.created_at.toISOString(),
      status: row.status,
      payment_method: payment.payment_method,
      payment_status: payment.payment_status,
      sub_total: row.sub_total.toFixed(2),
      coupon_discount: row.coupon_discount.toFixed(2),
      shipping_fee: row.shipping_fee.toFixed(2),
      total_amount: row.total_amount.toFixed(2),
      shipping_address: this.toAddressResponse(address),
      items,
      can_cancel: CANCELLABLE_STATUSES.includes(row.status),
    };
  }

  /** Short, display-friendly order code: first 8 hex chars of the uuid. */
  private orderNumber(orderId: string): string {
    return `#${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  private toAddressResponse(row: OrderAddressRow): AddressResponse {
    return {
      address_id: row.address_id,
      address_type: row.address_type,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      state: row.state,
      country: row.country,
      zip: row.zip,
      is_default: row.is_default,
    };
  }

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
