## Current Feature

**Cart Feature — Backend Cart Module + Frontend Cart Page** (spec: `007-cart-feature.md`)

Branch: `feature/cart-module` (cut from `main`).

Implements the full cart experience: a backend `cart` module owning view / add / update-quantity / remove, and a frontend Cart page (populated `cart_ui.png` / empty `empty_cart_ui.png`) plus the wired product-detail "Add to Cart" button and a live navbar cart badge. Cart summary = total items / total price / total product discount / final amount; **coupons are excluded** (applied at checkout). Quantities are stock-bounded (min 1, max current stock); out-of-stock/inactive products can't be added.

## Status

Done — backend `cart` module + frontend Cart page/feature implemented; schema migration applied; lint/build clean on both apps; backend Jest+Supertest and frontend Vitest/RTL+Playwright green; reviewed (quality/prisma/security/ui) with approved fixes applied; context refined. See History entry 9.

## Goal

Deliver end-to-end cart functionality for the authenticated user. Backend: a feature-isolated `cart` module mirroring `product`/`user` conventions (thin controller, logic in `CartService`, `PrismaService` only, no `any`, response contracts in `cart/types/`, copy in a new `CartMessages` group, `JwtAuthGuard` + `assertActiveUser` precheck on every op; identity from `@CurrentUser()` only; ownership-checked). Frontend: a `CartPage` + `features/cart/` slice/service/types mirroring the established architecture, the wired product-detail "Add to Cart" button, and the navbar cart badge reflecting the live item count. Screenshots are the source of truth (`cart_ui.png`, `empty_cart_ui.png`). See `specs/007-cart-feature.md` for the full Definition of Done.

## Scope / Plan

### Confirmed decisions

1. **Add when already in cart → increment quantity by 1** (capped at stock); new variant → create at qty 1; add takes only `product_variant_id`.
2. **Full frontend**: Cart page + wire product-detail "Add to Cart" + live navbar badge (was hardcoded `0`).
3. **Coupon excluded** from the cart summary (coupons belong to checkout).
4. **Strict stock enforcement (400)**: update qty > stock → 400; qty < 1 → 400; add/increment beyond stock → 400; add out-of-stock/inactive → 400.
5. **No pagination; max 25 distinct items (`MAX_CART_ITEMS = 25`)**: `GET /cart` returns the whole cart (summary + all items). Adding a **new** variant when the cart already has 25 lines → 400 `cartFull` ("checkout or remove an item"); incrementing an existing line is unaffected. Overrides the dev-rules "paginate cart items" rule for this feature (reconcile in Phase 6). "25 items" = 25 distinct lines, not units.
6. **Schema change approved**: add `@@unique([cart_id, product_variant_id])` to `CartItem` (migration `cart_item_unique_variant`) so "add" uses an atomic `upsert`.

### Backend — `cart` module (`backend/src/cart/`)

```
backend/src/cart/
├── cart.module.ts            // imports AuthModule; PrismaModule is global
├── cart.controller.ts        // @UseGuards(JwtAuthGuard); @CurrentUser() only
├── cart.service.ts
├── dto/{add-cart-item,update-cart-item}.dto.ts
└── types/cart.types.ts
```

Register `CartModule` in `AppModule`. Every op runs `assertActiveUser` (401) before any DB access; user id from the JWT only; ownership violations → 404; money serialized as `"0.00"` strings via `Decimal.toFixed(2)`; `final_price = max(0, price − discount)`; preview image = primary else lowest `sort_order`; `total_items` = Σ quantities (drives the badge). Endpoints: `GET /cart` (summary over all items + every item, no pagination), `POST /cart` (add/increment via `upsert`; blocks a 26th distinct line with `cartFull`), `PATCH /cart/:cartItemId` (update qty, `1..stock`), `DELETE /cart/:cartItemId` (message). `:cartItemId` validated with `ParseUUIDPipe`. `MAX_CART_ITEMS = 25` in `values.constant.ts`; new `CartMessages` group in `messages.constant.ts`. Contracts: `CartItem`, `CartSummary`, `CartResponse`, `AddToCartResponse`, `UpdateCartResponse` (see spec).

### Frontend — Cart page + Add-to-Cart + badge

```
frontend/src/
├── pages/Cart/{CartPage.tsx, Cart.module.css}   // replaces /cart placeholder
├── features/cart/{cartSlice.ts, cartService.ts, types.ts}   // CartState
├── types/cart.types.ts                          // API contracts
├── routes/router.tsx · store/store.ts           // route + register `cart` reducer
├── layouts/MainLayout/MainLayout.tsx            // badge = summary.total_items; fetchCart when authed
└── pages/ProductDetail/ProductDetailPage.tsx    // wire "Add to Cart"
```

- `cartService.ts` — all `fetch` (`credentials: "include"`, `ApiResult<T>`): `getCart`, `addToCart`, `updateItem`, `removeItem`.
- `cartSlice.ts` — thunks `fetchCart` / `addToCart` / `updateCartItem` / `removeCartItem`; branch on `ok`; synthetic `NETWORK_ERROR` from shared `NetworkErrorMessages`; `add`/`update` patch `summary` so the badge stays live; `remove` re-fetches the cart. `CartState`: `{ items, summary, loading, error, mutatingId, message }`.
- **Populated (`cart_ui.png`)** — left "Shopping Cart" item cards (image, name, brand, attribute pills, discount % + struck price + final price, "In Stock", quantity stepper bounded `1..stock`, "Remove Item"); right "PRICE DETAILS" (Price / Discount / Total Amount + save note + CHECKOUT placeholder).
- **Empty (`empty_cart_ui.png`)** — centered "Your Cart is empty" + illustration; no summary/CHECKOUT; badge 0.
- Reuse `utils/format.ts`, `utils/image.ts`; CSS Modules + theme tokens only; responsive (columns stack on mobile).

---

