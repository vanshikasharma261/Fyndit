# 008 — Address Module (Backend Address Module + Frontend Profile Addresses)

Fyndit users need to manage where their orders ship. Today the Profile page shows
a static **Addresses** placeholder; this feature makes it real. An authenticated
user can list their saved addresses, add new ones, edit any field, remove an
address (soft delete), and pick which address is their **default** — all from the
right-hand panel of the Profile page, and all bounded by the platform rule of at
most **5 active addresses per user**. On the backend it introduces a dedicated
`address` module (get-all / add / update / soft-remove / set-default) following the
same feature-isolated architecture as the `cart` and `user` modules, backed by a
small schema change to the `Address` model.

---

## Goal & Scope

Make the **Addresses** panel on the Profile page live. An authenticated user can
view all their addresses, add new ones, edit any field of an existing one, remove
one (soft delete), and choose which is their **default** address — bounded by the
business rule of **max 5 active addresses per user**.

This is delivered as:

- A backend `address` module (`get all` / `add` / `update` / `soft-remove` /
  `set-default`), mirroring the established `cart` / `user` module conventions.
- A schema migration adding two columns to `Address`: `is_removed` and
  `is_default`.
- A frontend `features/address/` slice/service/types + the live Addresses panel
  on the Profile page (list view ⇄ add/edit form view), replacing the current
  static placeholder.

**Out of scope:** checkout address selection (already reads addresses), order
history, any address use beyond CRUD + default on the Profile page.

---

## Confirmed Decisions

1. **Feedback model — react-toastify + inline field errors.** Operational
   success/errors (add / update / remove / set-default) surface as **react-toastify**
   toasts (already wired in `App.tsx`, used by Cart). Per-field **validation**
   errors render **inline** under each form field (red border + message), matching
   `validation_error_address_update.png`. No new toast system on the profile page.
2. **State = dropdown of `INDIAN_STATES`; Country = fixed `India` (disabled).**
   Backend keeps `@IsIn(INDIAN_STATES)` for state and `@IsIn([SUPPORTED_COUNTRY])`
   for country — identical to the signup address DTO. Frontend reuses
   `frontend/src/constants/location.ts`.
3. **Default address is IN scope.** Add an `is_default` column. Exactly one
   default per user whenever they have ≥1 active address.
   - The **first** address a user adds is automatically the default.
   - Default is set from the **list view** via a per-card "Set as default" action;
     the default card shows a **"Default"** badge. The add/edit **forms are
     unchanged** (no default control — screenshots are the source of truth).
   - Setting a new default unsets the previous one in a single transaction.
4. **Removing the default auto-promotes the newest.** When the current default is
   soft-removed and other active addresses remain, the **most-recently-created**
   remaining active address becomes the new default — in the same transaction as
   the remove.
5. **5-active-address limit — backend guard + frontend hides Add.** The backend
   rejects a 6th active address. The frontend also hides the "Add Address" button
   once 5 active addresses exist (with a short note).
6. **Soft delete only.** Remove sets `is_removed = true` + `removed_at = now()`.
   Removed addresses never appear in listings and don't count toward the limit.
   Never hard-delete (business rule + `database-design.md`).

---

## Backend Plan — `address` module (`backend/src/address/`)

```
backend/src/address/
├── address.module.ts          // imports AuthModule; PrismaModule is global
├── address.controller.ts      // @UseGuards(JwtAuthGuard); @CurrentUser() only
├── address.service.ts
├── dto/
│   ├── create-address.dto.ts
│   └── update-address.dto.ts  // PartialType(CreateAddressDto)
└── types/address.types.ts
```

Register `AddressModule` in `AppModule`. Conventions (mirrors `cart`/`user`):
`PrismaService` only, no `any`, thin controller, all logic in `AddressService`,
copy in a new `AddressMessages` group in `messages.constant.ts`, the 5-limit value
in `values.constant.ts` (`MAX_ACTIVE_ADDRESSES = 5`). Identity is **always**
`@CurrentUser().id` — never a body/param id. Every op runs the shared
`assertActiveUser(userId)` (→ 401 on inactive/soft-deleted session) before any DB
access. `:addressId` validated with `ParseUUIDPipe`.

### Endpoints

| Method & path | Purpose | Body / params | Success |
|---|---|---|---|
| `GET /address` | List the user's active addresses | — | `AddressResponse[]` (default first, then `created_at` desc) |
| `POST /address` | Add an address | `CreateAddressDto` | `201` `AddressResponse` |
| `PATCH /address/:addressId` | Update any subset of fields | `UpdateAddressDto` | `200` `AddressResponse` |
| `PATCH /address/:addressId/default` | Set this address as default | — | `200` `AddressResponse[]` (refreshed list) |
| `DELETE /address/:addressId` | Soft-remove | — | `200` `{ message }` |

### DTOs

`CreateAddressDto` (mirrors the signup address block + `ValidationMessages`):

