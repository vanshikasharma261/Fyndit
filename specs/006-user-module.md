# Feature Specification: User Module (Profile Management)

## Feature Overview

This feature introduces the **User module** to the Fyndit backend and the
**Profile page** to the frontend. Together they let a signed-in user view and
manage their own profile details, and soft-delete their account.

The backend exposes a new `/user` domain module (controller + service + DTO)
with three operations — read, update, and soft delete — all scoped to the
**currently authenticated user** (resolved from the JWT via the `@CurrentUser`
decorator; never from a client-supplied id). The frontend implements the
**Manage Your Profile** panel on the Profile page with inline, per-field
editing.

The implementation must follow all project standards defined in:

- `.claude/context/project-overview.md`
- `.claude/context/business-rules.md`
- `.claude/context/development-rules.md`
- `.claude/context/database-design.md`
- `.claude/context/prisma-schema.md`

UI is driven by the screenshots in `.claude/screenshots/` (see
[UI References](#ui-references)).

---

## Objectives

After implementation the application should support:

- Fetching the authenticated user's profile (`GET /user`)
- Updating the authenticated user's editable profile fields (`PATCH /user`)
- Soft-deleting the authenticated user's account (`DELETE /user`)
- An active-status guard on every operation via the existing
  `AuthService.isUserActive(userId)` utility
- A Profile page with a **Manage Your Profile** panel supporting inline,
  per-field editing with success + validation feedback
- A dummy **Addresses** panel on the right (heading + placeholder only;
  the real feature ships next)

---

## Background & Existing Building Blocks

This module builds directly on the `002-authentication-backend` work. Reuse,
do not re-create:

| Concern | Existing asset | Reuse note |
| --- | --- | --- |
| Authenticated principal | `@CurrentUser()` → `AuthenticatedUser` (`{ id, email }`) | `backend/src/common/decorators/current-user.decorator.ts` |
| Route protection | `JwtAuthGuard` | `backend/src/auth/guards/jwt-auth.guard.ts` |
| Active-session check | `AuthService.isUserActive(userId)` | Already returns `false` for inactive / soft-deleted users |
| DB access | `PrismaService` | Inject only this; no raw client |
| Response copy | `messages.constant.ts` (`AuthMessages`, `ValidationMessages`) | Add a new `UserMessages` group |
| Validation error shape | global validation exception factory | `backend/src/common/validation/validation-exception.factory.ts` — already emits the `{ errors: { field: msg } }` envelope |
| Frontend feedback pattern | `authSlice` / `AuthState` | Mirror for `userSlice` / `UserState` |
| Validation copy reuse | `ValidationMessages.phoneInvalid`, `emailInvalid` | Same messages as signup |

### Relevant existing `User` model (`backend/prisma/schema.prisma`)

```prisma
model User {
  user_id       String  @id @default(uuid()) @db.Uuid
  email         String  @unique
  password_hash String
  user_name     String
  first_name    String
  last_name     String
  phone         String?

  is_active  Boolean   @default(false)
  is_deleted Boolean   @default(false)
  deleted_at DateTime?

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  // ...relations
}
```

> **No schema migration is required.** `is_deleted` + `deleted_at` already exist
> for soft delete, and all editable fields already exist on the model.

---

## Backend

### Module Structure

```text
backend/
└── src/
    └── user/
        ├── user.module.ts
        ├── user.controller.ts
        ├── user.service.ts
        ├── dto/
        │   └── update-user.dto.ts
        └── types/
            └── user.types.ts        // UserProfile response contract (incl. phone)
```

- Register `UserModule` in `app.module.ts`.
- `UserModule` imports `AuthModule` (to inject `AuthService` for `isUserActive`)
  and `PrismaModule`. Export nothing unless a later module needs it.
- Controller stays thin: it only wires the route, the guard, the `@CurrentUser`
  decorator, and the DTO, then delegates to the service.

### Cross-cutting Rule — Active-status precheck

> Before reading or mutating any user record, the service **must** call
> `authService.isUserActive(user.id)` first. If it returns `false`, throw
> `UnauthorizedException(AuthMessages.inactiveAccountMessage)`.

This guards against a still-valid JWT belonging to a user who has logged out or
been soft-deleted. Apply it in `getUser`, `updateUser`, and `deleteUser`.

### Endpoints

All routes are protected with `@UseGuards(JwtAuthGuard)` and identify the user
via `@CurrentUser()` — **the user id is never accepted from the request body or
params** (prevents acting on another account).

#### 1. Get User — `GET /user`

- **Flow**
  1. `isUserActive(user.id)` precheck.
  2. Load the user by `user_id` with an explicit `select` (no `password_hash`,
     no internal flags leaked).
  3. Return the `UserProfile` contract.
- **Response 200**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "first_name": "Vanshika",
  "last_name": "Sharma",
  "user_name": "vs_29",
  "phone": "7015639716"
}
```

> Note: the existing `UserProfile` from `GET /auth/me` does **not** include
> `phone`. The Profile page needs it, so the `/user` response adds `phone`.
> Keep `/auth/me` as-is unless a follow-up unifies them; define the richer shape
> in `user/types/user.types.ts`.

#### 2. Update User — `PATCH /user`

- **Body**: `UpdateUserDto` (see below). Partial — only sent fields change.
- **Flow**
  1. `isUserActive(user.id)` precheck.
  2. Validate DTO (global `ValidationPipe`; unknown keys rejected with 400).
  3. Update only the whitelisted fields for `user_id = user.id`.
  4. Re-select and return the updated `UserProfile`.
- **Email uniqueness**: if `email` changes, it must remain unique. Catch Prisma
  `P2002` and surface it as a field error (`{ errors: { email: "..." } }`),
  mirroring the signup conflict handling. Add a `UserMessages.emailAlreadyExists`
  (or reuse `AuthMessages.emailAlreadyExistsMessage`).
- **Response 200**: same `UserProfile` shape as `GET /user`.

#### 3. Delete User — `DELETE /user` (soft delete)

- **Flow**
  1. `isUserActive(user.id)` precheck.
  2. Set `is_deleted = true`, `deleted_at = now()`, `is_active = false`.
  3. Clear the auth cookie (`ACCESS_TOKEN_COOKIE`) so the session ends — reuse
     the cookie-clear options from `AuthService`.
  4. Return `{ message: UserMessages.deleteSuccess }`.
- The record is **never** hard-deleted (soft delete per business rules).

### DTO — `update-user.dto.ts`

Editable fields map 1:1 to model columns: `first_name`, `last_name`,
`user_name`, `email`, `phone`. Every field is **optional** (partial update) but
validated when present. Reuse existing validators/messages from `signup.dto.ts`.

```ts
export class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50)
  first_name?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50)
  last_name?: string;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50)
  user_name?: string;

  @IsOptional() @IsEmail({}, { message: ValidationMessages.emailInvalid })
  email?: string;

  @IsOptional() @Matches(/^\d{10}$/, { message: ValidationMessages.phoneInvalid })
  phone?: string;
}
```

- The global pipe runs with `whitelist` + `forbidNonWhitelisted`, so password,
  ids, and any other key are stripped/rejected — a user cannot escalate by
  posting extra fields.
- All response copy from `UserMessages` in `messages.constant.ts`.

### Security Requirements

- Operations act only on `@CurrentUser().id`; never trust a body/param id.
- `password_hash` and internal flags must never appear in any response `select`.
- Email change must preserve uniqueness (handle `P2002`).
- Re-check `isUserActive` on every call (a JWT outlives logout / soft delete).

---

## Frontend

### Page & Routing

Replace the current placeholder route for `/profile` (in
`frontend/src/routes/router.tsx`, today
`{ path: "profile", element: <PlaceholderPage title="My Profile" /> }`) with the
real `ProfilePage`, still rendered inside `MainLayout` behind `RequireAuth`.

```text
frontend/src/
├── pages/Profile/
│   ├── ProfilePage.tsx
│   └── Profile.module.css
└── features/user/
    ├── userService.ts      // GET/PATCH/DELETE /user (credentials: "include")
    ├── userSlice.ts        // thunks + reducers (mirror authSlice)
    └── types.ts            // UserState