## Prior Feature — Product Browsing (Backend Product Module + Frontend Product Pages) (spec: `004-products-listing.md`) — Done

Implemented end-to-end product browsing for Fyndit: a feature-isolated backend `product` module (paginated/searchable/filterable listing, category facets, single-product detail) plus the frontend product listing page, functional filter sidebar, and product preview page. Wires the navbar category links and the global search bar to the listing endpoint, and powers pagination via `react-paginate`. This is the second frontend feature and the first to consume real catalog data seeded in `001-prisma-setup.md`.

Goal: Deliver a production-ready, screenshot-faithful browsing experience where category navigation, search, attribute/price filtering, pagination, and product detail are all URL-driven (shareable + refresh-safe), backed by typed, `PrismaService`-only endpoints.

### Backend — `product` module (`backend/src/product/`)

Mirror the `auth` module conventions: thin controllers, all logic in `ProductService`, `PrismaService` only, no `any`, interfaces for response contracts in `product/types/`, human strings in `src/constants/messages.constant.ts` (`ProductMessages`). Register `ProductModule` in `AppModule`. **All endpoints public** — no `JwtAuthGuard`.

Structure:

```
backend/src/product/
├── product.module.ts
├── product.controller.ts
├── product.service.ts
├── dto/list-products-query.dto.ts
└── types/product.types.ts
```

- **Money serialization:** prices live on `ProductVariant` as `Decimal(10,2)`; serialize `price`/`discount` as `"0.00"` **strings** (`Decimal.toFixed(2)`) — no Decimal/float leakage to the client.
- **Endpoint 1 — `GET /product/:category`** (paginated list). `category` is a slug or the literal `All`. DTO `ListProductsQueryDto` (all optional): `search` (trimmed, case-insensitive on name/brand/description, also parse "under N" price phrases via `OR`), `page` (default 1, `@IsInt`/`@Min(1)`), `limit` (default 12, `@Min(1)`/`@Max(50)`), `minPrice`/`maxPrice` (`@IsNumber`/`@Min(0)`; maxPrice ignored if `< minPrice`), `attributes` (URL-encoded JSON `Record<string,string[]>` parsed/validated via `@Transform`, 400 on malformed). Service: resolve category scope to ids (`All`→none; leaf→self; parent like `electronics`→self+all descendants; `Clothing`→`mens-clothing`+`womens-clothing`; unknown slug→empty result with valid meta, **not 500**); constrain `is_active: true`; apply price + attribute filters at the **variant level** with same-variant match (`variants: { some: { price gte/lte, AND of OR-per-key JSON path filters } }`); OR within a key, AND across keys; unknown attr keys ignored; paginate (`skip`/`take` + parallel `count`); return representative variant (prefer one satisfying active filters; else lowest-priced) + primary image (`is_primary` else lowest `sort_order`). Build `where` from a typed options object in one private helper.
- **Endpoint 2 — `GET /product/detail/:slug`** (declare **before** `:category`). One active product by slug + category + all variants (sku/stock/price/discount/attributes) + each variant's images (ordered `is_primary` then `sort_order`). Not found/inactive → `NotFoundException(ProductMessages.productNotFound)`.
- **Endpoint 3 — `GET /product/:category/filters`** (declare **before** `:category`). Resolve scope ids (same resolver); read attribute names from `CategoryAttribute` for those categories (`All` → none, price only); collect distinct values per key across in-scope active variants' JSON `attributes` (in-memory reduction, acceptable at this catalog size); price range via Prisma `aggregate`, serialized as `"0.00"` strings. Facets reflect the **unfiltered** scope (search may apply) so toggling never removes options.

Response contracts: `ProductListItem`, `PaginationMeta`, `ProductListResponse`, `ProductVariantDetail`, `ProductDetailResponse`, `AttributeFacet`, `ProductFiltersResponse` (see spec for exact shapes).

### Frontend — product pages

Install `react-paginate` (ships its own types). Mirror the `auth` feature layout (service + slice + types separated). Register the `products` reducer in `src/store/store.ts`. CSS Modules only, typed Redux hooks, no `fetch` in components.

Structure:

```
frontend/src/
├── pages/Products/{ProductsPage.tsx, Products.module.css}
├── pages/ProductDetail/{ProductDetailPage.tsx, ProductDetail.module.css}
├── features/products/{productsSlice.ts, productService.ts}
├── components/Pagination/{Pagination.tsx, Pagination.module.css}
├── components/FilterSidebar/{FilterSidebar.tsx, FilterSidebar.module.css}
├── types/product.types.ts
└── routes/router.tsx  (add /product/:category + /product/detail/:slug under MainLayout)
```

- **Navigation model:** navbar items map to category scopes — For You → `/` (no fetch); Clothing → `mens-clothing`+`womens-clothing`; Electronics → `electronics` (+descendants); Mobile → `mobile-phones`; **Furniture (replaces "Books")** → `furniture`; Select Category dropdown of categories holding products. Update `NAV_LINKS` in `MainLayout.tsx` and the footer "Shop" column.
- **Routing / URL as source of truth:** `/product/:category`, `?search=`, `?page=`, `?minPrice=`/`?maxPrice=`, `?attributes=<URL-encoded JSON>`, and `/product/detail/:slug`. Search submit → `/product/All?search=<term>`. Filters live in the query string (shareable, refresh-safe); toggling a value adds/removes it in the `attributes` map (drop empty keys); any filter change resets `page` to 1.
- **`productService.ts`:** all fetch calls, `VITE_API_URL`, `ApiResult<T>` `{ ok, status, data }` pattern; public GETs (no `credentials: "include"`). `list`, `filters`, `detail`; `buildProductListPath` / `buildFiltersPath` helpers.
- **`productsSlice.ts`:** `createSlice` + `createAsyncThunk` (`fetchProducts`, `fetchFilters`, `fetchProductDetail`); branch on `ApiResult.ok`. Re-fetch `fetchFilters` only on category/search change, **not** on every filter toggle.
- **Pagination component:** thin wrapper over `react-paginate` (0-based → 1-based via `forcePage={currentPage-1}` and `selected+1`); render only when `total_pages > 1`.
- **Listing page** (`products_page_clothing_category.png`): left `FilterSidebar` (data-driven price slider + one toggleable group per `AttributeFacet`; `All` scope → price only; "Clear filters"); main "Products" grid of cards (image, name, brand, short description, price, discount badge); pagination footer; loading/empty/error states.
- **Preview page** (`product_preview.png`): two-column — left image gallery (primary + vertical thumbnails, reflects selected variant); right category badge, dynamic attribute selector groups (derived from union of variant `attributes` keys — not hardcoded), name/brand/description, price + discount badge, stock status, Add to Cart / Buy buttons (wiring is a later feature). Selected-variant logic drives price/discount/stock/gallery; default to first variant.

