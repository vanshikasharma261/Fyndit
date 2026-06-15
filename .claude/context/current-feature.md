## Current Feature

**Prisma Setup, Database Integration & Seed Generation** (spec: `001-prisma-setup.md`)

Establishes the complete database foundation for Fyndit: Prisma 7 + PostgreSQL setup, schema creation, migrations, idempotent seed data, product image assets, and a reusable `PrismaService` exposed via Dependency Injection. This is the foundation for all future backend modules.

## Status

Done

## Goal

Stand up a production-ready database layer that all future modules can depend on.

Requirements:

- Prisma ORM 7 with the latest stable Prisma Client and the Prisma PostgreSQL Adapter (no deprecated configs).
- PostgreSQL connection via `DATABASE_URL` environment variable.
- Schema generated from `database-design.md` and `prisma-schema.md` using Prisma 7 conventions:
  - UUID primary keys, `Decimal` for money fields, proper indexes, relations, and enums.
  - Follow naming conventions from `prisma-schema.md`.
- Core models: User, Address, Category, Product, ProductVariant, ProductImage, Cart, CartItem, Coupon, CouponUsage, Order, OrderItem, Payment.
- Migrations only — `npx prisma migrate dev --name "prisma_intial_setup"` and `npx prisma migrate deploy`. **Never** `prisma db push`.
- Data-driven, idempotent seed system:
  - At least 3 parent categories with 2–4 child categories each (slugs + attributes).
  - Minimum 20 products spread across categories (name, brand, description, slug, variants).
  - 2–4 variants per product, generated automatically via cartesian combination of `colors` × `variantOptions`.
  - Each variant: unique SKU, stock quantity, price, discount, attribute JSON.
  - Exactly 3 images per variant (1 primary + 2 thumbnails); only relative asset paths persisted.
  - Adding a new product requires editing only `products.data.ts` — no seed-logic changes.
  - Idempotent via `upsert`, unique slug, unique SKU.
- `PrismaService` as the single source of DB access: extends `PrismaClient`, implements `OnModuleInit` and `OnModuleDestroy`, manages connection + graceful shutdown. No `new PrismaClient()` outside this service.

Target structure:

```
backend/
├── assets/products/<product>/<color>/{1,2,3}.jpg
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── seed-data/
│       ├── categories.data.ts
│       ├── products.data.ts
│       └── product-images.data.ts
└── src/prisma/
    ├── prisma.module.ts
    └── prisma.service.ts
```

## Definition of Done (from spec)

- ✓ Prisma 7 installed; PostgreSQL adapter configured; `DATABASE_URL` configured.
- ✓ `schema.prisma` generated; initial migration generated; database migrated successfully.
- ✓ Seed files created; Categories, Products, Product Variants, and Product Images seeded.
- ✓ All image paths stored as relative paths; every variant has exactly 3 images.
- ✓ `PrismaModule` and `PrismaService` created; Dependency Injection configured; Prisma Client generated.
- ✓ Seed command executes successfully and is idempotent (re-running creates no duplicates).
- ✓ Project follows all standards in `prisma-schema.md`; no direct `PrismaClient` instantiation outside `PrismaService`.

---

## Notes / decisions

- Must consult before/while implementing: `project-overview.md`, `business-rules.md`, `database-design.md`, `prisma-schema.md`, `development-rules.md`.
- Money uses `Decimal`; order placement (future) uses transactions.
- Seed must be data-driven: variant generation is automatic from `colors` + `variantOptions` via cartesian product.
- Images live under `backend/assets/products`; DB stores relative paths only.
- After completion, run `fyndit-prisma-reviewer` and `fyndit-quality-reviewer`.

## History

1. **Prisma Setup, Database Integration & Seed Generation** — *Done* (spec `001-prisma-setup.md`). Database foundation: Prisma 7 + PostgreSQL, schema, migrations, idempotent data-driven seeds, product image assets, reusable `PrismaService` via DI.
   - Prisma 7.8.0 with the new `prisma-client` generator (output `src/generated/prisma`) + `@prisma/adapter-pg` driver adapter; connection URL lives in `prisma.config.ts` (Prisma 7 removes `url` from `schema.prisma` and disables auto `.env` loading).
   - All 13 models created; `prisma_intial_setup` migration generated and applied (migrations only).
   - `PrismaService` (extends generated client, `OnModuleInit`/`OnModuleDestroy`, built from `ConfigService` + pg adapter) + `@Global() PrismaModule`, wired into `AppModule`. No `new PrismaClient()` outside `PrismaService` and the standalone seed.
   - Data-driven seed: variants auto-generated via cartesian of `colors × options` (`variant-generator.ts`); idempotent upserts (slug/sku/code); atomic per-variant image rebuild. Adding a product = one entry in `products.data.ts`.
   - **Image decision (changed from spec):** images are downloaded from real source URLs (`image-sources.data.ts` → `download-assets.ts`) into `assets/products/<slug>/<color>/{1,2,3}.jpg`; DB stores only relative paths (no runtime internet dependency).
   - Seeded: 13 categories, 26 products, 86 variants, 258 images (exactly 3/variant, 1 primary), 3 coupons. Idempotent (re-run = identical counts). Floral Summer Dress carries `red + yellow × S/M/L = 6` variants; variant-count guard max raised to 8.
   - Verified: `npm run lint` clean, `npm run build` → `dist/main.js`, Nest context boot confirms `PrismaService` connects via DI. Reviewed with `fyndit-prisma-reviewer` + `fyndit-quality-reviewer`; in-scope fixes applied (atomic image rebuild, `used_count` reset on re-seed, shared `constants.ts`, seed-time variant guard).
   - **Outstanding (out of scope):** project scaffold still has `noImplicitAny: false` (tsconfig) and `no-explicit-any: 'off'` (eslint) — recommend enabling full `strict` in a separate hardening pass.
