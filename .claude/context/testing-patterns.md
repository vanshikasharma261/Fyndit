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

**Extended rule from `mail-module`:** After `resetAllMocks()`, restore EVERY mock's default return value — not just the critical `$transaction` one. Any `jest.fn()` that had a `.mockResolvedValue()` / `.mockReturnValue()` set at declaration time is reset to returning `undefined`. A missing restoration causes silent "undefined is not a function" failures several tests later when the mock is finally called.

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

---

## Stripe Webhook E2E: rawBody App + JSON Content-Type [order-module, payment-module]

The webhook e2e creates the test app with `module.createNestApplication({ rawBody: true })` (mirroring `main.ts`) so the controller's `req.rawBody` is populated. Send the event as a raw `Buffer` **and set `Content-Type: application/json`** — without the header Supertest defaults to `application/octet-stream`, Nest's raw-body parser skips it, `req.rawBody` is `undefined`, and the controller's guard returns 400 (a false failure, not an app bug):

```ts
await request(app.getHttpServer())
  .post('/payment/webhook')
  .set('stripe-signature', 'valid-sig')
  .set('Content-Type', 'application/json')      // required so req.rawBody fills
  .send(Buffer.from(JSON.stringify(fakeEvent)));
```

`StripeService` is mocked (`constructWebhookEvent` returns the fake event; `refundPaymentIntent` a stub). `ConfigService` (`useValue`) must supply `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` so `StripeService` (or its real instance) can construct. Webhook metadata `user_id`/`address_id` must be **valid UUIDs** in fixtures — the handler `isUUID`-validates them and silently returns on a non-UUID, so `user-001`-style ids make placement assertions see zero calls.

## Serializable `$transaction` Mock — Callback vs Array Form [cart-module, order-module]

Two shapes are mocked differently:
- **Callback form** (placement/cancel/refund): `mockPrisma.$transaction.mockImplementation((cb) => cb(mockTx))` so the body runs against `mockTx`. The `mockTx` stub must include every model method the body calls (e.g. `order.create`, `productVariant.update`, `couponUsage.deleteMany`, `coupon.update`, `cart.findUnique`/`deleteMany`).
- **Array form** (paginated reads, e.g. `listOrders` count+findMany): `mockPrisma.$transaction.mockResolvedValue([count, rows])`.

The narrowed placement `catch` (refund only on `BadRequestException`) means a "stock vanished → refund" test must `mockRejectedValue(new BadRequestException(...))`, not a generic `Error`.

## Playwright Route Globs Must Match Query Strings [order-module]

