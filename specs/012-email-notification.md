# Spec 012 — Email Notification on Order Placement

## Goal

Send a professional transactional email with a PDF invoice attachment to the
user's registered email address whenever a new order is successfully placed
(both Cash-on-Delivery and Stripe card flows).

## Scope

Backend-only. No UI changes. Design phase skipped.

---

## Backend Plan

### New module: `MailModule` (`backend/src/mail/`)

```
backend/src/mail/
├── mail.module.ts
├── mail.service.ts
└── templates/
    ├── order-confirmation.hbs   # HTML email body
    └── invoice.hbs              # HTML rendered to PDF by Puppeteer
```

### Invoice storage

Generated PDFs are written to `backend/assets/invoices/` as
`invoice_{orderId}.pdf`. The directory is created at startup if missing.
PDFs are kept permanently (audit / re-send use).

### Libraries

| Package | Purpose |
|---|---|
| `nodemailer` | SMTP transport — credentials already in `.env` |
| `puppeteer` | Headless Chromium → renders invoice HTML → PDF |
| `hbs` | Handlebars — compiles both templates |
| `@types/nodemailer` | TypeScript types |

### `MailService` API

```ts
sendOrderConfirmation(order: OrderDetail, user: { name: string; email: string }): Promise<void>
```

Internally:
1. Compile `invoice.hbs` with order data → HTML string
2. Launch Puppeteer → `page.setContent(html)` → `page.pdf()` → write to
   `backend/assets/invoices/invoice_{orderId}.pdf`
3. Compile `order-confirmation.hbs` → HTML email body
4. Send via nodemailer with the PDF as an attachment
   (`filename: invoice_{orderId}.pdf`)

### Email spec

| Field | Value |
|---|---|
| From | `MAIL_FROM` env var |
| Subject | `Your order #${orderId} has been placed — Fyndit` |
| Content-Type | `text/html` |
| Attachment | `invoice_{orderId}.pdf` |

**Email body sections:**
- Fyndit branded header (dark navy `#1a2744`, accent `#ff5c35`)
- Order summary: order ID, placement date, payment method
- Status badge: "Pending — will be confirmed shortly"
- Items table: product name, qty, unit price, line total
- Totals: subtotal, coupon discount, shipping fee, grand total
- Delivery address
- Professional footer with support note

### Invoice PDF spec (Amazon / Flipkart style)

| Section | Content |
|---|---|
| Header | "FYNDIT" brand name + "TAX INVOICE" label |
| Invoice meta | Invoice No: `INV-{orderId}`, Date: placement date |
| Bill-to | User's full name + email |
| Ship-to | Full delivery address (line1, line2, city, state, zip, country) |
| Line items | S.No · Product Name · Qty · Unit Price · Line Total |
| Totals block | Subtotal, Coupon Discount (if any), Shipping Fee, **Grand Total** |
| Footer | "Thank you for shopping with Fyndit" |

### Integration points

`MailService.sendOrderConfirmation()` is called after successful order
placement in two places inside `OrderService`:

1. **COD** — end of `placeCodOrder()`, after `buildOrderDetail` returns
2. **Stripe** — end of `placeStripeOrder()`, after the transaction commits

**Failure handling:** fire-and-forget. Email / PDF errors are caught, logged
via `Logger`, and never propagated. Order placement always succeeds regardless
of email outcome.

### `MailModule` wiring

- `OrderModule` imports `MailModule` directly.
- `OrderService` receives `MailService` via constructor injection.

### `.env` keys (all already present — no new keys)

```
MAIL_FROM=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

## Definition of Done

- [ ] `MailModule` created with `mail.service.ts` and both HBS templates
- [ ] `invoice.hbs` renders a professional PDF (brand header, items table,
      totals block, ship-to / bill-to)
- [ ] `order-confirmation.hbs` renders a professional HTML email body
- [ ] PDF written to `backend/assets/invoices/invoice_{orderId}.pdf`
- [ ] Email sent with PDF attachment via nodemailer after COD order placement
- [ ] Email sent with PDF attachment via nodemailer after Stripe order placement
- [ ] Email / PDF failure is caught, logged, and never throws back to the caller
- [ ] `OrderModule` imports `MailModule`; `OrderService` injects `MailService`
- [ ] `puppeteer`, `nodemailer`, `hbs` installed in backend
- [ ] TypeScript strict — no `any`
