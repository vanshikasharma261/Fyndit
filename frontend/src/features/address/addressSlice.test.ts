import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import addressReducer, {
  fetchAddresses,
  addAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
  clearAddressErrors,
} from "./addressSlice";
import type { AddressState } from "./types";
import type { AddressResponse } from "../../types/address.types";

// ---- Mock the address service so no real fetch happens ----
vi.mock("./addressService", () => ({
  addressService: {
    list: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setDefault: vi.fn(),
  },
}));

// ---- Mock auth slice to prevent cross-slice import issues ----
// `logoutUser` is a thunk; we only need its `.fulfilled` action type.
// `sessionExpired` is a plain action creator — it needs a `.type` property so
// `addCase(sessionExpired, …)` resolves the action correctly (same pattern as
// cartSlice.test.ts / testing-patterns.md § Cart Slice Cross-Slice Dependency).
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

import { addressService } from "./addressService";

const mockAddressService = addressService as {
  list: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setDefault: ReturnType<typeof vi.fn>;
};

// ---- Test fixtures ----

const mockAddress: AddressResponse = {
  address_id: "addr-1",
  address_type: "HOME",
  line1: "123 Main St",
  line2: "Apt 4B",
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  zip: "400001",
  is_default: true,
};

const mockAddress2: AddressResponse = {
  address_id: "addr-2",
  address_type: "WORK",
  line1: "456 Office Rd",
  line2: null,
  city: "Pune",
  state: "Maharashtra",
  country: "India",
  zip: "411001",
  is_default: false,
};

const validationErrorPayload = {
  statusCode: 400,
  error: "Bad Request",
  message: "Validation failed",
  errors: { zip: "Invalid Zip Code" },
};

const serverErrorPayload = {
  statusCode: 500,
  error: "Internal Server Error",
  message: "Something went wrong",
};

function makeStore(preloaded?: Partial<AddressState>) {
  return configureStore({
    reducer: { address: addressReducer },
    preloadedState: preloaded ? { address: preloaded as AddressState } : undefined,
  });
}

// ---- Initial state ----

describe("addressSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().address;

    expect(state.items).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.saving).toBe(false);
    expect(state.mutatingId).toBeNull();
    expect(state.errors).toBeNull();
  });
});

// ---- clearAddressErrors reducer ----

describe("addressSlice — clearAddressErrors reducer", () => {
  it("clears the errors map when dispatched", () => {
    const store = makeStore({
      items: [],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: { zip: "Invalid Zip Code" },
    });

    store.dispatch(clearAddressErrors());

    expect(store.getState().address.errors).toBeNull();
  });

  it("is a no-op when errors are already null", () => {
    const store = makeStore();
    store.dispatch(clearAddressErrors());
    expect(store.getState().address.errors).toBeNull();
  });
});

// ---- fetchAddresses thunk ----

describe("addressSlice — fetchAddresses thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true while pending", () => {
    const store = makeStore();
    mockAddressService.list.mockReturnValue(new Promise(() => {})); // never-resolving
    store.dispatch(fetchAddresses());
    expect(store.getState().address.loading).toBe(true);
  });

  it("populates items on success", async () => {
    const store = makeStore();
    mockAddressService.list.mockResolvedValue({
      ok: true,
      data: [mockAddress, mockAddress2],
    });

    await store.dispatch(fetchAddresses());

    const state = store.getState().address;
    expect(state.loading).toBe(false);
    expect(state.items).toEqual([mockAddress, mockAddress2]);
  });

  it("sets loading=false on server rejection", async () => {
    const store = makeStore();
    mockAddressService.list.mockResolvedValue({
      ok: false,
      data: serverErrorPayload,
    });

    await store.dispatch(fetchAddresses());

    const state = store.getState().address;
    expect(state.loading).toBe(false);
    expect(state.items).toEqual([]); // unchanged
  });

  it("sets loading=false when fetch throws (network error)", async () => {
    const store = makeStore();
    mockAddressService.list.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(fetchAddresses());

    expect(store.getState().address.loading).toBe(false);
  });
});

// ---- addAddress thunk ----

