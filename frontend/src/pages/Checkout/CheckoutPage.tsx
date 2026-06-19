import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import { toast } from "react-toastify";
import { Plus, Tag, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  applyCoupon,
  createPaymentIntent,
  fetchCheckoutSummary,
  removeCoupon,
} from "../../features/checkout/checkoutSlice";
import {
  addAddress,
  clearAddressErrors,
  fetchAddresses,
} from "../../features/address/addressSlice";
import { placeCodOrder } from "../../features/order/orderSlice";
import { fetchCart } from "../../features/cart/cartSlice";
import AddressForm from "../../components/Addresses/AddressForm";
import StripeCardForm from "./StripeCardForm";
import { stripePromise } from "../../services/stripe";
import { resolveImageUrl } from "../../utils/image";
import { formatMoney } from "../../utils/format";
import { CheckoutMessages } from "../../constants/messages.constant";
import type { CreateAddressRequest } from "../../types/address.types";
import type { CheckoutErrorResponse } from "../../types/checkout.types";
import styles from "./Checkout.module.css";

type PaymentMethod = "COD" | "CARD";

/** Red toast carrying the server's error message. */
function toastError(rejected: unknown): void {
  const payload = rejected as CheckoutErrorResponse | undefined;
  toast.error(payload?.message ?? CheckoutMessages.genericError);
}

function CheckoutPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { summary, loading, applyingCoupon, removingCoupon, creatingIntent, error } =
    useAppSelector((state) => state.checkout);
  const {
    items: addresses,
    saving: addressSaving,
    errors: addressErrors,
  } = useAppSelector((state) => state.address);
  const placing = useAppSelector((state) => state.order.placing);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [couponInput, setCouponInput] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchCheckoutSummary());
    void dispatch(fetchAddresses());
  }, [dispatch]);

  // The default address is pre-selected; an explicit pick overrides it. Derived
  // (not stored in an effect) so it stays correct as the list loads.
  const defaultAddressId =
    addresses.find((address) => address.is_default)?.address_id ??
    addresses[0]?.address_id ??
    null;
  const activeAddressId = selectedAddressId ?? defaultAddressId;

  /** Any change that affects the charged amount invalidates a created intent. */
  const invalidateIntent = () => setClientSecret(null);

  const selectAddress = (addressId: string) => {
    setSelectedAddressId(addressId);
    invalidateIntent();
  };

  const openAddForm = () => {
    dispatch(clearAddressErrors());
    setShowAddForm(true);
  };

  const handleAddAddress = (payload: CreateAddressRequest) => {
    void dispatch(addAddress(payload))
      .unwrap()
      .then((created) => {
        setShowAddForm(false);
        selectAddress(created.address_id);
        toast.success(CheckoutMessages.addressAdded);
      })
      .catch(toastError);
  };

  const handleApplyCoupon = () => {
    const code = couponInput.trim();
    if (!code) return;
    void dispatch(applyCoupon(code))
      .unwrap()
      .then(() => {
        setCouponInput("");
        invalidateIntent();
        toast.success(CheckoutMessages.couponApplied);
      })
      .catch(toastError);
  };

  const handleRemoveCoupon = () => {
    void dispatch(removeCoupon())
      .unwrap()
      .then(() => {
        invalidateIntent();
        toast.success(CheckoutMessages.couponRemoved);
      })
      .catch(toastError);
  };

  const handlePlaceCod = () => {
    if (!activeAddressId) return;
    void dispatch(placeCodOrder(activeAddressId))
      .unwrap()
      .then((order) => {
        void dispatch(fetchCart()); // reset the navbar badge
        toast.success(CheckoutMessages.orderPlaced);
        navigate(`/orders/${order.order_id}`);
      })
      .catch(toastError);
  };

  const handleProceedToPayment = () => {
    if (!activeAddressId) return;
    void dispatch(createPaymentIntent(activeAddressId))
      .unwrap()
      .then((intent) => setClientSecret(intent.client_secret))
      .catch(toastError);
  };

  const handlePaymentSucceeded = () => {
    void dispatch(fetchCart());
    toast.success(CheckoutMessages.paymentProcessing);
    navigate("/orders");
  };

  const switchPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    invalidateIntent();
  };

  if (loading && !summary) {
    return <p className={styles.status}>{CheckoutMessages.loading}</p>;
  }
  if (error && !summary) {
    return <p className={`${styles.status} ${styles.error}`}>{error}</p>;
  }
  if (!summary) {
    return null;
  }

  const purchasable = summary.total_items > 0;
  if (!purchasable) {
    return (
      <div className={styles.emptyState}>
        <h1 className={styles.emptyTitle}>{CheckoutMessages.emptyTitle}</h1>
        <p className={styles.emptyBody}>{CheckoutMessages.emptyBody}</p>
        <button
          type="button"
          className={styles.emptyCta}
          onClick={() => navigate("/cart")}
        >
          {CheckoutMessages.emptyCta}
        </button>
      </div>
    );
  }

  const { personal, applied_coupon } = summary;
  const canPlace = Boolean(activeAddressId) && purchasable;
  const couponDiscount = Number(summary.coupon_discount);
  const shippingFee = Number(summary.shipping_fee);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{CheckoutMessages.heading}</h1>

      <div className={styles.layout}>
        {/* ---------- INFORMATION column ---------- */}
        <section className={styles.information}>
          <div className={styles.informationBar}>
            {CheckoutMessages.informationBar}
          </div>

          {/* Personal information (read-only, from the profile) */}
          <div className={styles.card}>
            <h2 className={styles.cardHeading}>
              {CheckoutMessages.personalHeading}
            </h2>
            <div className={styles.personalGrid}>
              <div className={styles.readField}>
                <span className={styles.readLabel}>
                  {CheckoutMessages.firstName}
                </span>
                <span className={styles.readValue}>{personal.first_name}</span>
              </div>
              <div className={styles.readField}>
                <span className={styles.readLabel}>
                  {CheckoutMessages.lastName}
                </span>
                <span className={styles.readValue}>{personal.last_name}</span>
              </div>
              <div className={styles.readField}>
                <span className={styles.readLabel}>
                  {CheckoutMessages.phone}
                </span>
                <span className={styles.readValue}>{personal.phone ?? "—"}</span>
              </div>
              <div className={styles.readField}>
                <span className={styles.readLabel}>
                  {CheckoutMessages.email}
                </span>
                <span className={styles.readValue}>{personal.email}</span>
              </div>
            </div>
          </div>

          {/* Shipping information (address picker + inline add) */}
          <div className={styles.card}>
            <h2 className={styles.cardHeading}>
              {CheckoutMessages.shippingHeading}
            </h2>

            {showAddForm ? (
              <AddressForm
                mode="add"
                saving={addressSaving}
                errors={addressErrors}
                onSubmit={handleAddAddress}
                onCancel={() => setShowAddForm(false)}
              />
            ) : (
              <>
                <div className={styles.addressList}>
                  {addresses.map((address) => {
                    const selected = address.address_id === activeAddressId;
                    return (
                      <button
                        type="button"
                        key={address.address_id}
                        className={`${styles.addressCard} ${selected ? styles.addressSelected : ""}`}
                        aria-pressed={selected}
                        onClick={() => selectAddress(address.address_id)}
                      >
                        <span className={styles.addressBadge}>
                          {address.address_type} {CheckoutMessages.addressBadge}
                        </span>
                        <span className={styles.addressBody}>
                          <span className={styles.addressLine1}>
                            {address.line1}
                          </span>
                          {address.line2 && <span>{address.line2}</span>}
                          <span className={styles.addressCity}>
                            {address.city.toUpperCase()}
                          </span>
                          <span>{address.zip}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {addresses.length === 0 && (
                  <p className={styles.muted}>{CheckoutMessages.noAddress}</p>
                )}

                <button
                  type="button"
                  className={styles.addAddressBtn}
                  onClick={openAddForm}
                >
                  <Plus size={16} aria-hidden="true" />
                  {CheckoutMessages.addAddress}
                </button>
              </>
            )}
          </div>

          {/* Payment method */}
          <div className={styles.card}>
            <h2 className={styles.cardHeading}>
              {CheckoutMessages.paymentHeading}
            </h2>

            <label
              className={`${styles.payOption} ${paymentMethod === "COD" ? styles.payOptionActive : ""}`}
            >
              <span className={styles.payLabel}>{CheckoutMessages.cod}</span>
              <input
                type="radio"
                name="payment-method"
                value="COD"
                checked={paymentMethod === "COD"}
                onChange={() => switchPaymentMethod("COD")}
              />
            </label>

            <label
              className={`${styles.payOption} ${paymentMethod === "CARD" ? styles.payOptionActive : ""}`}
            >
              <span className={styles.payLabel}>{CheckoutMessages.card}</span>
              <input
                type="radio"
                name="payment-method"
                value="CARD"
                checked={paymentMethod === "CARD"}
                onChange={() => switchPaymentMethod("CARD")}
              />
            </label>

            {paymentMethod === "CARD" && clientSecret && (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret }}
                key={clientSecret}
              >
                <StripeCardForm
                  returnUrl={`${window.location.origin}/orders`}
                  onSucceeded={handlePaymentSucceeded}
                  onError={(message) => toast.error(message)}
                />
              </Elements>
            )}
          </div>

          {/* Primary action */}
          {paymentMethod === "COD" ? (
            <button
              type="button"
              className={styles.placeButton}
              disabled={!canPlace || placing}
              onClick={handlePlaceCod}
            >
              {CheckoutMessages.placeOrderCod}
            </button>
          ) : (
            !clientSecret && (
              <button
                type="button"
                className={styles.placeButton}
                disabled={!canPlace || creatingIntent}
                onClick={handleProceedToPayment}
              >
                {CheckoutMessages.proceedToPayment}
              </button>
            )
          )}
        </section>

        {/* ---------- SHOPPING BAG column ---------- */}
        <aside className={styles.bag}>
          <h2 className={styles.bagHeading}>{CheckoutMessages.bagHeading}</h2>

          <ul className={styles.bagItems}>
            {summary.items.map((item) => {
              const image = resolveImageUrl(item.image_url);
              return (
                <li key={item.cart_item_id} className={styles.bagItem}>
                  <div className={styles.bagImageWrap}>
                    {image ? (
                      <img
                        src={image}
                        alt={item.product_name}
                        className={styles.bagImage}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.bagImagePlaceholder} aria-hidden="true" />
                    )}
                    {item.out_of_stock && (
                      <span className={styles.outOfStockOverlay}>
                        {CheckoutMessages.outOfStock}
                      </span>
                    )}
                  </div>
                  <div className={styles.bagBody}>
                    <p className={styles.bagName}>{item.product_name}</p>
                    <p className={styles.bagBrand}>{item.brand}</p>
                    <div className={styles.bagAttributes}>
                      {Object.entries(item.attributes).map(([key, value]) => (
                        <span key={key} className={styles.bagAttribute}>
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                    <p className={styles.bagPrice}>
                      {formatMoney(item.final_price)}
                      {item.quantity > 1 && (
                        <span className={styles.bagQty}> × {item.quantity}</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Promo code */}
          {applied_coupon ? (
            <div className={styles.couponApplied}>
              <Tag size={14} aria-hidden="true" />
              <span className={styles.couponCode}>{applied_coupon.code}</span>
              <button
                type="button"
                className={styles.couponRemove}
                aria-label={CheckoutMessages.remove}
                disabled={removingCoupon}
                onClick={handleRemoveCoupon}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className={styles.couponRow}>
              <input
                className={styles.couponInput}
                type="text"
                value={couponInput}
                placeholder={CheckoutMessages.promoPlaceholder}
                aria-label={CheckoutMessages.promoPlaceholder}
                onChange={(event) => setCouponInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleApplyCoupon();
                  }
                }}
              />
              <button
                type="button"
                className={styles.couponApplyBtn}
                disabled={applyingCoupon || couponInput.trim().length === 0}
                onClick={handleApplyCoupon}
              >
                {CheckoutMessages.apply}
              </button>
            </div>
          )}

          {/* Totals */}
          <div className={styles.bagTotals}>
            <div className={styles.bagRow}>
              <span>{CheckoutMessages.shippingFee}</span>
              <span>
                {shippingFee > 0
                  ? formatMoney(summary.shipping_fee)
                  : CheckoutMessages.free}
              </span>
            </div>
            {couponDiscount > 0 && (
              <div className={styles.bagRow}>
                <span>{CheckoutMessages.discount}</span>
                <span className={styles.discountValue}>
                  −{formatMoney(summary.coupon_discount)}
                </span>
              </div>
            )}
            <div className={`${styles.bagRow} ${styles.bagTotalRow}`}>
              <span>{CheckoutMessages.total}</span>
              <span>{formatMoney(summary.total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default CheckoutPage;
