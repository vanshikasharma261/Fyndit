import type {
  AuthErrorResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  SignupRequest,
  SignupResponse,
  UserProfile,
} from "../../types/auth.types";

/**
 * Auth API integration. Per the frontend rules all network logic lives here in
 * the service layer — slices/thunks call these functions, components never do.
 *
 * Every request sends `credentials: "include"` because the JWT lives in an
 * HTTP-only cookie the browser must attach (and accept) on cross-origin calls.
 */

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  // Fail loudly at startup rather than firing requests at `/undefined/auth/...`.
  throw new Error(
    "VITE_API_URL is not defined. Set it in frontend/.env (e.g. http://localhost:3000).",
  );
}

/** Normalised result of a fetch call — the thunk branches on `ok`. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Parsed body: the success payload on 2xx, an error envelope otherwise. */
  data: T | AuthErrorResponse;
}

/**
 * POSTs JSON to an auth endpoint and parses the body once. `fetch` does NOT
 * reject on 4xx/5xx, so callers inspect `ok`/`status` themselves. Throws only
 * on true network failures (offline, DNS, CORS) — thunks catch that.
 */
async function postJson<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json()) as T | AuthErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

/** GETs JSON (sending the auth cookie) and parses the body once, like `postJson`. */
async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const data = (await res.json()) as T | AuthErrorResponse;
  return { ok: res.ok, status: res.status, data };
}

export const authService = {
  login: (payload: LoginRequest) =>
    postJson<LoginResponse>("/auth/login", payload),

  signup: (payload: SignupRequest) =>
    postJson<SignupResponse>("/auth/signup", payload),

  logout: () => postJson<LogoutResponse>("/auth/logout"),

  /** Restore the current session from the cookie; 401 when not signed in. */
  me: () => getJson<UserProfile>("/auth/me"),
};
