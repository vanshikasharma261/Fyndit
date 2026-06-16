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
