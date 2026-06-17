# Feature Specification: Product Browsing (Backend Product Module + Frontend Product Pages)

## Feature Overview

This feature implements product browsing for Fyndit. It introduces a backend
**Product module** that lists products in a paginated, searchable, and
filterable way and exposes single-product detail, plus the frontend **product
listing page** and **product preview page** that render those results and power the
navbar category links and the global search bar.

The implementation includes:

1. Backend `product` module (controller, service, DTOs) — feature-isolated
2. Paginated **list products** endpoint with a category path param + search/pagination
3. **Category-aware attribute filtering** (price range + the current category's attributes)
4. **Get category filters** endpoint exposing the available filter options (facets)
5. **Get single product** endpoint for the product preview/detail
6. Frontend product listing page wired to the navbar category links
7. Frontend functional filter sidebar driven by the current category's attributes
8. Frontend product preview page (image gallery + variant selectors)
9. Pagination via the **`react-paginate`** component
10. Frontend search wired to the listing endpoint using the `All` category scope
11. Redux Toolkit state + async thunks + a `productService` API layer
12. Theme-consistent, responsive product UI

The implementation must follow:

- `.claude/context/project-overview.md`
- `.claude/context/business-rules.md`
- `.claude/context/development-rules.md`
- `.claude/context/database-design.md`
- `.claude/context/prisma-schema.md`

UI implementation must follow the reference screenshots:

- `.claude/screenshots/products_page_clothing_category.png` — listing page layout, and the URL when the category is Clothing
- `.claude/screenshots/search_scenario.png` — search behavior; the browser URL on top is the routing reference
- `.claude/screenshots/product_preview.png` — single-product preview layout (image gallery + variant attribute selectors); source of truth for the detail shape

---

## Navigation Model

The top navbar drives browsing. Each navbar item maps to a category scope. The
real seeded category hierarchy (see `backend/prisma/seed-data/categories.data.ts`)
is:

- **Electronics** → Mobile Phones · Laptops · Headphones · Smart Watches
- **Fashion** → Men's Clothing · Women's Clothing · Footwear
- **Home & Kitchen** → Cookware · Home Decor · Furniture

| Navbar Item     | Behavior                                                   | Maps to (DB)                             |
| --------------- | ---------------------------------------------------------- | ---------------------------------------- |
| For You         | Stays on `/` (home). No product fetch.                     | —                                        |
| Clothing        | Lists all Clothing products.                               | `mens-clothing` + `womens-clothing`      |
| Electronics     | Lists all Electronics products across child categories.    | `electronics` parent (+ all descendants) |
| Mobile          | Lists mobile products.                                     | `mobile-phones`                          |
| **Furniture**   | Lists furniture products. **Replaces the "Books" item.**   | `furniture`                              |
| Select Category | Dropdown of available categories; selecting one navigates. | Any category with products               |

### Notes

- **Replace "Books" with "Furniture"** — there is no Books category in the seed
  data; Furniture exists under Home & Kitchen. Update `NAV_LINKS` in
  `frontend/src/layouts/MainLayout/MainLayout.tsx` (and the footer "Shop" column).
- A parent-scope item (Clothing, Electronics) must include products from **all
  descendant categories**, not only products attached directly to the parent.
  "Clothing" is a curated scope spanning the two clothing children.
- The **Select Category** dropdown is populated from the categories that actually
  hold products. Selecting one navigates to that category's product page.

---

## Routing

```
/product/:category                                           # listing
/product/:category?search=<term>
/product/:category?search=<term>&page=<n>
/product/:category?minPrice=<n>&maxPrice=<n>&attributes=<json>   # filters
/product/detail/:slug                                        # single-product preview
```

Confirmed by the screenshot URL `localhost:5173/product/All?search=jeans`.

- Active filters live in the **URL query string** (alongside `search`/`page`) so a
  filtered view is shareable and survives refresh.
- Attribute filters are carried as **one structured map** in a single `attributes`
  query param — a URL-encoded JSON object of `attributeName → selectedValues[]`
  (e.g. `attributes={"color":["blue"],"size":["32"]}`). Price uses `minPrice` /
  `maxPrice`.
- The UI **toggles** values in and out of this map: selecting an option adds the
  value to its attribute's array; selecting it again removes it. When an attribute's
  array becomes empty it is dropped from the map entirely (no empty keys). Clearing
  all filters removes the param.

- `:category` is a category **slug** (e.g. `mens-clothing`, `electronics`,
  `mobile-phones`, `furniture`) **or** the literal `All`.
- `All` means "no category filter" — used by the global search bar so search spans
  every category.
- Clicking a navbar category link navigates to `/product/<slug>`.
- Submitting the navbar search navigates to `/product/All?search=<term>`.
- Clicking a product card navigates to `/product/detail/<slug>`.
- The route components read `:category` / `:slug` / `?search` / `?page` from the URL
  as the single source of truth, so refresh and deep-links work.

---

## Backend: Product Module

Create a feature module under `backend/src/product/`, following the existing
`auth` module conventions:

```
backend/src/
└── product/
    ├── product.module.ts
    ├── product.controller.ts
    ├── product.service.ts
    ├── dto/
    │   └── list-products-query.dto.ts
    └── types/
        └── product.types.ts
```

Architecture rules (matching `auth`):

- **Thin controllers** — validate input (DTOs + the global `ValidationPipe`) and
  delegate to the service; handlers return `Promise<…>` straight from the service,
  like `AuthController`.
- **All logic in `ProductService`**, using **`PrismaService` only**.
- No `any`; prefer interfaces for response contracts (in `product/types`).
- Build the Prisma `where` clause from a typed options object so filters compose
  cleanly and stay extensible (see below).
- Source human-facing strings from `src/constants/messages.constant.ts` (add a
  `ProductMessages` group, e.g. `productNotFound`).
- Register `ProductModule` in `AppModule`.
- These endpoints are **public** (browsing needs no auth) — do **not** apply
  `JwtAuthGuard`.

### Money serialization (matches existing convention)

Prices live on `ProductVariant` as `Decimal(10,2)`. The seeder stores money as
2-decimal **strings** (`money()` → `"799.00"`). The API must serialize `price` and
`discount` as **strings** in the same `"0.00"` format so the frontend never deals
with float drift or `Prisma.Decimal` instances. Convert with `Decimal.toFixed(2)` /
`.toString()` in the service before returning.

---

### Endpoint 1 — List Products (paginated)

```
GET /product/:category
```

**Path parameter**

- `category` — a category slug, or the literal `All` for no category filter.

**Query parameters** (DTO `ListProductsQueryDto`, all optional)

| Param        | Type   | Default | Rules                                                                       |
| ------------ | ------ | ------- | --------------------------------------------------------------------------- |
| `search`     | string | —       | Trimmed; case-insensitive match on name / brand / description.              |
| `page`       | number | `1`     | `@Type(() => Number)`, `@IsInt`, `@Min(1)`.                                  |
| `limit`      | number | `12`    | `@IsInt`, `@Min(1)`, `@Max(50)`.                                             |
| `minPrice`   | number | —       | `@Type(() => Number)`, `@IsNumber`, `@Min(0)`.                               |
| `maxPrice`   | number | —       | `@IsNumber`, `@Min(0)`; ignored if `< minPrice`.                            |
| `attributes` | string | —       | URL-encoded JSON map `{ [attr]: string[] }`; parsed + validated (see below). |

DTO notes: use `class-validator` + `class-transformer` as in the auth DTOs. The
global pipe runs `whitelist` + `forbidNonWhitelisted`, so unknown query keys are
rejected — keep the DTO the single source of accepted params. Attribute filters are
deliberately collapsed into **one** `attributes` param (instead of dynamic per-key
params) precisely so the whitelist stays intact while supporting arbitrary,
category-defined attribute names.

The `attributes` param is parsed in the DTO with a `@Transform` that
`JSON.parse`s the value into a typed `Record<string, string[]>` (reject with 400 on
malformed JSON or a non-`string[]` shape). Treat it as an empty map when absent.

**Service behavior**

1. **Resolve the category scope** into a set of category ids:
   - `All` → no category constraint.
   - A leaf slug (`mobile-phones`, `furniture`, …) → that category id only.
   - A parent slug (`electronics`) → the parent **and all descendant** ids.
   - The `Clothing` navbar scope resolves to `[mens-clothing, womens-clothing]`.
   - Unknown slug → empty result set with valid pagination meta (not a 500).
2. Apply `search` (case-insensitive `contains`) across `product_name`, `brand`,
   `description` , also add on price like "under 300" or "under 400" via an `OR`.
3. Constrain to active products (`is_active: true`).
4. **Apply filters** (price + attributes) at the variant level — see below.
5. Paginate: `skip = (page - 1) * limit`, `take = limit`. Get `total` with a
   parallel `count` on the same `where`.
6. Include the data the card needs: brand, name, slug, the representative variant's
   `price`/`discount`, and the **primary image** (`is_primary: true`, else lowest
   `sort_order`). Use the first/lowest-priced variant as the card's representative.
7. Return `items` + `meta`.

**Filter application**

- Construct `where` incrementally from a typed options object
  `{ categoryIds?, search?, minPrice?, maxPrice?, attributes?: Record<string, string[]> }`
  — never a single hardcoded literal. Keep filter translation in one private helper.
- Filters resolve against `ProductVariant`, and **all selected filters must be
  satisfied by the same variant** — a product matches only if it has at least one
  variant meeting every active constraint:

  ```ts
  // product-level where fragment
  variants: {
    some: {
      // price range (Decimal columns compare against numbers fine)
      price: { gte: minPrice, lte: maxPrice },
      // attribute map: AND across keys, OR across each key's values.
      // ProductVariant.attributes is JSON → use Prisma JSON path filters.
      AND: Object.entries(attributes).map(([key, values]) => ({
        OR: values.map((value) => ({
          attributes: { path: [key], equals: value },
        })),
      })),
    },
  }
  ```

- Within one attribute (e.g. `color: ["blue","black"]`) the values are **OR**'d;
  across attributes they are **AND**'d (`color=blue AND size=32`).
- Unknown attribute keys (not defined on the scope's categories) are ignored rather
  than erroring, so a stale URL never 500s.
- The representative variant chosen for the card (step 6) should prefer a variant
  that satisfies the active filters, so the displayed price matches what was filtered.

**Response types** (`product/types/product.types.ts`)

```ts
export interface ProductListItem {
  product_id: string;
  product_name: string;
  slug: string;
  brand: string;
  price: string; // "799.00" — representative variant
  discount: string; // "50.00"
  image_url: string | null;
  category_slug: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number; // ceil(total / limit)
}

export interface ProductListResponse {
  items: ProductListItem[];
  meta: PaginationMeta;
}
```

Controller signature mirrors auth:

```ts
@Get(':category')
listProducts(
  @Param('category') category: string,
  @Query() query: ListProductsQueryDto,
): Promise<ProductListResponse> {
  return this.productService.listProducts(category, query);
}
```

---

### Endpoint 2 — Get Single Product (preview / detail)

```
GET /product/detail/:slug
```

> Use the distinct `detail/:slug` segment so the detail route never collides with
> the `:category` listing route. Declare it **before** the `:category` route in the
> controller so routing is unambiguous.

**Behavior**

- Fetch one active product by `slug`, including its category, all variants
  (sku, stock, price, discount, attributes) and each variant's images
  (ordered by `is_primary` then `sort_order`).
- Not found / inactive → `throw new NotFoundException(ProductMessages.productNotFound)`.

**The response must carry everything the preview screen composes** (see
`product_preview.png`): a category badge, per-attribute selector groups, the variant
image gallery, price + discount, and stock status. All of that is derivable from the
variant list + attributes — no extra endpoint needed.

**Response types**

```ts
export interface ProductVariantDetail {
  product_variant_id: string;
  sku: string;
  stock: number;
  price: string;
  discount: string;
  attributes: Record<string, string>; // e.g. { color: "blue", storage: "256GB" }
  images: { image_url: string; alt_text: string | null; is_primary: boolean }[];
}

export interface ProductDetailResponse {
  product_id: string;
  product_name: string;
  slug: string;
  brand: string;
  description: string;
  category: { category_id: string; category_name: string; slug: string };
  variants: ProductVariantDetail[];
}
```

> The `attributes` keys are **dynamic per category** (driven by `CategoryAttribute`:
> Mobile Phones → `color`/`storage`/`ram`; Clothing → `color`/`size`; etc.). The
> frontend must NOT hardcode attribute names — it derives the selector groups from
> the union of `attributes` keys across the returned variants.

---

### Endpoint 3 — Get Category Filters (facets)

```
GET /product/:category/filters
```

> Declare this **before** the `:category` listing route too (more specific path
> first), so `:category/filters` is matched as a sub-route, not as a category named
> "filters".

Returns the filter options available **for the current category scope** so the
sidebar renders exactly the attributes that category has — and only the values that
actually exist on its products. This is what makes the filter UI "show the
attributes of the current category."

**Behavior**

1. Resolve the category scope to its category ids (same resolver as the listing).
2. Read the attribute names defined for those categories from `CategoryAttribute`
   (e.g. Clothing → `color`, `size`; Mobile Phones → `color`, `storage`, `ram`).
   For the `All` scope, return no attribute groups (price only).
3. For each attribute name, collect the **distinct values** present across the active
   products' variants (`ProductVariant.attributes`). Because attributes are JSON,
   fetch the in-scope variants' `attributes` (active products only) and reduce the
   distinct values per key in the service — acceptable at this catalog size; note the
   reduction happens in-memory.
4. Compute the price range (`min`/`max`) via a Prisma `aggregate` on the in-scope
   variants, serialized as `"0.00"` strings.

**Response types**

```ts
export interface AttributeFacet {
  name: string;        // attribute key, e.g. "color"  (raw)
  label: string;       // display label, e.g. "Color"  (title-cased)
  values: string[];    // distinct available values, e.g. ["blue","black"]
}

export interface ProductFiltersResponse {
  price: { min: string; max: string };   // "0.00" .. "100000.00"
  attributes: AttributeFacet[];
}
```

The facets reflect the **unfiltered** category scope (search may still apply), so
selecting one value never removes the other options from the sidebar — the user can
keep toggling. Only the product grid narrows.

---

## Frontend: Product Pages

### Dependencies

Install the pagination component (currently not in `frontend/package.json`):

```bash
cd frontend
npm install react-paginate
```

`react-paginate` ships its own types, so no separate `@types` package is needed.

### Folder Structure

Mirror the `auth` feature layout (service + slice + types separated):

```
frontend/src/
├── pages/
│   ├── Products/
│   │   ├── ProductsPage.tsx
│   │   └── Products.module.css
│   └── ProductDetail/
│       ├── ProductDetailPage.tsx
│       └── ProductDetail.module.css
├── features/
│   └── products/
│       ├── productsSlice.ts
│       └── productService.ts
├── components/
│   ├── Pagination/
│   │   ├── Pagination.tsx          (thin wrapper around react-paginate)
│   │   └── Pagination.module.css
│   └── FilterSidebar/
│       ├── FilterSidebar.tsx       (price range + attribute facet groups)
│       └── FilterSidebar.module.css
├── types/
│   └── product.types.ts
└── routes/
    └── router.tsx          (add /product/:category and /product/detail/:slug under MainLayout)
```

Frontend rules (matching the auth feature):

- **`productService.ts`** holds all `fetch` calls (no `fetch` in components),
  using `const API_URL = import.meta.env.VITE_API_URL` and the same `ApiResult<T>`
  `{ ok, status, data }` pattern. These are public `GET`s — `credentials: "include"`
  is not required (no cookie needed).
- **`productsSlice.ts`** uses `createSlice` + `createAsyncThunk`; reducers branch on
  `ApiResult.ok`, mirroring `authSlice`.
- Use the typed `useAppDispatch` / `useAppSelector` hooks; **CSS Modules only**.
- Register the `products` reducer in `src/store/store.ts`.

### Types (`types/product.types.ts`)

Re-declare the backend contracts on the client: `ProductListItem`,
`PaginationMeta`, `ProductListResponse`, `ProductDetailResponse`,
`ProductVariantDetail`, `AttributeFacet`, `ProductFiltersResponse`, plus the params:

```ts
export interface ListProductsParams {
  category: string;
  search?: string;
  page?: number;
  minPrice?: number;
  maxPrice?: number;
  attributes?: Record<string, string[]>; // { color: ["blue"], size: ["32"] }
}
```

### Service (`features/products/productService.ts`)

```ts
export const productService = {
  list: (params: ListProductsParams) =>
    getJson<ProductListResponse>(buildProductListPath(params)),

  filters: (category: string, search?: string) =>
    getJson<ProductFiltersResponse>(buildFiltersPath(category, search)),

  detail: (slug: string) =>
    getJson<ProductDetailResponse>(`/product/detail/${slug}`),
};
```

`buildProductListPath` assembles `/product/{category}?search=&page=&minPrice=&maxPrice=&attributes=`
from params, URL-encoding `search` and `JSON.stringify`-ing the `attributes` map
(omit it when empty). `buildFiltersPath` builds `/product/{category}/filters?search=`.

### Slice (`features/products/productsSlice.ts`)

- State: `items`, `meta`, `listLoading`, `listError`; `filters` (the
  `ProductFiltersResponse` facets), `filtersLoading`; `detail`, `detailLoading`,
  `detailError`; and the active `category` / `search` / `page` / `minPrice` /
  `maxPrice` / `attributes`.
- Thunks:
  - `fetchProducts(params: ListProductsParams)` → `productService.list`
  - `fetchFilters({ category, search })` → `productService.filters`
  - `fetchProductDetail(slug)` → `productService.detail`
- On `fulfilled` set the corresponding data; on `rejected` set the error.
- Re-fetch `fetchFilters` when `category` (or `search`) changes, not on every filter
  toggle — the facet list is intentionally stable while the user narrows.

### Pagination component (`components/Pagination/`)

A reusable wrapper around **`react-paginate`** so pagination styling/behavior lives
in one place (the listing page consumes it; future paged lists can too).

```tsx
import ReactPaginate from "react-paginate";

interface PaginationProps {
  pageCount: number; // meta.total_pages
  currentPage: number; // meta.page (1-based)
  onPageChange: (page: number) => void; // emits a 1-based page
}

// react-paginate is 0-based: pass forcePage={currentPage - 1}, and in
// onPageChange map selected -> selected + 1 before calling back.
<ReactPaginate
  pageCount={pageCount}
  forcePage={currentPage - 1}
  onPageChange={({ selected }) => onPageChange(selected + 1)}
  previousLabel="Prev"
  nextLabel="Next"
  pageRangeDisplayed={1}
  marginPagesDisplayed={1}
  containerClassName={styles.pagination}
  pageClassName={styles.page}
  activeClassName={styles.active}
  previousClassName={styles.nav}
  nextClassName={styles.nav}
  disabledClassName={styles.disabled}
/>;
```

Style the classes to match the screenshot's `Prev / 1 / Next` control: the active
page uses `--color-primary`, the Prev/Next buttons are bordered/surface. Render it
only when `meta.total_pages > 1`.

### Products Listing Page

Reference: `.claude/screenshots/products_page_clothing_category.png` — source of truth.

Layout:

- **Left sidebar — `FilterSidebar`** (functional). Rendered from the
  `fetchFilters` facets for the current category, so it shows **exactly that
  category's attributes** and their available values:
  - **Price Range** slider bound to `price.min` / `price.max` → sets `minPrice` /
    `maxPrice`.
  - **One group per `AttributeFacet`** (e.g. Color, Size for Clothing; Color,
    Storage, RAM for Mobile), each value a toggleable pill/checkbox. The groups are
    data-driven — the screenshot's Size/Color/Gender is illustrative; the actual
    groups come from the category's real attributes.
  - A **"Clear filters"** action when any filter is active.
  - For the `All` scope (global search) only the price group shows (no shared
    attributes across all categories).
- **Main area — "Products"** heading + a responsive grid of product cards.
- **Product card**: primary image, product name, brand, a short description line,
  price, and a discount badge (e.g. "15 % off"), per the screenshot.
- **Pagination footer**: the `Pagination` component, driven by `meta`.

Behavior:

1. Navbar category link → `/product/<slug>` → `fetchProducts(...)` + `fetchFilters(...)`.
2. Navbar search submit → `/product/All?search=<term>` → `fetchProducts({ category: "All", search: term, page: 1 })`.
3. The page derives `category` / `search` / `page` / `minPrice` / `maxPrice` /
   `attributes` from the URL, so refresh and deep-links reproduce the exact filtered
   view.
4. **Toggling an attribute value** flips it in the `attributes` map (add on select,
   remove on re-select; drop the key when its array empties) and writes the new map
   back to the URL `attributes` param. Changing price writes `minPrice`/`maxPrice`.
   Any filter change resets `page` to `1`.
5. The URL change re-drives `fetchProducts` — keep the URL the source of truth, not
   local component state. `fetchFilters` is **not** re-run on filter toggles (facets
   stay stable; only the grid narrows).
6. `Pagination`'s `onPageChange` updates the `page` query param.
7. Clicking a card navigates to `/product/detail/<slug>`.
8. Show loading, empty ("No products found"), and error states.

### Product Preview (Detail) Page

Reference: `.claude/screenshots/product_preview.png` — source of truth.

Two-column card layout:

- **Left — image gallery**: a large primary image with a vertical thumbnail strip.
  Clicking a thumbnail swaps the main image. The gallery shows the **selected
  variant's** images (changes as the user picks a color, etc.).
- **Right — product info**, top to bottom:
  1. **Category badge** (e.g. "CLOTHING") from `category.category_name`.
  2. **Attribute selector groups**, one per attribute key, each rendered as a row of
     selectable pills — e.g. `SIZE` (32 / 30 / 34), `COLOR` (Blue / Black),
     `GENDER` (Male). Build these by aggregating distinct values for each key across
     `variants[].attributes` — **do not hardcode** the attribute names; they vary by
     category.
  3. **Product name** and the **brand / description** line.
  4. **Price** + **discount badge** (e.g. "₹2,999 15 % off").
  5. **Stock status** — "In Stock" (green) when the selected variant's `stock > 0`,
     else "Out of Stock".
  6. **Actions** — `Add to Cart` and `Buy` buttons (Cart/Buy wiring belongs to later
     features; render the buttons and resolve the selected variant here).

Selected-variant logic:

- Maintain a selected-attributes object in component state; the selected
  `ProductVariant` is the one whose `attributes` match every selected value.
- Price, discount, stock, and the image gallery all reflect the selected variant.
- Default to the first variant on load.

---

## Theme Requirements

Use the project theme variables only (no hardcoded colors):

```css
:root {
  --color-primary: #1a2744;
  --color-primary-light: #243460;
  --color-primary-dark: #111a30;
  --color-accent: #ff5c35;
  --color-accent-hover: #e64d28;
  --color-surface: #f1f2f4;
  --color-surface-card: #ffffff;
  --color-text: #1a1a2e;
  --color-text-muted: #6b7280;
  --color-border: #e5e7eb;
}
```

Requirements:

- Discount badge and price use the accent color, per the screenshots.
- Active pagination page and the `Buy` button / selected attribute pill use the
  primary color; unselected pills and Prev/Next are bordered/surface, per the
  screenshots.
- Cards: white surface, soft border, minimal shadow, generous spacing.
- Responsive: on mobile the filter sidebar stacks above the grid, and the preview
  columns stack (image above info).
- Consistent with the existing navbar/footer styling in `MainLayout`.

---

## Acceptance Criteria

**Backend**

- ✓ `product` module created (controller, service, DTO, types) and registered in `AppModule`
- ✓ `GET /product/:category` returns paginated products (`items` + `meta`)
- ✓ `category` supports a slug and the literal `All`
- ✓ Parent scopes (Electronics) include all descendant categories; "Clothing" spans both clothing children
- ✓ Unknown category slug → empty result with valid meta (no 500)
- ✓ `search` matches name/brand/description, case-insensitive
- ✓ `page`/`limit` validated via DTO; `total` + `total_pages` returned
- ✓ Only active products returned
- ✓ `price`/`discount` serialized as `"0.00"` strings (no Decimal/float leakage)
- ✓ `where` built from a typed options object — price + attribute filters applied
- ✓ `minPrice`/`maxPrice` and the JSON `attributes` map filter at the variant level (same-variant match)
- ✓ Attribute values OR'd within a key, AND'd across keys; unknown keys ignored (no 500)
- ✓ `GET /product/:category/filters` returns price range + per-attribute facets for the scope; declared before `:category`
- ✓ Facets reflect the category's `CategoryAttribute` names and the distinct values actually present
- ✓ `GET /product/detail/:slug` returns full detail with variants, attributes + images; declared before `:category`
- ✓ Missing/inactive product → `NotFoundException` with a `ProductMessages` string
- ✓ Endpoints public (no `JwtAuthGuard`); `PrismaService` only; no `any`

**Frontend**

- ✓ `react-paginate` installed and used via a reusable `Pagination` wrapper
- ✓ Navbar/footer "Books" replaced with "Furniture"
- ✓ `/product/:category` and `/product/detail/:slug` routes added under `MainLayout`
- ✓ Navbar category links navigate to the correct slug; search → `/product/All?search=<term>`
- ✓ `productService` holds all fetch logic; no `fetch` in components
- ✓ `productsSlice` with `fetchProducts` / `fetchProductDetail`; `products` reducer registered
- ✓ Listing page matches `products_page_clothing_category.png`
- ✓ `FilterSidebar` is functional, driven by `fetchFilters` facets for the current category
- ✓ Sidebar shows the category's real attributes + available values (data-driven, not hardcoded); price range from facets
- ✓ Toggling a value adds/removes it in the `attributes` map; empty keys dropped; "Clear filters" resets
- ✓ Filters live in the URL (`minPrice`/`maxPrice`/`attributes`); deep-link + refresh reproduce the filtered grid; filter change resets `page` to 1
- ✓ Facets fetched on category/search change only, not on every toggle
- ✓ Product card: image, name, brand, price, discount badge
- ✓ Pagination driven by `meta` (react-paginate, 0-based mapped to 1-based), updates the `page` query param
- ✓ Preview page matches `product_preview.png`: image gallery, category badge, attribute selectors, price/discount, stock status, action buttons
- ✓ Attribute selectors derived dynamically from variant attributes (not hardcoded)
- ✓ Selected variant drives price/discount/stock/gallery
- ✓ URL is the source of truth for category/search/page (deep-link + refresh safe)
- ✓ Loading / empty / error states handled
- ✓ Theme variables applied; CSS Modules only; typed Redux hooks; mobile + desktop responsive

---

## Post-Implementation Addendum — Access Control & UX

The following decisions diverge from / extend the original spec and were applied
after the initial build (see `.claude/context/business-rules.md` →
*Access Control & Session Rules*).

### Endpoints are protected, not public

The spec called the product endpoints public. In practice the whole app is an
authenticated-only experience, so `ProductController` is guarded with
`JwtAuthGuard` and every service method re-checks `is_active` via
`AuthService.isUserActive` before any DB access. Inactive/logged-out sessions →
`403`; missing token → `401`. Frontend `productService` GETs send
`credentials: "include"`.

### Frontend route protection (bug fix)

Originally the frontend had no route guard, so a logged-out user could still
open `/` or `/product/*`; the listing page would then fire a fetch that `401`'d
and render "Unauthorized" over an empty grid. Fixed by:

- **`RequireAuth` guard** (`frontend/src/routes/RequireAuth.tsx`) wrapping every
  content route in `router.tsx`. It shows a neutral loader while the initial
  `GET /auth/me` check is in flight, then redirects to `/login` when there is no
  authenticated session.
- **Global 401 interceptor** (`frontend/src/store/authExpiryMiddleware.ts`,
  registered in `store/store.ts`): any *data* request rejected with `401`
  dispatches `sessionExpired`, clearing all auth state so the guard redirects to
  `/login`. Auth endpoints (`auth/*`) are excluded so their expected `401`s
  (bad login, not-signed-in `/auth/me`) are handled in place.
- **`sessionExpired` reducer** added to the auth slice to tear the session down.
- Logout already redirected to `/login`; the guard now also blocks navigating
  back into protected pages while signed out.

### Sticky filter sidebar (UX)

The `FilterSidebar` is now `position: sticky` (offset below the sticky navbar)
with `max-height: calc(100dvh - 6rem)` + `overflow-y: auto` + `overscroll-behavior:
contain`, so the filters stay in view while the product grid scrolls and tall
scopes (e.g. Electronics) can scroll internally to reach the last attribute
group. The scrollbar is slim and hover-revealed (thumb transparent until
hover/focus), and a bouncing down-chevron hint fades in at the card's bottom
edge while there is more content below (JS-tracked via a `scroll` listener +
`ResizeObserver`), disappearing once the bottom is reached — so the
hidden-until-hover scrollbar isn't the only "more below" cue. Disabled at the
`≤900px` breakpoint where the sidebar stacks above the grid.