### Theme

Project CSS variables only. Discount badge + price use accent; active page / Buy / selected pill use primary; unselected pills + Prev/Next bordered/surface. Cards: white surface, soft border, minimal shadow. Responsive: sidebar stacks above grid on mobile; preview columns stack.

## Definition of Done (from spec)

**Backend**

- ☑ `UserModule` created (controller, service, DTO, types) + registered in `AppModule`
- ☑ `GET /user` returns the authenticated profile incl. `phone`, no sensitive fields (`PROFILE_SELECT` excludes `password_hash`/internal flags)
- ☑ `PATCH /user` updates only present whitelisted fields, returns updated profile; unknown keys → 400; email change preserves uniqueness (`P2002` + `meta.target` includes `email` → field error)
- ☑ `DELETE /user` soft-deletes (`is_deleted`/`deleted_at`/`is_active=false`), clears auth cookie via `AuthService.clearSessionCookie`, never hard-deletes
- ☑ Every operation runs the `isUserActive` precheck → 401 for inactive/soft-deleted
- ☑ User identified via `@CurrentUser()` only (no client-supplied id); `PrismaService` only; no `any`; copy from `UserMessages`; validation uses the existing `{ errors: { field } }` envelope

**Frontend**

- ☑ `/profile` renders `ProfilePage` (placeholder removed), behind `RequireAuth` inside `MainLayout`
- ☑ Left panel matches `profile_ui.png`; right "Addresses" panel is a dummy placeholder (static, `aria-hidden`)
- ☑ Per-row inline edit (pencil → input + green tick → confirm) matches `profile_edit_ui.png`; success exits edit mode, shows new value + success message (Enter confirms / Esc cancels)
- ☑ Field validation errors render under the row with reserved space (`profile_edit_error_ui.png`); message shows "Validation Failed", not "Something went wrong"
- ☑ `userSlice`/`UserState` mirror the auth validation-failure model; all network logic in `userService.ts` (no `fetch` in components); `user` reducer registered
- ☑ CSS Modules + theme variables only; `npm run lint` + `npm run build` clean (backend + frontend)

---

## Prior Feature — Products Page UI Improvement: Discount Badge (spec: `005-ui-improvemnt-products-page.md`) — Done

Branch `improvement/discount-badge-ui` (cut from `feature/products-browsing`). Small, screenshot-faithful CSS-only polish: the per-product discount on the listing card rendered as plain accent-coloured text; the prototype `products_page_clothing_category.png` shows it as a pill badge.

- **Theme tokens added** (`frontend/src/styles/theme.css`): `--color-accent-subtle: rgba(255, 92, 53, 0.12)` (mirroring `--color-error-subtle`) and `--radius-pill: 999px`.
- **`.cardBadge`** (`Products.module.css`) is now a pill — accent-subtle background, accent text, `padding: var(--space-1) var(--space-2)`, `border-radius: var(--radius-pill)`, `white-space: nowrap`; existing font size/weight + position unchanged. `.cardPriceRow` switched `align-items: baseline` → `center` so the padded pill sits level with the price.
- Theme variables only. `formatDiscountBadge`, badge logic, API contract, Redux, routing, and the **detail page** discount are untouched (out of scope) — listing vs detail discount styling now differ by design.
- **Verified:** frontend `npm run lint` + `npm run build` (tsc + vite) clean. Live visual confirmation at the two breakpoints still to be eyeballed (no browser-automation tooling here).

---

## Notes / decisions

- Must consult before/while implementing: `project-overview.md`, `business-rules.md`, `development-rules.md`, `database-design.md`, `prisma-schema.md`. Screenshots are the source of truth under `.claude/screenshots/`: `profile_ui.png` (page layout — left "Manage Your Profile", right "Addresses" dummy), `profile_edit_ui.png` (row in edit mode: input + green tick + accent border), `profile_edit_error_ui.png` (field error under the row + toast).
- **Reuse, don't rebuild:** `@CurrentUser()` → `AuthenticatedUser`, `JwtAuthGuard`, `AuthService.isUserActive(userId)`, `PrismaService`, the global validation exception factory (`{ errors: { field } }` envelope), and `ValidationMessages.phoneInvalid`/`emailInvalid` all already exist from `002`. The frontend feedback model (validation → `errors`, else → `message`, `startRequest`/`failRequest` helpers) is lifted from `authSlice`/`AuthState`.
- **No schema migration** — `is_deleted`, `deleted_at`, and all editable columns already exist on `User`. Soft delete only; never hard-delete.
- **`/user` adds `phone`** to the profile contract (the Profile page needs it); `/auth/me`'s `UserProfile` stays as-is. Unifying the two is explicitly out of scope.
- **Identity from the token only** — every `/user` op acts on `@CurrentUser().id`; no body/param id is trusted (prevents acting on another account). `password_hash`/internal flags must never appear in a response `select`.
- **`isUserActive` precheck on every op** — a JWT outlives logout / soft delete, so re-verify before reading or mutating (development-rules "Special Protection").
- Follow established patterns: per-feature `types.ts` vs API-contract types in `src/types/`, `ApiResult<T>` service layer, typed `useAppDispatch`/`useAppSelector`, theme tokens in `src/styles/theme.css`, `VITE_API_URL` typed in `vite-env.d.ts`.
- After completion run the relevant reviewers: `fyndit-security-reviewer` (ownership/`@CurrentUser` scoping, soft-delete cookie clear), `fyndit-prisma-reviewer` (selects/`P2002` handling), `fyndit-quality-reviewer`, `fyndit-ui-reviewer` (screenshot/theme/responsive), plus `fyndit-api-reviewer` + `fyndit-redux-reviewer` (referenced in CLAUDE.md but may not be registered here — cover those concerns manually if so).

