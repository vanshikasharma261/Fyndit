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
