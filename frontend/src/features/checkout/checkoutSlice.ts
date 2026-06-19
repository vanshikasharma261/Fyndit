import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { checkoutService } from "./checkoutService";
import type { CheckoutState } from "./types";
import { logoutUser, sessionExpired } from "../auth/authSlice";
import { deleteUser } from "../user/userSlice";
import {
  CheckoutMessages,
  NetworkErrorMessages,
} from "../../constants/messages.constant";
import { NETWORK_ERROR_STATUS } from "../../constants/values.constant";
import type {
  CheckoutErrorResponse,
  CheckoutSummary,
  PaymentIntentResponse,
} from "../../types/checkout.types";

const initialState: CheckoutState = {
  summary: null,
  loading: false,
  applyingCoupon: false,
  removingCoupon: false,
  creatingIntent: false,
  error: null,
};

/** Synthetic envelope used when `fetch` itself throws (offline/DNS/CORS). */
const NETWORK_ERROR: CheckoutErrorResponse = {
  statusCode: NETWORK_ERROR_STATUS,
  error: NetworkErrorMessages.title,
  message: NetworkErrorMessages.message,
};

function errorMessage(payload: CheckoutErrorResponse | undefined): string {
  return payload?.message ?? CheckoutMessages.genericError;
}

function resetCheckout(state: CheckoutState): void {
  state.summary = null;
  state.loading = false;
  state.applyingCoupon = false;
  state.removingCoupon = false;
  state.creatingIntent = false;
  state.error = null;
}

// ----- Thunks -----

export const fetchCheckoutSummary = createAsyncThunk<
  CheckoutSummary,
  void,
  { rejectValue: CheckoutErrorResponse }
>("checkout/fetch", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await checkoutService.getSummary();
    if (ok) return data as CheckoutSummary;
    return rejectWithValue(data as CheckoutErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const applyCoupon = createAsyncThunk<
  CheckoutSummary,
  string,
  { rejectValue: CheckoutErrorResponse }
>("checkout/applyCoupon", async (code, { rejectWithValue }) => {
  try {
    const { ok, data } = await checkoutService.applyCoupon(code);
    if (ok) return data as CheckoutSummary;
    return rejectWithValue(data as CheckoutErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const removeCoupon = createAsyncThunk<
  CheckoutSummary,
  void,
  { rejectValue: CheckoutErrorResponse }
>("checkout/removeCoupon", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await checkoutService.removeCoupon();
    if (ok) return data as CheckoutSummary;
    return rejectWithValue(data as CheckoutErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const createPaymentIntent = createAsyncThunk<
  PaymentIntentResponse,
  string,
  { rejectValue: CheckoutErrorResponse }
>("checkout/createPaymentIntent", async (addressId, { rejectWithValue }) => {
  try {
    const { ok, data } = await checkoutService.createPaymentIntent(addressId);
    if (ok) return data as PaymentIntentResponse;
    return rejectWithValue(data as CheckoutErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

const checkoutSlice = createSlice({
  name: "checkout",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // ----- Fetch summary -----
      .addCase(fetchCheckoutSummary.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchCheckoutSummary.fulfilled,
        (state, action: PayloadAction<CheckoutSummary>) => {
          state.loading = false;
          state.summary = action.payload;
        },
      )
      .addCase(fetchCheckoutSummary.rejected, (state, action) => {
        state.loading = false;
        state.error = errorMessage(action.payload);
      })
      // ----- Apply coupon (refreshes the summary) -----
      .addCase(applyCoupon.pending, (state) => {
        state.applyingCoupon = true;
      })
      .addCase(
        applyCoupon.fulfilled,
        (state, action: PayloadAction<CheckoutSummary>) => {
          state.applyingCoupon = false;
          state.summary = action.payload;
        },
      )
      .addCase(applyCoupon.rejected, (state) => {
        state.applyingCoupon = false;
      })
      // ----- Remove coupon (refreshes the summary) -----
      .addCase(removeCoupon.pending, (state) => {
        state.removingCoupon = true;
      })
      .addCase(
        removeCoupon.fulfilled,
        (state, action: PayloadAction<CheckoutSummary>) => {
          state.removingCoupon = false;
          state.summary = action.payload;
        },
      )
      .addCase(removeCoupon.rejected, (state) => {
        state.removingCoupon = false;
      })
      // ----- Create payment intent (busy flag guards double-submit) -----
      .addCase(createPaymentIntent.pending, (state) => {
        state.creatingIntent = true;
      })
      .addCase(createPaymentIntent.fulfilled, (state) => {
        state.creatingIntent = false;
      })
      .addCase(createPaymentIntent.rejected, (state) => {
        state.creatingIntent = false;
      })
      // ----- Session teardown -----
      .addCase(logoutUser.fulfilled, resetCheckout)
      .addCase(sessionExpired, resetCheckout)
      .addCase(deleteUser.fulfilled, resetCheckout);
  },
});

export default checkoutSlice.reducer;
