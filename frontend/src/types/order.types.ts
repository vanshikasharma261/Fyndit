/**
 * Order API contracts, shared between the order slice, thunks, service and the
 * Orders/OrderDetail pages. Mirror the backend `009-checkout-order` payloads
 * exactly. Money fields are 2-decimal strings.
 */

import type { ErrorResponse, ValidationErrorResponse } from "./auth.types";
import type { AddressResponse } from "./address.types";

export type { OrderStatus } from "../ui";

export type PaymentMethod = "COD" | "STRIPE";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface OrderListItem {
  order_id: string;
  order_number: string;
  product_name: string;
  brand: string;
  image_url: string | null;
  attributes: Record<string, string>;
  item_count: number;
  total_amount: string;
  status: OrderStatus;
  created_at: string;
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

/** `GET /order`. */
export interface OrderListResponse {
  orders: OrderListItem[];
  meta: OrderListMeta;
}

/** `PATCH /order/:id/cancel`. */
export interface CancelOrderResponse {
  message: string;
}

/** Union accepted by every order thunk's `rejectValue`. */
export type OrderErrorResponse = ValidationErrorResponse | ErrorResponse;