describe("addressSlice — addAddress thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets saving=true and clears errors while pending", () => {
    const store = makeStore({
      items: [],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: { zip: "old error" },
    });
    mockAddressService.add.mockReturnValue(new Promise(() => {}));
    // Also mock list for the re-fetch triggered on success
    mockAddressService.list.mockReturnValue(new Promise(() => {}));

    store.dispatch(
      addAddress({
        address_type: "HOME",
        line1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        zip: "400001",
      }),
    );

    const state = store.getState().address;
    expect(state.saving).toBe(true);
    expect(state.errors).toBeNull();
  });

  it("clears saving and errors on success, re-fetches list", async () => {
    const store = makeStore();
    mockAddressService.add.mockResolvedValue({
      ok: true,
      data: mockAddress,
    });
    mockAddressService.list.mockResolvedValue({
      ok: true,
      data: [mockAddress],
    });

    await store.dispatch(
      addAddress({
        address_type: "HOME",
        line1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        zip: "400001",
      }),
    );

    const state = store.getState().address;
    expect(state.saving).toBe(false);
    expect(state.errors).toBeNull();
    // After re-fetch, items reflect the list response
    expect(state.items).toEqual([mockAddress]);
  });

  it("populates errors from a 400 validation rejection", async () => {
    const store = makeStore();
    mockAddressService.add.mockResolvedValue({
      ok: false,
      data: validationErrorPayload,
    });

    await store.dispatch(
      addAddress({
        address_type: "HOME",
        line1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        zip: "BAD",
      }),
    );

    const state = store.getState().address;
    expect(state.saving).toBe(false);
    expect(state.errors).toEqual({ zip: "Invalid Zip Code" });
  });

  it("leaves errors null for a non-validation rejection", async () => {
    const store = makeStore();
    mockAddressService.add.mockResolvedValue({
      ok: false,
      data: serverErrorPayload,
    });

    await store.dispatch(
      addAddress({
        address_type: "HOME",
        line1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        zip: "400001",
      }),
    );

    expect(store.getState().address.errors).toBeNull();
  });

  it("sets saving=false when fetch throws", async () => {
    const store = makeStore();
    mockAddressService.add.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(
      addAddress({
        address_type: "HOME",
        line1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        zip: "400001",
      }),
    );

    expect(store.getState().address.saving).toBe(false);
  });
});

// ---- updateAddress thunk ----

