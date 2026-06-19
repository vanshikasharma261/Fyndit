/**
 * Address-module API contracts, shared between the address slice, thunks,
 * service and the Profile addresses panel. Mirrors the backend
 * `008-address-module` payloads exactly.
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

export type AddressType = "HOME" | "WORK" | "OTHER";

/** A saved address from `GET /address` and the add/update responses. */
export interface AddressResponse {
  address_id: string;
  address_type: AddressType;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  zip: string;
  is_default: boolean;
}

/** Body for `POST /address`. `is_default` is not client-settable. */
export interface CreateAddressRequest {
  address_type: AddressType;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  zip: string;
}

/** Body for `PATCH /address/:id` — any subset of the create fields. */
export type UpdateAddressRequest = Partial<CreateAddressRequest>;

/** Union accepted by every address thunk's `rejectValue`. */
export type AddressErrorResponse = ValidationErrorResponse | ErrorResponse;
