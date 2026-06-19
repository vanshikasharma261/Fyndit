# 009 — Checkout, Orders & Payments (COD + Stripe)

> Structured spec (Phase 1). Raw definition restructured per
> `.claude/context/workflow.md`. **No implementation begins until this spec is
> approved.** Decisions captured below were confirmed with the user; defaults are
> flagged as **[default — confirm]** where the raw definition was silent.

---

## 1. Goal & Scope

Deliver the end-to-end purchase flow that begins when the user clicks **CHECKOUT**
on the cart page and ends with a placed order the user can review and cancel:

- A **checkout page** that builds an authoritative order summary from the user's
  cart, surfaces out-of-stock lines (overlay, excluded from totals), adds a
  shipping fee, supports applying/removing a coupon, lets the user pick a
  shipping address, fills billing details from the profile, and offers two
  payment methods.
- **Cash on Delivery** — places the order immediately (payment `PENDING`).
- **Stripe card payment** — creates a PaymentIntent, the user pays via Stripe
  Elements, and the order is placed by the **webhook** on payment success
  (payment `PAID`).
- **Order management** — order history (paginated), order detail, and order
  cancellation (with a real, webhook-driven Stripe refund for paid orders).

### In scope

Backend `checkout`, `payment`, and `order` modules; Stripe integration
(PaymentIntent + webhook + refund); full coupon validation incl. per-user usage;
frontend Checkout page, Orders history page, Order detail page, Stripe Elements;
wiring the cart CHECKOUT button and the navbar Orders link.

### Out of scope (deferred)

- **Invoice email + PDF generation** (no `mail` module this feature) — *user
  decision: defer to a later feature*. The project context mentions it; it is
  **not** built here.
- Admin order-status transitions (CONFIRMED→PACKED→SHIPPED→DELIVERED) — orders
  are created `PENDING`; advancing status is an admin concern not in this build.
- Saved cards / Stripe Link account creation (Stripe Elements may render Link UI;
  we do not persist anything).

### Confirmed decisions (from Phase-1 Q&A)

1. **Invoice email/PDF:** deferred (not in this feature).
2. **Cancel of a paid order:** **real Stripe refund, webhook-driven** — cancel
   requests `stripe.refunds.create`; the order flips to `CANCELLED` + payment
   `REFUNDED` + stock restored **when the `charge.refunded` webhook arrives**
   (idempotent). COD/unpaid eligible orders cancel **synchronously** (CANCELLED +
   restock in one transaction).
3. **Coupon enforcement:** **full** — validate active / not-expired / min-order /
   `usage_limit`, **and** enforce one-use-per-user via `CouponUsage`, incrementing
   `used_count` atomically on order placement. Cancellation releases the usage
   (delete `CouponUsage` + decrement `used_count`) **[default — confirm]**.
4. **Stripe checkout context:** carried in **PaymentIntent metadata**
   (`user_id`, `address_id`, `coupon_code`); the webhook re-reads the cart,
   re-validates stock + coupon, and **creates the order only on success**.
   Idempotency guarded by `Payment.stripe_payment_id` (unique per order). **No DB
   migration.**
