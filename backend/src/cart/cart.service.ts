import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { AuthMessages, CartMessages } from '../constants/messages.constant';
import {
  MAX_CART_ITEM_QUANTITY,
  MAX_CART_ITEMS,
} from '../constants/values.constant';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import {
  AddToCartResponse,
  CartItem,
  CartResponse,
  CartSummary,
  UpdateCartResponse,
} from './types/cart.types';

/**
 * Full row selected for the cart item contract: the line plus its variant,
 * the variant's product (name/brand/description) and its images.
 */
const CART_ITEM_SELECT = {
  cart_item_id: true,
  product_variant_id: true,
  quantity: true,
  product_variant: {
    select: {
      stock: true,
      price: true,
      discount: true,
      attributes: true,
      product: {
        select: { product_name: true, brand: true, description: true },
      },
      images: {
        select: { image_url: true, is_primary: true, sort_order: true },
      },
    },
  },
} as const;

type CartItemRow = Prisma.CartItemGetPayload<{
  select: typeof CART_ITEM_SELECT;
}>;

/** Minimal row needed to total the whole cart (price/discount × quantity). */
const SUMMARY_SELECT = {
  quantity: true,
  product_variant: { select: { price: true, discount: true } },
} as const;

type SummaryRow = Prisma.CartItemGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Cart operations for the authenticated user. Every method acts only on the id
 * resolved from the JWT (`@CurrentUser().id`) — never a client-supplied id — and
 * re-checks the active session first, since a valid JWT can outlive a logout or
 * soft delete. Money is serialized as 2-decimal strings; coupons are not part of
 * the cart (they are applied at checkout).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Returns the whole cart: the summary (over all items) and every line. */
  async getCart(userId: string): Promise<CartResponse> {
    await this.assertActiveUser(userId);

    const cartId = await this.findCartId(userId);
    if (!cartId) {
      return { summary: this.emptySummary(), items: [] };
    }

    const rows = await this.prisma.cartItem.findMany({
      where: { cart_id: cartId },
      orderBy: { cart_item_id: 'asc' },
      select: CART_ITEM_SELECT,
    });

    return {
      summary: this.computeSummary(rows),
      items: rows.map((row) => this.toCartItem(row)),
    };
  }

  /**
   * Adds the variant to the cart: a new line starts at quantity 1, an existing
   * line is incremented by 1 (both capped at stock). A brand-new line is refused
   * once the cart already holds `MAX_CART_ITEMS` distinct items.
   */
  async addToCart(
    userId: string,
    dto: AddCartItemDto,
  ): Promise<AddToCartResponse> {
    await this.assertActiveUser(userId);

    const cartId = await this.getOrCreateCartId(userId);
    const variant = await this.prisma.productVariant.findUnique({
      where: { product_variant_id: dto.product_variant_id },
      select: { stock: true, product: { select: { is_active: true } } },
    });

    if (!variant || !variant.product.is_active) {
      throw new BadRequestException(CartMessages.productUnavailable);
    }
    if (variant.stock <= 0) {
      throw new BadRequestException(CartMessages.outOfStock);
    }

    const whereKey = {
      cart_id_product_variant_id: {
        cart_id: cartId,
        product_variant_id: dto.product_variant_id,
      },
    };

    // Serialize the read → count/stock-check → write so two concurrent "new
    // line" adds can't both clear the 25-item cap (or the per-variant stock
    // ceiling) and overshoot it. The compound unique already blocks duplicate
    // lines; this guards the count-based limits.
    const item = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.cartItem.findUnique({
          where: whereKey,
          select: { quantity: true },
        });

        if (existing) {
          if (existing.quantity + 1 > variant.stock) {
            throw new BadRequestException(CartMessages.exceedsStock);
          }
          if (existing.quantity + 1 > MAX_CART_ITEM_QUANTITY) {
            throw new BadRequestException(CartMessages.maxQuantityReached);
          }
        } else {
          const lineCount = await tx.cartItem.count({
            where: { cart_id: cartId },
          });
          if (lineCount >= MAX_CART_ITEMS) {
            throw new BadRequestException(CartMessages.cartFull);
          }
        }

        return tx.cartItem.upsert({
          where: whereKey,
          create: {
            cart_id: cartId,
            product_variant_id: dto.product_variant_id,
            quantity: 1,
          },
          update: { quantity: { increment: 1 } },
          select: CART_ITEM_SELECT,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      item: this.toCartItem(item),
      summary: await this.loadSummary(cartId),
    };
  }

  /**
   * Sets a line's quantity. The line must belong to the caller's cart (else
   * 404). Quantity is bounded `1 ≤ q ≤ stock`; the lower bound is the DTO's
   * `@Min(1)`, the upper bound is checked here against current stock.
   */
  async updateItem(
    userId: string,
    cartItemId: string,
    dto: UpdateCartItemDto,
  ): Promise<UpdateCartResponse> {
    await this.assertActiveUser(userId);

    const cartId = await this.findCartId(userId);
    const existing = cartId
      ? await this.prisma.cartItem.findFirst({
          where: { cart_item_id: cartItemId, cart_id: cartId },
          select: { product_variant: { select: { stock: true } } },
        })
      : null;

    if (!existing || !cartId) {
      throw new NotFoundException(CartMessages.cartItemNotFound);
    }
    if (dto.quantity > existing.product_variant.stock) {
      throw new BadRequestException(CartMessages.exceedsStock);
    }

    // Scope the write by cart_id too: if the line is removed between the check
    // and the write, this resolves as a 404 rather than a Prisma P2025 (500).
    const updated = await this.prisma.cartItem.updateMany({
      where: { cart_item_id: cartItemId, cart_id: cartId },
      data: { quantity: dto.quantity },
    });
    if (updated.count === 0) {
      throw new NotFoundException(CartMessages.cartItemNotFound);
    }

    const item = await this.prisma.cartItem.findUnique({
      where: { cart_item_id: cartItemId },
      select: CART_ITEM_SELECT,
    });
    if (!item) {
      throw new NotFoundException(CartMessages.cartItemNotFound);
    }

    return {
      message: CartMessages.updateSuccess,
      item: this.toCartItem(item),
      summary: await this.loadSummary(cartId),
    };
  }

  /** Removes a line. The line must belong to the caller's cart (else 404). */
  async removeItem(
    userId: string,
    cartItemId: string,
  ): Promise<{ message: string }> {
    await this.assertActiveUser(userId);

    const cartId = await this.findCartId(userId);

    // Delete scoped by cart_id: ownership check + race-safety in one query — a
    // already-deleted line yields count 0 (→ 404), never a Prisma P2025 (500).
    const deleted = cartId
      ? await this.prisma.cartItem.deleteMany({
          where: { cart_item_id: cartItemId, cart_id: cartId },
        })
      : null;

    if (!deleted || deleted.count === 0) {
      throw new NotFoundException(CartMessages.cartItemNotFound);
    }

    return { message: CartMessages.removeSuccess };
  }

  // ----- Session / cart resolution -----

  /**
   * Re-verifies the active session before any read/write. A JWT can outlive a
   * logout or soft delete, so an inactive principal is rejected with 401.
   */
  private async assertActiveUser(userId: string): Promise<void> {
    const active = await this.authService.isUserActive(userId);
    if (!active) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }
  }

  /** The caller's cart id, or null if (defensively) none exists yet. */
  private async findCartId(userId: string): Promise<string | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { user_id: userId },
      select: { cart_id: true },
    });
    return cart?.cart_id ?? null;
  }

  /**
   * The caller's cart id, creating the cart if it is somehow missing. Every user
   * gets a cart at signup, so this only guards against an inconsistent state.
   */
  private async getOrCreateCartId(userId: string): Promise<string> {
    const cart = await this.prisma.cart.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
      select: { cart_id: true },
    });
    return cart.cart_id;
  }

  private async loadSummary(cartId: string): Promise<CartSummary> {
    const rows = await this.prisma.cartItem.findMany({
      where: { cart_id: cartId },
      select: SUMMARY_SELECT,
    });
    return this.computeSummary(rows);
  }

  // ----- Serialization / math helpers -----

  private emptySummary(): CartSummary {
    return {
      total_items: 0,
      total_price: '0.00',
      total_discount: '0.00',
      final_amount: '0.00',
    };
  }

  /**
   * Totals the cart with `Prisma.Decimal` (no float drift). The per-unit
   * discount is clamped to the price so `final_amount` never goes negative and
   * always equals Σ(final_price × qty).
   */
  private computeSummary(rows: SummaryRow[]): CartSummary {
    let totalItems = 0;
    let totalPrice = new Prisma.Decimal(0);
    let totalDiscount = new Prisma.Decimal(0);

    for (const row of rows) {
      const { price, discount } = row.product_variant;
      totalItems += row.quantity;
      totalPrice = totalPrice.plus(price.times(row.quantity));
      const unitDiscount = Prisma.Decimal.min(discount, price);
      totalDiscount = totalDiscount.plus(unitDiscount.times(row.quantity));
    }

    return {
      total_items: totalItems,
      total_price: totalPrice.toFixed(2),
      total_discount: totalDiscount.toFixed(2),
      final_amount: totalPrice.minus(totalDiscount).toFixed(2),
    };
  }

  private toCartItem(row: CartItemRow): CartItem {
    const variant = row.product_variant;
    return {
      cart_item_id: row.cart_item_id,
      product_variant_id: row.product_variant_id,
      product_name: variant.product.product_name,
      brand: variant.product.brand,
      description: variant.product.description,
      image_url: this.pickPrimaryImage(variant.images),
      price: variant.price.toFixed(2),
      discount: variant.discount.toFixed(2),
      final_price: Prisma.Decimal.max(
        0,
        variant.price.minus(variant.discount),
      ).toFixed(2),
      quantity: row.quantity,
      stock: variant.stock,
      attributes: this.asAttributeRecord(variant.attributes),
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
