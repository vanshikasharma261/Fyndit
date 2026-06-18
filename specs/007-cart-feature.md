# 007 — Cart Feature (Backend Cart Module + Frontend Cart Page)

Fyndit gives every authenticated user exactly one cart. This feature implements
the full cart experience: a backend `cart` module that owns all cart operations
(view, add, update quantity, remove) and a frontend Cart page where the user
reviews their items and the price summary before heading to checkout. The same
work wires the product-detail "Add to Cart" button to the new endpoint and turns
the navbar cart icon's count into a live reflection of the cart.

The cart summary shows total items, total price, total product discount, and the
final amount (price − discount). Coupons are not part of the cart — they are
applied later on the checkout page — so no coupon line appears here. Quantities
are bounded by current stock (minimum 1, maximum the available stock), and
out-of-stock or inactive products cannot be added. A cart holds **at most 25
distinct items**; once full, adding a new item is refused with a message asking
the user to checkout or remove something first (increasing the quantity of an
item already in the cart is still allowed).

## Goal & Scope

- **Backend** — a feature-isolated `cart` module mirroring the established
  `product`/`user` conventions: thin controller, all logic in `CartService`,
  `PrismaService` only, no `any`, response contracts in `cart/types/`, copy in a
  new `CartMessages` group, `JwtAuthGuard` + an `assertActiveUser` precheck on
  every operation.
- **Frontend** — the **Cart page** (populated `cart_ui.png` / empty
  `empty_cart_ui.png`) replacing the current `/cart` placeholder, the wired
  product-detail **"Add to Cart"** button, and a **live navbar cart badge**.
  Mirrors the existing `features/<x>/{slice,service,types}` +
  `types/<x>.types.ts` architecture.

**In scope:** view / add / update-quantity / remove; cart summary; the 25-item
cap; empty-cart state; Add-to-Cart trigger; live navbar badge.

**Out of scope (deferred):** coupons (apply/remove happens on the checkout page —
`project-overview.md`); checkout; the "Buy" button on the detail page; order
placement; the `Cart.applied_coupon` column stays untouched.

---

## Decisions (confirmed with user)

1. **Add when already in cart → increment quantity by 1** (capped at stock). If
   the variant is not yet a line, create it at quantity 1. The add endpoint takes
   only `product_variant_id` (no quantity).
2. **Frontend = full**: Cart page **and** wire the product-detail "Add to Cart"
   button **and** make the navbar cart badge reflect the live item count
   (currently hardcoded `0`).
3. **Coupon excluded** from the cart summary — coupons belong to checkout. The
   summary is exactly: total items, total price, total (product) discount, final
   amount. Matches `cart_ui.png` (Price / Discount / Total Amount) and
   `project-overview.md` ("Cart Summary shown before any coupon is applied").
4. **Strict stock enforcement (reject with 400)**: update `quantity > stock` →
   400; `quantity < 1` → 400 (DTO `@Min(1)`); adding / incrementing beyond
   available `stock` → 400; adding an out-of-stock (`stock === 0`) or inactive
   product → 400. Mirrors `business-rules.md` (min 1, max = current stock;
   out-of-stock cannot be added).
5. **No pagination; max 25 distinct items (`MAX_CART_ITEMS = 25`)** — `GET /cart`
   returns the **whole** cart (summary + all items), no paging. A cart may hold
   at most 25 distinct line items (`CartItem` rows). When the cart already has 25
   lines, adding a **new** variant is rejected with `400 CartMessages.cartFull`
   ("checkout or remove an item first"); **incrementing an item already in the
   cart is unaffected** (it adds no new line). This **overrides** the
   `development-rules.md` "Pagination required for Cart Items" rule for this
   feature — the 25-item ceiling keeps the query bounded instead. (Context files
   to be reconciled in Phase 6.)
6. **Schema change (approved)**: add a composite uniqueness constraint to
   `CartItem` so each variant maps to at most one cart line and "add =
   find-or-increment" can use an atomic `upsert`:

   ```prisma
   model CartItem {
     // …existing fields…
     @@unique([cart_id, product_variant_id])
     @@index([cart_id])
   }
   ```

   Migration (migrations-only, never `db push`): `cart_item_unique_variant`.

---

## Backend Plan — `cart` module (`backend/src/cart/`)

