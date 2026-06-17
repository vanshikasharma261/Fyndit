import { describe, it, expect, vi, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import authReducer, {
  clearAuthFeedback,
  sessionExpired,
  loginUser,
  signupUser,
  fetchCurrentUser,
  logoutUser,
} from "./authSlice";
import type { AuthState } from "./types";
import type { UserProfile } from "../../types/auth.types";

// ---- Mock the auth service ----
vi.mock("./authService", () => ({
  authService: {
    login: vi.fn(),
    signup: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
  },
}));

import { authService } from "./authService";

const mockAuthService = authService as {
  login: ReturnType<typeof vi.fn>;
  signup: ReturnType<typeof vi.fn>;
  me: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};

// ---- Mock the user slice to prevent cross-slice import issues ----
vi.mock("../user/userSlice", () => ({
  deleteUser: {
    fulfilled: { match: () => false, type: "user/delete/fulfilled" },
    type: "user/delete",
  },
}));

const mockUser: UserProfile = {
  id: "user-1",
  email: "test@example.com",
  first_name: "Jane",
  last_name: "Doe",
  user_name: "janedoe",
};

function makeStore(preloaded?: Partial<AuthState>) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: preloaded ? { auth: preloaded as AuthState } : undefined,
  });
}

describe("authSlice — initial state", () => {
  it("has the correct initial shape", () => {
    const store = makeStore();
    const state = store.getState().auth;

    expect(state.loading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.authChecked).toBe(false);
    expect(state.success).toBe(false);
    expect(state.message).toBeNull();
    expect(state.errors).toBeNull();
  });
});

describe("authSlice — clearAuthFeedback", () => {
  it("clears message, errors, and success", () => {
    const store = makeStore({
      loading: false,
      isAuthenticated: false,
      user: null,
      authChecked: true,
      success: true,
      message: "Logged in",
      errors: { email: "Required" },
    });

    store.dispatch(clearAuthFeedback());
    const state = store.getState().auth;

    expect(state.message).toBeNull();
    expect(state.errors).toBeNull();
    expect(state.success).toBe(false);
  });
});

describe("authSlice — sessionExpired", () => {
  it("clears auth state and sets authChecked=true", () => {
    const store = makeStore({
      loading: false,
      isAuthenticated: true,
      user: mockUser,
      authChecked: true,
      success: false,
      message: null,
      errors: null,
    });

    store.dispatch(sessionExpired());
    const state = store.getState().auth;

    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.authChecked).toBe(true);
  });
});

describe("authSlice — loginUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets loading=true while pending", () => {
    const store = makeStore();
    mockAuthService.login.mockReturnValue(new Promise(() => {}));
    store.dispatch(loginUser({ email: "test@example.com", password: "pass" }));
    expect(store.getState().auth.loading).toBe(true);
  });

  it("sets isAuthenticated and authChecked on success", async () => {
    const store = makeStore();
    mockAuthService.login.mockResolvedValue({
      ok: true,
      data: { user: { id: "user-1", email: "test@example.com" }, message: "Logged in" },
    });

    await store.dispatch(loginUser({ email: "test@example.com", password: "pass" }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.authChecked).toBe(true);
    expect(state.success).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.message).toBe("Logged in");
  });

  it("populates per-field errors on 400 validation failure", async () => {
    const store = makeStore();
    mockAuthService.login.mockResolvedValue({
      ok: false,
      data: {
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: { email: "Must be a valid email" },
      },
    });

    await store.dispatch(loginUser({ email: "bad", password: "pass" }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.errors).toEqual({ email: "Must be a valid email" });
    expect(state.message).toBeNull();
  });

  it("surfaces plain message on non-validation error (e.g. 401)", async () => {
    const store = makeStore();
    mockAuthService.login.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Invalid credentials", error: "Unauthorized" },
    });

    await store.dispatch(loginUser({ email: "test@example.com", password: "wrong" }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.errors).toBeNull();
    expect(state.message).toBe("Invalid credentials");
  });

  it("sets network error message when fetch throws", async () => {
    const store = makeStore();
    mockAuthService.login.mockRejectedValue(new Error("Network failure"));

    await store.dispatch(loginUser({ email: "test@example.com", password: "pass" }));

    const state = store.getState().auth;
    expect(state.message).toBe(
      "Unable to reach the server. Please check your connection.",
    );
  });
});

describe("authSlice — signupUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets success and message on fulfilled", async () => {
    const store = makeStore();
    mockAuthService.signup.mockResolvedValue({
      ok: true,
      data: { message: "Account created successfully" },
    });

    await store.dispatch(
      signupUser({
        first_name: "Jane",
        last_name: "Doe",
        user_name: "janedoe",
        email: "jane@example.com",
        password: "Password123!",
        phone: "9876543210",
        line1: "123 Main St",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        zip: "400001",
      }),
    );

    const state = store.getState().auth;
    expect(state.success).toBe(true);
    expect(state.message).toBe("Account created successfully");
    expect(state.loading).toBe(false);
  });

  it("populates errors on 400 validation failure", async () => {
    const store = makeStore();
    mockAuthService.signup.mockResolvedValue({
      ok: false,
      data: {
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: { email: "email must be an email" },
      },
    });

    await store.dispatch(
      signupUser({
        first_name: "Jane",
        last_name: "Doe",
        user_name: "janedoe",
        email: "not-email",
        password: "pass",
        phone: "123",
        line1: "123 St",
        city: "City",
        state: "State",
        country: "Country",
        zip: "12345",
      }),
    );

    const state = store.getState().auth;
    expect(state.errors).toEqual({ email: "email must be an email" });
  });
});

describe("authSlice — fetchCurrentUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("populates user and sets isAuthenticated on success", async () => {
    const store = makeStore();
    mockAuthService.me.mockResolvedValue({ ok: true, data: mockUser });

    await store.dispatch(fetchCurrentUser());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.authChecked).toBe(true);
  });

  it("sets isAuthenticated=false and authChecked=true on 401 (not logged in)", async () => {
    const store = makeStore();
    mockAuthService.me.mockResolvedValue({
      ok: false,
      data: { statusCode: 401, message: "Unauthorized", error: "Unauthorized" },
    });

    await store.dispatch(fetchCurrentUser());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.authChecked).toBe(true);
  });
});

describe("authSlice — logoutUser thunk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("clears session on success", async () => {
    const store = makeStore({
      loading: false,
      isAuthenticated: true,
      user: mockUser,
      authChecked: true,
      success: false,
      message: null,
      errors: null,
    });
    mockAuthService.logout.mockResolvedValue({
      ok: true,
      data: { message: "Logged out" },
    });

    await store.dispatch(logoutUser());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.message).toBe("Logged out");
  });

  it("clears session even on rejection (client-side teardown)", async () => {
    const store = makeStore({
      loading: false,
      isAuthenticated: true,
      user: mockUser,
      authChecked: true,
      success: false,
      message: null,
      errors: null,
    });
    mockAuthService.logout.mockResolvedValue({
      ok: false,
      data: { statusCode: 500, message: "Server error", error: "Internal Server Error" },
    });

    await store.dispatch(logoutUser());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });
});