## History

1. **Prisma Setup, Database Integration & Seed Generation** — *Done* (spec `001-prisma-setup.md`). Database foundation: Prisma 7 + PostgreSQL, schema, migrations, idempotent data-driven seeds, product image assets, reusable `PrismaService` via DI.
   - Prisma 7.8.0 with the new `prisma-client` generator (output `src/generated/prisma`) + `@prisma/adapter-pg` driver adapter; connection URL lives in `prisma.config.ts` (Prisma 7 removes `url` from `schema.prisma` and disables auto `.env` loading).
   - All 13 models created; `prisma_intial_setup` migration generated and applied (migrations only).
   - `PrismaService` (extends generated client, `OnModuleInit`/`OnModuleDestroy`, built from `ConfigService` + pg adapter) + `@Global() PrismaModule`, wired into `AppModule`. No `new PrismaClient()` outside `PrismaService` and the standalone seed.
   - Data-driven seed: variants auto-generated via cartesian of `colors × options` (`variant-generator.ts`); idempotent upserts (slug/sku/code); atomic per-variant image rebuild. Adding a product = one entry in `products.data.ts`.
   - **Image decision (changed from spec):** images are downloaded from real source URLs (`image-sources.data.ts` → `download-assets.ts`) into `assets/products/<slug>/<color>/{1,2,3}.jpg`; DB stores only relative paths (no runtime internet dependency).
   - Seeded: 13 categories, 26 products, 86 variants, 258 images (exactly 3/variant, 1 primary), 3 coupons. Idempotent (re-run = identical counts). Floral Summer Dress carries `red + yellow × S/M/L = 6` variants; variant-count guard max raised to 8.
   - Verified: `npm run lint` clean, `npm run build` → `dist/main.js`, Nest context boot confirms `PrismaService` connects via DI. Reviewed with `fyndit-prisma-reviewer` + `fyndit-quality-reviewer`; in-scope fixes applied (atomic image rebuild, `used_count` reset on re-seed, shared `constants.ts`, seed-time variant guard).
   - **Outstanding (out of scope):** project scaffold still has `noImplicitAny: false` (tsconfig) and `no-explicit-any: 'off'` (eslint) — recommend enabling full `strict` in a separate hardening pass.

2. **Authentication Module (Backend)** — *Done* (spec `002-authentication-backend.md`). Production-ready auth layer: signup/login/logout, Passport JWT strategy, HTTP-only cookie auth, `@CurrentUser()` injection, `isUserActive` utility.
   - **Resolved decisions:** `session_active` is **not** used — it exists in neither `schema.prisma` nor `database-design.md`; `is_active` is the single session signal (false at signup, true on login, false on logout). Soft-delete login block checks **both** `is_deleted` and `deleted_at`. Cart-on-signup reconciled by creating User + default Address + Cart in one `$transaction`. Signup DTO collects the default address (phone/zip/state/country validated), which is why an address is created at registration.
   - **Migrations (migrations-only):** `add_user_is_deleted` (adds `is_deleted Boolean @default(false)`) and `user_is_active_default_false` (flips the schema/DB default of `is_active` to `false` so out-of-service User creates can't silently produce active accounts).
   - **New deps:** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `cookie-parser`, `class-validator`, `class-transformer` (+ types). The project had no `class-validator`/`class-transformer` before this feature.
   - **Validation:** global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + `transform`) with a custom `exceptionFactory` (`src/common/validation/validation-exception.factory.ts`) producing flat `{ field: message }` errors. Password ≤72 bytes (bcrypt limit); free-text fields length-bounded.
   - **Cookie:** `httpOnly`, `sameSite: 'strict'`, `secure` in production, `maxAge` derived from `JWT_EXPIRES_IN`; logout uses identifying attributes only (no `maxAge`) to clear reliably. `JWT_SECRET`/`JWT_EXPIRES_IN` read via `ConfigService.getOrThrow`/`get` — never hardcoded. bcrypt rounds = 12.
   - **Reviews:** `fyndit-security-reviewer`, `fyndit-prisma-reviewer`, `fyndit-quality-reviewer` run; in-scope fixes applied (P2002 race safety-net → `ConflictException`, `is_active` default fix, dedicated clear-cookie options, `@CurrentUser()` undefined guard, redundant `ConfigModule` import removed, DTO length caps, `resolveCookieMaxAge` extracted to a helper). (`fyndit-api-reviewer` is referenced in CLAUDE.md but not registered in this environment — API concerns covered manually and via live smoke test.)
   - **Verified:** `npm run lint` clean, `npm run build` → `dist`, Nest boot maps `/auth/{signup,login,logout}`. Live smoke test passed: flat validation errors, signup 201, duplicate 409, bad-password 401 (generic), login 200 with HttpOnly `access_token` cookie, guarded logout 200 / unauthenticated 401.
   - **Outstanding (out of scope — app-wide hardening, recommend a separate pass):** no CORS (`app.enableCors` with `credentials: true` + frontend origin — needed once the React app calls the API), no `helmet`, no rate limiting/throttling on `login`/`signup` (`@nestjs/throttler`), and no caching on `isUserActive` (a `SELECT` per protected op at scale).

