import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import checkoutReducer, {
  fetchCheckoutSummary,
  applyCoupon,
  removeCoupon,
  createPaymentIntent,
} from "./checkoutSlice";
import type { CheckoutState } from "./types";
import type {
  CheckoutSummary,
  PaymentIntentResponse,
} from "../../types/checkout.types";

// ---- Mock checkout service so no real fetch happens ----
vi.mock("./checkoutService", () => ({
  checkoutService: {
    getSummary: vi.fn(),
    applyCoupon: vi.fn(),
    removeCoupon: vi.fn(),
    createPaymentIntent: vi.fn(),
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

import { checkoutService } from "./checkoutService";

const mockCheckoutService = checkoutService as {
  getSummary: ReturnType<typeof vi.fn>;
  applyCoupon: ReturnType<typeof vi.fn>;
  removeCoupon: ReturnType<typeof vi.fn>;
  createPaymentIntent: ReturnType<typeof vi.fn>;
};

// ---- Test fixtures ----

const mockSummary: CheckoutSummary = {
  items: [
    {
      cart_item_id: "ci-1",
      product_variant_id: "pv-1",
      product_name: "Wireless Headphones",
      brand: "SoundMax",
      image_url: "/assets/products/headphones/black/1.jpg",
      attributes: { color: "Black" },
      price: "1500.00",
      discount: "200.00",
      final_price: "1300.00",
      quantity: 1,
      stock: 5,
      out_of_stock: false,
    },
  ],
  total_items: 1,
  sub_total: "1300.00",
  coupon_discount: "0.00",
  shipping_fee: "100.00",
  total: "1400.00",
  applied_coupon: null,
  personal: {
    first_name: "Jane",
    last_name: "Doe",
    phone: "9876543210",
    email: "jane@example.com",
  },
};

const mockSummaryWithCoupon: CheckoutSummary = {
  ...mockSummary,
  coupon_discount: "130.00",
  total: "1270.00",
  applied_coupon: {
    code: "SAVE10",
    discount_type: "PERCENTAGE",
    discount_value: "10.00",
    discount_amount: "130.00",
  },
};

const mockPaymentIntent: PaymentIntentResponse = {
  client_secret: "pi_test_secret_abc123",
  total: "1400.00",
};

function makeStore(preloaded?: Partial<CheckoutState>) {
  return configureStore({
    reducer: { checkout: checkoutReducer },
    preloadedState: preloaded ? { checkout: preloaded as CheckoutState } : undefined,
  });
}

// ---- Initial state ----

describe("checkoutSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().checkout;

    expect(state.summary).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.applyingCoupon).toBe(false);
    expect(state.removingCoupon).toBe(false);
    expect(state.error).toBeNull();
  });
});

// ---- fetchCheckoutSummary thunk ----

describe("checkoutSlice — fetchCheckoutSummary thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true and clears error while pending", () => {
    const store = makeStore({ summary: null, loading: false, applyingCoupon: false, removingCoupon: false, error: "old error" });
    mockCheckoutService.getSummary.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchCheckoutSummary());
    const state = store.getState().checkout;
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it("populates summary and clears loading on success", async () => {
    const store = makeStore();
    mockCheckoutService.getSummary.mockResolvedValue({ ok: true, data: mockSummary });

    await store.dispatch(fetchCheckoutSummary());

    const state = store.getState().checkout;
    expect(state.loading).toBe(false);
    expect(state.summary).toEqual(mockSummary);
    expect(state.error).toBeNull();
  });

  it("sets error from server message on rejection", async () => {
    const store = makeStore();
    mockCheckoutService.getSummary.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Cart is empty", error: "Bad Request" },
    });

    await store.dispatch(fetchCheckoutSummary());

    const state = store.getState().checkout;
    expect(state.loading).toBe(false);
    expect(state.summary).toBeNull();
    expect(state.error).toBe("Cart is empty");
  });

  it("sets generic error when server response has no message", async () => {
    const store = makeStore();
    mockCheckoutService.getSummary.mockResolvedValue({ ok: false, data: {} });

    await store.dispatch(fetchCheckoutSummary());

    expect(store.getState().checkout.error).toBe("Something went wrong. Please try again.");
  });

  it("sets NETWORK_ERROR message when fetch throws", async () => {
    const store = makeStore();
    mockCheckoutService.getSummary.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(fetchCheckoutSummary());

    const state = store.getState().checkout;
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Unable to reach the server. Please check your connection.");
  });
});

// ---- applyCoupon thunk ----

