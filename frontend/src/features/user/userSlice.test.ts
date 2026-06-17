import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import userReducer, {
  clearUserFeedback,
  fetchUser,
  updateUser,
  deleteUser,
} from "./userSlice";
import type { UserState } from "./types";
import type { UserProfile, DeleteUserResponse } from "../../types/user.types";

// ---- Mock the service module so no real fetch happens ----
vi.mock("./userService", () => ({
  userService: {
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { userService } from "./userService";

const mockUserService = userService as {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const mockProfile: UserProfile = {
  id: "user-1",
  email: "test@example.com",
  first_name: "Jane",
  last_name: "Doe",
  user_name: "janedoe",
  phone: "9876543210",
};

function makeStore(preloaded?: Partial<UserState>) {
  return configureStore({
    reducer: { user: userReducer },
    preloadedState: preloaded ? { user: preloaded as UserState } : undefined,
  });
}

describe("userSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().user;

    expect(state.profile).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.success).toBe(false);
    expect(state.message).toBeNull();
    expect(state.errors).toBeNull();
  });
});

describe("userSlice — clearUserFeedback", () => {
  it("clears message, errors and success", () => {
    const store = makeStore({
      profile: null,
      loading: false,
      success: true,
      message: "Profile updated successfully",
      errors: { email: "Already taken" },
    });

    store.dispatch(clearUserFeedback());
    const state = store.getState().user;

    expect(state.message).toBeNull();
    expect(state.errors).toBeNull();
    expect(state.success).toBe(false);
  });
});

describe("userSlice — fetchUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true while pending", () => {
    const store = makeStore();
    mockUserService.get.mockReturnValue(new Promise(() => {})); // never-resolving
    store.dispatch(fetchUser());
    expect(store.getState().user.loading).toBe(true);
  });

  it("populates profile on success", async () => {
    const store = makeStore();
    mockUserService.get.mockResolvedValue({ ok: true, data: mockProfile });

    await store.dispatch(fetchUser());

    const state = store.getState().user;
    expect(state.loading).toBe(false);
    expect(state.profile).toEqual(mockProfile);
    expect(state.message).toBeNull();
  });

  it("sets message on server error", async () => {
    const store = makeStore();
    mockUserService.get.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Unauthorized", error: "Unauthorized" },
    });

    await store.dispatch(fetchUser());

    const state = store.getState().user;
    expect(state.loading).toBe(false);
    expect(state.profile).toBeNull();
    expect(state.message).toBe("Unauthorized");
    expect(state.errors).toBeNull();
  });

  it("sets network error message when fetch throws", async () => {
    const store = makeStore();
    mockUserService.get.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(fetchUser());

    const state = store.getState().user;
    expect(state.loading).toBe(false);
    expect(state.message).toBe(
      "Unable to reach the server. Please check your connection.",
    );
  });
});

describe("userSlice — updateUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true while pending", () => {
    const store = makeStore();
    mockUserService.update.mockReturnValue(new Promise(() => {}));
    store.dispatch(updateUser({ first_name: "Jane" }));
    expect(store.getState().user.loading).toBe(true);
  });

  it("updates profile and sets success on fulfilled", async () => {
    const store = makeStore({ profile: mockProfile, loading: false, success: false, message: null, errors: null });
    const updatedProfile = { ...mockProfile, first_name: "Janet" };
    mockUserService.update.mockResolvedValue({ ok: true, data: updatedProfile });

    await store.dispatch(updateUser({ first_name: "Janet" }));

    const state = store.getState().user;
    expect(state.loading).toBe(false);
    expect(state.success).toBe(true);
    expect(state.profile?.first_name).toBe("Janet");
    expect(state.message).toBe("Profile updated successfully");
  });

  it("populates per-field errors on 400 validation failure", async () => {
    const store = makeStore();
    mockUserService.update.mockResolvedValue({
      ok: false,
      data: {
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: { email: "Must be a valid email" },
      },
    });

    await store.dispatch(updateUser({ email: "not-an-email" }));

    const state = store.getState().user;
    expect(state.loading).toBe(false);
    expect(state.success).toBe(false);
    expect(state.errors).toEqual({ email: "Must be a valid email" });
    expect(state.message).toBe("Validation Failed");
  });

  it("sets generic message on non-validation server error", async () => {
    const store = makeStore();
    mockUserService.update.mockResolvedValue({
      ok: false,
      data: { statusCode: 500, message: "Internal Server Error", error: "Internal Server Error" },
    });

    await store.dispatch(updateUser({ phone: "123" }));

    const state = store.getState().user;
    expect(state.errors).toBeNull();
    expect(state.message).toBe("Internal Server Error");
  });
});

describe("userSlice — deleteUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true while pending", () => {
    const store = makeStore();
    mockUserService.remove.mockReturnValue(new Promise(() => {}));
    store.dispatch(deleteUser());
    expect(store.getState().user.loading).toBe(true);
  });

  it("clears profile and sets success on fulfilled", async () => {
    const store = makeStore({ profile: mockProfile, loading: false, success: false, message: null, errors: null });
    const deleteResponse: DeleteUserResponse = { message: "Account deleted" };
    mockUserService.remove.mockResolvedValue({ ok: true, data: deleteResponse });

    await store.dispatch(deleteUser());

    const state = store.getState().user;
    expect(state.loading).toBe(false);
    expect(state.success).toBe(true);
    expect(state.profile).toBeNull();
    expect(state.message).toBe("Account deleted");
  });

  it("sets error message on failure", async () => {
    const store = makeStore();
    mockUserService.remove.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Unauthorized", error: "Unauthorized" },
    });

    await store.dispatch(deleteUser());

    const state = store.getState().user;
    expect(state.success).toBe(false);
    expect(state.message).toBe("Unauthorized");
  });

  it("sets network error when fetch throws", async () => {
    const store = makeStore();
    mockUserService.remove.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(deleteUser());

    const state = store.getState().user;
    expect(state.message).toBe(
      "Unable to reach the server. Please check your connection.",
    );
  });
});
