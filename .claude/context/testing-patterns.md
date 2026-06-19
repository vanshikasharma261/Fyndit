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

---

## Prisma.Decimal Fixtures for Cart Service Tests [cart-feature]

CartService uses `Prisma.Decimal.min()` and `Prisma.Decimal.max()` static factories inside `computeSummary` and `toCartItem`. These static methods try to construct a new `Decimal` from their arguments, so plain JS mock objects (with `.plus`/`.times`/etc. stubs) cause a `[DecimalError] Invalid argument: [object Object]` at runtime. Fixture rows passed to `cartItem.findMany` and `cartItem.upsert` mocks **must** use real `Decimal` instances: import `Decimal` directly from `@prisma/client-runtime-utils` (which Jest resolves without a live DB) and wrap numbers with `new Decimal(String(value))`. All other Prisma models that do not use `Decimal` static methods (e.g. product, user) can continue to use the lightweight `toFixed`/`toNumber` stub objects.

---

## Playwright waitForResponse Before Click Pattern [cart-feature]

Always set up `page.waitForResponse()` BEFORE the user action (click) that triggers the request — never after. If the response arrives between the click and the `await page.waitForResponse(...)` call, the test will never see it and will timeout after 30 s. Correct pattern:

```ts
const responsePromise = page.waitForResponse(r => r.url().includes("/cart/item-1") && r.status() === 200);
await page.getByRole("button", { name: "Increase quantity" }).click();
await responsePromise;
```

---

## Playwright LIFO Route Stacking and GET State Transitions [cart-feature]

Playwright route handlers form a LIFO stack per URL pattern. A `page.route(url, handler)` registered inside a test body fires BEFORE any handler registered in `beforeEach` for the same URL. If a test overrides a GET handler and always returns one state (e.g., empty), the initial page load will see that state even before any user action. For tests that need the page to start populated and then transition (e.g., after DELETE), use a mutable boolean flag — not a call counter and not an always-empty GET handler — to track when the transition occurred:

```ts
let itemRemoved = false;
await page.route(`${API_URL}/cart`, async (route) => {
  if (route.request().method() === "GET") {
    await route.fulfill({ body: JSON.stringify(itemRemoved ? emptyCart : populatedCart) });
  }
});
await page.route(`${API_URL}/cart/item-1`, async (route) => {
  if (route.request().method() === "DELETE") { itemRemoved = true; ... }
});
```

A call-counter approach breaks under React StrictMode, which double-fires `useEffect`, causing multiple GET requests before the user interacts.

---

## Cart Slice Cross-Slice Dependency Mocking [cart-feature]

`cartSlice` imports `logoutUser` and `sessionExpired` from `authSlice` and `deleteUser` from `userSlice` to listen for session-teardown actions. Slice unit tests must mock these cross-slice imports with `vi.mock()` or the Vitest module graph will pull in the full auth/user module trees, causing the `VITE_API_URL` guard in each service module to throw. The mock for `sessionExpired` (a plain action creator, not a thunk) needs to be an `Object.assign`-ed function with a `.type` property so `addCase(sessionExpired, ...)` resolves correctly. The `logoutUser.fulfilled` and `deleteUser.fulfilled` action types can be dispatched directly as plain objects `{ type: "auth/logout/fulfilled" }` to verify the `resetCart` reducer fires.

---

## Navbar Badge Scoped Locator [cart-feature]

The cart navbar badge `<span>` is rendered inside `<Link to="/cart" aria-label="Cart">`. To avoid strict mode violations (e.g., `getByText("1")` matching the badge, a price containing "1", and a discount percentage), always scope badge assertions to the cart link:

```ts
await expect(page.getByRole("link", { name: "Cart" }).locator("span")).toHaveText("2");
```

When the badge should be absent (0 items), assert `not.toBeVisible()` on the same scoped locator — the `<span>` element is conditionally rendered only when `cartCount > 0`.

---

## Prisma $transaction Mock Pattern for Serializable Writes [cart-feature]

When a service method wraps inner Prisma calls inside `this.prisma.$transaction(async (tx) => { ... }, { isolationLevel })`, the unit-test mock must expose `$transaction` as a `jest.fn()` that immediately invokes its callback argument with a dedicated `tx` object. Declare a separate `mockTx` constant (with its own `jest.fn()` stubs for every model method called inside the callback), then implement `$transaction` as:

```ts
mockPrisma.$transaction = jest.fn((callback) => callback(mockTx));
```

Re-apply this implementation in `beforeEach` after `jest.clearAllMocks()` resets it. Inside transaction tests, assert on `mockTx.cartItem.*` (not `mockPrisma.cartItem.*`) for the inner ops, and assert on `mockPrisma.productVariant.findUnique` for any lookup that runs outside the transaction. This makes it possible to verify both the transaction boundary and the individual inner calls.

---

## resetAllMocks vs clearAllMocks When Using mockResolvedValueOnce Across Tests [address-module]

`jest.clearAllMocks()` clears call counts and results but does NOT drain `mockResolvedValueOnce` return-value queues. If a test queues two `mockResolvedValueOnce` values on a shared `mockTx` stub but the service only consumes one (because a branch is not taken), the second value leaks into the next test despite `clearAllMocks()` in `beforeEach`. The symptom is a NotFoundException (or unexpected truthy/falsy mock return) in a test that sets up the correct mocks, caused by the stale queued value being consumed first.

