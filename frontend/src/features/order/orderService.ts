import { ConfigMessages } from "../../constants/messages.constant";
import type {
  CancelOrderResponse,
  OrderDetail,
  OrderErrorResponse,
  OrderListResponse,
} from "../../types/order.types";

/**
 * Order API integration. All network logic lives here (frontend rules); slices
 * call these functions, components never do. Every request sends
 * `credentials: "include"` for the HTTP-only auth cookie.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error(ConfigMessages.missingApiUrl);
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | OrderErrorResponse;
}

type Method = "GET" | "POST" | "PATCH";

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json()) as T | OrderErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

export const orderService = {
  /** Place a Cash-on-Delivery order against the chosen address. */
  placeCod: (addressId: string) =>
    request<OrderDetail>("POST", "/order", { address_id: addressId }),

  /** Paginated order history. */
  list: (page: number) =>
    request<OrderListResponse>(
      "GET",
      `/order?page=${encodeURIComponent(String(page))}`,
    ),

  /** A single order's detail. */
  detail: (orderId: string) =>
    request<OrderDetail>("GET", `/order/${encodeURIComponent(orderId)}`),

  /** Cancel an eligible order (COD synchronous; paid → refund initiated). */
  cancel: (orderId: string) =>
    request<CancelOrderResponse>(
      "PATCH",
      `/order/${encodeURIComponent(orderId)}/cancel`,
    ),
};
