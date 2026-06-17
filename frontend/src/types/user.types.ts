/**
 * User-module API contracts, shared between the user slice, thunks, service and
 * the Profile page. Mirrors the backend `006-user-module` payloads.
 *
 * The error envelopes (`ValidationErrorResponse` / `ErrorResponse` /
 * `FieldValidationErrors`) are reused from the auth contracts — the backend
 * emits the same flat `{ errors: { field: message } }` shape everywhere.
 */

import type { ErrorResponse, ValidationErrorResponse } from "./auth.types";

export type {
  ErrorResponse,
  FieldValidationErrors,
  ValidationErrorResponse,
} from "./auth.types";

/**
 * Authenticated user's profile from `GET /user` / `PATCH /user`. Richer than
 * the auth `UserProfile` — it includes `phone`, which the Profile page edits.
 */
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  user_name: string;
  phone: string | null;
}

/** Editable profile fields. The Profile page sends one field at a time. */
export interface UpdateUserRequest {
  first_name?: string;
  last_name?: string;
  user_name?: string;
  email?: string;
  phone?: string;
}

/** The editable keys, used to type the per-row inline edit. */
export type EditableField = keyof UpdateUserRequest;

export interface DeleteUserResponse {
  message: string;
}

/** Union accepted by every user thunk's `rejectValue`. */
export type UserErrorResponse = ValidationErrorResponse | ErrorResponse;
