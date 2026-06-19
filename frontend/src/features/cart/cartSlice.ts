import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { cartService } from "./cartService";
import type { CartState } from "./types";
import { logoutUser, sessionExpired } from "../auth/authSlice";
import { deleteUser } from "../user/userSlice";
import {
  CartMessages,
  NetworkErrorMessages,
} from "../../constants/messages.constant";
import { NETWORK_ERROR_STATUS } from "../../constants/values.constant";
import type {
  AddToCartResponse,
  CartErrorResponse,
  CartResponse,
  UpdateCartResponse,
} from "../../types/cart.types";

const initialState: CartState = {
  items: [],
  summary: null,
  loading: false,
  error: null,
  mutatingId: null,
  adding: false,
};

/** Synthetic envelope used when `fetch` itself throws (offline/DNS/CORS). */
const NETWORK_ERROR: CartErrorResponse = {
  statusCode: NETWORK_ERROR_STATUS,
  error: NetworkErrorMessages.title,
  message: NetworkErrorMessages.message,
};

/** Pull a human-readable message out of an error envelope. */
function errorMessage(payload: CartErrorResponse | undefined): string {
  return payload?.message ?? CartMessages.genericError;
}

/** Reset to an empty cart (on logout / session end / account deletion). */
function resetCart(state: CartState): void {
  state.items = [];
  state.summary = null;
  state.loading = false;
  state.error = null;
  state.mutatingId = null;
  state.adding = false;
}

// ----- Thunks -----
// Feedback for mutations is surfaced as a toast in the component that dispatches
// (success/error via `.unwrap()`), so the slice only owns data + busy flags.

export const fetchCart = createAsyncThunk<
  CartResponse,
  void,
  { rejectValue: CartErrorResponse }
>("cart/fetch", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await cartService.get();
    if (ok) return data as CartResponse;
    return rejectWithValue(data as CartErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const addToCart = createAsyncThunk<
  AddToCartResponse,
  string,
  { rejectValue: CartErrorResponse }
>("cart/add", async (productVariantId, { rejectWithValue }) => {
  try {
    const { ok, data } = await cartService.add(productVariantId);
    if (ok) return data as AddToCartResponse;
    return rejectWithValue(data as CartErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const updateCartItem = createAsyncThunk<
  UpdateCartResponse,
  { cartItemId: string; quantity: number },
  { rejectValue: CartErrorResponse }
>("cart/update", async ({ cartItemId, quantity }, { rejectWithValue }) => {
  try {
    const { ok, data } = await cartService.update(cartItemId, quantity);
    if (ok) return data as UpdateCartResponse;
    return rejectWithValue(data as CartErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const removeCartItem = createAsyncThunk<
  string,
  string,
  { rejectValue: CartErrorResponse }
>("cart/remove", async (cartItemId, { dispatch, rejectWithValue }) => {
  try {
    const { ok, data } = await cartService.remove(cartItemId);
    if (ok) {
      // Delete returns a message only — re-fetch so items + summary refresh.
      await dispatch(fetchCart());
      return cartItemId;
    }
    return rejectWithValue(data as CartErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

/** Replace a line in place if present, otherwise append it. */
function upsertItem(state: CartState, item: CartState["items"][number]): void {
  const index = state.items.findIndex(
    (existing) => existing.cart_item_id === item.cart_item_id,
  );
  if (index >= 0) {
    state.items[index] = item;
  } else {
    state.items.push(item);
  }
}

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // ----- Fetch -----
      .addCase(fetchCart.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchCart.fulfilled,
        (state, action: PayloadAction<CartResponse>) => {
          state.loading = false;
          state.items = action.payload.items;
          state.summary = action.payload.summary;
        },
      )
      .addCase(fetchCart.rejected, (state, action) => {
        state.loading = false;
        state.error = errorMessage(action.payload);
      })
      // ----- Add -----
      .addCase(addToCart.pending, (state) => {
        state.adding = true;
      })
      .addCase(
        addToCart.fulfilled,
        (state, action: PayloadAction<AddToCartResponse>) => {
          state.adding = false;
          upsertItem(state, action.payload.item);
          state.summary = action.payload.summary;
        },
      )
      .addCase(addToCart.rejected, (state) => {
        state.adding = false;
      })
      // ----- Update quantity -----
      .addCase(updateCartItem.pending, (state, action) => {
        state.mutatingId = action.meta.arg.cartItemId;
      })
      .addCase(
        updateCartItem.fulfilled,
        (state, action: PayloadAction<UpdateCartResponse>) => {
          state.mutatingId = null;
          upsertItem(state, action.payload.item);
          state.summary = action.payload.summary;
        },
      )
      .addCase(updateCartItem.rejected, (state) => {
        state.mutatingId = null;
      })
      // ----- Remove -----
      .addCase(removeCartItem.pending, (state, action) => {
        state.mutatingId = action.meta.arg;
      })
      .addCase(removeCartItem.fulfilled, (state) => {
        // items + summary are refreshed by the fetchCart the thunk dispatched.
        state.mutatingId = null;
      })
      .addCase(removeCartItem.rejected, (state) => {
        state.mutatingId = null;
      })
      // ----- Session teardown: empty the cart so the badge can't go stale -----
      .addCase(logoutUser.fulfilled, resetCart)
      .addCase(sessionExpired, resetCart)
      .addCase(deleteUser.fulfilled, resetCart);
  },
});

export default cartSlice.reducer;
