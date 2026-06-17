import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { userService } from "./userService";
import type { UserState } from "./types";
import {
  NetworkErrorMessages,
  UserMessages,
} from "../../constants/messages.constant";
import { NETWORK_ERROR_STATUS } from "../../constants/values.constant";
import type {
  DeleteUserResponse,
  UpdateUserRequest,
  UserErrorResponse,
  UserProfile,
  ValidationErrorResponse,
} from "../../types/user.types";

const initialState: UserState = {
  profile: null,
  loading: false,
  success: false,
  message: null,
  errors: null,
};

/**
 * Synthetic envelope used when `fetch` itself throws (offline/DNS/CORS). Built
 * from the shared `NETWORK_ERROR_STATUS` + `NetworkErrorMessages` so the offline
 * copy/status stay defined in exactly one place.
 */
const NETWORK_ERROR: UserErrorResponse = {
  statusCode: NETWORK_ERROR_STATUS,
  error: NetworkErrorMessages.title,
  message: NetworkErrorMessages.message,
};

/** A 400 validation envelope carries a per-field `errors` map; others don't. */
function isValidationError(
  payload: UserErrorResponse,
): payload is ValidationErrorResponse {
  return (
    "errors" in payload &&
    typeof payload.errors === "object" &&
    payload.errors !== null
  );
}

// ----- Thunks -----

export const fetchUser = createAsyncThunk<
  UserProfile,
  void,
  { rejectValue: UserErrorResponse }
>("user/fetch", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await userService.get();
    if (ok) return data as UserProfile;
    return rejectWithValue(data as UserErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const updateUser = createAsyncThunk<
  UserProfile,
  UpdateUserRequest,
  { rejectValue: UserErrorResponse }
>("user/update", async (payload, { rejectWithValue }) => {
  try {
    const { ok, data } = await userService.update(payload);
    if (ok) return data as UserProfile;
    return rejectWithValue(data as UserErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const deleteUser = createAsyncThunk<
  DeleteUserResponse,
  void,
  { rejectValue: UserErrorResponse }
>("user/delete", async (_, { rejectWithValue }) => {
  try {
    const { ok, data } = await userService.remove();
    if (ok) return data as DeleteUserResponse;
    return rejectWithValue(data as UserErrorResponse);
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

/** Shared pending behaviour: enter loading, clear prior feedback. */
function startRequest(state: UserState): void {
  state.loading = true;
  state.success = false;
  state.message = null;
  state.errors = null;
}

/**
 * Shared rejection behaviour, mirroring the auth slice. Validation failures
 * (400) populate `state.errors` with the per-field map and surface the
 * "Validation Failed" toast copy; everything else surfaces the server message.
 */
function failRequest(
  state: UserState,
  payload: UserErrorResponse | undefined,
): void {
  state.loading = false;
  state.success = false;

  if (payload && isValidationError(payload)) {
    state.errors = payload.errors;
    state.message = UserMessages.validationFailed;
  } else {
    state.errors = null;
    state.message = payload?.message ?? UserMessages.genericError;
  }
}

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    /** Clear transient feedback (e.g. when entering/leaving edit mode). */
    clearUserFeedback(state) {
      state.message = null;
      state.errors = null;
      state.success = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // ----- Fetch profile -----
      .addCase(fetchUser.pending, startRequest)
      .addCase(
        fetchUser.fulfilled,
        (state, action: PayloadAction<UserProfile>) => {
          state.loading = false;
          state.profile = action.payload;
          state.errors = null;
          state.message = null;
        },
      )
      .addCase(fetchUser.rejected, (state, action) => {
        failRequest(state, action.payload);
      })
      // ----- Update field -----
      .addCase(updateUser.pending, startRequest)
      .addCase(
        updateUser.fulfilled,
        (state, action: PayloadAction<UserProfile>) => {
          state.loading = false;
          state.success = true;
          state.profile = action.payload;
          state.errors = null;
          state.message = UserMessages.updateSuccess;
        },
      )
      .addCase(updateUser.rejected, (state, action) => {
        failRequest(state, action.payload);
      })
      // ----- Delete account -----
      .addCase(deleteUser.pending, startRequest)
      .addCase(
        deleteUser.fulfilled,
        (state, action: PayloadAction<DeleteUserResponse>) => {
          state.loading = false;
          state.success = true;
          state.profile = null;
          state.errors = null;
          state.message = action.payload.message;
        },
      )
      .addCase(deleteUser.rejected, (state, action) => {
        failRequest(state, action.payload);
      });
  },
});

export const { clearUserFeedback } = userSlice.actions;
export default userSlice.reducer;
