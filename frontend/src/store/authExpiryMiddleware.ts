import { isRejectedWithValue } from "@reduxjs/toolkit";
import type { Middleware } from "@reduxjs/toolkit";
import { sessionExpired } from "../features/auth/authSlice";
import { UNAUTHORIZED_STATUS } from "../constants/values.constant";

/** The slice of an error envelope this interceptor cares about. */
interface RejectedAuthPayload {
  statusCode?: number;
}

/**
 * Global session-expiry interceptor. When a *data* request (products today,
 * cart/order later) is rejected with a 401, the cookie session has died
 * mid-use — expired, logged out in another tab, or the account was
 * deactivated. We clear the auth state via {@link sessionExpired}; the route
 * guard then redirects to /login. The guard owns navigation, so the middleware
 * never needs router access.
 *
 * Auth endpoints are deliberately skipped: their own 401s are normal — bad
 * login credentials, or the not-signed-in `GET /auth/me` probe on first load —
 * and are already handled by the auth slice. Reacting to them here would clear
 * the login error banner before the user could read it.
 */
export const authExpiryMiddleware: Middleware =
  (store) => (next) => (action) => {
    if (isRejectedWithValue(action) && !action.type.startsWith("auth/")) {
      const payload = action.payload as RejectedAuthPayload | undefined;
      if (payload?.statusCode === UNAUTHORIZED_STATUS) {
        store.dispatch(sessionExpired());
      }
    }
    return next(action);
  };
