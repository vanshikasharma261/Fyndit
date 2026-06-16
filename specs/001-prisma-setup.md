## Feature Specification: Prisma Setup, Database Integration & Seed Generation

## Feature Overview

This feature is responsible for setting up the complete database foundation for the Fyndit application.

## The implementation includes:

1. Prisma 7 setup

2. PostgreSQL integration using Prisma PostgreSQL Adapter

3. Database schema creation

4. Migration configuration

5. Seed data generation

6. Product image asset setup

7. Prisma Module creation

8. PrismaService implementation

9. Dependency Injection integration

This feature serves as the foundation for all future backend modules and must be implemented following the project standards defined in:

- `.claude/context/project-overview.md`
- `.claude/context/business-rules.md`
- `.claude/context/database-design.md`
- `.claude/context/prisma-schema.md`
- `.claude/context/development-rules.md`

---

## Objectives

After implementation the project should support:

- Prisma 7 Client Generation
- PostgreSQL Database Connection
- Migration Generation
- Database Seeding
- Dependency Injection Based Database Access
- Product & Category Seed Data
- Product Variant Images
- PrismaService Reusability Across Modules

---

## Technical Requirements

Prisma Version

Use:

- Prisma ORM Version 7
- Latest stable Prisma Client
- Prisma PostgreSQL Adapter

Follow the latest Prisma 7 documentation and recommended setup patterns.

Do not use deprecated Prisma configurations.

---

## Database Provider

Database:

PostgreSQL

Connection:

Environment Variable DATABASE_URL=

---

## Prisma Folder Structure

Required structure: backend/ │ ├── prisma/ │ ├── schema.prisma │ ├── seed.ts │ │ │ └── seed-data/ │ ├── categories.data.ts │ ├── products.data.ts │ └── product-images.data.ts │ └── src/ └── prisma/ ├── prisma.module.ts └── prisma.service.ts

---

Schema Generation

Generate the schema based on:

- database-design.md
- prisma-schema.md

Requirements:

- Use Prisma 7 conventions
- Use Decimal for money fields
- Use UUID primary keys
- Use proper indexes
- Use proper relations
- Use enums where applicable
- Follow naming conventions defined in prisma-schema.md

Core Models:

- User
- Address
- Category
- Product
- ProductVariant
- ProductImage
- Cart
- CartItem
- Coupon
- CouponUsage
- Order
- OrderItem
- Payment

The generated schema should be production-ready and fully aligned with the Fyndit domain.

---

## Migration Setup

Implementation must support: npx prisma migrate dev --name "prisma_intial_setup"

and npx prisma migrate deploy

Never use: npx prisma db push

Migration files must be generated using Prisma migrations only.

---

## Seed Data Requirements

Seed data should create realistic e-commerce data.

---

Categories

## Categories

Generate a realistic category hierarchy suitable for a modern e-commerce platform.

Requirements:

- Parent categories
- Child categories
- Category slugs
- Category attributes

At least:

- 3 parent categories
- 2-4 child categories per parent

The structure should support future product filtering and search functionality.

---

## Products

Generate a minimum of:

20 Products

Spread across categories.

Each product should include:

- Product Name
- Brand
- Description
- Slug
- Variants

---

## Product Variants

Each product should have:

2-4 Variants

Examples:

T-Shirt

- Red Small
- Red Medium
- Blue Medium

Phone

- 128GB Black
- 256GB Black
- 512GB Blue

Variant Requirements:

- Unique SKU
- Stock Quantity
- Price
- Discount
- Attribute JSON

---

## Product Images

backend/│├── assets/│ └── products/│ ├── samsung-galaxy-s25/│ │ ├── blue/│ │ │ ├── 1.jpg│ │ │ ├── 2.jpg│ │ │ └── 3.jpg│ │ ││ │ └── violet/│ │ ├── 1.jpg│ │ ├── 2.jpg│ │ └── 3.jpg│ ││ ├── dell-xps-15/│ └── nike-air-max/│├── prisma/│ ├── schema.prisma│ ├── seed.ts│ ││ └── seed-data/│ ├── categories.data.ts│ ├── products.data.ts│ ├── category-attributes.data.ts│ └── additional files needed│└── src/ └── prisma/ ├── prisma.module.ts └── prisma.service.ts

---

Image Requirements

Each Product Variant must contain:

Exactly 3 Images

Structure:

Variant├── Primary Image├── Thumbnail Image 1└── Thumbnail Image 2

Example:

iPhone 128GB Black

- image1.jpg
- image2.jpg
- image3.jpg

These images will be used by the frontend product gallery.

---

## Seed Image Mapping

Create: product-images.data.ts

This file should maintain image mappings for all variants.

Example: { sku: "IPHONE16-BLK-128", images: [ "/assets/products/iphone/image1.jpg", "/assets/products/iphone/image2.jpg", "/assets/products/iphone/image3.jpg" ] }

---

## Seed Execution

Seed process should:

1. Create Categories

2. Create Products

3. Create Product Variants

4. Create Product Images

Seeding should be idempotent.

Running seeds multiple times should not create duplicates.

Use:

- upsert
- unique identifiers

where appropriate.

---

## Seed Data Rules

The seed system must be data driven.

Adding a new product should only require editing:

- products.data.ts

No seed logic changes should be required.

Variant generation must happen automatically from:

- colors
- variantOptions

using cartesian combination generation.

The seed system must be idempotent.

Use:

- upsert
- unique slug
- unique sku

to prevent duplicate records.

Images must be stored under:

backend/assets/products

and only relative asset paths are persisted to the database.

Every generated product variant must have exactly:

- 3 images

with one image marked as primary.

---

## Prisma Module

Create: src/prisma/

containing: prisma.module.ts prisma.service.ts

---

## PrismaService

PrismaService is the single source of database access.

Responsibilities:

- Instantiate Prisma Client
- Manage Database Connection
- Manage Graceful Shutdown
- Expose Prisma Client via Dependency Injection

Requirements:

- Extend PrismaClient
- Implement OnModuleInit
- Implement OnModuleDestroy

No other module should instantiate PrismaClient directly.

---

## Dependency Injection Rules

All modules must inject: PrismaService

Example: constructor( private readonly prisma: PrismaService ) {}

Forbidden: new PrismaClient()

inside feature modules.

Only PrismaService may create the Prisma client instance.

---

## Acceptance Criteria

The feature is complete when:

✓ Prisma 7 installed

✓ PostgreSQL adapter configured

✓ DATABASE_URL configured

✓ schema.prisma generated

✓ Initial migration generated

✓ Database migrated successfully

✓ Seed files created

✓ Categories seeded

✓ Products seeded

✓ Product Variants seeded

✓ Product Images seeded

✓ All image paths stored as relative paths

✓ Every variant has exactly 3 images

✓ PrismaModule created

✓ PrismaService created

✓ Dependency Injection configured

✓ Prisma Client generated

✓ Seed command executes successfully

✓ Project follows all Prisma standards defined in prisma-schema.md

✓ No direct PrismaClient instantiation outside PrismaService
