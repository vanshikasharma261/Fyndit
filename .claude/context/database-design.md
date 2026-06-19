# Fyndit Database Design

# Database

PostgreSQL

ORM:

Prisma 7

---

# Core Entities

1. User
2. Address
3. Category
4. CategoryAttribute
5. Product
6. ProductVariant
7. ProductImage
8. Cart
9. CartItem
10. Coupon
11. CouponUsage
12. Order
13. OrderItem
14. Payment

---

# Relationships

User
├── Addresses
├── Orders
├── Cart
└── CouponUsage

Address
└── Orders

Category
├── Child Categories
├── Parent Category
├── Products
└── Attributes

Product
└── Product Variants

Product Variant
├── Images
├── Cart Items
└── Order Items

Cart
└── Cart Items

Order
├── Order Items
└── Payment

Coupon
└── Coupon Usage

Payment
└── Order

---

# Product Structure

Category
└── Product
└── ProductVariant
└── ProductImage

Example:

Electronics
└── iPhone 16
├── 128GB Black
├── 256GB Black
└── 512GB Blue

Each variant stores:

- SKU
- Price
- Discount
- Stock
- Attributes

---

# Order Structure

Order
├── Order Items
├── Address Snapshot
├── Payment
└── User

Order Item stores:

- Product Name Snapshot
- Variant Snapshot
- Purchase Price
- Quantity

This prevents future product changes affecting order history.

---

# Indexing Strategy

Indexes Required:

User

- email

Category

- slug

Product

- slug
- product_name

ProductVariant

- sku
- product_id

Order

- user_id
- status
- created_at

Coupon

- code

Cart

- user_id

Address

- user_id (single index — currently defined)
- [user_id, is_removed] (composite — deferred; recommended if the active-scope
  `{ user_id, is_removed: false }` listing/count query becomes hot under the
  Serializable add/set-default/remove transactions)

---

# Money Handling

Never use Float.

Use:

Decimal(10,2)

for:

- Product Prices
- Discounts
- Coupon Values
- Order Totals
- Payment Amounts
