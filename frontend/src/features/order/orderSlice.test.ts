import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import orderReducer, {
  placeCodOrder,
  fetchOrders,
  fetchOrderDetail,
  cancelOrder,
  clearOrderDetail,
} from "./orderSlice";
import type { OrderState } from "./types";
import type {
  OrderDetail,
  OrderListItem,
  OrderListResponse,
} from "../../types/order.types";

// ---- Mock order service so no real fetch happens ----
vi.mock("./orderService", () => ({
  orderService: {
    placeCod: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    cancel: vi.fn(),
  },
}));

// ---- Mock auth slice to prevent cross-slice import issues ----
vi.mock("../auth/authSlice", () => ({
  logoutUser: {
    fulfilled: { match: () => false, type: "auth/logout/fulfilled" },
    type: "auth/logout",
  },
  sessionExpired: Object.assign(() => ({ type: "auth/sessionExpired" }), {
    type: "auth/sessionExpired",
    match: (action: { type: string }) => action.type === "auth/sessionExpired",
  }),
}));

// ---- Mock user slice to prevent cross-slice import issues ----
vi.mock("../user/userSlice", () => ({
  deleteUser: {
    fulfilled: { match: () => false, type: "user/delete/fulfilled" },
    type: "user/delete",
  },
}));

import { orderService } from "./orderService";

const mockOrderService = orderService as {
  placeCod: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

// ---- Test fixtures ----

const mockAddress = {
  address_id: "addr-1",
  address_type: "HOME" as const,
  line1: "123 Main St",
  line2: null,
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  zip: "400001",
  is_default: true,
};

const mockOrderDetail: OrderDetail = {
  order_id: "order-uuid-1",
  order_number: "#A2224894",
  created_at: "2026-06-01T10:00:00.000Z",
  status: "PENDING",
  payment_method: "COD",
  payment_status: "PENDING",
  sub_total: "1300.00",
  coupon_discount: "0.00",
  shipping_fee: "100.00",
  total_amount: "1400.00",
  shipping_address: mockAddress,
  items: [
    {
      order_item_id: "oi-1",
      product_name: "Wireless Headphones",
      brand: "SoundMax",
      image_url: "/assets/products/headphones/black/1.jpg",
      attributes: { color: "Black" },
      purchase_price: "1300.00",
      quantity: 1,
      line_total: "1300.00",
    },
  ],
  can_cancel: true,
};

const mockListItem: OrderListItem = {
  order_id: "order-uuid-1",
  order_number: "#A2224894",
  product_name: "Wireless Headphones",
  brand: "SoundMax",
  image_url: "/assets/products/headphones/black/1.jpg",
  attributes: { color: "Black" },
  item_count: 1,
  total_amount: "1400.00",
  status: "PENDING",
  created_at: "2026-06-01T10:00:00.000Z",
  can_cancel: true,
};

const mockListItem2: OrderListItem = {
  order_id: "order-uuid-2",
  order_number: "#B3335005",
  product_name: "Running Shoes",
  brand: "SpeedRun",
  image_url: null,
  attributes: { size: "42" },
  item_count: 1,
  total_amount: "2500.00",
  status: "DELIVERED",
  created_at: "2026-05-15T14:00:00.000Z",
  can_cancel: false,
};

const mockListResponse: OrderListResponse = {
  orders: [mockListItem, mockListItem2],
  meta: {
    page: 1,
    limit: 10,
    total: 2,
    total_pages: 1,
  },
};

function makeStore(preloaded?: Partial<OrderState>) {
  return configureStore({
    reducer: { order: orderReducer },
    preloadedState: preloaded ? { order: preloaded as OrderState } : undefined,
  });
}

// ---- Initial state ----

describe("orderSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().order;

    expect(state.list).toEqual([]);
    expect(state.meta).toBeNull();
    expect(state.detail).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.detailLoading).toBe(false);
    expect(state.placing).toBe(false);
    expect(state.cancellingId).toBeNull();
    expect(state.error).toBeNull();
  });
});

// ---- clearOrderDetail reducer ----

describe("orderSlice — clearOrderDetail reducer", () => {
  it("clears detail and error when dispatched", () => {
    const store = makeStore({
      list: [],
      meta: null,
      detail: mockOrderDetail,
      loading: false,
      detailLoading: false,
      placing: false,
      cancellingId: null,
      error: "some error",
    });

    store.dispatch(clearOrderDetail());

    const state = store.getState().order;
    expect(state.detail).toBeNull();
    expect(state.error).toBeNull();
  });

  it("is a no-op when detail is already null", () => {
    const store = makeStore();
    store.dispatch(clearOrderDetail());
    expect(store.getState().order.detail).toBeNull();
  });
});

