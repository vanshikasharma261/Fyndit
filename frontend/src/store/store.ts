import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import productsReducer from "../features/products/productsSlice";
import { authExpiryMiddleware } from "./authExpiryMiddleware";

/**
 * The global Redux store. Reducers are registered per feature; future slices
 * (cart, order, …) get added to this map.
 *
 * `authExpiryMiddleware` watches every data request for a 401 and tears down
 * the session so the route guard can redirect to /login.
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    products: productsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(authExpiryMiddleware),
});

/** Full state tree type — use with `useAppSelector`. */
export type RootState = ReturnType<typeof store.getState>;

/** Dispatch type that knows about thunks — use with `useAppDispatch`. */
export type AppDispatch = typeof store.dispatch;