```
backend/src/cart/
├── cart.module.ts            // imports AuthModule (isUserActive) + PrismaModule(global)
├── cart.controller.ts        // @UseGuards(JwtAuthGuard); @CurrentUser() only
├── cart.service.ts
├── dto/
│   ├── add-cart-item.dto.ts      // product_variant_id
│   └── update-cart-item.dto.ts   // quantity
└── types/cart.types.ts
```

Register `CartModule` in `AppModule`. Every handler takes `@CurrentUser()` and
passes `user.id`; **no id is ever read from the body/params** (a user can only
touch their own cart). Each service method runs `assertActiveUser(userId)`
(wrapping `AuthService.isUserActive`) **before any DB access** — same pattern as
`ProductService`/`UserService` (a valid JWT can outlive a logout/soft-delete);
an inactive principal → 401.

### Money & data conventions

- All monetary fields serialized as 2-decimal **strings** (`Decimal.toFixed(2)`)
  — never leak `Prisma.Decimal`/float. Arithmetic done with `Prisma.Decimal` to
  avoid float drift.
- `final_price` (per unit) = `max(0, price − discount)`. The per-unit discount is
  clamped to the price so totals stay consistent.
- `image_url` (preview) = the variant's primary image (`is_primary`), else the
  lowest `sort_order`, else `null` (same rule as the product listing card).
- `attributes` = the variant's `attributes` JSON (`Record<string,string>`).
- `total_items` = **sum of quantities** across the whole cart (drives the badge).

### Endpoints

All under `/cart`, all guarded.

| Method | Route | Body | Returns |
|---|---|---|---|
| `GET` | `/cart` | — | `CartResponse` (summary + all items) |
| `POST` | `/cart` | `AddCartItemDto` | `AddToCartResponse` (the single added/updated item + summary) |
| `PATCH` | `/cart/:cartItemId` | `UpdateCartItemDto` | `UpdateCartResponse` (message + updated item + summary) |
| `DELETE` | `/cart/:cartItemId` | — | `{ message }` |

**`GET /cart`** — resolve the caller's cart (by `user_id`). Return the summary
(over all items) and **every** item (ordered deterministically by
`cart_item_id`), capped naturally by the 25-item ceiling. Empty cart → empty
`items`, zero summary.

**`POST /cart`** (add) — validate the variant exists, its product `is_active`,
and `stock > 0` (else 400 `productUnavailable` / `outOfStock`). Look up the
existing line (compound unique):
- **exists** → `quantity + 1` (reject 400 `exceedsStock` if that exceeds
  `stock`).
- **new line** → first check the cart's distinct line count; if it is already
  `MAX_CART_ITEMS` (25) → reject 400 `cartFull`. Otherwise create at quantity 1.

Apply via `prisma.cartItem.upsert` on the compound unique key. Return the single
resulting `CartItem` + the recomputed summary.

**`PATCH /cart/:cartItemId`** (update quantity) — load the line and assert it
belongs to the caller's cart (else `NotFoundException` `cartItemNotFound`).
Validate `1 ≤ quantity ≤ stock` (`> stock` → 400 `exceedsStock`). Update, return
`{ message: updateSuccess, item, summary }`.

**`DELETE /cart/:cartItemId`** (remove) — assert ownership (else 404), hard-delete
the line (cart items are transient, not soft-deleted — `business-rules.md` soft
delete applies only to `User`/`Address`). Return `{ message: removeSuccess }`.
(The frontend re-fetches the cart to refresh totals.)

### DTOs (class-validator)

- `AddCartItemDto`: `product_variant_id: string` — `@IsUUID()`.
- `UpdateCartItemDto`: `quantity: number` — `@IsInt() @Min(1)` (transform). The
  upper bound is stock-dependent, so it's enforced in the service, not the DTO.

Global pipe `whitelist` + `forbidNonWhitelisted` rejects extra keys. Route param
`:cartItemId` is validated as a UUID (`ParseUUIDPipe`); a malformed id → 400.

### Response contracts (`cart/types/cart.types.ts`)

```ts
export interface CartItem {
  cart_item_id: string;
  product_variant_id: string;
  product_name: string;
  brand: string;
  description: string;
  image_url: string | null;          // preview/primary image
  price: string;                     // "1100.00"
  discount: string;                  // "77.00"  (per-unit flat amount)
  final_price: string;               // "1023.00" = max(0, price - discount)
  quantity: number;
  stock: number;                     // current available stock (for max qty)
  attributes: Record<string, string>;
}

export interface CartSummary {
  total_items: number;               // sum of quantities
  total_price: string;               // Σ price × qty
  total_discount: string;            // Σ discount × qty
  final_amount: string;              // total_price - total_discount
}

export interface CartResponse {       // GET /cart
  summary: CartSummary;
  items: CartItem[];                 // the whole cart (≤ 25 lines)
}

export interface AddToCartResponse {  // POST /cart
  item: CartItem;
  summary: CartSummary;
}

export interface UpdateCartResponse { // PATCH /cart/:cartItemId
  message: string;
  item: CartItem;
  summary: CartSummary;
}
```