5. **Shipping fee:** ₹100 when the **pre-coupon subtotal < ₹500**, else ₹0 (free).
   Threshold compares against `sub_total` (Σ final unit price × qty, before
   coupon). Matches the existing announcement bar ("Free Standard Shipping on
   orders above ₹500.00").

### Default decisions (silent in raw def — confirm at approval)

- **D1. Minimal schema migration.** *(Originally planned as "no migration"; one
  migration was added during Phase-5 review — see below.)* Every model needed
  (`Order`, `OrderItem`, `Payment`, `Coupon`, `CouponUsage`, `Cart.applied_coupon`)
  already existed. Migration **`order_coupon_ref`** adds a nullable
  `Order.coupon_id` FK (+ `Coupon.orders` back-relation) so cancellation can
  **release** the per-user `CouponUsage` + decrement `used_count` (the user chose
  coupon-release-on-cancel over the no-migration alternative). The display
  "Order ID" (e.g. `#A2224894`) is still **derived from `order_id`** (first 8 hex
  chars, upper-cased, `#`-prefixed) — not a column.
- **D2. Money serialized as `"0.00"` strings** end-to-end (same as cart), via
  `Prisma.Decimal.toFixed(2)`. Frontend renders checkout/order amounts with **2
  decimals** + Indian grouping (`formatMoney`), distinct from the rounded
  `formatPrice` used on product listings (the checkout/order screenshots show
  decimals, e.g. `₹1,178.56`).
- **D3. `purchase_price` (OrderItem) = final unit price** = `max(0, price −
  variant.discount)`. The variant's own discount is baked into the unit price;
  the checkout "Discount" line is the **coupon** discount only (matches the
  screenshots — no separate variant-discount line on checkout).
- **D4. Out-of-stock = `stock === 0`.** Such lines stay listed with an "Out of
  Stock" overlay and are **excluded** from totals and from the placed order. A
  line with `0 < stock < quantity` is included, but **placement re-validates
  `stock >= quantity` in a Serializable transaction and rejects** (`400`) if
  insufficient (per "Checkout Rules → Stock is available").
- **D5. Order item brand / image / attributes are read live** from the variant
  via `product_variant_id` for display; only **name + price are snapshotted**
  (the schema snapshots `product_name` + `purchase_price`, per Order Rules). No
  attribute/brand/image snapshot columns are added.
- **D6. "Add Address" on checkout** toggles an **inline `AddressForm`** (reusing
  `components/Addresses/AddressForm` + the `addAddress` thunk) inside the shipping
  card; on success the new address is selected. No navigation away from checkout.
- **D7. Webhook stock-validation failure** (stock vanished between intent and
  webhook): the webhook **auto-refunds** the captured PaymentIntent and does
  **not** create an order (prevents charging without fulfilment).

---

## 2. Backend Plan

### 2.1 New modules & dependency graph

```
payment   (leaf)  ──exports StripeService
   ▲   ▲
   │   └──────────────── checkout ──exports CheckoutService, CouponService
   │                        ▲
   └──────────── order ─────┘     (order imports payment + checkout)
```

- **`payment` module** — `StripeService` only (thin Stripe SDK wrapper). Depends
  on `ConfigService` alone (leaf, no app deps → no circular imports). Exported.
- **`checkout` module** — `CheckoutService` + `CouponService` + `CheckoutController`.
  Imports `AuthModule`, `PaymentModule`. Exports `CheckoutService` + `CouponService`
  (so `order` reuses the authoritative summary + coupon logic — no duplication).
- **`order` module** — `OrderService` + `OrderController` (`/order` routes) +
  `OrderWebhookController` (`POST /payment/webhook`, hosted here because it drives
  order placement/cancellation). Imports `AuthModule`, `PaymentModule`,
  `CheckoutModule`.

All three registered in `AppModule`. Every authenticated op runs the shared
`assertActiveUser(userId)` precheck (401) before any DB access; identity always
from `@CurrentUser().id`; `:orderId` via `ParseUUIDPipe`. `PrismaService` only,
no `any`, response contracts in each module's `types/`, copy in new
`CheckoutMessages` / `OrderMessages` / `CouponMessages` groups in
`messages.constant.ts`; numeric constants (`SHIPPING_FEE = 100`,
`FREE_SHIPPING_THRESHOLD = 500`) in `values.constant.ts`.

### 2.2 New dependency & config

- Backend dep: **`stripe`** (npm). `main.ts` → `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })` so the webhook can verify the Stripe signature against the **raw** body (`req.rawBody`).
- `backend/.env` (gitignored — **never committed**): add
  `STRIPE_SECRET_KEY=…`, `STRIPE_WEBHOOK_SECRET=…` (values supplied in the raw
  spec). Read via `ConfigService.getOrThrow`.
- Stripe amount = `Math.round(total × 100)` paise, currency `inr`.

### 2.3 Endpoints & contracts

All money fields are `"0.00"` strings.

#### Checkout (`CheckoutController`)

| Method | Route | Body | Returns |
|---|---|---|---|
| `GET` | `/checkout` | — | `CheckoutSummary` |
| `POST` | `/checkout/coupon` | `{ code }` (`ApplyCouponDto`) | `CheckoutSummary` (200) |
| `DELETE` | `/checkout/coupon` | — | `CheckoutSummary` |
| `POST` | `/checkout/payment-intent` | `{ address_id }` (`CreatePaymentIntentDto`) | `{ client_secret, total }` |

- **`GET /checkout`** — load cart (+variant price/discount/stock/name/brand/image/
  attributes). For each line set `out_of_stock = stock === 0`. **Re-verify
  `cart.applied_coupon`** (active/expiry/usage/min-order/per-user); if invalid,
  clear `applied_coupon` and return summary without it (implements "every checkout
  re-verifies the cart coupon and removes it if wrong"). Compute:
  - `sub_total` = Σ over in-stock lines `max(0, price − discount) × qty`
  - `coupon_discount` = coupon applied to `sub_total` (PERCENTAGE: `sub_total ×
    value/100`; FIXED: `min(value, sub_total)`), clamped to `sub_total`, 2dp
  - `shipping_fee` = `sub_total < 500 ? 100 : 0`
  - `total` = `sub_total − coupon_discount + shipping_fee`
- **`POST /checkout/coupon`** — validate `code`; on success set
  `cart.applied_coupon = code` and return the recomputed summary; on failure
  `400` with a `CouponMessages` reason (`couponInvalid` / `couponExpired` /
  `couponUsed` / `couponMinOrder` / `couponUsageLimit`). `@HttpCode(200)`.
- **`POST /checkout/payment-intent`** — validate active user + owned address +
  non-empty purchasable cart + re-verify coupon + compute `total`; create a
  Stripe PaymentIntent (`amount`, `currency: 'inr'`, `metadata: { user_id,
  address_id, coupon_code }`, `automatic_payment_methods`). **No order is
  created.** Returns `client_secret`.

```ts
interface CheckoutItem {
  cart_item_id: string; product_variant_id: string;
  product_name: string; brand: string; image_url: string | null;
  attributes: Record<string, string>;
  price: string; discount: string; final_price: string; // unit, 2dp strings
  quantity: number; stock: number; out_of_stock: boolean;
}
interface AppliedCoupon {
  code: string; discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: string; discount_amount: string;
}
interface CheckoutSummary {
  items: CheckoutItem[];
  total_items: number;            // Σ qty of in-stock lines
  sub_total: string; coupon_discount: string;
  shipping_fee: string; total: string;
  applied_coupon: AppliedCoupon | null;
  personal: { first_name: string; last_name: string; phone: string | null; email: string };
}
```

#### Order (`OrderController`)

| Method | Route | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/order` | `{ address_id }` (`PlaceOrderDto`) — **COD only** | `OrderDetail` (201) |
| `GET` | `/order` | `?page` | `{ orders: OrderListItem[], meta }` |
| `GET` | `/order/:orderId` | — | `OrderDetail` |
| `PATCH` | `/order/:orderId/cancel` | — | `{ message }` (+ `OrderDetail` for COD path) |

- **`POST /order`** (COD) — Serializable `$transaction`: re-validate active user +
  owned address + purchasable cart + per-line `stock >= qty`; re-verify coupon;
  create `Order` (status `PENDING`) + `OrderItem[]` (snapshot name + final unit
  `purchase_price`) + `Payment` (`COD`, `PENDING`, `amount = total`); **decrement
  stock**; **record coupon usage** (`CouponUsage` create + `used_count` increment,
  if coupon); **clear cart** (delete `CartItem`s + null `applied_coupon`). Returns
  the new order.
- **`GET /order`** — paginated (`take`/`skip`, page size **10**, `created_at`
  desc). Each `OrderListItem` carries a **representative** (first) item + a
  `item_count`, the total, status, date, and `can_cancel`.
- **`GET /order/:orderId`** — ownership-scoped (foreign id → 404). Full detail.
- **`PATCH /order/:orderId/cancel`** — eligibility = status ∈ {`PENDING`,
  `CONFIRMED`, `PACKED`} (else `400 orderNotCancellable`). **COD/unpaid:**
  Serializable txn → status `CANCELLED` + restock + release coupon usage + payment
  `PENDING→`(left as-is / `FAILED`? → leave `PENDING`, order `CANCELLED`).
  **Stripe-paid:** call `stripe.refunds.create({ payment_intent })`; respond
  "refund initiated"; the **`charge.refunded` webhook** performs the
  CANCELLED + REFUNDED + restock + coupon-release transaction (idempotent).

```ts
interface OrderListItem {
  order_id: string; order_number: string;       // "#A2224894" derived
  product_name: string; brand: string; image_url: string | null;
  attributes: Record<string, string>;           // representative item
  item_count: number; total_amount: string;
  status: OrderStatus; created_at: string; can_cancel: boolean;
}
interface OrderItemView {
  product_name: string; brand: string; image_url: string | null;
  attributes: Record<string, string>;
  purchase_price: string; quantity: number; line_total: string;
}
interface OrderDetail {
  order_id: string; order_number: string; created_at: string;
  status: OrderStatus; payment_method: 'COD' | 'STRIPE';
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  sub_total: string; coupon_discount: string; shipping_fee: string; total_amount: string;
  shipping_address: AddressResponse; items: OrderItemView[]; can_cancel: boolean;
}
```

#### Webhook (`OrderWebhookController`)

- **`POST /payment/webhook`** — raw body + `stripe-signature` header verified via
  `StripeService.constructWebhookEvent`. Handlers:
  - **`payment_intent.succeeded`** → place order from metadata (re-validate user/
    cart/stock/coupon; same placement transaction as COD but payment `STRIPE` /
    `PAID` / `stripe_payment_id = pi.id`). **Idempotent:** skip if a `Payment`
    with this `stripe_payment_id` exists. On stock-validation failure → **refund**
    the PaymentIntent and create no order (D7).
  - **`charge.refunded`** → finalize cancellation for the order whose payment has
    that `stripe_payment_id`: status `CANCELLED`, payment `REFUNDED`, restock,
    release coupon usage. Idempotent (skip if already `REFUNDED`).
  - Unknown event types → `200` ack (no-op).

### 2.4 Transactions (Serializable, per development-rules)

COD placement, Stripe placement (webhook), COD cancellation, refund finalization
(webhook) — each is a single Serializable `$transaction` covering totals,
order/items/payment writes, stock change, coupon usage, and cart clearing, so
concurrent stock/coupon races cannot corrupt inventory or the one-use-per-user
invariant.

---

## 3. Frontend Plan

### 3.1 New dependency & env

- Deps: **`@stripe/stripe-js`**, **`@stripe/react-stripe-js`**.
- `frontend/.env`: `VITE_STRIPE_PUBLISHABLE_KEY=…` (supplied). Typed in
  `vite-env.d.ts`; `loadStripe` memoised in a `services/stripe.ts` (or
  `features/checkout`) module.

### 3.2 Features (slice / service / types — `ApiResult<T>` + `NETWORK_ERROR` pattern)

- **`features/checkout/`** — `checkoutService` (`getSummary`, `applyCoupon`,
  `removeCoupon`, `createPaymentIntent`), `checkoutSlice`
  (`fetchCheckoutSummary`, `applyCoupon`, `removeCoupon`, `createPaymentIntent`;
  state `{ summary, loading, applyingCoupon, removingCoupon, error }`). Resets on
  logout / sessionExpired / deleteUser.
- **`features/order/`** — `orderService` (`placeCod`, `list(page)`, `detail(id)`,
  `cancel(id)`), `orderSlice` (`placeCodOrder`, `fetchOrders`, `fetchOrderDetail`,
  `cancelOrder`; state `{ list, meta, detail, loading, placing, cancellingId,
  error }`). Resets on session teardown.
- `types/checkout.types.ts`, `types/order.types.ts` mirroring the backend
  contracts (reuse `AddressResponse`, `ErrorResponse`, `ValidationErrorResponse`).
- Register `checkout` + `order` reducers in `store/store.ts` (covered by the
  existing `authExpiryMiddleware` 401 handling).

### 3.3 Pages, routes, components

- **`pages/Checkout/CheckoutPage.tsx`** (route `/checkout`, inside `MainLayout`,
  behind `RequireAuth`) — source of truth `checkout_cod_ui.png` /
  `checkout_stripe_ui.png` / `stripe_payment_ui.png`:
  - **INFORMATION** column: `PERSONAL INFORMATION` (read-only first/last/phone/
    email from `summary.personal`); `SHIPPING INFORMATION` (selectable address
    cards from the `address` slice, default pre-selected, accent highlight on the
    chosen one, inline "Add Address" → `AddressForm`); `PAYMENT` (COD / Card
    radios).
  - **SHOPPING BAG** column: item rows (image, name, brand, attribute pills,
    price; "Out of Stock" overlay when `out_of_stock`), `Promo Code` + Apply
    (applied state shows the code chip + remove ✕; inline error under the field on
    invalid), `Shipping Fee`, `Discount` (green, coupon only, shown when > 0),
    `Total` (bold).
  - **COD:** button "Pay & Place Order" → `placeCodOrder({ address_id })` →
    on success `toast.success`, `dispatch(fetchCart())` (badge → 0), navigate to
    `/orders/:orderId`.
  - **Card:** button "Proceed to Payment" → `createPaymentIntent({ address_id })`
    → mount `<Elements options={{ clientSecret }}>` with `<PaymentElement/>` →
    "Confirm & Pay" → `stripe.confirmPayment({ elements, redirect: 'if_required'
    })`. On success → toast + `fetchCart()` + navigate to `/orders` (the order
    appears once the webhook lands; orders page does a short bounded re-poll if
    not yet present). On failure → red toast with Stripe's message.
  - Place buttons disabled while no purchasable item / no address selected / op
    in flight.
- **`pages/Orders/OrdersPage.tsx`** (route `/orders` — **replaces the
  Placeholder**) — `order_history_ui.png`: title "Order History", table (Product
  [img+name+brand], Order ID, Date, Total, Status pill, Attributes, Action
  [View → `/orders/:id`; Cancel → `cancelOrder`, shown only when `can_cancel`]),
  reusing the existing `Pagination` component.
- **`pages/Orders/OrderDetailPage.tsx`** (route `/orders/:orderId`) —
  `order_detail_ui.png`: title "Your Order Details", header card (Order Date /
  Order ID / Payment Method), item rows (img, name, brand, Qty pill, line total).
  **[default — confirm]** also render a status badge, the totals breakdown
  (subtotal / discount / shipping / total) and the shipping address below the
  items (no screenshot for these; styled with theme chrome).
- **Wiring:** `pages/Cart` CHECKOUT button → `navigate('/checkout')` (replaces the
  current no-op); the navbar **Orders** link already points to `/orders` (now a
  real page).
- **Utils:** add `formatMoney(value)` (₹ + 2dp + Indian grouping) and
  `formatOrderNumber(order_id)` to `utils/format.ts`. New copy in
  `constants/messages.constant.ts` (`CheckoutMessages`, `OrderMessages`).
- CSS Modules + theme tokens only; responsive (2-col → stacked on narrow). New
  tokens added to `theme.css` only if an existing one doesn't fit.

---

## 4. Screenshot references (source of truth)

- `checkout_cod_ui.png` — checkout layout, COD selected, "Pay & Place Order".
- `checkout_stripe_ui.png` — card selected, "Proceed to Payment".
- `stripe_payment_ui.png` — Stripe Payment Element inline + "Confirm & Pay".
- `order_history_ui.png` — order history table + pagination.
- `order_detail_ui.png` — order detail header + items.
- (`cart_ui.png` — for the CHECKOUT button origin.)

---

## 5. Definition of Done

**Backend**
- [ ] `stripe` installed; `main.ts` `rawBody: true`; Stripe env keys read via
      `getOrThrow`; `.env` not committed.
- [ ] `payment` (StripeService), `checkout` (CheckoutService + CouponService +
      controller), `order` (service + controller + webhook controller) created,
      registered, no circular imports.
- [ ] `GET /checkout`, `POST`/`DELETE /checkout/coupon`,
      `POST /checkout/payment-intent` working; coupon re-verified every checkout
      and cleared from cart when invalid.
- [ ] `POST /order` (COD), `GET /order` (paginated), `GET /order/:id`,
      `PATCH /order/:id/cancel` working; ownership-scoped (foreign id → 404).
- [ ] `POST /payment/webhook` verifies signature, places order on
      `payment_intent.succeeded`, finalizes refund on `charge.refunded`, both
      idempotent; stock-fail path refunds (D7).
- [ ] All placement/cancel/refund paths in Serializable `$transaction`s; stock
      decremented on placement, restored on cancel/refund; coupon `used_count` +
      `CouponUsage` recorded on placement, released on cancel.
- [ ] Money as `"0.00"` strings; no `any`; one migration (`order_coupon_ref`,
      adds nullable `Order.coupon_id` for coupon release on cancel); DTO
      validation; `assertActiveUser` on every authenticated op.
- [ ] `npm run lint` + `npm run build` clean.

**Frontend**
- [ ] `@stripe/*` installed; `VITE_STRIPE_PUBLISHABLE_KEY` typed + memoised
      `loadStripe`.
- [ ] `checkout` + `order` features (slice/service/types), reducers registered,
      reset on session teardown.
- [ ] Checkout page matches the three checkout screenshots (personal info,
      address picker + inline add, payment radios, shopping bag, coupon
      apply/remove, out-of-stock overlay) for both COD and card flows.
- [ ] Orders history page (replaces placeholder) + Order detail page match their
      screenshots; cart CHECKOUT navigates to `/checkout`; Orders link live.
- [ ] COD places + redirects; Stripe pays via Payment Element, order appears
      after webhook; cancel works (incl. refund initiation); cart badge resets on
      placement.
- [ ] CSS Modules + theme tokens only; responsive; `npm run lint` +
      `npm run build` clean.

**Testing (Phase 4) & Review (Phase 5)** per `workflow.md` — backend Jest unit +
Supertest e2e (incl. webhook + coupon + cancel/refund), frontend Vitest/RTL +
Playwright; then the four reviewers in parallel (security review of payment/
webhook/ownership/refund is critical).

---

## 6. Open confirmations before implementation

1. The **default decisions D1–D7** above (esp. *no schema migration*, *order
   number derived from uuid*, *coupon usage released on cancel*, *order-detail
   extra sections beyond the screenshot*).
2. Branch name **`feature/checkout-order`** (cut from `main`).
3. Anything to add/trim from scope before I update `current-feature.md` and begin
   Phase 3.
