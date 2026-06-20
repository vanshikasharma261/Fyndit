# Fyndit Development Rules

# General Rules

- Use TypeScript Strict Mode.
- Never use any.
- Prefer interfaces for contracts.
- Follow NestJS dependency injection patterns.
- Keep code modular and feature based.

---

# Folder Structure Rules

Every module should contain:

dto/
types/
controller/
service/
module/

Optional:

guards/
decorators/
helpers/

---

# Controller Rules

Controllers should:

- Receive requests
- Validate DTOs
- Call services
- Return responses

Controllers must not contain business logic.

---

# Service Rules

Services should contain:

- Business logic
- Authorization checks
- Validation checks
- Database interactions

---

# DTO Rules

All request bodies must use DTOs.

Validation required using:

- class-validator
- class-transformer

No raw request body access.

---

# Authentication Rules

Protected routes must use:

@UseGuards(JwtAuthGuard)

Authenticated user should come from:

@CurrentUser()

custom decorator.

Avoid directly accessing req.user throughout codebase.

---

# Prisma Rules

Use Prisma 7.

Never instantiate PrismaClient manually.

Only use:

PrismaService

Transactions required for:

- Place Order
- Inventory Deduction
- Payment Confirmation
- Order Cancellation
- Refund Processing
- Add to cart (Serializable) — guards the 25-line / per-line quantity caps
- Add address (Serializable) — guards the 5-active-address limit + first-is-default
- Set default address (Serializable) — unset others then set target (exactly one default)
- Remove address (Serializable) — soft-delete then auto-promote a replacement default

Always use:

select

Avoid:

include: true

---

# Query Rules

Pagination required for:

- Products
- Orders

Use:

take
skip
cursor

No full table scans.

The **cart is the exception**: it is returned whole (no pagination), bounded
instead by the 25 distinct-line cap (`MAX_CART_ITEMS`). The summary is computed
over all lines; the bounded size keeps the query cheap.

---

# Error Handling

Use NestJS exceptions:

- BadRequestException
- UnauthorizedException
- ForbiddenException
- NotFoundException
- ConflictException
- InternalServerErrorException

Never throw raw Error objects.

---

# Logging

Use custom Logger Middleware.

Log:

- Method
- Route
- Status Code
- Execution Time

Do not log passwords or tokens.

---

### Special Protection

- always check user status from is_active
- if user is active then only process futher business logic
- make a uitlity inside authService for this

# Frontend Rules

Use:

- React 19
- Redux Toolkit
- React Router
- CSS Modules

No inline styling.

No direct API calls inside components.

Use Async Thunks only.

Not every page needs a slice/service. A purely presentational page (e.g. the
Home page) may hold its content in a local typed constant and render it
directly — no Redux/service when there is no server state. Import bundled static
assets via Vite (`import banner from "../../assets/x.png"`).

---

# Redux Rules

Each feature should contain:

feature/
├── slice.ts
├── service.ts
├── types.ts

API logic belongs inside service.ts.

---

# Styling Rules

Use CSS Variables.

Never hardcode colors repeatedly.

Use design tokens from theme.css.

---

# Security Rules

Passwords:

bcrypt

JWT Secret:

Environment Variable

Never commit:

.env

Never expose:

- Stripe Secret Key
- SMTP Password
- JWT Secret

---

## E2E Test Setup Pattern [user-module, product-module, auth-module]

E2E specs in test/ must not import ConfigModule or the real AppModule. Instead: provide ConfigService directly via { provide: ConfigService, useValue: mockConfigService }, register JwtModule.register({ secret: TEST_SECRET }) with a fixed test secret, and mock PrismaService with jest.fn() stubs. The test/jest-e2e.json must override ts-jest tsconfig to module: CommonJS, moduleResolution: node, resolvePackageJsonExports: false so ESM .js extension imports in generated Prisma code resolve correctly. A test/tsconfig.json that extends the root tsconfig and adds types: ["jest", "node"] is required to eliminate IDE false-positive errors on describe/jest/beforeAll globals.

---

## Cart Write Patterns [cart-module]

