/**
 * Authentication contracts shared between the auth slice, thunks and pages.
 * These mirror the backend `002-authentication-backend` payloads exactly.
 */

/** Supported address types (matches the backend `AddressType` enum). */
export type AddressType = "HOME" | "WORK" | "OTHER";

// ----- Requests -----

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Signup payload. The backend DTO is FLAT — address fields live at the top
 * level, NOT nested under an `address` object. The global ValidationPipe runs
 * with `forbidNonWhitelisted`, so any unknown/extra key is rejected with 400.
 * `line2` and `address_type` are optional.
 */
export interface SignupRequest {
  first_name: string;
  last_name: string;
  user_name: string;
  email: string;
  password: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  address_type?: AddressType;
}

// ----- Responses -----

export interface LoginResponse {
  user: { id: string; email: string };
  message: string;
}

/**
 * Current-user profile from `GET /auth/me`. Used to restore the authenticated
 * session on app load (the JWT cookie is HTTP-only and unreadable by JS).
 */
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  user_name: string;
}

export interface SignupResponse {
  message: string;
}

export interface LogoutResponse {
  message: string;
}

// ----- Errors -----

/** Flat per-field validation map: `{ field: message }`. */
export interface FieldValidationErrors {
  [field: string]: string;
}

/**
 * 400 envelope. The per-field map lives under `errors`; the top-level `message`
 * is always the generic `"Validation failed"`.
 */
export interface ValidationErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  errors: FieldValidationErrors;
}

/**
 * Standard NestJS exception shape for non-validation failures (401 invalid
 * credentials, 409 duplicate email, 401 unauthorized logout). `message` is a
 * single human-readable string and there is no `errors` map.
 */
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

/** Union accepted by every auth thunk's `rejectValue`. */
export type AuthErrorResponse = ValidationErrorResponse | ErrorResponse;