`MAX_CART_ITEMS = 25` lives in `src/constants/values.constant.ts`.
`CartMessages` (new group in `messages.constant.ts`): `updateSuccess`,
`removeSuccess`, `outOfStock`, `exceedsStock`, `productUnavailable`,
`cartItemNotFound`, `cartFull`.

---

## Frontend Plan

```
frontend/src/
├── pages/Cart/{CartPage.tsx, Cart.module.css}   // replaces /cart placeholder
├── features/cart/{cartSlice.ts, cartService.ts, types.ts}   // CartState
├── types/cart.types.ts                          // API contracts (mirror server)
├── routes/router.tsx                            // /cart → <CartPage/> (under MainLayout + RequireAuth)
├── store/store.ts                               // register `cart` reducer
├── layouts/MainLayout/MainLayout.tsx            // badge = cart count; fetch cart when authed
└── pages/ProductDetail/ProductDetailPage.tsx    // wire "Add to Cart"
```

- **`cartService.ts`** — all `fetch` here (`credentials: "include"`, parse-once
  `ApiResult<T>` `{ ok, status, data }`). Methods: `getCart()`,
  `addToCart(productVariantId)`, `updateItem(cartItemId, quantity)`,
  `removeItem(cartItemId)`. `VITE_API_URL` guarded at module init.
- **`cartSlice.ts`** — `createSlice` + `createAsyncThunk`: `fetchCart`,
  `addToCart`, `updateCartItem`, `removeCartItem`. Branch on `ApiResult.ok`;
  `rejectWithValue` the error envelope; synthetic `NETWORK_ERROR` on `fetch`
  throw (reuse the shared `NetworkErrorMessages`). State (`CartState`):
  `{ items, summary, loading, error, mutatingId, adding }` — there is no
  `message` field; success/error feedback is shown via react-toastify in the
  dispatching component (`.unwrap()` → `toast.success`/`toast.error`). `add`/
  `update` update `summary` (so the badge stays live without a refetch);
  `remove` re-fetches the cart. 401s are handled globally by the existing
  `authExpiryMiddleware` (no per-thunk redirect logic).
- **Cart page — populated (`cart_ui.png`)** — two-column layout:
  - **Left** — "Shopping Cart" heading + a list of cart item cards. Each card:
    preview image, product name, brand, a short variant/description line,
    **attribute pills** (`key:value`, e.g. `ram:16GB`, `color:Silver`), a price
    row (discount % badge + struck original price + final price), an "In Stock"
    line, a **quantity stepper** (`−` / value / `+`, bounded `1..stock`), and a
    **"Remove Item"** action.
  - **Right** — "PRICE DETAILS" summary card: Price, Discount (negative), **Total
    Amount**, a "You will save ₹X on this order!" note, a trust line, and a
    **CHECKOUT** button (navigates toward checkout, built in the next feature —
    disabled/placeholder for now, no checkout logic here).
  - Quantity `+`/`−` dispatch `updateCartItem` (`+` disabled at `stock`, `−`
    disabled at 1); the `mutatingId` flag disables that line's controls
    mid-request. Loading + error states.
- **Cart page — empty (`empty_cart_ui.png`)** — when the cart has no items,
  render a centered empty state instead of the two-column layout: a **"Your Cart
  is empty"** heading + the empty-cart illustration (cart-with-X). No summary
  panel, no CHECKOUT. Navbar badge reads 0. (Illustration shipped as a frontend
  asset under `assets/` or an inline SVG matching the screenshot; theme tokens
  only.)
- **Add to Cart wiring (`ProductDetailPage.tsx`)** — the existing button
  dispatches `addToCart(selectedVariant.product_variant_id)`. It stays
  **clickable regardless of stock** (only disabled briefly while a request is in
  flight); on success a green **"Added to cart"** toast shows and the navbar
  badge increments (summary update), while any rejection (out of stock, cart
  full, over stock) shows a red toast with the server message. Feedback uses
  **react-toastify** (top-right, `theme="colored"`), not inline text. (The "Buy"
  button is clickable but inert — out of scope.)
