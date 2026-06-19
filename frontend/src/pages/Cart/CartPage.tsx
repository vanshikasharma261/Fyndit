import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Lock, Minus, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  fetchCart,
  removeCartItem,
  updateCartItem,
} from "../../features/cart/cartSlice";
import { resolveImageUrl } from "../../utils/image";
import { formatPrice } from "../../utils/format";
import { CartMessages } from "../../constants/messages.constant";
import type { CartErrorResponse, CartItem } from "../../types/cart.types";
import styles from "./Cart.module.css";

/** Red toast carrying the server's error message (stock / cart-full / etc.). */
function toastError(rejected: unknown): void {
  const payload = rejected as CartErrorResponse | undefined;
  toast.error(payload?.message ?? CartMessages.genericError);
}

/** Centered empty state (matches `empty_cart_ui.png`). */
function EmptyCart() {
  return (
    <div className={styles.empty}>
      <h1 className={styles.emptyTitle}>{CartMessages.empty}</h1>
      <svg
        className={styles.emptyArt}
        viewBox="0 0 240 200"
        role="img"
        aria-label="An empty shopping cart"
      >
        {/* Sparkles */}
        <g
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M44 60 v10 M39 65 h10" />
          <path d="M206 92 v8 M202 96 h8" />
          <path d="M150 26 v8 M146 30 h8" />
        </g>

        {/* Trolley */}
        <g
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* handle */}
          <path d="M26 56 H40 L52 74" />
          {/* basket */}
          <path d="M52 74 H188 L168 134 H86 Z" />
          {/* legs to wheels */}
          <path d="M86 134 L96 150 M168 134 L156 150" />
        </g>

        {/* basket grid (lighter) */}
        <g
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M64 102 H176" />
          <path d="M92 74 L88 134 M124 74 L122 134 M156 74 L156 134" />
        </g>

        {/* wheels */}
        <g fill="var(--color-text-muted)">
          <circle cx="100" cy="160" r="9" />
          <circle cx="152" cy="160" r="9" />
        </g>

        {/* X badge */}
        <circle
          cx="190"
          cy="52"
          r="20"
          fill="var(--color-surface-card)"
          stroke="var(--color-accent)"
          strokeWidth="3"
        />
        <path
          d="M182 44 l16 16 M198 44 l-16 16"
          stroke="var(--color-accent)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function CartPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { items, summary, loading, error, mutatingId } = useAppSelector(
    (state) => state.cart,
  );

  useEffect(() => {
    void dispatch(fetchCart());
  }, [dispatch]);

  // No global `mutatingId` guard: a busy line's own controls are disabled via
  // `disabled={busy}`, so other lines stay independently interactive.
  const handleQuantity = (item: CartItem, next: number) => {
    if (next < 1 || next > item.stock || next === item.quantity) return;
    void dispatch(updateCartItem({ cartItemId: item.cart_item_id, quantity: next }))
      .unwrap()
      .catch(toastError);
  };

  const handleRemove = (cartItemId: string) => {
    void dispatch(removeCartItem(cartItemId)).unwrap().catch(toastError);
  };

  if (loading && items.length === 0) {
    return <p className={styles.status}>{CartMessages.loading}</p>;
  }

  if (error && items.length === 0) {
    return <p className={`${styles.status} ${styles.error}`}>{error}</p>;
  }

  if (items.length === 0) {
    return <EmptyCart />;
  }

  const savings = summary ? Number(summary.total_discount) : 0;

  return (
    <div className={styles.page}>
      {/* ----- Items ----- */}
      <section className={styles.items}>
        <h1 className={styles.heading}>{CartMessages.heading}</h1>

        {items.map((item) => {
          const image = resolveImageUrl(item.image_url);
          const discountPercent =
            Number(item.price) > 0
              ? Math.round((Number(item.discount) / Number(item.price)) * 100)
              : 0;
          const inStock = item.stock > 0;
          const busy = mutatingId === item.cart_item_id;
          const attributePairs = Object.entries(item.attributes);

          return (
            <article key={item.cart_item_id} className={styles.itemCard}>
              <div className={styles.itemMain}>
                <div className={styles.itemImageWrap}>
                  {image ? (
                    <img
                      src={image}
                      alt={item.product_name}
                      className={styles.itemImage}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className={styles.imagePlaceholder}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className={styles.itemBody}>
                <h2 className={styles.itemName}>{item.product_name}</h2>
                <p className={styles.itemBrand}>{item.brand}</p>
                <p className={styles.itemDescription}>{item.description}</p>

                {attributePairs.length > 0 && (
                  <div className={styles.attributes}>
                    {attributePairs.map(([key, value]) => (
                      <span key={key} className={styles.attribute}>
                        {key}:{value}
                      </span>
                    ))}
                  </div>
                )}

                <div className={styles.priceRow}>
                  {discountPercent > 0 && (
                    <span className={styles.discount}>
                      <ArrowDown size={14} aria-hidden="true" />
                      {discountPercent}%
                    </span>
                  )}
                  {discountPercent > 0 && (
                    <span className={styles.strikePrice}>
                      {formatPrice(item.price)}
                    </span>
                  )}
                  <span className={styles.finalPrice}>
                    {formatPrice(item.final_price)}
                  </span>
                </div>

                <p
                  className={`${styles.stock} ${inStock ? styles.inStock : styles.outOfStock}`}
                >
                  {inStock ? CartMessages.inStock : CartMessages.outOfStock}
                </p>

                <div className={styles.controls}>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      aria-label="Increase quantity"
                      disabled={busy || item.quantity >= item.stock}
                      onClick={() => handleQuantity(item, item.quantity + 1)}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                    <span
                      className={styles.quantity}
                      aria-label={`Quantity: ${item.quantity}`}
                    >
                      {item.quantity}
                    </span>
                    {item.quantity <= 1 ? (
                      <button
                        type="button"
                        className={`${styles.stepperButton} ${styles.stepperDelete}`}
                        aria-label="Remove item"
                        disabled={busy}
                        onClick={() => handleRemove(item.cart_item_id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.stepperButton}
                        aria-label="Decrease quantity"
                        disabled={busy}
                        onClick={() => handleQuantity(item, item.quantity - 1)}
                      >
                        <Minus size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <span className={styles.deliveryNote}>
                    {CartMessages.deliveryNote}
                  </span>
                </div>
                </div>
              </div>

              <div className={styles.removeRow}>
                <button
                  type="button"
                  className={styles.removeButton}
                  disabled={busy}
                  onClick={() => handleRemove(item.cart_item_id)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {CartMessages.removeItem}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* ----- Summary ----- */}
      {summary && (
        <aside className={styles.summary}>
          <div className={styles.summaryCard}>
            <h2 className={styles.summaryHeading}>{CartMessages.priceDetails}</h2>

            <div className={styles.summaryRow}>
              <span>Price</span>
              <span>{formatPrice(summary.total_price)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Discount</span>
              <span className={styles.discountValue}>
                −{formatPrice(summary.total_discount)}
              </span>
            </div>
            <div className={`${styles.summaryRow} ${styles.totalRow}`}>
              <span>Total Amount</span>
              <span>{formatPrice(summary.final_amount)}</span>
            </div>

            {savings > 0 && (
              <p className={styles.savings}>
                <Tag size={14} aria-hidden="true" className={styles.savingsIcon} />
                You will save {formatPrice(summary.total_discount)} on this order!
              </p>
            )}
          </div>

          <p className={styles.trust}>
            <Lock size={13} aria-hidden="true" className={styles.trustIcon} />
            {CartMessages.trust}
          </p>

          <div className={styles.checkoutCard}>
            <div className={styles.checkoutTotals}>
              {Number(summary.total_discount) > 0 && (
                <span className={styles.checkoutStrike}>
                  {formatPrice(summary.total_price)}
                </span>
              )}
              <span className={styles.checkoutTotal}>
                {formatPrice(summary.final_amount)}
              </span>
            </div>
            <button
              type="button"
              className={styles.checkoutButton}
              onClick={() => navigate("/checkout")}
            >
              {CartMessages.checkout}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

export default CartPage;
