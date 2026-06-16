const DEFAULT_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parses a JWT-style duration (`"1d"`, `"12h"`, `"30m"`, `"3600s"`, or a bare
 * seconds number) into milliseconds for an auth cookie's `maxAge`, falling back
 * to one day when the value is missing or unparseable. A bare number is treated
 * as seconds, matching `jsonwebtoken`'s `expiresIn` semantics.
 */
export function resolveCookieMaxAge(expiresIn: string | undefined): number {
  if (!expiresIn) {
    return DEFAULT_COOKIE_MAX_AGE_MS;
  }

  const match = /^(\d+)\s*([smhd])?$/.exec(expiresIn.trim());
  if (!match) {
    return DEFAULT_COOKIE_MAX_AGE_MS;
  }

  const value = Number(match[1]);
  return value * (match[2] ? UNIT_TO_MS[match[2]] : 1000);
}
