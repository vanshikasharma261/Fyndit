import { ConfigMessages } from "../../constants/messages.constant";
import type {
  AddressErrorResponse,
  AddressResponse,
  CreateAddressRequest,
  UpdateAddressRequest,
} from "../../types/address.types";

/**
 * Address API integration. Per the frontend rules all network logic lives here
 * in the service layer — slices/thunks call these functions, components never
 * do.
 *
 * Every request sends `credentials: "include"` so the HTTP-only auth cookie is
 * attached; the backend gates each route behind the JWT guard + an
 * active-session check.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  // Fail loudly at startup rather than firing requests at `/undefined/address`.
  throw new Error(ConfigMessages.missingApiUrl);
}

/** Normalised result of a fetch call — the thunk branches on `ok`. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Parsed body: the success payload on 2xx, an error envelope otherwise. */
  data: T | AddressErrorResponse;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Sends a request and parses the body once. `fetch` does not reject on 4xx/5xx,
 * so callers inspect `ok`/`status`; it throws only on true network failures,
 * which the thunks catch.
 */
async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json()) as T | AddressErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

export const addressService = {
  /** The user's active addresses (default first). */
  list: () => request<AddressResponse[]>("GET", "/address"),

  /** Add a new address. */
  add: (payload: CreateAddressRequest) =>
    request<AddressResponse>("POST", "/address", payload),

  /** Update an address's fields. */
  update: (addressId: string, payload: UpdateAddressRequest) =>
    request<AddressResponse>(
      "PATCH",
      `/address/${encodeURIComponent(addressId)}`,
      payload,
    ),

  /** Make an address the default; returns the refreshed list. */
  setDefault: (addressId: string) =>
    request<AddressResponse[]>(
      "PATCH",
      `/address/${encodeURIComponent(addressId)}/default`,
    ),

  /** Soft-remove an address. */
  remove: (addressId: string) =>
    request<{ message: string }>(
      "DELETE",
      `/address/${encodeURIComponent(addressId)}`,
    ),
};
