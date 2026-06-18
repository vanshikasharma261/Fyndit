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

- Maximum 5 active addresses per user.
- Deleted addresses are soft deleted.
- Removed addresses must not appear in address listings.

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

Minimum Quantity:

1

Maximum Quantity:

Current Available Stock

## Coupon Rules

Only one coupon can be applied at a time.

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

## JWT Session Active Re-check [user-module, product-module]

A valid JWT can outlive a logout or soft-delete. Both UserService and ProductService re-check is_active via AuthService.isUserActive() before executing any business logic. UserService throws UnauthorizedException (401) on an inactive session; ProductService throws ForbiddenException (403). The difference is intentional: 401 = "not authenticated", 403 = "authenticated but session no longer permitted to browse".

---

## Email Conflict Surfaced as Field Error [user-module]

When PATCH /user triggers a Prisma P2002 unique-constraint violation on the email column, UserService wraps it as a BadRequestException with body shape { errors: { email: "..." } } — identical to the global validation-pipe envelope — so the frontend renders it under the email form field. P2002 on any other unique field (e.g. user_name) is re-thrown unchanged.

---

## Frontend E2E Requires Live Backend [testing]

Playwright e2e specs run against a real backend, not mocks. Execution order is fixed: run `npx vitest run` (component + slice tests) first, then start the backend with `npm run start:dev --prefix ../backend &` and block on `npx wait-on http://localhost:3000` before running `npx playwright test`. Kill the backend server after Playwright completes. Fix every failure before finishing.
