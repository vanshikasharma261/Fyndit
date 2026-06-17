## Current Feature

**Products Page UI Improvement — Discount Badge** (spec: `005-ui-improvemnt-products-page.md`)

Branch: `improvement/discount-badge-ui` (cut from `feature/products-browsing`, which carries features 003 + 004 + the access-control hardening).

A small, screenshot-faithful polish on the products listing page: the per-product discount on each product card currently renders as plain accent-coloured text, but the prototype `products_page_clothing_category.png` shows it as a **badge** (soft accent-tinted pill next to the price). CSS-only presentation change — no API/data-contract/Redux/routing/logic changes; `formatDiscountBadge` and badge placement stay as-is.

## Status

Done.

## Goal

Restyle `.cardBadge` in `frontend/src/pages/Products/Products.module.css` so the discount renders as a rounded pill (soft accent background + accent text) matching the prototype, using theme variables only (add an accent-subtle token to `theme.css` if one is missing, mirroring `--color-error-subtle`). Detail-page discount is out of scope. See `specs/005-ui-improvemnt-products-page.md` for the full Definition of Done.

## Implementation

- Added two theme tokens to `frontend/src/styles/theme.css`: `--color-accent-subtle: rgba(255, 92, 53, 0.12)` (soft accent fill, mirroring the `--color-error-subtle` convention) and `--radius-pill: 999px`.
- `.cardBadge` in `Products.module.css` is now a pill: `background-color: var(--color-accent-subtle)`, accent text, `padding: var(--space-1) var(--space-2)`, `border-radius: var(--radius-pill)`, `white-space: nowrap`. Existing font size/weight and position next to the price are unchanged.
- `.cardPriceRow` switched from `align-items: baseline` to `center` so the padded pill sits level with the price.
- Theme variables only — no hardcoded colours in the module. `formatDiscountBadge`, badge text/percentage logic, API contract, Redux, routing, and the detail page are all untouched (out of scope).
- Verified: `frontend` `npm run lint` clean and `npm run build` (tsc + vite) succeeds. Visual confirmation against the prototype at the running dev server still to be eyeballed.

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

- ☐ `product` module created (controller, service, DTO, types) + registered in `AppModule`
- ☐ `GET /product/:category` returns paginated products (`items` + `meta`); supports slug + `All`
- ☐ Parent scopes (Electronics) include descendants; "Clothing" spans both clothing children; unknown slug → empty result with valid meta (no 500)
- ☐ `search` matches name/brand/description case-insensitive; `page`/`limit` validated; `total` + `total_pages` returned; only active products
- ☐ `price`/`discount` serialized as `"0.00"` strings (no Decimal/float leakage)
- ☐ `where` built from a typed options object; price + JSON `attributes` filter at variant level (same-variant match); OR within key / AND across keys; unknown keys ignored
- ☐ `GET /product/:category/filters` returns price range + per-attribute facets for scope (declared before `:category`); facets from `CategoryAttribute` names + distinct present values
- ☐ `GET /product/detail/:slug` returns full detail with variants/attributes/images (declared before `:category`); missing/inactive → `NotFoundException` with `ProductMessages` string
- ☐ Endpoints public (no `JwtAuthGuard`); `PrismaService` only; no `any`

**Frontend**

- ☐ `react-paginate` installed + used via reusable `Pagination` wrapper
- ☐ Navbar/footer "Books" replaced with "Furniture"
- ☐ `/product/:category` + `/product/detail/:slug` routes under `MainLayout`; navbar links → correct slug; search → `/product/All?search=<term>`
- ☐ `productService` holds all fetch logic (no `fetch` in components); `productsSlice` with thunks; `products` reducer registered
- ☐ Listing page matches `products_page_clothing_category.png`; `FilterSidebar` functional + data-driven from facets (not hardcoded); price range from facets
- ☐ Toggling a value adds/removes in `attributes` map (empty keys dropped); "Clear filters" resets; filters in URL (`minPrice`/`maxPrice`/`attributes`); deep-link + refresh reproduce grid; filter change resets `page` to 1; facets fetched on category/search change only
- ☐ Product card: image/name/brand/price/discount badge; pagination driven by `meta` (0-based↔1-based), updates `page` query param
- ☐ Preview matches `product_preview.png`: gallery, category badge, dynamic attribute selectors, price/discount, stock status, action buttons; selected variant drives price/discount/stock/gallery
- ☐ URL is source of truth (deep-link + refresh safe); loading/empty/error states; theme variables; CSS Modules only; typed Redux hooks; mobile + desktop responsive

---

## Notes / decisions

- Must consult before/while implementing: `project-overview.md`, `business-rules.md`, `development-rules.md`, `database-design.md`, `prisma-schema.md`. Screenshots are the source of truth and live under `.claude/screenshots/`: `products_page_clothing_category.png` (listing layout + Clothing URL), `search_scenario.png` (search routing — URL `localhost:5173/product/All?search=jeans`), `product_preview.png` (detail layout).
- **Real seeded category hierarchy** (`backend/prisma/seed-data/categories.data.ts`): Electronics → Mobile Phones · Laptops · Headphones · Smart Watches; Fashion → Men's Clothing · Women's Clothing · Footwear; Home & Kitchen → Cookware · Home Decor · Furniture. There is **no Books category** — that is why the navbar "Books" item is replaced with "Furniture".
- **Attribute filter param is collapsed into one `attributes` JSON param** (not dynamic per-key params) precisely so the global `ValidationPipe` `whitelist` + `forbidNonWhitelisted` stays intact while supporting arbitrary category-defined attribute names. `ProductVariant.attributes` is JSON → use Prisma JSON path filters (`{ path: [key], equals: value }`).
- **Attribute names are dynamic per category** (driven by `CategoryAttribute`: Mobile → color/storage/ram; Clothing → color/size). The frontend must NOT hardcode them — derive selector groups from the union of `attributes` keys across returned variants (detail) or from the facets endpoint (sidebar).
- **Route ordering matters:** declare `detail/:slug` and `:category/filters` **before** the `:category` listing route so routing is unambiguous.
- **Facets are intentionally stable** while the user narrows — `fetchFilters` re-runs on category/search change only, not on every toggle, so selecting one value never removes the other sidebar options; only the grid narrows.
- Follow the established frontend patterns from feature 003: per-feature `types.ts` vs API-contract types in `src/types/`, `ApiResult<T>` service layer, typed `useAppDispatch`/`useAppSelector`, theme tokens in `src/styles/theme.css`, `VITE_API_URL` typed in `vite-env.d.ts`.
- After completion run the relevant reviewers: `fyndit-api-reviewer` (API contracts/DTOs — referenced in CLAUDE.md), `fyndit-prisma-reviewer` (queries/JSON filters/aggregate), `fyndit-security-reviewer` (public-endpoint exposure), `fyndit-quality-reviewer`, `fyndit-redux-reviewer`, `fyndit-ui-reviewer` (screenshot/theme/responsive). Note from prior features: `fyndit-api-reviewer` and `fyndit-redux-reviewer` may not be registered in this environment — cover those concerns manually if so.

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
