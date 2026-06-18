import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import cartReducer, {
  fetchCart,
  addToCart,
  updateCartItem,
  removeCartItem,
} from "./cartSlice";
import type { CartState } from "./types";
import type {
  CartItem,
  CartSummary,
  CartResponse,
  AddToCartResponse,
  UpdateCartResponse,
} from "../../types/cart.types";

// ---- Mock the cart service so no real fetch happens ----
vi.mock("./cartService", () => ({
  cartService: {
    get: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
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

import { cartService } from "./cartService";

const mockCartService = cartService as {
  get: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

// ---- Test fixtures ----

const mockSummary: CartSummary = {
  total_items: 2,
  total_price: "2000.00",
  total_discount: "200.00",
  final_amount: "1800.00",
};

const mockItem: CartItem = {
  cart_item_id: "item-1",
  product_variant_id: "variant-1",
  product_name: "Test Product",
  brand: "Test Brand",
  description: "A great product",
  image_url: "/assets/products/test/image1.jpg",
  price: "1000.00",
  discount: "100.00",
  final_price: "900.00",
  quantity: 2,
  stock: 10,
  attributes: { color: "Red", size: "M" },
};

const mockCartResponse: CartResponse = {
  summary: mockSummary,
  items: [mockItem],
};

function makeStore(preloaded?: Partial<CartState>) {
  return configureStore({
    reducer: { cart: cartReducer },
    preloadedState: preloaded ? { cart: preloaded as CartState } : undefined,
  });
}

// ---- Initial state ----

describe("cartSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().cart;

    expect(state.items).toEqual([]);
    expect(state.summary).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.mutatingId).toBeNull();
    expect(state.adding).toBe(false);
  });
});

// ---- fetchCart thunk ----

describe("cartSlice — fetchCart thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true while pending", () => {
    const store = makeStore();
    mockCartService.get.mockReturnValue(new Promise(() => {})); // never-resolving
    store.dispatch(fetchCart());
    expect(store.getState().cart.loading).toBe(true);
    expect(store.getState().cart.error).toBeNull();
  });

  it("populates items and summary on success", async () => {
    const store = makeStore();
    mockCartService.get.mockResolvedValue({ ok: true, data: mockCartResponse });

    await store.dispatch(fetchCart());

    const state = store.getState().cart;
    expect(state.loading).toBe(false);
    expect(state.items).toEqual([mockItem]);
    expect(state.summary).toEqual(mockSummary);
    expect(state.error).toBeNull();
  });

  it("populates empty items and zero summary for an empty cart", async () => {
    const store = makeStore();
    const emptyCart: CartResponse = {
      summary: {
        total_items: 0,
        total_price: "0.00",
        total_discount: "0.00",
        final_amount: "0.00",
      },
      items: [],
    };
    mockCartService.get.mockResolvedValue({ ok: true, data: emptyCart });

    await store.dispatch(fetchCart());

    const state = store.getState().cart;
    expect(state.loading).toBe(false);
    expect(state.items).toEqual([]);
    expect(state.summary?.total_items).toBe(0);
  });

  it("sets error message on server failure", async () => {
    const store = makeStore();
    mockCartService.get.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Unauthorized", error: "Unauthorized" },
    });

    await store.dispatch(fetchCart());

    const state = store.getState().cart;
    expect(state.loading).toBe(false);
    expect(state.error).toBe("Unauthorized");
    expect(state.items).toEqual([]);
  });

  it("sets generic error when no message is provided", async () => {
    const store = makeStore();
    mockCartService.get.mockResolvedValue({
      ok: false,
      data: {},
    });

    await store.dispatch(fetchCart());

    const state = store.getState().cart;
    expect(state.error).toBe("Something went wrong. Please try again.");
  });

  it("sets network error message when fetch throws", async () => {
    const store = makeStore();
    mockCartService.get.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(fetchCart());

    const state = store.getState().cart;
    expect(state.loading).toBe(false);
    expect(state.error).toBe(
      "Unable to reach the server. Please check your connection.",
    );
  });

  it("clears previous error on re-fetch (pending → loading)", () => {
    const store = makeStore({
      items: [],
      summary: null,
      loading: false,
      error: "Previous error",
      mutatingId: null,
      adding: false,
    });
    mockCartService.get.mockReturnValue(new Promise(() => {}));
    store.dispatch(fetchCart());
    expect(store.getState().cart.error).toBeNull();
  });
});

