# Prisma 7 Standards

# Prisma Version

Use Prisma ORM Version 7.

Migration strategy:

npx prisma migrate dev

Production:

npx prisma migrate deploy

Never use:

db push

---

# Naming Conventions

Models:

PascalCase

Examples:

User
Order
ProductVariant

Fields:

snake_case

Examples:

created_at
updated_at
user_id

---

# Soft Deletes

User

deleted_at

Address

removed_at

No physical deletion.

---

# Monetary Fields

Always use:

Decimal

Example:

Decimal @db.Decimal(10,2)

Never use Float for money.

---

# Transactions

Required for:

- Order Placement
- Inventory Reduction
- Stripe Confirmation
- Refunds
- Cart add-to-cart — the count/stock-bounded `upsert` runs in a Serializable
  `$transaction` so concurrent adds can't breach the 25-line / per-line caps

Use:

prisma.$transaction()

---

# Query Optimization

Prefer:

select

over:

include

Always paginate collections.

---

# Prisma Client Usage

Only one PrismaService should exist.

Never instantiate PrismaClient inside modules.

---

# Search Rules

Use:

mode: "insensitive"

for search.

Searchable:

- Product Name
- Brand
- Category

---

# Index Rules

Create indexes for:

- Foreign Keys
- Search Fields
- Frequently Filtered Columns

`CartItem` carries a composite unique `@@unique([cart_id, product_variant_id])`
(one line per variant per cart). It enables the atomic add-to-cart `upsert` via
the generated `cart_id_product_variant_id` key and prevents duplicate lines.
Added in migration `cart_item_unique_variant`.

---

# Seeding Rules

Seed Files:

prisma/
└── seed-data/
├── categories.data.ts
└── products.data.ts

Seed order:

1. Categories
2. Products
3. Variants
4. Images
5. Coupons

Seed script must be idempotent.

## schema.prisma example

generator client {
provider = "prisma-client"
output = "../generated/prisma"
}

datasource db {
provider = "postgresql"
url = env("DATABASE_URL")
}

enum OrderStatus {
PENDING
CONFIRMED
PACKED
SHIPPED
DELIVERED
CANCELLED
}

enum PaymentStatus {
PENDING
PAID
FAILED
REFUNDED
}

enum PaymentMethod {
COD
STRIPE
}

enum AddressType {
HOME
WORK
OTHER
}

enum DiscountType {
PERCENTAGE
FIXED
}

model User {
user_id String @id @default(uuid()) @db.Uuid
email String @unique
password_hash String
user_name String
first_name String
last_name String
phone String?

is_active Boolean @default(true)

deleted_at DateTime?

created_at DateTime @default(now())
updated_at DateTime @updatedAt

cart Cart?
addresses Address[]
orders Order[]
coupon_usage CouponUsage[]

@@index([email])
}

model Address {
address_id String @id @default(uuid()) @db.Uuid
user_id String @db.Uuid

line1 String
line2 String?

city String
state String
country String
zip String

address_type AddressType

removed_at DateTime?

created_at DateTime @default(now())
updated_at DateTime @updatedAt

user User @relation(fields: [user_id], references: [user_id])

orders Order[]

@@index([user_id])
}

model Cart {
cart_id String @id @default(uuid()) @db.Uuid
user_id String @unique @db.Uuid

applied_coupon String?

created_at DateTime @default(now())
updated_at DateTime @updatedAt

user User @relation(fields: [user_id], references: [user_id])

cart_items CartItem[]
}

model CartItem {
cart_item_id String @id @default(uuid()) @db.Uuid

cart_id String @db.Uuid
product_variant_id String @db.Uuid

quantity Int

cart Cart @relation(fields: [cart_id], references: [cart_id])

product_variant ProductVariant
@relation(fields: [product_variant_id], references: [product_variant_id])

@@index([cart_id])
}

model Category {
category_id String @id @default(uuid()) @db.Uuid

category_name String @unique
slug String @unique

parent_id String? @db.Uuid

parent Category?
@relation("CategoryHierarchy", fields: [parent_id], references: [category_id])

children Category[]
@relation("CategoryHierarchy")

products Product[]

attributes CategoryAttribute[]

created_at DateTime @default(now())

}

model CategoryAttribute {
category_id String @db.Uuid
attribute_name String

category Category @relation(fields: [category_id], references: [category_id])

@@id([category_id, attribute_name])
}

model Product {
product_id String @id @default(uuid()) @db.Uuid

category_id String @db.Uuid

product_name String
slug String @unique

brand String

description String

is_active Boolean @default(true)

created_at DateTime @default(now())
updated_at DateTime @updatedAt

category Category @relation(fields: [category_id], references: [category_id])

variants ProductVariant[]

@@index([product_name])
}

model ProductVariant {
product_variant_id String @id @default(uuid()) @db.Uuid

product_id String @db.Uuid

sku String @unique

stock Int

price Decimal @db.Decimal(10,2)

discount Decimal @db.Decimal(10,2)

attributes Json

created_at DateTime @default(now())
updated_at DateTime @updatedAt

product Product @relation(fields: [product_id], references: [product_id])

images ProductImage[]

cart_items CartItem[]
order_items OrderItem[]

@@index([product_id])
}

model ProductImage {
image_id String @id @default(uuid()) @db.Uuid

product_variant_id String @db.Uuid

image_url String

alt_text String?

is_primary Boolean @default(false)

sort_order Int @default(0)

created_at DateTime @default(now())

product_variant ProductVariant
@relation(
fields: [product_variant_id],
references: [product_variant_id]
)

@@index([product_variant_id])
}

model Coupon {
coupon_id String @id @default(uuid()) @db.Uuid

code String @unique

discount_type DiscountType

discount_value Decimal @db.Decimal(10,2)

minimum_order Decimal? @db.Decimal(10,2)

usage_limit Int?

used_count Int @default(0)

is_active Boolean @default(true)

expires_at DateTime?

created_at DateTime @default(now())

usages CouponUsage[]
}

model CouponUsage {
coupon_id String @db.Uuid
user_id String @db.Uuid

coupon Coupon @relation(fields: [coupon_id], references: [coupon_id])
user User @relation(fields: [user_id], references: [user_id])

@@id([coupon_id, user_id])
}

model Order {
order_id String @id @default(uuid()) @db.Uuid

user_id String @db.Uuid
address_id String @db.Uuid

sub_total Decimal @db.Decimal(10,2)
coupon_discount Decimal @db.Decimal(10,2)
shipping_fee Decimal @db.Decimal(10,2)
total_amount Decimal @db.Decimal(10,2)

status OrderStatus @default(PENDING)

created_at DateTime @default(now())
updated_at DateTime @updatedAt

user User @relation(fields: [user_id], references: [user_id])
address Address @relation(fields: [address_id], references: [address_id])

items OrderItem[]
payment Payment?

@@index([user_id])
@@index([status])
}

model OrderItem {
order_item_id String @id @default(uuid()) @db.Uuid

order_id String @db.Uuid

product_name String
product_variant_id String @db.Uuid

purchase_price Decimal @db.Decimal(10,2)

quantity Int

order Order @relation(fields: [order_id], references: [order_id])

product_variant ProductVariant @relation(fields: [product_variant_id], references: [product_variant_id])

@@index([order_id])
}

model Payment {
payment_id String @id @default(uuid()) @db.Uuid

order_id String @unique @db.Uuid

payment_method PaymentMethod
payment_status PaymentStatus

amount Decimal @db.Decimal(10,2)

stripe_payment_id String?

created_at DateTime @default(now())

order Order @relation(fields: [order_id], references: [order_id])
}
