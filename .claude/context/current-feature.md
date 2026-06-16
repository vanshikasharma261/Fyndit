## Current Feature

**Authentication Module (Backend)** (spec: `002-authentication-backend.md`)

Implements the complete backend authentication system for Fyndit: signup, login, logout, JWT generation/validation, cookie-based auth, protected routes, request-user injection, and an active-user verification utility. Builds directly on the database foundation from `001-prisma-setup.md` (User + Address models, `PrismaService`).

## Status

Done

## Goal

Stand up a production-ready auth layer that all future protected modules (Cart, Checkout, Orders, Address, User) can depend on.

Requirements:

- **Auth strategy:** Passport JWT Strategy + `JwtModule`/`JwtService` + `JwtAuthGuard`. JWT extracted from an HTTP-only cookie, signature + expiry validated, user attached to `req.user`.
- **JWT payload:** `{ sub: user_id, email }`.
- **Cookie:** `httpOnly: true`, `sameSite: 'strict'`, `secure` based on environment. `JWT_SECRET` from env only — never hardcoded.
- **Express augmentation:** `src/types/express.d.ts` augments `Express.User` with `{ id: string; email: string }`; after auth `req.user = { id, email }`.
- **Signup (`POST /auth/signup`):** validate DTO → check email uniqueness → bcrypt-hash password → create User → create default Address → success response.
  - User defaults: `is_active = false`, `session_active = false`, `is_deleted = false`, `deleted_at = null`. DB maintains `created_at` / `updated_at`.
  - Per business rules, a Cart is auto-created after successful registration (see Notes).
- **Login (`POST /auth/login`):** validate DTO → find user by email → bcrypt-compare → generate JWT → set HTTP-only cookie → set `is_active = true` → success response. Soft-deleted users cannot login.
- **Logout (`POST /auth/logout`, `@UseGuards(JwtAuthGuard)`):** read `req.user` → set `is_active = false` → clear auth cookie → success response.
- **Active-user utility:** `authService.isUserActive(userId: string): Promise<boolean>` — future modules call this before sensitive operations (JWT may outlive a logout/deactivation).
- **Validation:** all bodies use DTOs (`class-validator` / `class-transformer`). Validation errors transformed into a frontend-friendly flat object (`{ field: message }`) via a global validation exception formatter — NOT the default NestJS array format.
  - Password: min 8 chars, upper + lower + number + special.
  - Phone: exactly 10 digits. Zip: exactly 6 digits. State: valid Indian state. Country must equal `India`.
- **Messages:** all response messages sourced from `src/constants/messages.constant.ts` (e.g. `AuthMessages.loginSuccessMessage`).
- **Migration:** add `is_deleted Boolean @default(false)` to the User model for soft-delete support (migration, never `db push`).
- **Security:** passwords never returned in responses, never logged. Use `bcrypt.hash()` / `bcrypt.compare()`.

Target structure:

```
backend/src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── dto/
│   │   ├── login.dto.ts
│   │   └── signup.dto.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   └── strategies/
│       └── jwt.strategy.ts
├── constants/
│   └── messages.constant.ts
└── types/
    └── express.d.ts
```

## Definition of Done (from spec)

- ☑ AuthModule, controller, service created.
- ☑ Signup, Login, Logout endpoints implemented.
- ☑ Passport JWT Strategy + `JwtAuthGuard` implemented; JWT generated, stored in HTTP-only cookie, and validated.
- ☑ `req.user` populated correctly; `Express.User` type augmentation created; `@CurrentUser()` decorator used instead of raw `req.user` access (per development-rules).
- ☑ bcrypt hashing + comparison implemented.
- ☑ Validation DTOs created; validation error response transformed into flat `{ field: message }` object.
- ☑ `isUserActive` utility implemented; logout updates `is_active`.
- ☑ User model contains `is_deleted`; migration generated successfully (migrations only).
- ☑ All messages sourced from `messages.constant.ts`; no auth secrets hardcoded; passwords never returned/logged.

---

## Notes / decisions