// ---- addToCart thunk ----

describe("cartSlice — addToCart thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets adding=true while pending", () => {
    const store = makeStore();
    mockCartService.add.mockReturnValue(new Promise(() => {}));
    store.dispatch(addToCart("variant-1"));
    expect(store.getState().cart.adding).toBe(true);
  });

  it("upserts item and updates summary on success (new item)", async () => {
    const store = makeStore();
    const addResponse: AddToCartResponse = {
      item: mockItem,
      summary: mockSummary,
    };
    mockCartService.add.mockResolvedValue({ ok: true, data: addResponse });

    await store.dispatch(addToCart("variant-1"));

    const state = store.getState().cart;
    expect(state.adding).toBe(false);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toEqual(mockItem);
    expect(state.summary).toEqual(mockSummary);
  });

  it("upserts item (updates existing item in-place)", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    const updatedItem = { ...mockItem, quantity: 3 };
    const updatedSummary: CartSummary = {
      ...mockSummary,
      total_items: 3,
      total_price: "3000.00",
      final_amount: "2700.00",
    };
    mockCartService.add.mockResolvedValue({
      ok: true,
      data: { item: updatedItem, summary: updatedSummary },
    });

    await store.dispatch(addToCart("variant-1"));

    const state = store.getState().cart;
    expect(state.items).toHaveLength(1); // still one item, just updated
    expect(state.items[0].quantity).toBe(3);
    expect(state.summary?.total_items).toBe(3);
  });

  it("sets adding=false on rejection without modifying items", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    mockCartService.add.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Out of stock", error: "Bad Request" },
    });

    await store.dispatch(addToCart("variant-out-of-stock"));

    const state = store.getState().cart;
    expect(state.adding).toBe(false);
    // items and summary are unchanged on rejection
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toEqual(mockItem);
  });

  it("sets adding=false when fetch throws (network error)", async () => {
    const store = makeStore();
    mockCartService.add.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(addToCart("variant-1"));

    expect(store.getState().cart.adding).toBe(false);
  });

  it("appends new item (does not find existing by cart_item_id)", async () => {
    const secondItem: CartItem = {
      ...mockItem,
      cart_item_id: "item-2",
      product_variant_id: "variant-2",
    };
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    const addResponse: AddToCartResponse = {
      item: secondItem,
      summary: { ...mockSummary, total_items: 3 },
    };
    mockCartService.add.mockResolvedValue({ ok: true, data: addResponse });

    await store.dispatch(addToCart("variant-2"));

    const state = store.getState().cart;
    expect(state.items).toHaveLength(2);
    expect(state.items[1].cart_item_id).toBe("item-2");
  });
});

// ---- updateCartItem thunk ----

describe("cartSlice — updateCartItem thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets mutatingId while pending", () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    mockCartService.update.mockReturnValue(new Promise(() => {}));
    store.dispatch(updateCartItem({ cartItemId: "item-1", quantity: 3 }));
    expect(store.getState().cart.mutatingId).toBe("item-1");
  });

  it("updates item in-place and clears mutatingId on success", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    const updatedItem = { ...mockItem, quantity: 5 };
    const updatedSummary: CartSummary = { ...mockSummary, total_items: 5 };
    const updateResponse: UpdateCartResponse = {
      message: "Cart updated",
      item: updatedItem,
      summary: updatedSummary,
    };
    mockCartService.update.mockResolvedValue({ ok: true, data: updateResponse });

    await store.dispatch(updateCartItem({ cartItemId: "item-1", quantity: 5 }));

    const state = store.getState().cart;
    expect(state.mutatingId).toBeNull();
    expect(state.items[0].quantity).toBe(5);
    expect(state.summary?.total_items).toBe(5);
  });

  it("clears mutatingId on rejection", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    mockCartService.update.mockResolvedValue({
      ok: false,
      data: { statusCode: 400, message: "Exceeds stock", error: "Bad Request" },
    });

    await store.dispatch(updateCartItem({ cartItemId: "item-1", quantity: 99 }));

    expect(store.getState().cart.mutatingId).toBeNull();
  });

  it("clears mutatingId when fetch throws", async () => {
    const store = makeStore();
    mockCartService.update.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(updateCartItem({ cartItemId: "item-1", quantity: 2 }));

    expect(store.getState().cart.mutatingId).toBeNull();
  });
});

