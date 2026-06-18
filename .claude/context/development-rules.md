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