describe("checkoutSlice — applyCoupon thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets applyingCoupon=true while pending", () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.applyCoupon.mockReturnValue(new Promise(() => {}));
    store.dispatch(applyCoupon("SAVE10"));
    expect(store.getState().checkout.applyingCoupon).toBe(true);
  });

  it("updates summary with coupon data on success", async () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.applyCoupon.mockResolvedValue({
      ok: true,
      data: mockSummaryWithCoupon,
    });

    await store.dispatch(applyCoupon("SAVE10"));

    const state = store.getState().checkout;
    expect(state.applyingCoupon).toBe(false);
    expect(state.summary?.applied_coupon?.code).toBe("SAVE10");
    expect(state.summary?.coupon_discount).toBe("130.00");
    expect(state.summary?.total).toBe("1270.00");
  });

  it("clears applyingCoupon on rejection (slice does NOT set error)", async () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.applyCoupon.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Invalid coupon", error: "Bad Request" },
    });

    await store.dispatch(applyCoupon("BADSAVE"));

    const state = store.getState().checkout;
    expect(state.applyingCoupon).toBe(false);
    // Summary is unchanged on rejection
    expect(state.summary?.applied_coupon).toBeNull();
    // The slice does NOT set state.error for coupon rejection (toast via .unwrap)
    expect(state.error).toBeNull();
  });

  it("clears applyingCoupon when fetch throws (NETWORK_ERROR path)", async () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.applyCoupon.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(applyCoupon("SAVE10"));

    expect(store.getState().checkout.applyingCoupon).toBe(false);
  });
});

// ---- removeCoupon thunk ----

describe("checkoutSlice — removeCoupon thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets removingCoupon=true while pending", () => {
    const store = makeStore({
      summary: mockSummaryWithCoupon,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.removeCoupon.mockReturnValue(new Promise(() => {}));
    store.dispatch(removeCoupon());
    expect(store.getState().checkout.removingCoupon).toBe(true);
  });

  it("replaces summary without coupon on success", async () => {
    const store = makeStore({
      summary: mockSummaryWithCoupon,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.removeCoupon.mockResolvedValue({
      ok: true,
      data: mockSummary,
    });

    await store.dispatch(removeCoupon());

    const state = store.getState().checkout;
    expect(state.removingCoupon).toBe(false);
    expect(state.summary?.applied_coupon).toBeNull();
    expect(state.summary?.coupon_discount).toBe("0.00");
  });

  it("clears removingCoupon on rejection", async () => {
    const store = makeStore({
      summary: mockSummaryWithCoupon,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.removeCoupon.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "No coupon applied", error: "Bad Request" },
    });

    await store.dispatch(removeCoupon());

    expect(store.getState().checkout.removingCoupon).toBe(false);
  });

  it("clears removingCoupon when fetch throws (NETWORK_ERROR path)", async () => {
    const store = makeStore({
      summary: mockSummaryWithCoupon,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.removeCoupon.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(removeCoupon());

    expect(store.getState().checkout.removingCoupon).toBe(false);
  });
});

// ---- createPaymentIntent thunk ----

describe("checkoutSlice — createPaymentIntent thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the payment intent response on success (slice state is unchanged)", async () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.createPaymentIntent.mockResolvedValue({
      ok: true,
      data: mockPaymentIntent,
    });

    const result = await store.dispatch(createPaymentIntent("addr-1"));

    // The slice has no pending/fulfilled/rejected handlers for this thunk
    // — the component uses .unwrap() to get the client_secret
    expect(result.type).toBe("checkout/createPaymentIntent/fulfilled");
    // Payload carries the payment intent
    const payload = result.payload as PaymentIntentResponse;
    expect(payload.client_secret).toBe("pi_test_secret_abc123");
    // Slice state is unaffected
    const state = store.getState().checkout;
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("rejects with server error when API returns not-ok", async () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.createPaymentIntent.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Invalid address", error: "Bad Request" },
    });

    const result = await store.dispatch(createPaymentIntent("addr-bad"));

    expect(result.type).toBe("checkout/createPaymentIntent/rejected");
  });

  it("rejects with NETWORK_ERROR when fetch throws", async () => {
    const store = makeStore({
      summary: mockSummary,
      loading: false,
      applyingCoupon: false,
      removingCoupon: false,
      error: null,
    });
    mockCheckoutService.createPaymentIntent.mockRejectedValue(new Error("Network failure"));

    const result = await store.dispatch(createPaymentIntent("addr-1"));

    expect(result.type).toBe("checkout/createPaymentIntent/rejected");
  });
});

// ---- Session teardown: resetCheckout ----

describe("checkoutSlice — session teardown (resetCheckout)", () => {
  const populatedState: CheckoutState = {
    summary: mockSummary,
    loading: true,
    applyingCoupon: true,
    removingCoupon: true,
    creatingIntent: true,
    error: "some error",
  };

  it("resets to initial on logoutUser.fulfilled", () => {
    const store = makeStore(populatedState);
    store.dispatch({ type: "auth/logout/fulfilled" });
    const state = store.getState().checkout;
    expect(state.summary).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.applyingCoupon).toBe(false);
    expect(state.removingCoupon).toBe(false);
    expect(state.error).toBeNull();
  });

  it("resets to initial on sessionExpired", () => {
    const store = makeStore(populatedState);
    store.dispatch({ type: "auth/sessionExpired" });
    const state = store.getState().checkout;
    expect(state.summary).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("resets to initial on deleteUser.fulfilled", () => {
    const store = makeStore(populatedState);
    store.dispatch({ type: "user/delete/fulfilled" });
    const state = store.getState().checkout;
    expect(state.summary).toBeNull();
    expect(state.applyingCoupon).toBe(false);
    expect(state.removingCoupon).toBe(false);
  });
});
