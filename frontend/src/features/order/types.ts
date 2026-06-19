import type {
  OrderDetail,
  OrderListItem,
  OrderListMeta,
} from "../../types/order.types";

/**
 * Order slice state. Operational feedback (placed / cancelled / errors) is
 * surfaced as a toast by the dispatching component via `.unwrap()`; the slice
 * owns data + busy flags only.
 */
export interface OrderState {
  /** Order history list + its pagination meta. */
  list: OrderListItem[];
  meta: OrderListMeta | null;
  /** The currently viewed order detail. */
  detail: OrderDetail | null;
  /** `GET /order` (history) in flight. */
  loading: boolean;
  /** `GET /order/:id` (detail) in flight. */
  detailLoading: boolean;
  /** A COD placement is in flight. */
  placing: boolean;
  /** order_id whose cancellation is in flight. */
  cancellingId: string | null;
  /** History/detail load failure. */
  error: string | null;
}
