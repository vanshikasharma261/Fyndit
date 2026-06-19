import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { orderService } from "./orderService";
import type { OrderState } from "./types";
import { logoutUser, sessionExpired } from "../auth/authSlice";
import { deleteUser } from "../user/userSlice";
import {
  NetworkErrorMessages,
  OrderMessages,
} from "../../constants/messages.constant";
import { NETWORK_ERROR_STATUS } from "../../constants/values.constant";
import type {
  OrderDetail,
  OrderErrorResponse,
  OrderListResponse,
} from "../../types/order.types";

const initialState: OrderState = {
  list: [],
  meta: null,
  detail: null,
  loading: false,
  detailLoading: false,
  placing: false,
  cancellingId: null,
  error: null,
};

/** Synthetic envelope used when `fetch` itself throws (offline/DNS/CORS). */
const NETWORK_ERROR: OrderErrorResponse = {
  statusCode: NETWORK_ERROR_STATUS,
  error: NetworkErrorMessages.title,
  message: NetworkErrorMessages.message,
};

function errorMessage(payload: OrderErrorResponse | undefined): string {
  return payload?.message ?? OrderMessages.genericError;
}

function resetOrders(state: OrderState): void {
  state.list = [];
  state.meta = null;
  state.detail = null;
  state.loading = false;
  state.detailLoading = false;
  state.placing = false;
  state.cancellingId = null;
  state.error = null;
}

// ----- Thunks -----

export const placeCodOrder = createAsyncThunk<
  OrderDetail,
  string,
  { rejectValue: OrderErrorResponse }
>("order/placeCod", async (addressId, { rejectWithValue }) => {
  try {
    const { ok, data } = await orderService.placeCod(addressId);
    if (ok) return data as OrderDetail;
    return rejectWithValue(data as OrderErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const fetchOrders = createAsyncThunk<
  OrderListResponse,
  number,
  { rejectValue: OrderErrorResponse }
>("order/list", async (page, { rejectWithValue }) => {
  try {
    const { ok, data } = await orderService.list(page);
    if (ok) return data as OrderListResponse;
    return rejectWithValue(data as OrderErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const fetchOrderDetail = createAsyncThunk<
  OrderDetail,
  string,
  { rejectValue: OrderErrorResponse }
>("order/detail", async (orderId, { rejectWithValue }) => {
  try {
    const { ok, data } = await orderService.detail(orderId);
    if (ok) return data as OrderDetail;
    return rejectWithValue(data as OrderErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const cancelOrder = createAsyncThunk<
  string,
  string,
  { rejectValue: OrderErrorResponse }
>("order/cancel", async (orderId, { rejectWithValue }) => {
  try {
    const { ok, data } = await orderService.cancel(orderId);
    if (ok) return orderId;
    return rejectWithValue(data as OrderErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

const orderSlice = createSlice({
  name: "order",
  initialState,
  reducers: {
    /** Drop the loaded detail (e.g. when leaving the detail page). */
    clearOrderDetail(state) {
      state.detail = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ----- Place COD -----
      .addCase(placeCodOrder.pending, (state) => {
        state.placing = true;
      })
      .addCase(placeCodOrder.fulfilled, (state) => {
        state.placing = false;
      })
      .addCase(placeCodOrder.rejected, (state) => {
        state.placing = false;
      })
      // ----- History -----
      .addCase(fetchOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchOrders.fulfilled,
        (state, action: PayloadAction<OrderListResponse>) => {
          state.loading = false;
          state.list = action.payload.orders;
          state.meta = action.payload.meta;
        },
      )
      .addCase(fetchOrders.rejected, (state, action) => {
        state.loading = false;
        state.error = errorMessage(action.payload);
      })
      // ----- Detail -----
      .addCase(fetchOrderDetail.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
        state.detail = null;
      })
      .addCase(
        fetchOrderDetail.fulfilled,
        (state, action: PayloadAction<OrderDetail>) => {
          state.detailLoading = false;
          state.detail = action.payload;
        },
      )
      .addCase(fetchOrderDetail.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = errorMessage(action.payload);
      })
      // ----- Cancel -----
      .addCase(cancelOrder.pending, (state, action) => {
        state.cancellingId = action.meta.arg;
      })
      .addCase(cancelOrder.fulfilled, (state) => {
        state.cancellingId = null;
      })
      .addCase(cancelOrder.rejected, (state) => {
        state.cancellingId = null;
      })
      // ----- Session teardown -----
      .addCase(logoutUser.fulfilled, resetOrders)
      .addCase(sessionExpired, resetOrders)
      .addCase(deleteUser.fulfilled, resetOrders);
  },
});

export const { clearOrderDetail } = orderSlice.actions;
export default orderSlice.reducer;