// ---- placeCodOrder thunk ----

describe("orderSlice — placeCodOrder thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets placing=true while pending", () => {
    const store = makeStore();
    mockOrderService.placeCod.mockReturnValue(new Promise(() => {}));
    store.dispatch(placeCodOrder("addr-1"));
    expect(store.getState().order.placing).toBe(true);
  });

  it("clears placing on success and returns the order detail", async () => {
    const store = makeStore();
    mockOrderService.placeCod.mockResolvedValue({ ok: true, data: mockOrderDetail });

    const result = await store.dispatch(placeCodOrder("addr-1"));

    expect(store.getState().order.placing).toBe(false);
    // The fulfilled payload carries the order detail for redirect
    expect(result.type).toBe("order/placeCod/fulfilled");
    const payload = result.payload as OrderDetail;
    expect(payload.order_id).toBe("order-uuid-1");
  });

  it("clears placing on server rejection", async () => {
    const store = makeStore();
    mockOrderService.placeCod.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Out of stock", error: "Bad Request" },
    });

    await store.dispatch(placeCodOrder("addr-1"));

    expect(store.getState().order.placing).toBe(false);
  });

  it("clears placing when fetch throws (NETWORK_ERROR path)", async () => {
    const store = makeStore();
    mockOrderService.placeCod.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(placeCodOrder("addr-1"));

    expect(store.getState().order.placing).toBe(false);
  });
});

// ---- fetchOrders thunk ----

describe("orderSlice — fetchOrders thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true and clears error while pending", () => {
    const store = makeStore({ list: [], meta: null, detail: null, loading: false, detailLoading: false, placing: false, cancellingId: null, error: "old error" });
    mockOrderService.list.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchOrders(1));
    const state = store.getState().order;
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("populates list and meta on success", async () => {
    const store = makeStore();
    mockOrderService.list.mockResolvedValue({ ok: true, data: mockListResponse });

    await store.dispatch(fetchOrders(1));

    const state = store.getState().order;
    expect(state.loading).toBe(false);
    expect(state.list).toHaveLength(2);
    expect(state.list[0]).toEqual(mockListItem);
    expect(state.list[1]).toEqual(mockListItem2);
    expect(state.meta?.total).toBe(2);
    expect(state.meta?.total_pages).toBe(1);
  });

  it("sets error message on server rejection", async () => {
    const store = makeStore();
    mockOrderService.list.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Unauthorized", error: "Unauthorized" },
    });

    await store.dispatch(fetchOrders(1));

    const state = store.getState().order;
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Unauthorized");
    expect(state.list).toEqual([]);
  });

  it("sets generic error when server response has no message", async () => {
    const store = makeStore();
    mockOrderService.list.mockResolvedValue({ ok: false, data: {} });

    await store.dispatch(fetchOrders(1));

    expect(store.getState().order.error).toBe("Something went wrong. Please try again.");
  });

  it("sets NETWORK_ERROR message when fetch throws", async () => {
    const store = makeStore();
    mockOrderService.list.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(fetchOrders(1));

    const state = store.getState().order;
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Unable to reach the server. Please check your connection.");
  });
});

// ---- fetchOrderDetail thunk ----

describe("orderSlice — fetchOrderDetail thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets detailLoading=true, clears detail and error while pending", () => {
    const store = makeStore({
      list: [],
      meta: null,
      detail: mockOrderDetail,
      loading: false,
      detailLoading: false,
      placing: false,
      cancellingId: null,
      error: "old error",
    });
    mockOrderService.detail.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchOrderDetail("order-uuid-1"));
    const state = store.getState().order;
    expect(state.detailLoading).toBe(true);
    expect(state.detail).toBeNull();
    expect(state.error).toBeNull();
  });

  it("populates detail on success", async () => {
    const store = makeStore();
    mockOrderService.detail.mockResolvedValue({ ok: true, data: mockOrderDetail });

    await store.dispatch(fetchOrderDetail("order-uuid-1"));

    const state = store.getState().order;
    expect(state.detailLoading).toBe(false);
    expect(state.detail).toEqual(mockOrderDetail);
    expect(state.detail?.order_id).toBe("order-uuid-1");
    expect(state.detail?.items).toHaveLength(1);
  });

  it("sets error on server rejection", async () => {
    const store = makeStore();
    mockOrderService.detail.mockResolvedValue({
      ok: false,
      data: { statusCode: 404, message: "Order not found", error: "Not Found" },
    });

    await store.dispatch(fetchOrderDetail("order-bad-id"));

    const state = store.getState().order;
    expect(state.detailLoading).toBe(false);
    expect(state.detail).toBeNull();
    expect(state.error).toBe("Order not found");
  });

  it("sets NETWORK_ERROR message when fetch throws", async () => {
    const store = makeStore();
    mockOrderService.detail.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(fetchOrderDetail("order-uuid-1"));

    const state = store.getState().order;
    expect(state.detailLoading).toBe(false);
    expect(state.error).toBe("Unable to reach the server. Please check your connection.");
  });
});

