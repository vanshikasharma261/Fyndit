# Fyndit Business Rules

# User Rules

## Registration

- Email must be unique.
- Password must be hashed using bcrypt.
- User account is not active by default it get active on login and not active on logout.
- Cart should be automatically created after successful registration.

## Login

- Soft deleted users cannot login.
- Only valid email/password combinations can authenticate.

---

# Access Control & Session Rules

## Authenticated-Only Application

- The entire application requires an authenticated session. Every content page —
  home, product listing, product detail, profile, orders, cart — is protected.
- Unauthenticated visitors must never see a protected page or a partially
  rendered/error state from a denied request. They are redirected to the login
  page before any protected content or data fetch.

## Logout

- On logout the client session is fully torn down and the user is returned to
  the login page. They cannot navigate back into protected pages while signed
  out.

## Mid-Session Expiry

- A valid session can end mid-use (cookie expiry, logout in another tab, account
  deactivation). When any authenticated request returns `401 Unauthorized`, all
  client-side auth state must be cleared and the user redirected to the login
  page. Auth endpoints themselves (login / signup / session-restore) are exempt:
  their own `401`s are expected and handled in place.

---

# Address Rules

## Address Ownership

Users can only:

- View their own addresses
- Update their own addresses
- Delete their own addresses

Accessing another user's address is forbidden.

## Address Limits

- Maximum 5 active addresses per user (`MAX_ACTIVE_ADDRESSES` in
  `values.constant.ts`). The backend rejects a 6th with a 400; the frontend also
  hides "Add Address" at 5.
- Deleted addresses are soft deleted (`is_removed = true` + `removed_at = now()`
  + `is_default = false`); never hard-deleted.
- Removed addresses must not appear in address listings and do not count toward
  the 5-address limit.

## Default Address

- Exactly one default (`is_default = true`) exists per user whenever they have
  ≥1 active address — an invariant enforced inside Serializable transactions.
- The first address a user adds (including the signup address) is automatically
  the default.
- Any active address can be made default via `PATCH /address/:addressId/default`;
  setting a new default unsets the previous one in the same transaction.
- Removing the current default auto-promotes the most-recently-created remaining
  active address to default (same transaction).
- `is_default` is never accepted from a create/update DTO — it changes only via
  the dedicated set-default endpoint or the auto-default/auto-promote rules.

## Address Types

Supported values:

- HOME
- WORK
- OTHER

---

# Product Rules

## Product Visibility

Only active products should be visible.

## Product Variants

A product can have multiple variants.

Examples:

T-Shirt

- Red / Small
- Red / Medium
- Blue / Medium

Each variant has:

- Independent stock
- Independent SKU
- Independent pricing

## Stock Rules

Stock can never be negative.

Out-of-stock variants:

- Cannot be added to cart.
- At checkout, an out-of-stock item is excluded from the final order summary
  (its subtotal is not counted toward the total), and the item is shown with an
  "Out of Stock" overlay on the checkout page.
- Cannot be purchased.

---

# Cart Rules

## Cart Ownership

Each user owns exactly one cart.

## Quantity Rules

Minimum quantity per line: 1.

Maximum quantity per line: `min(MAX_CART_ITEM_QUANTITY, current available stock)`,
where `MAX_CART_ITEM_QUANTITY = 20` is a fixed per-line cap and current stock is
the real ceiling. Enforced server-side on both `PATCH` (update) and the
`POST` add/increment path (so the cap can't be exceeded by repeated adds).

## Cart Size Limit

A cart holds at most **25 distinct line items** (`MAX_CART_ITEMS`). Adding a
**new** variant to a full cart is rejected (`cartFull` — "checkout or remove an
item"); increasing the quantity of an item already in the cart is unaffected by
this cap. The cart is returned whole (no pagination) — the cap bounds its size.

## Add / Stock Behavior

Out-of-stock (`stock === 0`) or inactive products cannot be added (400). The
frontend leaves the product-detail "Add to Cart" / "Buy" buttons **clickable**
(not disabled by stock) and surfaces any rejection — out of stock, cart full,
over stock — as a toast.

## Coupon Rules

Only one coupon can be applied at a time, and **at checkout, not in the cart** —
the cart summary never includes a coupon discount.

Applying a new coupon automatically replaces the previous coupon.

---

# Coupon Rules

Coupons must satisfy:

- Active
- Not expired
- Usage limit not exceeded
- Order minimum requirement met

Supported coupon types:

- Percentage Discount
- Fixed Amount Discount

---

# Checkout Rules

Checkout validation must verify:

- User exists
- Address exists
- Address belongs to user
- Products exist
- Products are active
- Stock is available

Failure of any validation blocks checkout.

---

# Order Rules

## Order Creation

Order items must store snapshot data:

- Product Name
- Variant Attributes
- Purchase Price
- Quantity

Order history must remain unchanged even if product data changes later.

## Inventory Deduction

Inventory must be reduced only after successful order placement.

## Cancellation Rules

Orders can only be cancelled before:

SHIPPED

Statuses eligible for cancellation:

- PENDING
- CONFIRMED
- PACKED

Statuses not eligible:

- SHIPPED
- DELIVERED
- CANCELLED

---

# Payment Rules

## Cash On Delivery

Order created immediately.

Payment Status:

PENDING

## Stripe

Order creation occurs only after successful payment confirmation.

Payment Status:

PAID

Failed payments must not create orders.

---

# Email Rules

Successful order placement triggers:

- Invoice generation
- PDF generation
- Email delivery

Email failures must not rollback orders.

---

# Soft Delete Rules

Soft Deletes Only:

- User
- Address

Physical delete is prohibited for production data.

---

## JWT Session Active Re-check [user-module, product-module, cart-module, address-module]

A valid JWT can outlive a logout or soft-delete. UserService, ProductService, CartService, and AddressService re-check is_active via AuthService.isUserActive() (the shared `assertActiveUser(userId)` precheck) before executing any business logic. UserService, CartService, and AddressService throw UnauthorizedException (401) on an inactive session; ProductService throws ForbiddenException (403). The difference is intentional: 401 = "not authenticated", 403 = "authenticated but session no longer permitted to browse".

---

## Email Conflict Surfaced as Field Error [user-module]

When PATCH /user triggers a Prisma P2002 unique-constraint violation on the email column, UserService wraps it as a BadRequestException with body shape { errors: { email: "..." } } — identical to the global validation-pipe envelope — so the frontend renders it under the email form field. P2002 on any other unique field (e.g. user_name) is re-thrown unchanged.

---

## Frontend E2E Requires Live Backend [testing]

Playwright e2e specs run against a real backend, not mocks. Execution order is fixed: run `npx vitest run` (component + slice tests) first, then start the backend with `npm run start:dev --prefix ../backend &` and block on `npx wait-on http://localhost:3000` before running `npx playwright test`. Kill the backend server after Playwright completes. Fix every failure before finishing.
