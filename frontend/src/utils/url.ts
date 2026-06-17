/**
 * URL query-string parsing helpers. Pages keep the URL as the source of truth
 * for listing state, so these turn raw `URLSearchParams` values into typed data.
 */

/** Parse a numeric query param, returning undefined when absent/invalid. */
export function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse the `attributes` query param into a map; tolerate malformed input. */
export function parseAttributes(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string[]>;
    }
  } catch {
    // Ignore — a malformed URL falls back to no attribute filters.
  }
  return {};
}
