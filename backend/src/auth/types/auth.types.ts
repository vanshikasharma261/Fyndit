/**
 * Shared auth contracts.
 */

/** Shape of the signed JWT body. */
export interface JwtPayload {
  /** Subject — the user's id. */
  sub: string;
  email: string;
}

/** Principal attached to `req.user` after a successful guard pass. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Current-user profile returned by `GET /auth/me`. Lets the SPA restore its
 * authenticated state on load/refresh, since the JWT lives in an HTTP-only
 * cookie the client cannot read.
 */
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  user_name: string;
}
