import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { addressService } from "./addressService";
import type { AddressState } from "./types";
import { logoutUser, sessionExpired } from "../auth/authSlice";
import { deleteUser } from "../user/userSlice";
import { NetworkErrorMessages } from "../../constants/messages.constant";
import { NETWORK_ERROR_STATUS } from "../../constants/values.constant";
import type {
  AddressErrorResponse,
  AddressResponse,
  CreateAddressRequest,
  UpdateAddressRequest,
  ValidationErrorResponse,
} from "../../types/address.types";

const initialState: AddressState = {
  items: [],
  loading: false,
  saving: false,
  mutatingId: null,
  errors: null,
};

/** Synthetic envelope used when `fetch` itself throws (offline/DNS/CORS). */
const NETWORK_ERROR: AddressErrorResponse = {
  statusCode: NETWORK_ERROR_STATUS,
  error: NetworkErrorMessages.title,
  message: NetworkErrorMessages.message,
};

/** A 400 validation envelope carries a per-field `errors` map; others don't. */
export function isAddressValidationError(
  payload: AddressErrorResponse,
): payload is ValidationErrorResponse {
  return (
    "errors" in payload &&
    typeof payload.errors === "object" &&
    payload.errors !== null
  );
}

/** Reset to empty (on logout / session end / account deletion). */
function resetAddresses(state: AddressState): void {
  state.items = [];
  state.loading = false;
  state.saving = false;
  state.mutatingId = null;
  state.errors = null;
}

// ----- Thunks -----
// Operational feedback is surfaced as a toast in the component that dispatches
// (success/error via `.unwrap()`); the slice owns data, busy flags and the
// inline form `errors` map only. add/remove re-fetch the list so the canonical
// "default first" ordering and the default invariant are always reflected.

export const fetchAddresses = createAsyncThunk<
  AddressResponse[],
  void,
  { rejectValue: AddressErrorResponse }
>("address/fetch", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await addressService.list();
    if (ok) return data as AddressResponse[];
    return rejectWithValue(data as AddressErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const addAddress = createAsyncThunk<
  AddressResponse,
  CreateAddressRequest,
  { rejectValue: AddressErrorResponse }
>("address/add", async (payload, { dispatch, rejectWithValue }) => {
  try {
    const { ok, data } = await addressService.add(payload);
    if (ok) {
      await dispatch(fetchAddresses());
      return data as AddressResponse;
    }
    return rejectWithValue(data as AddressErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const updateAddress = createAsyncThunk<
  AddressResponse,
  { addressId: string; payload: UpdateAddressRequest },
  { rejectValue: AddressErrorResponse }
>("address/update", async ({ addressId, payload }, { rejectWithValue }) => {
  try {
    const { ok, data } = await addressService.update(addressId, payload);
    if (ok) return data as AddressResponse;
    return rejectWithValue(data as AddressErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const setDefaultAddress = createAsyncThunk<
  AddressResponse[],
  string,
  { rejectValue: AddressErrorResponse }
>("address/setDefault", async (addressId, { rejectWithValue }) => {
  try {
    const { ok, data } = await addressService.setDefault(addressId);
    if (ok) return data as AddressResponse[];
    return rejectWithValue(data as AddressErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const removeAddress = createAsyncThunk<
  string,
  string,
  { rejectValue: AddressErrorResponse }
>("address/remove", async (addressId, { dispatch, rejectWithValue }) => {
  try {
    const { ok, data } = await addressService.remove(addressId);
    if (ok) {
      await dispatch(fetchAddresses());
      return addressId;
    }
    return rejectWithValue(data as AddressErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

/** Store the per-field map on a validation failure; clear it otherwise. */
function applyFormErrors(
  state: AddressState,
  payload: AddressErrorResponse | undefined,
): void {
  state.errors =
    payload && isAddressValidationError(payload) ? payload.errors : null;
}

const addressSlice = createSlice({
  name: "address",
  initialState,
  reducers: {
    /** Clear inline form errors (e.g. when opening/closing the form). */
    clearAddressErrors(state) {
      state.errors = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ----- Fetch -----
      .addCase(fetchAddresses.pending, (state) => {
        state.loading = true;
      })
      .addCase(
        fetchAddresses.fulfilled,
        (state, action: PayloadAction<AddressResponse[]>) => {
          state.loading = false;
          state.items = action.payload;
        },
      )
      .addCase(fetchAddresses.rejected, (state) => {
        state.loading = false;
      })
      // ----- Add (list refreshed by the dispatched fetch) -----
      .addCase(addAddress.pending, (state) => {
        state.saving = true;
        state.errors = null;
      })
      .addCase(addAddress.fulfilled, (state) => {
        state.saving = false;
        state.errors = null;
      })
      .addCase(addAddress.rejected, (state, action) => {
        state.saving = false;
        applyFormErrors(state, action.payload);
      })
      // ----- Update (replace the line in place; default unchanged) -----
      .addCase(updateAddress.pending, (state) => {
        state.saving = true;
        state.errors = null;
      })
      .addCase(
        updateAddress.fulfilled,
        (state, action: PayloadAction<AddressResponse>) => {
          state.saving = false;
          state.errors = null;
          const index = state.items.findIndex(
            (item) => item.address_id === action.payload.address_id,
          );
          if (index >= 0) state.items[index] = action.payload;
        },
      )
      .addCase(updateAddress.rejected, (state, action) => {
        state.saving = false;
        applyFormErrors(state, action.payload);
      })
      // ----- Set default (returns the refreshed list) -----
      .addCase(setDefaultAddress.pending, (state, action) => {
        state.mutatingId = action.meta.arg;
      })
      .addCase(
        setDefaultAddress.fulfilled,
        (state, action: PayloadAction<AddressResponse[]>) => {
          state.mutatingId = null;
          state.items = action.payload;
        },
      )
      .addCase(setDefaultAddress.rejected, (state) => {
        state.mutatingId = null;
      })
      // ----- Remove (list refreshed by the dispatched fetch) -----
      .addCase(removeAddress.pending, (state, action) => {
        state.mutatingId = action.meta.arg;
      })
      .addCase(removeAddress.fulfilled, (state) => {
        state.mutatingId = null;
      })
      .addCase(removeAddress.rejected, (state) => {
        state.mutatingId = null;
      })
      // ----- Session teardown -----
      .addCase(logoutUser.fulfilled, resetAddresses)
      .addCase(sessionExpired, resetAddresses)
      .addCase(deleteUser.fulfilled, resetAddresses);
  },
});

export const { clearAddressErrors } = addressSlice.actions;
export default addressSlice.reducer;