// ---- removeCartItem thunk ----

describe("cartSlice — removeCartItem thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets mutatingId=cartItemId while pending", () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    mockCartService.remove.mockReturnValue(new Promise(() => {}));
    store.dispatch(removeCartItem("item-1"));
    expect(store.getState().cart.mutatingId).toBe("item-1");
  });

  it("clears mutatingId on success (fetchCart re-fetch updates the rest)", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    // Remove returns { message: "Removed" }
    mockCartService.remove.mockResolvedValue({
      ok: true,
      data: { message: "Item removed" },
    });
    // The thunk dispatches fetchCart() internally after remove succeeds
    mockCartService.get.mockResolvedValue({
      ok: true,
      data: { summary: { ...mockSummary, total_items: 0 }, items: [] },
    });

    await store.dispatch(removeCartItem("item-1"));

    expect(store.getState().cart.mutatingId).toBeNull();
  });

  it("clears mutatingId on rejection", async () => {
    const store = makeStore();
    mockCartService.remove.mockResolvedValue({
      ok: false,
      data: { statusCode: 404, message: "Item not found", error: "Not Found" },
    });

    await store.dispatch(removeCartItem("item-999"));

    expect(store.getState().cart.mutatingId).toBeNull();
  });

  it("clears mutatingId when fetch throws", async () => {
    const store = makeStore();
    mockCartService.remove.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(removeCartItem("item-1"));

    expect(store.getState().cart.mutatingId).toBeNull();
  });
});

// ---- Session teardown: resetCart ----

describe("cartSlice — session teardown (resetCart)", () => {
  it("resets cart to empty on logoutUser.fulfilled", async () => {
    // We can't easily dispatch logoutUser.fulfilled directly, but we can verify
    // the action type is handled by constructing it manually.
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });

    // Dispatch the raw action type that logoutUser.fulfilled emits
    store.dispatch({ type: "auth/logout/fulfilled" });

    const state = store.getState().cart;
    expect(state.items).toEqual([]);
    expect(state.summary).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.mutatingId).toBeNull();
    expect(state.adding).toBe(false);
  });

  it("resets cart to empty on sessionExpired", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: "some error",
      mutatingId: "item-1",
      adding: true,
    });

    store.dispatch({ type: "auth/sessionExpired" });

    const state = store.getState().cart;
    expect(state.items).toEqual([]);
    expect(state.summary).toBeNull();
    expect(state.adding).toBe(false);
    expect(state.mutatingId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("resets cart to empty on deleteUser.fulfilled", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });

    store.dispatch({ type: "user/delete/fulfilled" });

    const state = store.getState().cart;
    expect(state.items).toEqual([]);
    expect(state.summary).toBeNull();
  });
});

// ---- upsertItem internal behavior via addToCart.fulfilled ----

describe("cartSlice — upsertItem via addToCart", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates existing item when cart_item_id matches", async () => {
    const store = makeStore({
      items: [mockItem],
      summary: mockSummary,
      loading: false,
      error: null,
      mutatingId: null,
      adding: false,
    });
    const incrementedItem = { ...mockItem, quantity: 3 };
    mockCartService.add.mockResolvedValue({
      ok: true,
      data: { item: incrementedItem, summary: mockSummary },
    });

    await store.dispatch(addToCart("variant-1"));

    const state = store.getState().cart;
    // Should still be one item (replaced, not appended)
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(3);
  });
});
