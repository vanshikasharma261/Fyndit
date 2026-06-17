import type {
  FieldValidationErrors,
  UserProfile,
} from "../../types/user.types";

/**
 * Redux state owned by the user feature. Mirrors the auth feedback model:
 * validation failures (400) populate `errors` (the flat per-field map),
 * everything else populates `message`. (API contract types live in
 * `src/types/user.types.ts` since they are shared with the page and service.)
 */
export interface UserState {
  /** The authenticated user's profile, or null until `fetchUser` resolves. */
  profile: UserProfile | null;
  loading: boolean;
  success: boolean;
  message: string | null;
  /** Flat per-field validation map only (the backend's `response.errors`). */
  errors: FieldValidationErrors | null;
}