3. **Frontend Foundation, Redux Toolkit Setup & Authentication UI** — *Done* (spec `003-auth-pages-frontend.md`). First frontend feature: typed Redux store, auth slice + thunks, Login/Signup pages, `MainLayout` shell, routing.
   - **Deps added:** `@reduxjs/toolkit`, `react-redux`, `react-router-dom`.
   - **Store/state:** `store/store.ts` (`{ auth }`, exports `RootState`/`AppDispatch`), typed `useAppDispatch`/`useAppSelector` in `store/hooks.ts`. `AuthState` (`{ loading, isAuthenticated, success, message, errors }`) lives in `features/auth/types.ts` per the per-feature `types.ts` dev-rule; API-contract types in `src/types/auth.types.ts`.
   - **Service/thunks:** all `fetch` logic isolated in `features/auth/authService.ts` (`credentials: "include"`, parse-once, returns `{ ok, status, data }`); `authSlice.ts` thunks (`loginUser`/`signupUser`/`logoutUser`) branch on `ok`, `rejectWithValue(data)` typed `ValidationErrorResponse | ErrorResponse`. 400 → `state.errors` (per-field map from `response.errors`); 401/409 → `state.message`; network failures caught → synthetic `NETWORK_ERROR` envelope. `isValidationError` type guard narrows the union. `clearAuthFeedback` dispatched on auth-page mount.
   - **Decisions:** `isAuthenticated` derived from thunk results (HTTP-only cookie is unreadable in JS), not a stored token. Signup does NOT authenticate — on success redirects to `/login` (passing `state.registered` so Login shows a success banner); login redirects to `/`. Login `user_name`/state/country dropdowns mirror backend `INDIAN_STATES`/`SUPPORTED_COUNTRY` (duplicated in `frontend/src/constants/location.ts`) so client options match the DTO's `@IsIn` validation. `line2`/`address_type` optional; empty `line2` dropped from payload to satisfy `forbidNonWhitelisted`. Country fixed to India (single-option select, defaulted).
   - **UI:** `pages/Login` + `pages/Signup` (split brand panel + appended address section), `pages/Home` placeholder (post-login landing inside `MainLayout`), `layouts/MainLayout` (announcement bar + navbar + `<Outlet />` + footer). Auth pages standalone (outside `MainLayout`). Theme tokens centralized in `src/styles/theme.css` (added `--color-on-primary/-on-accent`, `--color-error-subtle/-border`, `--shadow-focus-accent`, `--space-7`); CSS Modules only, responsive (mobile/desktop breakpoints). `VITE_API_URL` typed in `vite-env.d.ts` and guarded at service init.
   - **Reviews:** `fyndit-ui-reviewer` + `fyndit-quality-reviewer` run; in-scope fixes applied (theme-token dedup for repeated focus-ring/error colors, `AuthState` moved to feature `types.ts`, `LoginPage` curried-handler cleanup, `NavLink`→`Link` (all nav targets are placeholder `/`), `required` + `aria-describedby`/`aria-busy` accessibility passes, login `<h1>`, signup success banner, `VITE_API_URL` startup guard). (`fyndit-redux-reviewer` referenced in notes but not registered in this environment — Redux concerns covered by the quality review.)
   - **Verified:** `npm run lint` clean, `npm run build` → `dist` (tsc `-b` + Vite), Vite dev server boots on `http://localhost:5173` (matches backend `FRONTEND_URL` for credentialed CORS). Not yet exercised against a running backend end-to-end.
   - **Outstanding (carried into this feature):** `NAV_LINKS` all point to `/` pending category routes — feature 004 wires them to `/product/<slug>`; cart icon is still a placeholder emoji; full homepage (hero/categories/product sections) is a later feature.

