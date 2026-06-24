import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { cancelOrder, fetchOrders } from "../../features/order/orderSlice";
import Pagination from "../../components/Pagination/Pagination";
import { resolveImageUrl } from "../../utils/image";
import { formatMoney, formatOrderDate } from "../../utils/format";
import { OrderMessages } from "../../constants/messages.constant";
import type { OrderErrorResponse } from "../../types/order.types";
import { StatusBadge } from "../../ui";
import styles from "./Orders.module.css";

function toastError(rejected: unknown): void {
  const payload = rejected as OrderErrorResponse | undefined;
  toast.error(payload?.message ?? OrderMessages.genericError);
}

function OrdersPage() {
  const dispatch = useAppDispatch();
  const { list, meta, loading, error, cancellingId } = useAppSelector(
    (state) => state.order,
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    void dispatch(fetchOrders(page));
  }, [dispatch, page]);

  const handleCancel = (orderId: string) => {
    void dispatch(cancelOrder(orderId))
      .unwrap()
      .then(() => {
        toast.success(OrderMessages.cancelSuccess);
        void dispatch(fetchOrders(page));
      })
      .catch(toastError);
  };

  if (loading && list.length === 0) {
    return <p className={styles.status}>{OrderMessages.loading}</p>;
  }
  if (error && list.length === 0) {
    return <p className={`${styles.status} ${styles.error}`}>{error}</p>;
  }
  if (list.length === 0) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>{OrderMessages.empty}</h1>
        <Link to="/" className={styles.emptyCta}>
          {OrderMessages.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{OrderMessages.historyHeading}</h1>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{OrderMessages.colProduct}</th>
              <th scope="col">{OrderMessages.colOrderId}</th>
              <th scope="col">{OrderMessages.colDate}</th>
              <th scope="col">{OrderMessages.colTotal}</th>
              <th scope="col">{OrderMessages.colStatus}</th>
              <th scope="col">{OrderMessages.colAttributes}</th>
              <th scope="col">{OrderMessages.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((order) => {
              const image = resolveImageUrl(order.image_url);
              const busy = cancellingId === order.order_id;
              return (
                <tr key={order.order_id}>
                  <td>
                    <div className={styles.product}>
                      <div className={styles.thumbWrap}>
                        {image ? (
                          <img
                            src={image}
                            alt={order.product_name}
                            className={styles.thumb}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.thumbPlaceholder} aria-hidden="true" />
                        )}
                      </div>
                      <div className={styles.productMeta}>
                        <span className={styles.productName}>
                          {order.product_name}
                        </span>
                        <span className={styles.productBrand}>{order.brand}</span>
                        {order.item_count > 1 && (
                          <span className={styles.moreItems}>
                            {OrderMessages.moreItems(order.item_count - 1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={styles.orderId}>{order.order_number}</td>
                  <td>{formatOrderDate(order.created_at)}</td>
                  <td className={styles.total}>
                    {formatMoney(order.total_amount)}
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td>
                    <div className={styles.attributes}>
                      {Object.entries(order.attributes).map(([key, value]) => (
                        <span key={key}>
                          {key}: <strong>{value}</strong>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link
                        to={`/orders/${order.order_id}`}
                        className={styles.viewBtn}
                      >
                        {OrderMessages.view}
                      </Link>
                      {order.can_cancel && (
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          disabled={busy}
                          onClick={() => handleCancel(order.order_id)}
                        >
                          {OrderMessages.cancel}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {meta && (
          <div className={styles.paginationWrap}>
            <Pagination
              pageCount={meta.total_pages}
              currentPage={meta.page}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default OrdersPage;
