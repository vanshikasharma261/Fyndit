/**
 * Image URL helpers. The API returns stored image paths relative to its origin
 * (e.g. `/assets/products/<slug>/<color>/1.jpg`); the UI prefixes them with the
 * API origin so `<img src>` resolves against the backend, not the frontend host.
 */

const API_URL = import.meta.env.VITE_API_URL;

/** Prefix a stored image path (`/assets/...`) with the API origin. */
export function resolveImageUrl(path: string | null): string | null {
  return path ? `${API_URL}${path}` : null;
}
