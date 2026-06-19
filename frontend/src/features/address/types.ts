import type {
  AddressResponse,
  FieldValidationErrors,
} from "../../types/address.types";

/**
 * Redux state owned by the address feature. Operational feedback
 * (add/update/remove/set-default success + non-validation errors) is surfaced
 * as react-toastify toasts by the component via `.unwrap()` — the slice only
 * owns data, busy flags, and the inline form `errors` map.
 *
 * (API contract types live in `src/types/address.types.ts` since they are
 * shared with the components and service.)
 */
export interface AddressState {
  items: AddressResponse[];
  /** `GET /address` in flight (initial load / refresh). */
  loading: boolean;
  /** `POST`/`PATCH` form submit in flight. */
  saving: boolean;
  /** The `address_id` whose remove/set-default is in flight, or null. */
  mutatingId: string | null;
  /** Per-field validation errors for the open form (rendered inline). */
  errors: FieldValidationErrors | null;
}
