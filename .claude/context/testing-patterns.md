# Fyndit Testing Patterns

---

## Vitest + RTL Setup [user-profile, products-browsing]

Vitest unit tests require a `vitest.config.ts` at `frontend/` root with `environment: "jsdom"`, `globals: true`, and `setupFiles: ["./src/test/setup.ts"]`. The setup file imports `@testing-library/jest-dom` and provides a `ResizeObserver` stub because jsdom does not implement it. Without the stub, any component using `ResizeObserver` (such as `FilterSidebar`) throws during the effect phase.

---

## Redux Test Store Pattern [user-profile, products-browsing]

For unit tests that need Redux state, use `configureStore` directly with only the relevant reducer rather than importing the full app store. Preload state using `preloadedState` to seed specific scenarios. Use `vi.mock()` on the service module to prevent real network calls from thunks.

---

## renderWithProviders Utility [user-profile]

All RTL component tests that need Redux or routing use the `src/test/renderWithProviders.tsx` helper. It wraps the component in `Provider` (with a fresh test store) and `MemoryRouter`. Pass `preloadedState` to seed initial Redux state and `initialRoute` to control the router entry.

---

## React StrictMode and Playwright /auth/me Intercepts [user-profile, products-browsing]

The app uses React StrictMode in development, which fires `useEffect` twice on mount. When intercepting `/auth/me` in Playwright, use a mutable closure flag (`let loginCompleted = false`) rather than a call counter to distinguish pre-login (401) from post-login (200) responses. A counter reaches 2 due to StrictMode double-fire before the user interacts, prematurely authenticating and detaching the login form from the DOM.

---

## Playwright Route Pattern — API vs. Frontend Origin [products-browsing]

Playwright `page.route()` intercepts ALL outgoing requests, including navigation requests served by the Vite dev server. Always anchor route patterns to the API origin (`http://localhost:3000/product/**`) rather than using path-only regex patterns. A path-only regex like `/\/product\/.*/` matches the Vite HTML request for `/product/All` and returns raw JSON instead of the React app.

---

## Playwright Product API Wildcard Mock [products-browsing]

Use `${API_URL}/product/**` as a single wildcard handler and branch inside on `url.includes("/filters")` to serve the correct fixture. This avoids route registration order issues (LIFO) and covers all variants: list with/without query params and the filters endpoint.

---

## Playwright Strict Mode Locator Conflicts [products-browsing]

Product card buttons and filter sidebar pills can share accessible names (e.g., "Blue" matches a color pill AND the "Blue Denim Jacket" card). Scope filter pill assertions to `page.getByRole('complementary', { name: 'Product filters' })` and use `{ exact: true }`. For product names that also appear in the description text, prefer `getByRole('heading', { name: '...', level: 3 })`.
