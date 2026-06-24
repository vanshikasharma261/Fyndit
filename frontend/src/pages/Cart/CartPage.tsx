import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Lock, Minus, Plus, ShoppingCart, Tag, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button, EmptyState } from "../../ui";
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

/** Centered empty state, built on the design-system `EmptyState` primitive. */
function EmptyCart() {
  const navigate = useNavigate();
  return (
    <EmptyState
      art={<ShoppingCart size={64} strokeWidth={1.5} />}
      title={CartMessages.empty}
      description={CartMessages.emptyBody}
      action={
        <Button onClick={() => navigate("/product/All")}>
          {CartMessages.emptyCta}
        </Button>
      }
    />
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