describe("addressSlice — updateAddress thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets saving=true and clears errors while pending", () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: { zip: "previous error" },
    });
    mockAddressService.update.mockReturnValue(new Promise(() => {}));

    store.dispatch(updateAddress({ addressId: "addr-1", payload: { zip: "400002" } }));

    expect(store.getState().address.saving).toBe(true);
    expect(store.getState().address.errors).toBeNull();
  });

  it("replaces the matching item in place on success", async () => {
    const updatedAddress = { ...mockAddress, zip: "400002" };
    const store = makeStore({
      items: [mockAddress, mockAddress2],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.update.mockResolvedValue({
      ok: true,
      data: updatedAddress,
    });

    await store.dispatch(
      updateAddress({ addressId: "addr-1", payload: { zip: "400002" } }),
    );

    const state = store.getState().address;
    expect(state.saving).toBe(false);
    expect(state.errors).toBeNull();
    // The first item is replaced; the second is untouched
    expect(state.items[0]).toEqual(updatedAddress);
    expect(state.items[1]).toEqual(mockAddress2);
  });

  it("does not remove other items when updating one", async () => {
    const updatedAddress = { ...mockAddress, city: "Delhi" };
    const store = makeStore({
      items: [mockAddress, mockAddress2],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.update.mockResolvedValue({
      ok: true,
      data: updatedAddress,
    });

    await store.dispatch(
      updateAddress({ addressId: "addr-1", payload: { city: "Delhi" } }),
    );

    expect(store.getState().address.items).toHaveLength(2);
  });

  it("populates errors from a 400 validation rejection", async () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.update.mockResolvedValue({
      ok: false,
      data: validationErrorPayload,
    });

    await store.dispatch(
      updateAddress({ addressId: "addr-1", payload: { zip: "BAD" } }),
    );

    expect(store.getState().address.errors).toEqual({ zip: "Invalid Zip Code" });
  });

  it("leaves errors null for a non-validation rejection", async () => {
    const store = makeStore({ items: [mockAddress], loading: false, saving: false, mutatingId: null, errors: null });
    mockAddressService.update.mockResolvedValue({
      ok: false,
      data: serverErrorPayload,
    });

    await store.dispatch(
      updateAddress({ addressId: "addr-1", payload: { zip: "400001" } }),
    );

    expect(store.getState().address.errors).toBeNull();
  });

  it("sets saving=false when fetch throws", async () => {
    const store = makeStore();
    mockAddressService.update.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(
      updateAddress({ addressId: "addr-1", payload: { zip: "400001" } }),
    );

    expect(store.getState().address.saving).toBe(false);
  });
});

// ---- setDefaultAddress thunk ----

describe("addressSlice — setDefaultAddress thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets mutatingId while pending", () => {
    const store = makeStore({
      items: [mockAddress, mockAddress2],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.setDefault.mockReturnValue(new Promise(() => {}));

    store.dispatch(setDefaultAddress("addr-2"));

    expect(store.getState().address.mutatingId).toBe("addr-2");
  });

  it("replaces items with the refreshed list on success", async () => {
    const refreshedList: AddressResponse[] = [
      { ...mockAddress2, is_default: true },
      { ...mockAddress, is_default: false },
    ];
    const store = makeStore({
      items: [mockAddress, mockAddress2],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.setDefault.mockResolvedValue({
      ok: true,
      data: refreshedList,
    });

    await store.dispatch(setDefaultAddress("addr-2"));

    const state = store.getState().address;
    expect(state.mutatingId).toBeNull();
    expect(state.items).toEqual(refreshedList);
  });

  it("clears mutatingId on rejection", async () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.setDefault.mockResolvedValue({
      ok: false,
      data: serverErrorPayload,
    });

    await store.dispatch(setDefaultAddress("addr-1"));

    expect(store.getState().address.mutatingId).toBeNull();
  });

  it("clears mutatingId when fetch throws", async () => {
    const store = makeStore();
    mockAddressService.setDefault.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(setDefaultAddress("addr-1"));

    expect(store.getState().address.mutatingId).toBeNull();
  });
});

// ---- removeAddress thunk ----

describe("addressSlice — removeAddress thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets mutatingId while pending", () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.remove.mockReturnValue(new Promise(() => {}));
    mockAddressService.list.mockReturnValue(new Promise(() => {}));

    store.dispatch(removeAddress("addr-1"));

    expect(store.getState().address.mutatingId).toBe("addr-1");
  });

  it("clears mutatingId on success and re-fetches list", async () => {
    const store = makeStore({
      items: [mockAddress, mockAddress2],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.remove.mockResolvedValue({
      ok: true,
      data: { message: "Address removed" },
    });
    mockAddressService.list.mockResolvedValue({
      ok: true,
      data: [mockAddress2],
    });

    await store.dispatch(removeAddress("addr-1"));

    const state = store.getState().address;
    expect(state.mutatingId).toBeNull();
    // The list is refreshed — only the remaining address remains
    expect(state.items).toEqual([mockAddress2]);
  });

  it("clears mutatingId on rejection", async () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });
    mockAddressService.remove.mockResolvedValue({
      ok: false,
      data: serverErrorPayload,
    });

    await store.dispatch(removeAddress("addr-1"));

    expect(store.getState().address.mutatingId).toBeNull();
  });

  it("clears mutatingId when fetch throws", async () => {
    const store = makeStore();
    mockAddressService.remove.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(removeAddress("addr-1"));

    expect(store.getState().address.mutatingId).toBeNull();
  });
});

// ---- Session teardown: resetAddresses ----

describe("addressSlice — session teardown (resetAddresses)", () => {
  it("resets to empty on logoutUser.fulfilled", () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: true,
      mutatingId: "addr-1",
      errors: { zip: "bad" },
    });

    store.dispatch({ type: "auth/logout/fulfilled" });

    const state = store.getState().address;
    expect(state.items).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.saving).toBe(false);
    expect(state.mutatingId).toBeNull();
    expect(state.errors).toBeNull();
  });

  it("resets to empty on sessionExpired", () => {
    const store = makeStore({
      items: [mockAddress, mockAddress2],
      loading: true,
      saving: false,
      mutatingId: "addr-2",
      errors: null,
    });

    store.dispatch({ type: "auth/sessionExpired" });

    const state = store.getState().address;
    expect(state.items).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.mutatingId).toBeNull();
  });

  it("resets to empty on deleteUser.fulfilled", () => {
    const store = makeStore({
      items: [mockAddress],
      loading: false,
      saving: false,
      mutatingId: null,
      errors: null,
    });

    store.dispatch({ type: "user/delete/fulfilled" });

    const state = store.getState().address;
    expect(state.items).toEqual([]);
    expect(state.errors).toBeNull();
  });
});