4. **Product Browsing (Backend Product Module + Frontend Product Pages)** — *Done* (spec `004-products-listing.md`). End-to-end browsing: a `product` module + listing/preview pages, data-driven filters, URL-driven search/pagination.
   - **Protected, not public (changed from spec):** the spec called the endpoints public, but the app is fully protected — `ProductController` is `@UseGuards(JwtAuthGuard)` and **every** service method calls a shared `assertActiveUser(userId)` (wrapping `AuthService.isUserActive`) **before any DB access**, per the development-rules "Special Protection" rule. `ProductModule` imports `AuthModule`; handlers take `@CurrentUser()` and pass `user.id`. Inactive/soft-deleted (valid-token-but-logged-out) → `403` (`AuthMessages.inactiveAccountMessage`); missing token → `401`. Frontend `productService` GETs therefore send `credentials: "include"`.
   - **Backend:** `product/` module (controller, service, `ListProductsQueryDto`, `CategoryFiltersQueryDto`, `types/product.types.ts`) registered in `AppModule`; `PrismaService` only, no `any`. Routes declared `detail/:slug` → `:category/filters` → `:category` (specific-first). `where` built from a typed `ProductWhereOptions`; price + JSON `attributes` filter at variant level with same-variant match (`variants: { some: { price, AND of OR-per-key path filters } }`); OR within key / AND across keys; unknown attr keys ignored (sanitized against `CategoryAttribute` names). Money serialized as `"0.00"` strings via `Decimal.toFixed(2)`. Scope resolver: `All`→null, `clothing` alias→both clothing children, parent slug→self+descendants (BFS over one category load), unknown→`[]` (empty page, no 500). Facets = `CategoryAttribute` names × distinct present values (empty-value facets like `ram`/`connectivity`/`brand` dropped); price range via `aggregate`.
   - **Other decisions / changes from spec:**
     - **Static assets:** nothing served the seeded image paths — added `app.useStaticAssets(<backend>/assets, { prefix: '/assets' })` in `main.ts` (switched to `NestExpressApplication`); these stay unguarded. Frontend prefixes `image_url` with `VITE_API_URL` via `resolveImageUrl`.
     - **`clothing` curated alias:** no `clothing` category exists, so navbar Clothing → `/product/clothing`; backend `CATEGORY_ALIASES` (in `src/constants/values.constant.ts`) resolves it to `mens-clothing` + `womens-clothing`.
     - **Constants centralized (review feedback):** backend listing/alias constants → `src/constants/values.constant.ts`, `ProductMessages` → `messages.constant.ts`; frontend strings/values → `src/constants/messages.constant.ts` + `values.constant.ts`.
     - **No categories endpoint exists** → the "Select Category" dropdown + nav/footer links are a static constant (`frontend/src/constants/categories.ts`) mirroring the seeded hierarchy. Navbar "Books" replaced with "Furniture".
     - **Card carries no description line** — `ProductListItem` contract has none; card shows image/name/brand/price/discount (matches the typed contract + DoD). **Discount badge** computed as a percentage from the flat discount amount (`round(discount/price*100) % off`); prices render `₹` Indian-grouped, no decimals (`utils/format.ts`).
   - **Frontend:** `react-paginate` installed; reusable `Pagination` (0↔1-based, hidden when `total_pages ≤ 1`); data-driven `FilterSidebar` (price slider + facet pill groups + "Clear filters"); `ProductsPage` (+ inline `ProductCard`) and `ProductDetailPage` (gallery + dynamic variant selectors; selected variant drives price/discount/stock/gallery; default-variant reset done during render, not in an effect — the new `react-hooks/set-state-in-effect` rule). `productService` holds all fetch logic + `buildProductListPath`/`buildFiltersPath`; `productsSlice` thunks (`fetchProducts`/`fetchFilters`/`fetchProductDetail`) branch on `ApiResult.ok`; `products` reducer registered. URL is the source of truth (category/search/page/`minPrice`/`maxPrice`/`attributes`); filter change resets `page=1`; `fetchFilters` re-runs on category/search only.
   - **Verified:** backend + frontend `npm run lint` clean and `npm run build` succeed. Live smoke test (booted on `:3100` alongside the user's running `:3000` instance) against real seed data: unauth → `401`; after login (cookie) listing pagination + `"0.00"` money strings, `clothing` alias, `electronics` descendants (total 11), same-variant `size=32` filter, `/filters` color/size facets, full `/detail`, search `jeans` + `under 30` price-OR all `200`; valid-token-but-logged-out → `403` inactive-account message; unknown slug → empty meta (no 500); `/assets/...jpg` → `200`; malformed `attributes` → `400` with the `ProductMessages` string. (Created a throwaway `smoke004@example.com` user in the dev DB during testing.)
   - **Not yet run:** the `fyndit-*` reviewers (api/prisma/security/quality/redux/ui) — recommend running before opening the PR. Frontend not yet exercised in a real browser end-to-end (logic verified via the API smoke test + type/build checks).

5. **Frontend Access Control Hardening + Sticky Filters** — *Done* (extends spec `004-products-listing.md`; see its *Post-Implementation Addendum* and `business-rules.md` → *Access Control & Session Rules*). Fixes a protection gap surfaced in live testing and a filter-scroll UX issue.
   - **Bug fixed:** the app is authenticated-only on the backend, but the frontend had **no route guard** — a logged-out user could still open `/` or `/product/*`, where the listing fired a fetch that `401`'d and painted "Unauthorized" in red over an empty grid.
   - **`RequireAuth` guard** (`frontend/src/routes/RequireAuth.tsx` + `.module.css`) now wraps **all** content routes in `router.tsx` (home, products, detail, profile, orders, cart). Shows a neutral loader while the initial `GET /auth/me` check is in flight (so a signed-in user isn't bounced on refresh), then redirects to `/login` when there's no session. Preserves the attempted location in router state for a future post-login return.
   - **Global 401 interceptor** (`frontend/src/store/authExpiryMiddleware.ts`, registered in `store/store.ts`): any *data* request rejected with `401` dispatches the new **`sessionExpired`** auth-slice reducer (clears all auth state, keeps `authChecked` true); the guard then auto-redirects to `/login`. Auth endpoints (`auth/*`) are excluded so their expected `401`s (bad login, not-signed-in `/auth/me`) aren't clobbered. Added `UNAUTHORIZED_STATUS` constant + `AuthGateMessages.checkingSession` copy.
   - **Logout** already redirected to `/login`; the guard now also blocks navigating back into protected pages while signed out.
   - **Sticky filter sidebar:** `FilterSidebar` `.sidebar` is now `position: sticky; top: 5rem` (clears the ~4rem sticky navbar) with `max-height: calc(100dvh - 6rem)` + `overflow-y: auto` + `overscroll-behavior: contain`, so filters stay in view while the grid scrolls and tall scopes (e.g. Electronics) scroll internally to reach the last attribute group. Scrollbar is **slim + hover-revealed** (thumb transparent until hover/focus; `scrollbar-width: thin` + styled `::-webkit-scrollbar`) — chosen over a fully hidden bar so the bottom filter stays discoverable/draggable. Card split into a `.sidebar` shell (pinned, `overflow: hidden`, rounded) + inner `.scroll` container; a **bouncing down-chevron hint** (`scrollHint`) fades in at the bottom edge while more content is below and hides at the bottom — state tracked in `FilterSidebar` via a `scroll` listener + `ResizeObserver` (deps `[filters, loading]`; `setCanScrollDown` only fires inside callbacks, clear of the `set-state-in-effect` rule). Reverts to static at the `≤900px` breakpoint where the sidebar stacks above the grid. Verified no ancestor `overflow` would break sticky (`.shell`/`.content` are plain flex).
   - **Verified:** frontend `npm run build` (tsc + vite) and `npm run lint` clean. Sticky prerequisites verified statically; not yet eyeballed in a browser (no browser-automation tooling in this environment) — visual scroll + the logout/401 redirect flow to be confirmed against the running `:5173`/`:3000` instances.

6. **Products Page UI Improvement — Discount Badge** — *Done* (spec `005-ui-improvemnt-products-page.md`). Branch `improvement/discount-badge-ui` (cut from `feature/products-browsing`). Small, screenshot-faithful polish: the per-product discount on the listing card rendered as plain accent-coloured text; the prototype `products_page_clothing_category.png` shows it as a pill badge. CSS-only.
   - **Theme tokens added** (`frontend/src/styles/theme.css`): `--color-accent-subtle: rgba(255, 92, 53, 0.12)` (soft accent fill, mirroring the existing `--color-error-subtle` convention) and `--radius-pill: 999px`.
   - **`.cardBadge`** (`frontend/src/pages/Products/Products.module.css`) is now a pill — `background-color: var(--color-accent-subtle)`, accent text, `padding: var(--space-1) var(--space-2)`, `border-radius: var(--radius-pill)`, `white-space: nowrap`; existing font size/weight and position next to the price unchanged. `.cardPriceRow` switched `align-items: baseline` → `center` so the padded pill sits level with the price.
   - **Theme variables only** — no hardcoded colours in the module. `formatDiscountBadge`, badge text/percentage logic, API contract, Redux, routing, and the **detail page** (`.discount` in `ProductDetail.module.css`) are all untouched (out of scope) — so listing vs detail discount styling now differ by design.
   - **Verified:** frontend `npm run lint` clean and `npm run build` (tsc + vite) succeeds. Live visual confirmation against the prototype at the two breakpoints (`≤900px`, `≤540px`) still to be eyeballed on the running `:5173` (no browser-automation tooling in this environment).

7. **User Module — Profile Management** — *Done* (spec `006-user-module.md`). Branch `feature/user-module` (cut from `main`). Backend `/user` module (read / update / soft-delete the authenticated user, identified via `@CurrentUser()` only) + frontend Profile page with inline per-field editing.
   - **Backend:** new `user/` module (controller, `UserService`, `UpdateUserDto`, `types/user.types.ts`) registered in `AppModule`; imports `AuthModule` for `AuthService.isUserActive`. `GET /user` (profile incl. `phone`, via a module-level `PROFILE_SELECT` typed with `Prisma.UserGetPayload` that excludes `password_hash`/internal flags), `PATCH /user` (partial update built from only the present DTO keys — not explicit `undefined`s; `P2002` surfaced as an `{ errors: { email } }` 400 only when `error.meta.target` includes `email`, else re-thrown), `DELETE /user` (soft delete: `is_deleted`/`deleted_at`/`is_active=false` + cookie clear). Every op runs the `assertActiveUser` → `isUserActive` precheck (401 on inactive/soft-deleted); identity from the token only; `PrismaService` only; copy from a new `UserMessages` group. `AuthService.clearSessionCookie(res)` extracted (public) and reused by both `logout` and the user soft-delete. No schema migration (columns already exist).
   - **Frontend:** `pages/Profile/` + `features/user/` (slice/service/types) mirroring the auth feedback model (`startRequest`/`failRequest`, `isValidationError` narrowing); replaces the `/profile` placeholder route; `user` reducer registered. Left "Manage Your Profile" inline-edit panel (pencil → borderless input + accent row border + green tick → confirm; Enter confirms, Esc cancels; one row at a time; field errors render under each row with reserved height so the panel never shifts); right "Addresses" dummy panel (static, `aria-hidden`, with pencil/trash chrome + dashed "Add Address" to match the screenshot). Validation → `state.errors` + "Validation Failed" toast; other failures → server `message` toast. `lucide-react` icons (`Pencil`/`Check`/`Trash2`). Shared `NetworkErrorMessages` constant added (so the offline envelope isn't borrowed from a product-namespaced message). `authSlice` reacts to `deleteUser.fulfilled` to tear down the session so the navbar can't stay "signed in". CSS Modules + theme variables only.
   - **Reviews:** `fyndit-security-reviewer`, `fyndit-prisma-reviewer`, `fyndit-quality-reviewer`, `fyndit-ui-reviewer` run; in-scope fixes applied (P2002 `meta.target` guard, present-keys-only update payload, `deleteUser` auth teardown, address-card icon chrome, Esc-to-cancel). Deferred as out-of-scope cross-cutting refactors (pre-existing, flagged by reviewers): `ApiResult<T>` duplicated across the three services, `authSlice`'s inline `NETWORK_ERROR` not yet pointed at `NetworkErrorMessages`, and the `UserProfile` name shared by the auth (5-field) and user (6-field, +`phone`) contracts on both ends.
   - **Verified:** backend `npm run lint`/`build`/`test` and frontend `npm run lint`/`build` all clean. Not yet exercised against a running backend in a browser (no browser-automation in this environment); the error-toast screenshot (`profile_edit_error_ui.png`) shows the old "Something went wrong" copy — the code now correctly shows "Validation Failed", so that screenshot is the stale artifact.

8. **Testing Suite + Tooling/Docs** — *Done* (branch `feature/testing-suite-implemented`). **No spec and no application-feature change** — this entry is tooling + documentation only: it retro-fits automated tests over the already-shipped auth/product/user features and improves the testing workflow. Logged here (not as a numbered spec) because nothing in `backend/src` or `frontend/src` behaviour changed.
   - **Backend tests:** Jest service unit specs (`auth`, `product`, `user`) + Supertest e2e (`auth`, `product`, `user`, `app`). E2E setup (`test/jest-e2e.json` + `test/tsconfig.json`) avoids importing the real `AppModule`/`ConfigModule`: `ConfigService` provided via `useValue`, `JwtModule.register` with a fixed test secret, `PrismaService` mocked with `jest.fn()` stubs; ts-jest overridden to CommonJS so the generated Prisma ESM `.js` imports resolve. (Pattern captured in `development-rules.md` E2E append.)
   - **Frontend tests:** Vitest + RTL infra (`vitest.config.ts`, `src/test/setup.ts` with a `ResizeObserver` stub, `src/test/renderWithProviders.tsx`); 8 unit/component/slice/util tests; Playwright e2e (`auth`, `products-browsing`, `user-profile`) + `playwright.config.ts`. Playwright runs against a **live** backend, not mocks (start backend → `wait-on :3000` → run → kill). Conventions captured in `testing-patterns.md` (Redux test store, StrictMode `/auth/me` intercept flag, API-origin-anchored routes, strict-mode locator scoping).
   - **Self-improving context:** new `.claude/context/testing-patterns.md`; the two tester agents append discoveries to it / `business-rules.md` / `development-rules.md` rather than rewriting.
   - **Agent + doc corrections (this pass):** both tester agents now (a) read `testing-patterns.md` **and** `current-feature.md` + the named spec before writing tests, (b) follow a **report-and-wait** policy — write unit + e2e tests, run with coverage, surface failures with a proposed fix, and make **no application-code changes without explicit permission** (replacing the old "do not stop until all pass" wording), and (c) require a coverage summary. Frontend agent's slice-test path corrected to `src/features/[feature]/[feature]Slice.test.ts` (matches the placed files) and its typos fixed. Context files refined to state the auth-only requirement clearly and to describe the upcoming cart (`cart_ui.png`) and checkout (`checkout_cod_ui.png` / `checkout_stripe_ui.png`, coupon-before-payment + shipping fee, out-of-stock overlay) flows — design notes for the next feature, no code yet.

9. **Cart Feature — Backend Cart Module + Frontend Cart Page** — *Done* (spec `007-cart-feature.md`). Branch `feature/cart-module` (cut from `main`). Full cart experience: a `cart` backend module (view / add / update-qty / remove) + the Cart page, wired product-detail "Add to Cart", and a live navbar badge.
   - **Backend:** new `cart/` module (controller, `CartService`, `AddCartItemDto`/`UpdateCartItemDto`, `types/cart.types.ts`) registered in `AppModule`; imports `AuthModule`. `GET /cart` (summary over all lines + every item, **no pagination**), `POST /cart` (add — atomic `upsert` on the new compound unique, `@HttpCode(200)` since it may only increment), `PATCH /cart/:cartItemId` (qty), `DELETE /cart/:cartItemId`. Guarded by `JwtAuthGuard`; `assertActiveUser` precheck (401) on every op; identity from `@CurrentUser()` only; `:cartItemId` via `ParseUUIDPipe`. Money serialized as `"0.00"` strings (`Prisma.Decimal`, never float); `final_price = max(0, price − discount)`; `total_items` = Σ quantities. New `CartMessages`; `MAX_CART_ITEMS = 25`, `MAX_CART_ITEM_QUANTITY = 20` in `values.constant.ts`.
   - **Confirmed decisions:** add increments by 1 (cap at `min(20, stock)`); **25 distinct-line cap** (a 26th *new* line → `cartFull`; incrementing existing unaffected); **coupon excluded** (checkout-only); strict stock enforcement (400); out-of-stock/inactive can't be added but the FE leaves Add-to-Cart/Buy **clickable** and toasts the rejection (per user decision — overrides the spec's earlier "disable" wording).
   - **Schema:** added `@@unique([cart_id, product_variant_id])` to `CartItem` (migration `cart_item_unique_variant`); enables the atomic add `upsert`.
   - **Review fixes applied (approved):** wrapped add's count/stock-check + upsert in a Serializable `$transaction` (cap can't be raced); switched update/remove to ownership-scoped `updateMany`/`deleteMany` (404 not P2025/500); `POST` → 200; `@Max(20)` on the update DTO + the same cap on the add/increment path (`maxQuantityReached`); FE: savings tag icon → green, removed the global `mutatingId` guard (per-line `disabled` only), centralized cart strings, `aria-label` on the qty value, richer empty-cart SVG.
   - **Frontend:** `features/cart/` (slice/service/types — `CartState` has **no `message`**; feedback is **react-toastify** toasts, green success / red error, top-right), `pages/Cart/` (populated + empty states), `types/cart.types.ts`; `cart` reducer registered; `MainLayout` badge = `summary.total_items` (fetches cart when authed, resets on logout/sessionExpired/deleteUser); product-detail Add-to-Cart wired; CHECKOUT button is an enabled placeholder (next feature). `--color-success-subtle` token added. Each `MainLayout` page now fills the viewport (`min-height: 100dvh`) so the footer sits below the fold. `renderWithProviders` migrated off the removed RTK `PreloadedState` type to `combineReducers` + `Partial<RootState>` and includes the `cart` reducer.
   - **Tests:** backend Jest unit (`cart.service.spec.ts`, 48) + Supertest e2e (`cart.e2e-spec.ts`); frontend Vitest/RTL (`cartSlice`, `CartPage`, `MainLayout` badge) + Playwright (`e2e/cart.spec.ts`). All green; both apps `npm run lint`/`build` clean. New testing pattern captured: Prisma `$transaction` mock for Serializable writes.
   - **Verified:** booted live and exercised in the browser per the user (cart page layout, stepper, toasts, badge, empty state, full-height footer) with iterative UI fixes against `cart_ui.png` / `empty_cart_ui.png`.
   - **Deferred (out of scope):** checkout/coupons/payments + the "Buy" action (next feature); pre-existing cross-cutting debt reaffirmed by reviewers — `ApiResult<T>` now duplicated across 4 services, `authSlice` inline `NETWORK_ERROR`, `ProductService` 403 vs cart/user 401 for inactive sessions.