Fix: use `jest.resetAllMocks()` in the outer `beforeEach` instead of `clearAllMocks()`. `resetAllMocks()` also drains `Once` queues. Since it also removes any `mockImplementation()`, re-apply `mockPrisma.$transaction.mockImplementation(...)` immediately after — exactly the pattern already used in cart.service.spec.ts for `$transaction`. This distinction matters whenever multiple tests in a describe block use `mockResolvedValueOnce` on the same shared stub object and not all queued values are guaranteed to be consumed.

---

## Playwright /cart Mock Required in All Profile Page Tests [address-feature]

`MainLayout` dispatches `fetchCart` on every authenticated mount. In Playwright tests that mock `/auth/me` as 200 but use no real session cookie, the live backend returns 401 for `GET /cart`, which fires `authExpiryMiddleware` → `sessionExpired` → redirect to `/login`. Every `setupAuthenticatedSession` helper used in profile-page e2e tests must therefore also mock `GET /cart` (returning an empty cart) to prevent this session-expiry redirect. This applies to any page rendered inside `MainLayout` that mounts without a real cookie.

---

## Playwright Strict Mode Locator for "Default" Badge [address-feature]

The "Default" badge text on an address card conflicts with the "Set as default" button in strict locator mode: `page.getByText("Default")` matches both the badge `<span>` and the button element (which contains "default" as a substring). Use `page.getByText("Default", { exact: true }).first()` to scope the assertion to the badge only. The `{ exact: true }` flag matches whole text content, not substrings, so "Set as default" is excluded.

---

## renderWithProviders Must Include address Reducer [address-feature]

`src/test/renderWithProviders.tsx` must register the `address` reducer (from `features/address/addressSlice`) alongside `auth`, `products`, `user`, and `cart`. Without it, any component that calls `useAppSelector((state) => state.address)` — such as `AddressesPanel` — throws during rendering in unit tests. The reducer was added in this pass; all subsequent tests that render `AddressesPanel` or `ProfilePage` will use the updated helper automatically.

---

## Type Supertest `res.body` to the Response Contract [address-module]

The backend ESLint config is type-checked (`recommendedTypeChecked`), so accessing `res.body.x` directly trips `@typescript-eslint/no-unsafe-member-access` / `no-unsafe-assignment` because supertest types `.body` as `any`. In e2e specs, cast `res.body` to the real response contract before reading it — reuse the module's exported types rather than inventing shapes:

```ts
const body = res.body as AddressResponse[];          // list endpoints
const body = res.body as AddressResponse;            // single resource
const body = res.body as { message: string };        // message / error envelope
const body = res.body as { errors: Record<string, string> }; // validation envelope
```

Apply the same casting to `any`-typed locals in service unit specs (e.g. `const calls = mockFn.mock.calls as Array<[{ where: ... }]>` before indexing `calls[0][0]`). Never reach for `eslint-disable` — type it.

---

## Asymmetric-Matcher Wrappers to Satisfy no-unsafe-assignment [address-module]

`expect.objectContaining(...)` and `expect.any(...)` return `any`, which trips `no-unsafe-assignment` when nested as a property value inside another matcher object. Define thin wrappers that re-type the result as `unknown` (behavior-identical — they just forward to the real matcher):

```ts
const containing = (obj: object): unknown => expect.objectContaining(obj);
const anyOf = (ctor: unknown): unknown => expect.any(ctor);

expect(mockTx.address.create).toHaveBeenCalledWith(
  expect.objectContaining({ data: containing({ is_default: true }) }),
);
```

`unknown` is still accepted by `toHaveBeenCalledWith` / `toMatchObject` (their params are `any[]`) but is not flagged. Used in `address.service.spec.ts`, `address.e2e-spec.ts`, `cart.e2e-spec.ts`.

---

## ESLint `^_`-Prefixed Unused-Var Convention [address-module]

The backend ESLint config sets `@typescript-eslint/no-unused-vars` with `argsIgnorePattern` / `varsIgnorePattern` / `caughtErrorsIgnorePattern: '^_'`. Prefix deliberately-unused bindings with `_` to signal intent and pass lint — e.g. omit-destructures in e2e specs that build a payload missing a required field:

```ts
const { address_type: _omitted, ...payload } = validAddressPayload();
await request(app.getHttpServer()).post('/address').send(payload); // missing field
```

Also applies to ignored catch params (`catch (_e)`).

---

## Assert Ownership-Scoped Writes as `updateMany`, Not `update` [address-module]

Service methods that mutate user-owned resources use ownership-scoped `updateMany` (scoped by `{ id, user_id, is_removed: false }`, `count === 0` → 404) — never bare `update` (which would surface a foreign id as a Prisma `P2025`/500). Unit specs must therefore assert on `mockTx.address.updateMany` (or `mockPrisma.*.updateMany`), and the `mockTx` model stub must include **every** method the transaction calls — including `findMany` when the method builds its refreshed response list inside the same `$transaction` (e.g. set-default returns the in-tx list). A stale spec asserting `update`, or a `mockTx` missing `findMany`, fails even though the implementation is correct.