- **Add to cart** is an atomic `upsert` on the `CartItem` compound unique key `@@unique([cart_id, product_variant_id])` (Prisma generated key `cart_id_product_variant_id`): create at quantity 1, otherwise `{ quantity: { increment: 1 } }`. The read → count/stock check → upsert runs inside `prisma.$transaction(cb, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })` so concurrent adds cannot breach the 25-line cap (`MAX_CART_ITEMS`) or the per-line quantity ceiling (`MAX_CART_ITEM_QUANTITY`).
- **Update / remove** scope the write by `cart_id` as well as `cart_item_id` using `updateMany` / `deleteMany`, and treat a `count === 0` result as a 404. This is both the ownership check (a user can only touch their own line) and a guard against a Prisma `P2025` (record-not-found) surfacing as a 500 when a line is removed mid-request.
- Identity is always `@CurrentUser().id`; no cart or cart-item id is ever trusted from the body/params to establish ownership. Every cart op runs the `assertActiveUser` precheck (401) before any DB access.

---

## Address Write Patterns [address-module]

- **Ownership-scoped writes** mirror the cart module: update / set-default / remove use `updateMany` scoped by `{ address_id, user_id, is_removed: false }` and treat `count === 0` as a 404 — both the ownership check and a guard against a Prisma `P2025` surfacing as a 500. Identity is always `@CurrentUser().id`; `:addressId` never establishes ownership on its own. `:addressId` is validated with `ParseUUIDPipe`.
- **Active-scope helper:** every read/write filters on `{ user_id, is_removed: false }` (an `activeScope(userId)` helper). Removed rows are invisible everywhere and excluded from counts.
- **The "exactly one default" invariant** is held inside Serializable `$transaction`s: add (count-check + create + first-is-default), set-default (unset all active defaults → set target), remove (soft-delete → promote the most-recently-created remaining active address when the removed row was the default). When a transactional method returns the refreshed list, it builds that list on the `tx` client inside the same transaction.
- **Response select excludes ownership/internal columns.** Define a single `select` constant (e.g. `ADDRESS_SELECT`) listing only contract columns; never select `user_id`, `is_removed`, `removed_at`, or internal timestamps, so they cannot leak even after a refactor. `is_default` is set only by the service (auto-default / auto-promote / set-default), never from a create/update DTO.

---

## Checkout / Order / Payment Module Graph [checkout-module, order-module, payment-module]

Acyclic by design: **`payment` (leaf) → `checkout` → `order`**.

- **`payment`** exports `StripeService` only — the sole `stripe` SDK wrapper
  (createPaymentIntent / refundPaymentIntent / constructWebhookEvent). Depends on
  `ConfigService` alone (Stripe keys via `getOrThrow`), so it stays a leaf.
- **`checkout`** imports `payment`; provides `CheckoutService` + `CouponService`
  and **exports both**. `CheckoutService.buildOrderContext(client, userId)` is the
  single **authoritative** money/stock/coupon breakdown — computed inside the
  placement transaction so the checkout display and the placed order can never
  diverge. Money is serialized as `"0.00"` strings (`Prisma.Decimal.toFixed(2)`).
- **`order`** imports `payment` + `checkout`; hosts the authenticated `/order`
  controller **and** the unauthenticated `/payment/webhook` controller (the
  webhook drives placement/cancellation). `OrderItem` snapshots `product_name` +
  `purchase_price` (= `max(0, price − variant.discount)`); brand/image/attributes
  are read live from the variant.

## Stripe Webhook Rules [order-module, payment-module]

- `main.ts` creates the app with `NestFactory.create(..., { rawBody: true })` so
  the webhook can verify the Stripe signature against the **raw** body
  (`req.rawBody`). The webhook controller is **unauthenticated** — it is gated by
  the signature, not the JWT.
- Verify with `StripeService.constructWebhookEvent(rawBody, signature)`, which
  throws a `BadRequestException` (400, never 500) on a bad/missing signature.
  Always respond `200 { received: true }` for handled and unknown event types.
- Handle `payment_intent.succeeded` (→ place order from metadata) and
  `charge.refunded` (→ finalize refund/cancel). Both handlers must be
  **idempotent** (guard on an existing `stripe_payment_id` / an already-`CANCELLED`
  order).
- **Validate metadata** (`user_id`, `address_id`) with `isUUID` before any DB
  use, even though it is signed by Stripe.
- The placement `catch` must **refund only on `BadRequestException`** (genuinely
  unfulfillable order); re-throw everything else (duplicate-key `P2002`,
  serialization `P2034`, transient errors) so Stripe retries instead of refunding
  a successfully-placed order.
- Numeric tunables live in `values.constant.ts`: `SHIPPING_FEE`,
  `FREE_SHIPPING_THRESHOLD`, `ORDER_PAGE_SIZE`, `STRIPE_CURRENCY`,
  `PAISE_PER_RUPEE`.