- **Navbar badge (`MainLayout.tsx`)** — replace the hardcoded `0` with
  `cart.summary?.total_items ?? 0`; dispatch `fetchCart` once when the session is
  authenticated (`authChecked && isAuthenticated`) so the badge is populated on
  load and stays in sync after add/update/remove. Hide the badge when count is 0
  (matches `empty_cart_ui.png` showing `0`).
- **Types** — `types/cart.types.ts` mirrors the server contracts above
  (`CartItem`, `CartSummary`, `CartResponse`, `AddToCartResponse`,
  `UpdateCartResponse`, error envelope reused from the shared pattern).
  `CartState` lives in `features/cart/types.ts`.
- **Formatting** — reuse `utils/format.ts` (`formatPrice`, `formatDiscountBadge`)
  and `utils/image.ts` (`resolveImageUrl`). CSS Modules + theme tokens only; no
  hardcoded colours; responsive (columns stack on mobile).

---

## Screenshot references (source of truth)

Located under `.claude/screenshots/`:

- `cart_ui.png` — populated cart: items on the left, PRICE DETAILS summary +
  CHECKOUT on the right, attribute pills, discount %, struck original price,
  quantity stepper, "Remove Item", "You will save ₹X" note.
- `empty_cart_ui.png` — empty cart: centered "Your Cart is empty" heading + the
  empty-cart illustration; navbar badge at 0; no summary/CHECKOUT.

---

## Definition of Done

**Backend**

- ☐ `CartModule` (controller, service, 2 DTOs, types) created + registered in `AppModule`; imports `AuthModule`.
- ☐ `GET /cart` returns summary (over all items) + all items; money as `"0.00"` strings; empty cart handled.
- ☐ `POST /cart` adds at qty 1 / increments existing by 1 (capped at stock); validates active product + stock; blocks a 26th distinct item with `cartFull`; returns item + summary.
- ☐ `PATCH /cart/:cartItemId` enforces `1 ≤ qty ≤ stock` (400 otherwise); ownership-checked; returns message + item + summary.
- ☐ `DELETE /cart/:cartItemId` ownership-checked; returns message.
- ☐ Every op runs `assertActiveUser` (401 on inactive/soft-deleted); identity from `@CurrentUser()` only; ownership violations → 404; `PrismaService` only; no `any`; copy from `CartMessages`.
- ☐ `cart_item_unique_variant` migration applied (migrations-only).
- ☐ `npm run lint` + `npm run build` clean.

**Frontend**

- ☐ `/cart` renders `CartPage` (placeholder removed), behind `RequireAuth` inside `MainLayout`.
- ☐ Populated layout matches `cart_ui.png`; empty state matches `empty_cart_ui.png` ("Your Cart is empty" + illustration).
- ☐ Quantity `+`/`−` updates via `updateCartItem` (bounded 1..stock); Remove via `removeCartItem`; loading state; `cartFull`/stock errors surfaced.
- ☐ Product-detail "Add to Cart" wired to `addToCart`; navbar badge shows live `total_items` and updates after add/update/remove.
- ☐ `cartSlice`/`cartService`/`types` follow the established architecture; all `fetch` in the service; `cart` reducer registered.
- ☐ CSS Modules + theme variables only; `npm run lint` + `npm run build` clean.

**Testing & Review** (later phases)

- ☐ `fyndit-backend-tester` (Jest unit + Supertest e2e) and `fyndit-frontend-tester` (Vitest/RTL + Playwright) per the workflow's report-and-wait policy.
- ☐ Parallel review (`quality`, `prisma`, `security`, `ui`) → consolidated report → approved fixes only.

---

## Notes

- Reuse, don't rebuild: `@CurrentUser()`/`AuthenticatedUser`, `JwtAuthGuard`,
  `AuthService.isUserActive`, `PrismaService`, the `{ errors: { field } }`
  validation envelope, `ApiResult<T>`, typed `useAppDispatch`/`useAppSelector`,
  `utils/format.ts`, `utils/image.ts`, theme tokens, `NetworkErrorMessages`.
- A cart already exists for every user (created at signup in the `002`
  transaction), so no cart-creation path is needed here; the service still
  resolves it defensively.
- **"25 items" = 25 distinct cart lines** (`CartItem` rows), not 25 total units.
  Per-line quantity remains stock-bounded and independent of the line cap.
