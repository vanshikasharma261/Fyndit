import { ConfigMessages } from "../../constants/messages.constant";
import type {
  DeleteUserResponse,
  UpdateUserRequest,
  UserErrorResponse,
  UserProfile,
} from "../../types/user.types";

/**
 * User API integration. Per the frontend rules all network logic lives here in
 * the service layer — slices/thunks call these functions, components never do.
 *
 * Every request sends `credentials: "include"` so the HTTP-only auth cookie is
 * attached; the backend gates each route behind the JWT guard + an
 * active-session check.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  // Fail loudly at startup rather than firing requests at `/undefined/user`.
  throw new Error(ConfigMessages.missingApiUrl);
}

/** Normalised result of a fetch call — the thunk branches on `ok`. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Parsed body: the success payload on 2xx, an error envelope otherwise. */
  data: T | UserErrorResponse;
}

/** GETs JSON (sending the auth cookie) and parses the body once. */
async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const data = (await res.json()) as T | UserErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Sends JSON with a mutating method (PATCH/DELETE) and parses the body once.
 * `fetch` does not reject on 4xx/5xx, so callers inspect `ok`/`status`; it
 * throws only on true network failures, which the thunks catch.
 */
async function sendJson<T>(
  method: "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json()) as T | UserErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

export const userService = {
  /** Fetch the authenticated user's profile (incl. `phone`). */
  get: () => getJson<UserProfile>("/user"),

  /** Update one or more editable fields; returns the refreshed profile. */
  update: (payload: UpdateUserRequest) =>
    sendJson<UserProfile>("PATCH", "/user", payload),

  /** Soft-delete the account; the backend also clears the auth cookie. */
  remove: () => sendJson<DeleteUserResponse>("DELETE", "/user"),
};
