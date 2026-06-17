import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppSelector } from "../store/hooks";
import { AuthGateMessages } from "../constants/messages.constant";
import styles from "./RequireAuth.module.css";

/**
 * Route guard for the protected application shell. The entire app requires an
 * authenticated session, so every content route lives behind this gate.
 *
 * - While the initial `GET /auth/me` check is still in flight (`!authChecked`)
 *   we render a neutral loader — deciding now would wrongly bounce a
 *   signed-in user to /login on every refresh before the cookie is verified.
 * - Once resolved, an unauthenticated visitor is redirected to /login. The
 *   attempted location is preserved in router state so a future enhancement can
 *   return the user there after login. `replace` keeps it out of history.
 * - Otherwise the nested routes (MainLayout + pages) render.
 *
 * This also handles mid-session expiry: the auth-expiry middleware clears the
 * session on a 401, which flips `isAuthenticated` to false and re-runs this
 * guard, redirecting to /login automatically.
 */
function RequireAuth() {
  const { authChecked, isAuthenticated } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (!authChecked) {
    return (
      <div className={styles.gate} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.message}>{AuthGateMessages.checkingSession}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
