import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { authService } from "./authService";
import { deleteUser } from "../user/userSlice";
import type { AuthState } from "./types";
import type {
  AuthErrorResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  SignupRequest,
  SignupResponse,
  UserProfile,
  ValidationErrorResponse,
} from "../../types/auth.types";

const initialState: AuthState = {
  loading: false,
  isAuthenticated: false,
  user: null,
  authChecked: false,
  success: false,
  message: null,
  errors: null,
};

/** Synthetic envelope used when `fetch` itself throws (offline/DNS/CORS). */
const NETWORK_ERROR: AuthErrorResponse = {
  statusCode: 0,
  error: "Network Error",
  message: "Unable to reach the server. Please check your connection.",
};

/** A 400 validation envelope carries a per-field `errors` map; others don't. */
function isValidationError(
  payload: AuthErrorResponse,
): payload is ValidationErrorResponse {
  return (
    "errors" in payload &&
    typeof payload.errors === "object" &&
    payload.errors !== null
  );
}

// ----- Thunks -----

export const loginUser = createAsyncThunk<
  LoginResponse,
  LoginRequest,
  { rejectValue: AuthErrorResponse }
>("auth/login", async (payload, { rejectWithValue }) => {
  try {
    const { ok, data } = await authService.login(payload);
    if (ok) return data as LoginResponse;
    return rejectWithValue(data as AuthErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const signupUser = createAsyncThunk<
  SignupResponse,
  SignupRequest,
  { rejectValue: AuthErrorResponse }
>("auth/signup", async (payload, { rejectWithValue }) => {
  try {
    const { ok, data } = await authService.signup(payload);
    if (ok) return data as SignupResponse;
    return rejectWithValue(data as AuthErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

/**
 * Restores the session on app load by calling `GET /auth/me` with the cookie.
 * A 401 simply means "not signed in" — it is not surfaced as an error banner.
 */
export const fetchCurrentUser = createAsyncThunk<
  UserProfile,
  void,
  { rejectValue: AuthErrorResponse }
>("auth/me", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await authService.me();
    if (ok) return data as UserProfile;
    return rejectWithValue(data as AuthErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const logoutUser = createAsyncThunk<
  LogoutResponse,
  void,
  { rejectValue: AuthErrorResponse }
>("auth/logout", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await authService.logout();
    if (ok) return data as LogoutResponse;
    return rejectWithValue(data as AuthErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

/** Shared pending behaviour: enter loading, clear prior feedback. */
function startRequest(state: AuthState): void {
  state.loading = true;
  state.success = false;
  state.message = null;
  state.errors = null;
}

/**
 * Shared rejection behaviour. Validation failures (400) populate `state.errors`
 * with the per-field map; everything else surfaces the top-level `message`.
 * Rejection data is always read from `action.payload` (set by `rejectWithValue`).
 */
function failRequest(
  state: AuthState,
  payload: AuthErrorResponse | undefined,
): void {
  state.loading = false;
  state.success = false;

  if (payload && isValidationError(payload)) {
    state.errors = payload.errors;
    state.message = null;
  } else {
    state.errors = null;
    state.message = payload?.message ?? "Something went wrong. Please try again.";
  }
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /** Clear transient feedback (e.g. on unmount or before a fresh submit). */
    clearAuthFeedback(state) {
      state.message = null;
      state.errors = null;
      state.success = false;
    },
    /**
     * Tear down the session after a mid-use 401 (cookie expired, logged out in
     * another tab, account deactivated). Dispatched by the auth-expiry
     * middleware; the route guard then redirects to /login. `authChecked` stays
     * true so the guard redirects immediately rather than showing the loader.
     */
    sessionExpired(state) {
      state.isAuthenticated = false;
      state.user = null;
      state.loading = false;
      state.success = false;
      state.message = null;
      state.errors = null;
      state.authChecked = true;
    },
  },
  extraReducers: (builder) => {
    builder
      // ----- Login -----
      .addCase(loginUser.pending, startRequest)
      .addCase(
        loginUser.fulfilled,
        (state, action: PayloadAction<LoginResponse>) => {
          state.loading = false;
          state.success = true;
          state.isAuthenticated = true;
          state.authChecked = true;
          state.message = action.payload.message;
          state.errors = null;
        },
      )
      .addCase(loginUser.rejected, (state, action) => {
        state.isAuthenticated = false;
        state.user = null;
        failRequest(state, action.payload);
      })
      // ----- Session restore (GET /auth/me) -----
      .addCase(
        fetchCurrentUser.fulfilled,
        (state, action: PayloadAction<UserProfile>) => {
          state.isAuthenticated = true;
          state.user = action.payload;
          state.authChecked = true;
        },
      )
      .addCase(fetchCurrentUser.rejected, (state) => {
        // A 401 here is the normal "not signed in" case — no error banner.
        state.isAuthenticated = false;
        state.user = null;
        state.authChecked = true;
      })
      // ----- Signup -----
      .addCase(signupUser.pending, startRequest)
      .addCase(
        signupUser.fulfilled,
        (state, action: PayloadAction<SignupResponse>) => {
          state.loading = false;
          state.success = true;
          state.message = action.payload.message;
          state.errors = null;
        },
      )
      .addCase(signupUser.rejected, (state, action) => {
        failRequest(state, action.payload);
      })
      // ----- Logout -----
      .addCase(logoutUser.pending, startRequest)
      .addCase(
        logoutUser.fulfilled,
        (state, action: PayloadAction<LogoutResponse>) => {
          state.loading = false;
          state.success = true;
          state.isAuthenticated = false;
          state.user = null;
          state.message = action.payload.message;
          state.errors = null;
        },
      )
      .addCase(logoutUser.rejected, (state, action) => {
        // Logout is a client-side teardown: drop the session regardless of the
        // server outcome so a failed request can't leave the UI "logged in"
        // (which would bounce the user off /login back to home).
        state.isAuthenticated = false;
        state.user = null;
        failRequest(state, action.payload);
      })
      // ----- Account soft-delete (user feature) -----
      .addCase(deleteUser.fulfilled, (state) => {
        // A successful DELETE /user ends the session (the backend also clears
        // the cookie). Tear down auth state here so the navbar can't keep
        // showing the user as signed in; the route guard then redirects.
        state.isAuthenticated = false;
        state.user = null;
        state.authChecked = true;
      });
  },
});

export const { clearAuthFeedback, sessionExpired } = authSlice.actions;
export default authSlice.reducer;
