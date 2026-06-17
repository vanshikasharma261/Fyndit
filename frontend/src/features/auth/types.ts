import type { FieldValidationErrors, UserProfile } from "../../types/auth.types";

/**
 * Redux state owned by the auth feature. (API contract types live in
 * `src/types/auth.types.ts` since they are shared with pages and the service.)
 */
export interface AuthState {
  loading: boolean;
  isAuthenticated: boolean;
  /** The signed-in user's profile (name/email), or null when signed out. */
  user: UserProfile | null;
  /**
   * Whether the initial `GET /auth/me` session-restore check has completed.
   * Guards the navbar from flashing "Sign In" before the cookie is verified.
   */
  authChecked: boolean;
  success: boolean;
  message: string | null;
  /** Flat per-field validation map only (the backend's `response.errors`). */
  errors: FieldValidationErrors | null;
}
