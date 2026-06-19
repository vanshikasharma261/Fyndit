import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../generated/prisma/enums';
import { AddressResponse } from '../../address/types/address.types';

/**
 * Response contracts for the Order module. Money fields are 2-decimal strings.
 * `order_number` is a short, display-friendly code derived from `order_id` (no
 * dedicated column); item brand/image/attributes are read live from the variant
 * (only product name + purchase price are snapshotted on the order item).
 */

/** One row in the paginated order history — the order's representative item. */
export interface OrderListItem {
  order_id: string;
  /** Display code, e.g. "#A2224894" (first 8 hex chars of order_id). */
  order_number: string;
  product_name: string;
  brand: string;
  image_url: string | null;
  attributes: Record<string, string>;
  /** Number of distinct line items in the order. */
  item_count: number;
  total_amount: string;
  status: OrderStatus;
  /** ISO timestamp. */
  created_at: string;
  /** Whether the order is still within the cancellable window. */
  can_cancel: boolean;
}

export interface OrderItemView {
  order_item_id: string;
  product_name: string;
  brand: string;
  image_url: string | null;
  attributes: Record<string, string>;
  purchase_price: string;
  quantity: number;
  /** purchase_price × quantity. */
  line_total: string;
}

export interface OrderDetail {
  order_id: string;
  order_number: string;
  created_at: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  sub_total: string;
  coupon_discount: string;
  shipping_fee: string;
  total_amount: string;
  shipping_address: AddressResponse;
  items: OrderItemView[];
  can_cancel: boolean;
}

export interface OrderListMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface OrderListResponse {
  orders: OrderListItem[];
  meta: OrderListMeta;
}