- Must consult before/while implementing: `project-overview.md`, `business-rules.md`, `development-rules.md`, `database-design.md`, `prisma-schema.md`.
- **Cart-on-signup:** `business-rules.md` states a Cart is auto-created after successful registration, but the spec's signup flow only lists User + default Address. Reconcile during implementation — recommend creating User + Address + Cart inside a single Prisma transaction so signup is atomic.
- **Development-rules alignment:** use `@CurrentUser()` custom decorator rather than accessing `req.user` directly throughout the codebase; throw NestJS exceptions (`ConflictException` for duplicate email, `UnauthorizedException` for bad credentials) — never raw `Error`; use `select` (not `include: true`) and never log passwords/tokens.
- **Soft delete:** spec adds `is_deleted` to User; business-rules require soft-deleted users be unable to login. Account for both `is_deleted` and `deleted_at`.
- **`session_active` vs `is_active`:** spec sets defaults for both at signup but only toggles `is_active` on login/logout. Confirm intended semantics against `database-design.md` before wiring logic.
- After completion, run `fyndit-security-reviewer`, `fyndit-api-reviewer`, and `fyndit-quality-reviewer` (plus `fyndit-prisma-reviewer` for the migration).

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

2. **Authentication Module (Backend)** — *Done* (spec `002-authentication-backend.md`). Production-ready auth layer: signup/login/logout, Passport JWT strategy, HTTP-only cookie auth, `@CurrentUser()` injection, `isUserActive` utility.
   - **Resolved decisions:** `session_active` is **not** used — it exists in neither `schema.prisma` nor `database-design.md`; `is_active` is the single session signal (false at signup, true on login, false on logout). Soft-delete login block checks **both** `is_deleted` and `deleted_at`. Cart-on-signup reconciled by creating User + default Address + Cart in one `$transaction`. Signup DTO collects the default address (phone/zip/state/country validated), which is why an address is created at registration.
   - **Migrations (migrations-only):** `add_user_is_deleted` (adds `is_deleted Boolean @default(false)`) and `user_is_active_default_false` (flips the schema/DB default of `is_active` to `false` so out-of-service User creates can't silently produce active accounts).
   - **New deps:** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `cookie-parser`, `class-validator`, `class-transformer` (+ types). The project had no `class-validator`/`class-transformer` before this feature.
   - **Validation:** global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + `transform`) with a custom `exceptionFactory` (`src/common/validation/validation-exception.factory.ts`) producing flat `{ field: message }` errors. Password ≤72 bytes (bcrypt limit); free-text fields length-bounded.
   - **Cookie:** `httpOnly`, `sameSite: 'strict'`, `secure` in production, `maxAge` derived from `JWT_EXPIRES_IN`; logout uses identifying attributes only (no `maxAge`) to clear reliably. `JWT_SECRET`/`JWT_EXPIRES_IN` read via `ConfigService.getOrThrow`/`get` — never hardcoded. bcrypt rounds = 12.
   - **Reviews:** `fyndit-security-reviewer`, `fyndit-prisma-reviewer`, `fyndit-quality-reviewer` run; in-scope fixes applied (P2002 race safety-net → `ConflictException`, `is_active` default fix, dedicated clear-cookie options, `@CurrentUser()` undefined guard, redundant `ConfigModule` import removed, DTO length caps, `resolveCookieMaxAge` extracted to a helper). (`fyndit-api-reviewer` is referenced in CLAUDE.md but not registered in this environment — API concerns covered manually and via live smoke test.)
   - **Verified:** `npm run lint` clean, `npm run build` → `dist`, Nest boot maps `/auth/{signup,login,logout}`. Live smoke test passed: flat validation errors, signup 201, duplicate 409, bad-password 401 (generic), login 200 with HttpOnly `access_token` cookie, guarded logout 200 / unauthenticated 401.
   - **Outstanding (out of scope — app-wide hardening, recommend a separate pass):** no CORS (`app.enableCors` with `credentials: true` + frontend origin — needed once the React app calls the API), no `helmet`, no rate limiting/throttling on `login`/`signup` (`@nestjs/throttler`), and no caching on `isUserActive` (a `SELECT` per protected op at scale).