A `page.route()` **string** glob is an exact match unless it has a wildcard, so `${API_URL}/order` does **not** intercept `GET /order?page=1`. Use `${API_URL}/order*` — `*` matches the `?page=1` query but not `/order/:id` (it won't cross `/`), so the list, detail, and cancel routes stay distinct. Run Playwright from the `frontend/` dir (its `playwright.config.ts` testDir is `./e2e`); running from the repo root pulls in the backend jest specs and fails collection with a misleading "async test.describe" error.

## Playwright getByText Is Case-Insensitive Substring [order-module]

`page.getByText("Jane")` also matches `jane@example.com` (case-insensitive + substring) → a strict-mode "resolved to 2 elements" failure. Use `getByText("Jane", { exact: true })` when a value is a substring of another on the page.

## useNavigate Spy Pattern for Static Page Tests [home-page]

For components that call `useNavigate()` with no Redux dependency, mock only `useNavigate` using `importOriginal` to keep all other react-router-dom exports intact. The `renderWithProviders` MemoryRouter still works because all other hooks/components are real:

```ts
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});
```

Call `vi.clearAllMocks()` in `beforeEach` when `mockNavigate` is shared across tests. Assert with `expect(mockNavigate).toHaveBeenCalledWith("/product/All")`.

## Playwright aria-label Attribute Selector for Card Grids [home-page]

When a page renders a grid of `<button>` elements that cannot be distinguished by role alone, use a CSS attribute selector anchored to a substring of the aria-label to scope locators: `page.locator('button[aria-label*="shop mobile-phones"]')`. This avoids strict-mode locator conflicts and does not require `getByRole` when each button has a unique partial label. Pair with `.first()` when the first item in the section is sufficient for the navigation assertion.

## RTL Text Collision Between StatusBadge and Timeline Step Labels [order-tracking-timeline]

`OrderDetailPage` renders two elements that share text values: the `<StatusBadge>` in the header (e.g. "Delivered", "Cancelled") and the `<Timeline>` step labels (also "Delivered", "Cancelled"). RTL assertions must be scoped to avoid false matches. Scope StatusBadge assertions to the STATUS header cell via `screen.getByText("STATUS").closest("div")` and wrap with `within()`. Scope Timeline assertions to `screen.getByRole("list", { name: "Order progress" })` and use `within()`. Use `getAllByText` when the same string genuinely appears twice (e.g. the ORDER DATE header and the Timeline Placed step caption both show the formatted date — `getAllByText("01 Jun 2026")` asserts both instances exist).

## Playwright Attribute Selector for ARIA Landmark Testing [order-tracking-timeline]

For testing a specific WAI-ARIA landmark or semantic element that has a known `aria-label`, use a CSS attribute selector via `page.locator('[aria-label="Order progress"]')` rather than `page.getByRole("list", { name: "Order progress" })`. Both work in Playwright but the attribute selector is more explicit about targeting the rendered HTML attribute and is less sensitive to role resolution. For `aria-current` step assertions use `page.locator('[aria-current="step"]')`.

## ESM-Only Dependency Stub via moduleNameMapper [email-notification]

`puppeteer` ships as a pure ESM package (`"type": "module"`) that the CommonJS Jest / ts-jest unit-test environment cannot parse. Add a CJS stub at `src/__mocks__/puppeteer.js` and wire it in the unit Jest config (`package.json` `moduleNameMapper`) as `"^puppeteer$": "<rootDir>/__mocks__/puppeteer.js"`. For the e2e config (`test/jest-e2e.json`) the rootDir is `test/`, so use `"<rootDir>/../src/__mocks__/puppeteer.js"`. Tests that need full control of puppeteer (e.g. `mail.service.spec.ts`) layer a `jest.mock('puppeteer', factory)` on top — Jest's factory mock overrides the mapper stub. Tests that only mock the service consuming puppeteer (e.g. `order.service.spec.ts`) just use `jest.mock('../mail/mail.service')` and the mapper ensures the transitive `puppeteer` import never reaches the CJS parser.

## Fire-and-Forget Microtask Draining in Unit Tests [email-notification]

When a service method launches a fire-and-forget promise chain (no `await`, no returned promise), a single `await Promise.resolve()` is enough to flush a single-level chain (e.g. `fetchUserBasic().then(sendMail)`). For a deeper chain — e.g. `Promise.all([buildOrderDetail(), fetchUser()]).then(sendMail)` — where `buildOrderDetail` itself makes two sequential async calls, use `await new Promise<void>((resolve) => setImmediate(resolve))` to drain the entire microtask queue in one step. `setImmediate` fires after all pending microtasks and I/O events, guaranteeing the chain has settled before the assertion runs.

## Mocking ESM Services with jest.mock + MailService Module-Level Hoist [email-notification]

When a service (`OrderService`) depends on another service (`MailService`) that transitively imports an ESM-only package (`puppeteer`), add `jest.mock('../mail/mail.service')` as the **very first statement** in the spec (before any import). Jest hoists `jest.mock` calls, preventing `mail.service.ts` from being compiled by the CJS ts-jest transformer. In the `Test.createTestingModule` providers, supply the mock via `{ provide: MailService, useValue: mockMailService }` where `mockMailService` has `sendOrderConfirmation: jest.fn().mockResolvedValue(undefined)`. Re-apply `.mockResolvedValue(undefined)` after `jest.resetAllMocks()` in `beforeEach` since `resetAllMocks` drains the resolved-value queue.

## Testing OnModuleInit / OnModuleDestroy Lifecycle Hooks [mail-module]

NestJS lifecycle hooks (`OnModuleInit`, `OnModuleDestroy`) are NOT called automatically by `Test.createTestingModule().compile()`. Call them explicitly in `beforeEach` / `afterEach`:

```ts
beforeEach(async () => {
  // ... compile module, get service
  await service.onModuleInit();   // launches the singleton browser / opens connection
});

afterEach(async () => {
  await service.onModuleDestroy(); // closes browser / releases connection
});
```

To test the "resource not initialized" error path, create a fresh service without calling `onModuleInit()` inline in that specific test. Verify `onModuleDestroy` calls the expected close/cleanup mock (e.g. `mockBrowserClose`).

## jest.mock() Factory Callback Return Types [mail-module]

When `@typescript-eslint/no-unsafe-return` is active (via `recommendedTypeChecked`), arrow functions inside `jest.mock()` factories that call `jest.fn()` mocks trigger the rule because `jest.fn()` returns `any`. Fix: add an explicit return type and cast the result:

```ts
jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: (...args: unknown[]): typeof mockBrowser =>
      mockLaunch(...args) as typeof mockBrowser,
  },
  launch: (...args: unknown[]): typeof mockBrowser =>
    mockLaunch(...args) as typeof mockBrowser,
}));
// void functions (e.g. fs.mkdirSync): (...args: unknown[]): void => { mockFn(...args); }
// string returns (e.g. fs.readFileSync):  (...args: unknown[]): string => mockFn(...args) as string
```

The `typeof mockX` pattern keeps the return type in sync with the mock object's inferred type automatically.