- `address_type` — `@IsEnum(AddressType)`, **required** (form defaults to `HOME`).
- `line1` — `@IsString` `@IsNotEmpty` `@MaxLength(120)`.
- `line2` — `@IsOptional` `@IsString` `@MaxLength(120)`.
- `city` — `@IsString` `@IsNotEmpty` `@MaxLength(60)`.
- `state` — `@IsIn(INDIAN_STATES, { message: ValidationMessages.stateInvalid })`.
- `country` — `@IsIn([SUPPORTED_COUNTRY], { message: ValidationMessages.countryInvalid })`.
- `zip` — `@Matches(/^\d{6}$/, { message: ValidationMessages.zipInvalid })`.

`UpdateAddressDto extends PartialType(CreateAddressDto)` — every field optional;
the service builds the update payload from only the **present** keys (the
`user.service.ts` present-keys-only pattern, not relying on Prisma "undefined =
skip").

### Service rules

- **List:** `where: { user_id, is_removed: false }`, `select` the contract columns,
  `orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }]`.
- **Add:** inside a `$transaction` — count active addresses; if `>= 5` throw
  `BadRequestException(AddressMessages.limitReached)`; create the row; if it's the
  user's **first** active address set `is_default: true`, else `false`.
- **Update:** ownership-scoped `updateMany({ where: { address_id, user_id,
  is_removed: false }, data })`; `count === 0` → `NotFoundException` (this is both
  the ownership check and a guard against `P2025` surfacing as a 500), then read
  back the row for the response.
- **Set-default:** `$transaction` — verify the target belongs to the user and is
  active (else 404); `updateMany` unset `is_default` on all the user's active
  addresses, then set it on the target; return the refreshed list.
- **Remove:** `$transaction` — ownership-scoped soft-delete (`is_removed: true`,
  `removed_at: new Date()`, `is_default: false`); `count === 0` → 404; if the
  removed row **was** the default and ≥1 active address remains, promote the
  most-recently-created remaining active address (`orderBy created_at desc`,
  `take 1`) to `is_default: true`.

### Response contract (`types/address.types.ts`)

```ts
interface AddressResponse {
  address_id: string;
  address_type: AddressType;   // HOME | WORK | OTHER
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  zip: string;
  is_default: boolean;
}
```

(No money fields; nothing sensitive — `is_removed`/`removed_at`/`user_id` are not
selected into the response.)

---

## Database / Prisma Plan

Add two columns to `model Address` (alongside the existing `removed_at`):

```prisma
is_removed Boolean @default(false)
is_default Boolean @default(false)
```

- Mirrors the `User` soft-delete pair (`is_deleted` + `deleted_at`): `is_removed`
  is the boolean flag the spec asked for; `removed_at` is the timestamp.
- Migration name: `address_is_removed_is_default` (migrations only — **never**
  `db push`, per `prisma-schema.md`). Run `npx prisma migrate dev` +
  `npx prisma generate`.
- No index change required: the existing `@@index([user_id])` covers the
  `user_id + is_removed` list query at this row count. (Reconsider a composite
  index in Phase 6 if needed — noted, not done.)

---

## Frontend Plan

```
frontend/src/
├── features/address/
│   ├── addressService.ts     // all fetch calls (credentials: "include"), ApiResult<T>
│   ├── addressSlice.ts       // thunks + state
│   └── types.ts              // AddressState
├── types/address.types.ts    // API contracts (AddressResponse, request/error types)
├── components/Addresses/
│   ├── AddressesPanel.tsx    // list ⇄ form mode controller (right Profile card)
│   ├── AddressCard.tsx       // one address row (badge, lines, default badge, actions)
│   ├── AddressForm.tsx       // add/edit form (type pills + fields + inline errors)
│   └── *.module.css          // CSS Modules + theme tokens only
├── pages/Profile/ProfilePage.tsx   // render <AddressesPanel/> in the right card
└── store/store.ts            // register the `address` reducer
```

- **`addressService.ts`** — `VITE_API_URL`, `ApiResult<T>` `{ ok, status, data }`,
  `credentials: "include"`: `list`, `add`, `update`, `remove`, `setDefault`.
- **`addressSlice.ts`** — thunks `fetchAddresses` / `addAddress` / `updateAddress`
  / `removeAddress` / `setDefaultAddress`, each branching on `ok`; synthetic
  `NETWORK_ERROR` from shared `NetworkErrorMessages` + `NETWORK_ERROR_STATUS`.
  `AddressState`: `{ items, loading, saving, mutatingId, errors }` where `errors`
  is the per-field map for the **form** (inline). Operational success/error is
  surfaced as **toasts** by the component via `.unwrap()` (the Cart pattern — slice
  owns data + busy flags, not toast copy). Reset to empty on `logoutUser.fulfilled`
  / `sessionExpired` / `deleteUser.fulfilled` (mirrors `cartSlice`).
- **`AddressesPanel`** (right Profile card, replaces the `aria-hidden` placeholder):
  - **List mode** — heading "Addresses", one `AddressCard` per address; a dashed
    **"Add Address"** button **hidden once 5 active addresses exist** (replaced by
    a short "Maximum of 5 addresses" note). Fetches on mount.
  - **Form mode** — clicking "Add Address" (blank form) or a card's pencil
    (pre-filled) swaps the card content for `<AddressForm/>`. The form replaces the
    panel body exactly as in `address_add_form_ui.png` / `address_update_form_ui.png`.
- **`AddressCard`** — `address_type` badge, `line1`, `line2`, City/State, zip chip,
  a **"Default"** badge when `is_default`, pencil (edit) + trash (remove) icons,
  and a **"Set as default"** action on non-default cards. Remove + set-default
  show a confirm/spinner via `mutatingId`; both surface a toast.
- **`AddressForm`** — `ADDRESS TYPE` pill group (`HOME` default / `WORK` / `OTHER`,
  selected pill = accent outline per screenshot), `LINE 1`, `LINE 2`, `CITY`,
  `STATE` (**dropdown of `INDIAN_STATES`**), `COUNTRY` (fixed **India**, disabled),
  `ZIP CODE`; Cancel + **Add**/**Update** buttons. Inline per-field errors render
  under each field with reserved height (red border on the errored field +
  "↑ Invalid Zip Code"-style message), matching `validation_error_address_update.png`.
  No `fetch` in the component; CSS Modules + theme tokens only.
- Toast copy: add → "Address added", update → "Address updated", remove → "Address
  removed", set-default → "Default address updated"; errors show the server message.

---

## Screenshot References (source of truth)

- `address_add_form_ui.png` — the **Add** form (blank, `HOME` preselected, Cancel +
  **Add**). Form replaces the right panel body.
- `address_update_form_ui.png` — the **Edit** form (pre-filled, Cancel + **Update**).
- `validation_error_address_update.png` — inline field validation (red-bordered
  field + "↑ Invalid Zip Code" under it; no toast).
- (No screenshot for the **list** state or the **Default** badge / "Set as default"
  action — designed to match the existing placeholder card chrome + theme, since
  the default concept was added by decision and isn't in the prototypes.)

---

## Definition of Done

**Backend**

- ☐ `AddressModule` (controller, service, `CreateAddressDto`, `UpdateAddressDto`,
  `types/address.types.ts`) created + registered in `AppModule`; imports `AuthModule`.
- ☐ `GET /address` returns only active addresses (default first), no sensitive cols.
- ☐ `POST /address` validates the DTO, enforces the 5-active limit (400), and
  auto-defaults the first address.
- ☐ `PATCH /address/:addressId` updates only present fields, ownership-scoped, 404
  on foreign/removed id.
- ☐ `PATCH /address/:addressId/default` sets default in a transaction (unset others),
  404 on foreign/removed id.
- ☐ `DELETE /address/:addressId` soft-removes (`is_removed`/`removed_at`/`is_default=false`)
  and auto-promotes the newest remaining address when the default was removed.
- ☐ Every op runs `assertActiveUser` (401); identity from `@CurrentUser()` only;
  `PrismaService` only; no `any`; `:addressId` via `ParseUUIDPipe`; copy in
  `AddressMessages`; validation reuses the `{ errors: { field } }` envelope.
- ☐ Migration `address_is_removed_is_default` applied (migrations only); client regenerated.

**Frontend**

- ☐ Profile right panel is live (placeholder removed): list ⇄ add/edit form.
- ☐ Add form matches `address_add_form_ui.png`; edit form matches
  `address_update_form_ui.png`; inline validation matches
  `validation_error_address_update.png`.
- ☐ State = `INDIAN_STATES` dropdown; Country fixed India (disabled).
- ☐ "Add Address" hidden at 5 active addresses (+ note).
- ☐ Default badge + "Set as default" action; first address auto-default.
- ☐ Toasts (react-toastify) for add/update/remove/set-default success + errors;
  field validation errors inline.
- ☐ `features/address/` (slice/service/types) mirrors the cart/user architecture;
  `address` reducer registered; no `fetch` in components; resets on session teardown.
- ☐ CSS Modules + theme variables only; backend + frontend `npm run lint` + `build`
  clean.

**Testing & Review** (workflow Phases 4–5)

- ☐ Backend Jest unit (`address.service.spec.ts`) + Supertest e2e (`address.e2e-spec.ts`).
- ☐ Frontend Vitest/RTL (`addressSlice`, `AddressForm`, `AddressesPanel`) + Playwright
  (`e2e/address.spec.ts`) — live backend per `testing-patterns.md`.
- ☐ Four review agents (quality / prisma / security / ui) run; approved fixes applied.

---

## Branch

`feature/address-module` (cut from `main`).
