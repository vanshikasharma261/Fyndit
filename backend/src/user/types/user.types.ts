/**
 * User-module response contracts.
 */

/**
 * Authenticated user's profile returned by `GET /user` and `PATCH /user`.
 *
 * Richer than the `GET /auth/me` `UserProfile` — it adds `phone`, which the
 * Profile page edits. `/auth/me` stays as-is (unifying the two is out of scope).
 * Sensitive columns (`password_hash`, internal flags) are never selected here.
 */
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  user_name: string;
  phone: string | null;
}