// ---- cancelOrder thunk ----

describe("orderSlice — cancelOrder thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets cancellingId to the orderId while pending", () => {
    const store = makeStore({
      list: [mockListItem],
      meta: null,
      detail: null,
      loading: false,
      detailLoading: false,
      placing: false,
      cancellingId: null,
      error: null,
    });
    mockOrderService.cancel.mockReturnValue(new Promise(() => {}));
    store.dispatch(cancelOrder("order-uuid-1"));
    expect(store.getState().order.cancellingId).toBe("order-uuid-1");
  });

  it("clears cancellingId on success and returns the orderId", async () => {
    const store = makeStore({
      list: [mockListItem],
      meta: null,
      detail: null,
      loading: false,
      detailLoading: false,
      placing: false,
      cancellingId: null,
      error: null,
    });
    mockOrderService.cancel.mockResolvedValue({
      ok: true,
      data: { message: "Order cancelled" },
    });

    const result = await store.dispatch(cancelOrder("order-uuid-1"));

    expect(store.getState().order.cancellingId).toBeNull();
    expect(result.type).toBe("order/cancel/fulfilled");
    // The fulfilled payload is the orderId string (used by the component to re-fetch)
    expect(result.payload).toBe("order-uuid-1");
  });

  it("clears cancellingId on server rejection", async () => {
    const store = makeStore({
      list: [mockListItem],
      meta: null,
      detail: null,
      loading: false,
      detailLoading: false,
      placing: false,
      cancellingId: null,
      error: null,
    });
    mockOrderService.cancel.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Cannot cancel a delivered order", error: "Bad Request" },
    });

    await store.dispatch(cancelOrder("order-uuid-2"));

    expect(store.getState().order.cancellingId).toBeNull();
  });

  it("clears cancellingId when fetch throws (NETWORK_ERROR path)", async () => {
    const store = makeStore();
    mockOrderService.cancel.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(cancelOrder("order-uuid-1"));

    expect(store.getState().order.cancellingId).toBeNull();
  });

  it("tracks only one cancellation at a time (first wins)", async () => {
    const store = makeStore({
      list: [mockListItem, mockListItem2],
      meta: null,
      detail: null,
      loading: false,
      detailLoading: false,
      placing: false,
      cancellingId: null,
      error: null,
    });
    // First cancel — never-resolving to keep pending
    mockOrderService.cancel.mockReturnValue(new Promise(() => {}));
    store.dispatch(cancelOrder("order-uuid-1"));
    expect(store.getState().order.cancellingId).toBe("order-uuid-1");
  });
});

// ---- Session teardown: resetOrders ----

describe("orderSlice — session teardown (resetOrders)", () => {
  const populatedState: OrderState = {
    list: [mockListItem, mockListItem2],
    meta: { page: 1, limit: 10, total: 2, total_pages: 1 },
    detail: mockOrderDetail,
    loading: true,
    detailLoading: true,
    placing: true,
    cancellingId: "order-uuid-1",
    error: "some error",
  };

  it("resets to initial on logoutUser.fulfilled", () => {
    const store = makeStore(populatedState);
    store.dispatch({ type: "auth/logout/fulfilled" });
    const state = store.getState().order;
    expect(state.list).toEqual([]);
    expect(state.meta).toBeNull();
    expect(state.detail).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.detailLoading).toBe(false);
    expect(state.placing).toBe(false);
    expect(state.cancellingId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("resets to initial on sessionExpired", () => {
    const store = makeStore(populatedState);
    store.dispatch({ type: "auth/sessionExpired" });
    const state = store.getState().order;
    expect(state.list).toEqual([]);
    expect(state.detail).toBeNull();
    expect(state.cancellingId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("resets to initial on deleteUser.fulfilled", () => {
    const store = makeStore(populatedState);
    store.dispatch({ type: "user/delete/fulfilled" });
    const state = store.getState().order;
    expect(state.list).toEqual([]);
    expect(state.meta).toBeNull();
    expect(state.detail).toBeNull();
    expect(state.placing).toBe(false);
  });
});