```

Shared API contract types go in `frontend/src/types/user.types.ts` (mirroring
`types/auth.types.ts`): `UserProfile` (with `phone`), `UpdateUserRequest`, and
reuse the existing `ValidationErrorResponse` / `ErrorResponse` /
`FieldValidationErrors` envelopes.

### Layout (per `profile_ui.png`)

Two-column layout inside the page content:

- **Left — "Manage Your Profile"** (this feature): a card with one row per
  editable field. Each row shows an uppercase label (`FIRST NAME:`,
  `LAST NAME:`, `USER NAME:`, `EMAIL:`, `PHONE:`), the current value, and a
  pencil **edit icon** on the right.
- **Right — "Addresses"** (dummy this feature): heading + placeholder content
  only. The real address management ships in the next feature. Do not wire it to
  any API.

Use **CSS Modules** and **theme variables only** (`--color-*`, spacing, radius
tokens) — no hardcoded colours. Match spacing/soft-border/minimal-shadow style.

### Inline Edit Interaction (per `profile_edit_ui.png`)

For each row independently:

1. Click the **pencil** icon → the value becomes an editable `<input>`
   (focused, cursor visible), and the icon switches to a green **tick** (confirm)
   button. The active row gets an accent-coloured border/outline.
2. Click the green tick → dispatch the update thunk (`PATCH /user`) with just
   that field.
3. On success → exit edit mode, show the new value, and surface a success
   message (`UserMessages` copy, e.g. a toast / inline success).
4. Only one field is edited at a time per row; other rows stay read-only.

### Validation & Error Feedback (per `profile_edit_error_ui.png`)

Mirror the **auth** feedback model exactly in `userSlice` / `UserState`:

- A **400 validation** response populates `state.errors` (the flat
  `{ field: message }` map); a non-validation failure sets `state.message`.
- **Field-level errors render under the offending row** — reserve vertical space
  in the row layout so the inline message (e.g. `Phone must be exactly 10 digits`)
  appears directly beneath the input without shifting the panel. The errored row
  keeps its accent border.
- The toast in the screenshot reads "Something went wrong"; the real
  implementation must show a **proper message** — `"Validation Failed"` for
  validation errors (matching how the auth state surfaces validation failure),
  and the server `message` otherwise.

### `UserState` shape (mirror `AuthState`)

```ts
export interface UserState {
  profile: UserProfile | null;
  loading: boolean;
  success: boolean;
  message: string | null;
  errors: FieldValidationErrors | null;
}
```

- Thunks: `fetchUser` (GET), `updateUser` (PATCH), `deleteUser` (DELETE).
- Reuse the auth slice's `startRequest` / `failRequest` helper pattern:
  validation failures → `errors`; everything else → `message`.
- All network calls live in `userService.ts` (frontend rule: no `fetch` in
  components), sending `credentials: "include"` for the auth cookie.
- Register the `user` reducer in the Redux store.

---

## UI References

Source-of-truth screenshots in `.claude/screenshots/`:

- `profile_ui.png` — full Profile page: left "Manage Your Profile" panel
  (read-only rows with pencil icons), right "Addresses" panel (dummy here).
- `profile_edit_ui.png` — a row in edit mode: input + green tick + accent border.
- `profile_edit_error_ui.png` — validation error rendered under the row
  (`Phone must be exactly 10 digits`) plus the error toast.

---

## Out of Scope

- Real **Addresses** management (next feature) — render a dummy panel only.
- Password change / email-verification flows.
- Unifying `GET /auth/me` with `GET /user` (leave `/auth/me` unchanged).
- Any schema migration (existing columns already cover this feature).

---

## Acceptance Criteria

### Backend

- ✓ `UserModule` created and registered in `app.module.ts`.
- ✓ `GET /user` returns the authenticated user's profile (incl. `phone`), no
  sensitive fields.
- ✓ `PATCH /user` updates only whitelisted editable fields and returns the
  updated profile.
- ✓ `DELETE /user` soft-deletes (`is_deleted`, `deleted_at`, `is_active=false`),
  clears the auth cookie, never hard-deletes.
- ✓ Every operation runs the `isUserActive` precheck and rejects inactive /
  soft-deleted users with 401.
- ✓ User identified via `@CurrentUser()` only — no client-supplied id trusted.
- ✓ `UpdateUserDto` validates each field; unknown keys rejected (400).
- ✓ Email change preserves uniqueness (`P2002` → field error).
- ✓ All response copy sourced from `UserMessages` in `messages.constant.ts`.
- ✓ Validation errors use the existing `{ errors: { field: msg } }` envelope.
- ✓ `npm run lint`, `npm run build`, and `npm test` clean in `backend/`.

### Frontend

- ✓ `/profile` renders the real `ProfilePage` (placeholder removed), behind
  `RequireAuth`, inside `MainLayout`.
- ✓ Left "Manage Your Profile" panel matches `profile_ui.png`; right "Addresses"
  panel is a dummy heading/placeholder.
- ✓ Per-row inline edit: pencil → input + green tick → confirm, matching
  `profile_edit_ui.png`.
- ✓ Successful update exits edit mode, shows new value, surfaces a success
  message.
- ✓ Field validation errors render **under the row** with reserved space, per
  `profile_edit_error_ui.png`; toast/message shows "Validation Failed" (not
  "Something went wrong").
- ✓ `userSlice` / `UserState` mirror the auth validation-failure model; all
  network logic lives in `userService.ts` (no `fetch` in components).
- ✓ CSS Modules + theme variables only; no hardcoded colours.
- ✓ `npm run lint` and `npm run build` clean in `frontend/`.
