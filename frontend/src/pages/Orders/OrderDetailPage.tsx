import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  cancelOrder,
  clearOrderDetail,
  fetchOrderDetail,
} from "../../features/order/orderSlice";
import { resolveImageUrl } from "../../utils/image";
import { formatMoney, formatOrderDate } from "../../utils/format";
import { OrderMessages } from "../../constants/messages.constant";
import type { OrderErrorResponse } from "../../types/order.types";
import { StatusBadge, Timeline } from "../../ui";
import { buildOrderTimeline } from "./orderTimeline";
import styles from "./Orders.module.css";

function toastError(rejected: unknown): void {
  const payload = rejected as OrderErrorResponse | undefined;
  toast.error(payload?.message ?? OrderMessages.genericError);
}

function OrderDetailPage() {
  const dispatch = useAppDispatch();
  const { orderId } = useParams<{ orderId: string }>();
  const { detail, detailLoading, error, cancellingId } = useAppSelector(
    (state) => state.order,
  );

  useEffect(() => {
    if (orderId) {
      void dispatch(fetchOrderDetail(orderId));
    }
    return () => {
      dispatch(clearOrderDetail());
    };
  }, [dispatch, orderId]);

  if (detailLoading && !detail) {
    return <p className={styles.status}>{OrderMessages.loading}</p>;
  }
  if (error && !detail) {
    return <p className={`${styles.status} ${styles.error}`}>{error}</p>;
  }
  if (!detail) {
    return <p className={styles.status}>{OrderMessages.notFound}</p>;
  }

  const paymentLabel =
    detail.payment_method === "COD" ? OrderMessages.cod : OrderMessages.card;
  const address = detail.shipping_address;
  const busy = cancellingId === detail.order_id;
  const couponDiscount = Number(detail.coupon_discount);
  const shippingFee = Number(detail.shipping_fee);

  const handleCancel = () => {
    void dispatch(cancelOrder(detail.order_id))
      .unwrap()
      .then(() => {
        toast.success(OrderMessages.cancelSuccess);
        void dispatch(fetchOrderDetail(detail.order_id));
      })
      .catch(toastError);
  };

  return (
    <div className={styles.detailPage}>
      <div className={styles.detailHeadRow}>
        <h1 className={styles.heading}>{OrderMessages.detailHeading}</h1>
        <Link to="/orders" className={styles.backLink}>
          ← {OrderMessages.historyHeading}
        </Link>
      </div>

      {/* Summary header */}
      <div className={styles.detailHeader}>
        <div className={styles.headerCell}>
          <span className={styles.headerLabel}>{OrderMessages.orderDate}</span>
          <span className={styles.headerValue}>
            {formatOrderDate(detail.created_at)}
          </span>
        </div>
        <div className={styles.headerCell}>
          <span className={styles.headerLabel}>{OrderMessages.orderId}</span>
          <span className={styles.headerValue}>{detail.order_number}</span>
        </div>
        <div className={styles.headerCell}>
          <span className={styles.headerLabel}>
            {OrderMessages.paymentMethod}
          </span>
          <span className={styles.headerValue}>{paymentLabel}</span>
        </div>
        <div className={styles.headerCell}>
          <span className={styles.headerLabel}>{OrderMessages.status}</span>
          <StatusBadge status={detail.status} />
        </div>
      </div>

      {/* Status timeline */}
      <div className={styles.timelineCard}>
        <span className={styles.timelineLabel}>{OrderMessages.orderStatus}</span>
        <Timeline
          steps={buildOrderTimeline(detail.status, detail.created_at)}
          ariaLabel="Order progress"
        />
      </div>

      {/* Items */}
      <div className={styles.itemsCard}>
        {detail.items.map((item) => {
          const image = resolveImageUrl(item.image_url);
          return (
            <div key={item.order_item_id} className={styles.detailItem}>
              <div className={styles.detailThumbWrap}>
                {image ? (
                  <img
                    src={image}
                    alt={item.product_name}
                    className={styles.detailThumb}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.thumbPlaceholder} aria-hidden="true" />
                )}
              </div>
              <div className={styles.detailItemBody}>
                <span className={styles.productName}>{item.product_name}</span>
                <span className={styles.productBrand}>{item.brand}</span>
                <div className={styles.attributes}>
                  {Object.entries(item.attributes).map(([key, value]) => (
                    <span key={key}>
                      {key}: <strong>{value}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.detailItemRight}>
                <span className={styles.qtyChip}>
                  {OrderMessages.qty} {item.quantity}
                </span>
                <span className={styles.lineTotal}>
                  {formatMoney(item.line_total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.detailFooter}>
        {/* Shipping address */}
        <div className={styles.footerCard}>
          <h2 className={styles.footerHeading}>{OrderMessages.shippingTo}</h2>
          <p className={styles.addressBadge}>{address.address_type}</p>
          <p className={styles.addressText}>{address.line1}</p>
          {address.line2 && <p className={styles.addressText}>{address.line2}</p>}
          <p className={styles.addressText}>
            {address.city}, {address.state}
          </p>
          <p className={styles.addressText}>
            {address.country} — {address.zip}
          </p>
        </div>

        {/* Totals */}
        <div className={styles.footerCard}>
          <div className={styles.totalRow}>
            <span>{OrderMessages.subtotal}</span>
            <span>{formatMoney(detail.sub_total)}</span>
          </div>
          {couponDiscount > 0 && (
            <div className={styles.totalRow}>
              <span>{OrderMessages.discount}</span>
              <span className={styles.discountValue}>
                −{formatMoney(detail.coupon_discount)}
              </span>
            </div>
          )}
          <div className={styles.totalRow}>
            <span>{OrderMessages.shipping}</span>
            <span>
              {shippingFee > 0 ? formatMoney(detail.shipping_fee) : "Free"}
            </span>
          </div>
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <span>{OrderMessages.total}</span>
            <span>{formatMoney(detail.total_amount)}</span>
          </div>

          {detail.can_cancel && (
            <button
              type="button"
              className={styles.cancelDetailBtn}
              disabled={busy}
              onClick={handleCancel}
            >
              {OrderMessages.cancel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderDetailPage;
