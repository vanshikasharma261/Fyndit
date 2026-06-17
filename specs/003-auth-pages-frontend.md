## Feature Specification: Frontend Foundation, Redux Toolkit Setup & Authentication UI

## Feature Overview

This feature establishes the frontend foundation for the Fyndit application.

## The implementation includes:

1. Redux Toolkit setup

2. Global Store configuration

3. Typed Redux hooks

4. Authentication state management

5. Authentication API integration

6. Authentication type definitions

7. Login Page implementation

8. Signup Page implementation

9. Frontend routing integration

10. Theme integration

This feature serves as the foundation for all future frontend state management and authentication flows.

## The implementation must follow:

- `.claude/context/project-overview.md`
- `.claude/context/business-rules.md`
- `.claude/context/development-rules.md`

## UI implementation must follow the reference screenshots:

- `screenshots/login_ui.png`
- `screenshots/signup_ui.png`

---

## Objectives

After implementation the frontend should support:

- Global Redux Store
- Typed Redux Hooks
- Login
- Signup
- Logout
- Authentication State Persistence
- API Integration with Backend Authentication Routes
- Theme Consistency
- Responsive Authentication Pages

---

## Folder Structure

Required structure: frontend/ └── src/ ├── store/ │ ├── store.ts │ └── hooks.ts │ ├── features/ │ └── auth/ │ └── authSlice.ts │ ├── types/ │ └── auth.types.ts │ ├── pages/ │ ├── Login/ │ │ ├── LoginPage.tsx │ │ └── Login.module.css │ │ │ └── Signup/ │ ├── SignupPage.tsx │ └── Signup.module.css │ ├── routes/ │ └── router.tsx │ ├── App.tsx └── main.tsx

---

## Redux Toolkit Setup

Install and configure: npm install @reduxjs/toolkit react-redux

---

## Store Configuration

Create: src/store/store.ts

Responsibilities:

- Configure Redux Store
- Register reducers
- Export RootState
- Export AppDispatch

Required reducers: { auth: authReducer }

Future reducers will be added later.

---

## Typed Redux Hooks

Create: src/store/hooks.ts

Create typed wrappers: useAppDispatch() useAppSelector()

## Requirements:

- Use AppDispatch
- Use RootState
- Prevent direct usage of useDispatch and useSelector

Future components must use: useAppDispatch() useAppSelector()

only.

---

## Authentication Types

Create: src/types/auth.types.ts

---

## Login Request

    export interface LoginRequest {

      email: string;

      password: string;

    }

---

## Login Response

    export interface LoginResponse {

      user:{id:string,email:string};

      message: string;

    }

---

## Signup Request

The backend signup DTO is FLAT — the address fields live at the top level of the

body (NOT nested under an `address` object). The global ValidationPipe runs with

`forbidNonWhitelisted`, so any unknown/extra key (including a nested `address`)

is rejected with a 400. `line2` and `address_type` are optional.

    export interface SignupRequest {

      first_name: string;

      last_name: string;

      user_name: string;

      email: string;

      password: string;

      phone: string;

      line1: string;

      line2?: string;

      city: string;

      state: string;

      country: string;

      zip: string;

      address_type?: "HOME" | "WORK" | "OTHER";

    }

---

## Signup Response

    export interface SignupResponse {

      message: string;

    }

---

## Validation Error Response

    // Flat per-field map: { field: message }

    export interface FieldValidationErrors {

      [field: string]: string;

    }

    export interface ValidationErrorResponse {

      statusCode: number;            // 400

      error: string;                 // "Bad Request"

      message: string;               // "Validation failed"

      errors: FieldValidationErrors; // { email: "...", password: "..." }

    }

The per-field `{ field: message }` map is nested under the `errors` key — it is NOT the

top-level object. The top-level `message` is always the generic `"Validation failed"`.

Nested DTO fields would be dot-joined (e.g. `address.zip`), but since the signup DTO is

flat the keys are plain field names.

Example:

    {

      "statusCode": 400,

      "error": "Bad Request",

      "message": "Validation failed",

      "errors": {

        "email": "Please provide a valid email address",

        "password": "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character"

      }

    }

---

## Generic Error Response

Non-validation failures (401 invalid credentials, 409 duplicate email, 401 unauthorized

logout) use the standard NestJS exception shape — `message` is a single human-readable

string and there is no `errors` map.

    export interface ErrorResponse {

      statusCode: number;            // 401, 409, ...

      message: string;               // "Invalid email or password" / "An account with this email already exists"

      error: string;                 // "Unauthorized", "Conflict", ...

    }

---

## Logout Response

    export interface LogoutResponse {

      message: string;

    }

The backend logout returns only `{ message }` (HTTP 200). There is no `success`

boolean — derive UI success from the resolved/rejected thunk, not the payload.

---

## Auth Slice

Create: src/features/auth/authSlice.ts

Use:

- createSlice
- createAsyncThunk

---

## Authentication State

    interface AuthState {

      loading: boolean;

      isAuthenticated: boolean;

      success: boolean;

      message: string | null;

      errors: FieldValidationErrors | null;

    }

`errors` holds the flat per-field map only (the backend's `response.errors`), so

components can map messages straight onto form fields. The thunks must extract

`response.errors` from the `ValidationErrorResponse` envelope before storing it; a

non-validation failure (`ErrorResponse`) has no `errors` map — surface its top-level

`message` via `state.message` instead.

Initial state should be properly configured.

---

Async Thunks

Implement:

### Login

    loginUser

Calls: POST /auth/login

---

### Signup

    signupUser

Calls: POST /auth/signup

---

### Logout

    logoutUser

Calls: POST /auth/logout

---

## API Integration

Use: fetch()

for all API calls.

Requirements: credentials: "include"

must be sent with every authentication request because JWT is stored inside HTTP-only cookies.

---

## Fetch Error Handling

Unlike axios, `fetch()` does NOT reject on HTTP error status codes — a 400/401/409

response still resolves successfully. Each thunk must therefore inspect `res.ok`

itself and branch on the parsed body, then signal failure via `rejectWithValue`:

1. `await fetch(url, { method, credentials: "include", headers, body })`.

2. Parse the body once: `const data = await res.json()`.

3. If `res.ok` → return the success payload (`LoginResponse` / `SignupResponse` /

   `LogoutResponse`) so the `fulfilled` reducer runs.

4. If `!res.ok` → call `rejectWithValue(data)` so the `rejected` reducer receives

   the error body in `action.payload` (NOT `action.error`):

   - `res.status === 400` → `data` is `ValidationErrorResponse`; store `data.errors`

     in `state.errors`.

   - otherwise (401/409/…) → `data` is `ErrorResponse`; store `data.message` in

     `state.message`.

5. Wrap the call in try/catch for true network failures (offline, DNS, CORS) — the

   `catch` should `rejectWithValue` a synthetic `ErrorResponse`-shaped object so the

   reducer has a consistent payload to read.

Always read rejection data from `action.payload` (populated by `rejectWithValue`),

never `action.error.message` (which only carries the thrown `Error` string).

The thunk's `rejectValue` should be typed as

`ValidationErrorResponse | ErrorResponse` so reducers can narrow on the presence of

an `errors` map.

---

## Error Handling

A 400 validation failure arrives as the `ValidationErrorResponse` envelope. The flat

per-field map lives under the `errors` key:

    {

      "statusCode": 400,

      "error": "Bad Request",

      "message": "Validation failed",

      "errors": { "email": "Please provide a valid email address", "password": "..." }

    }

The thunk must store `response.errors` (the `FieldValidationErrors` map) inside

`state.errors` and display it per-field on the UI.

Non-validation failures (401/409) arrive as the `ErrorResponse` shape (no `errors`

map) — store the top-level `message` string in `state.message` and show it as a

form-level error.

---

## Login Page

Create: pages/Login/LoginPage.tsx pages/Login/Login.module.css

---

Design Requirements

Reference: screenshots/login_ui.png

The screenshot is the source of truth.

Requirements:

- Match layout structure
- Match spacing
- Match visual hierarchy
- Match typography
- Match button placement
- Match card styling

---

Login Form Fields

Required fields: Email Password

Buttons: Login

Links: Create Account

---

## Login Flow

1. User enters credentials

2. Submit dispatches loginUser thunk

3. Loading state shown

4. Success message handled

5. User redirected to home page after successful login

---

## Signup Page

Create: pages/Signup/SignupPage.tsx pages/Signup/Signup.module.css

Reference: screenshots/signup_ui.png

The screenshot is the source of truth.

---

## Additional Signup Requirement

Unlike the screenshot reference, the Fyndit signup form must include address information because backend signup creates a default address.

---

## Signup Form Fields

User Information: First Name Last Name User Name Email Password Phone Number

Address Information: Address Line 1 Address Line 2 City State Country Zip Code

Country: India

should be selected by default.

---

## Signup Flow

1. User fills form

2. Dispatch signupUser thunk

3. Loading state shown

4. Validation errors displayed

5. Success message displayed

6. Redirect user to Login Page

---

## Routing

Create routes for: /login /signup

Authentication pages should be accessible without login.

---

## Theme Requirements

Use the project theme defined in project context.

Required CSS Variables: :root { --color-primary: #1a2744; --color-primary-light: #243460; --color-primary-dark: #111a30; --color-accent: #ff5c35; --color-accent-hover: #e64d28; --color-surface: #f1f2f4; --color-surface-card: #ffffff; --color-text: #1a1a2e; --color-text-muted: #6b7280; --color-border: #e5e7eb; }

## Requirements:

- Consistent colors
- Consistent spacing
- Responsive design
- Mobile support
- Desktop support

---

## UX Requirements

Implement:

- Loading state during requests
- Disabled submit button during loading
- Validation error display
- Success feedback
- Accessible form labels
- Proper input focus states

---

## Acceptance Criteria

✓ Redux Toolkit installed

✓ Store configured successfully

✓ RootState exported

✓ AppDispatch exported

✓ useAppDispatch implemented

✓ useAppSelector implemented

✓ Auth types created

✓ Login request types created

✓ Signup request types created

✓ Error response types created

✓ Auth slice implemented

✓ Login async thunk implemented

✓ Signup async thunk implemented

✓ Logout async thunk implemented

✓ fetch API integration completed

✓ credentials: "include" configured

✓ Login page implemented

✓ Signup page implemented

✓ Login page follows login_ui.png

✓ Signup page follows signup_ui.png

✓ Signup includes address section

✓ Validation errors displayed correctly

✓ Loading states implemented

✓ Authentication routes configured

✓ Theme variables applied

✓ Mobile responsive

✓ Desktop responsive

✓ Project follows frontend development rules

---

## Post-Login Destination & Main Layout

After a successful login the user is redirected to the homepage. The homepage is
the landing surface for the authenticated app, so this feature must also introduce
the shared application layout that every post-auth page will render inside.

### Reference Screenshots

- `screenshots/homepage_ui.png` — upper homepage layout and the navbar
- `screenshots/homepage_lower_section_ui.png` — lower homepage sections and footer

The screenshots are the source of truth for the navbar and footer visuals.

### Main Layout

Create a `layouts/` folder:

    frontend/src/
    └── layouts/
        └── MainLayout/
            ├── MainLayout.tsx
            └── MainLayout.module.css

`MainLayout` composes the persistent page shell as three stacked regions:

1. **Navbar** — top navigation; derive its structure and styling from
   `screenshots/homepage_ui.png`.
2. **Outlet** — the React Router `<Outlet />` where the routed page renders.
3. **Footer** — bottom footer; derive its structure from
   `screenshots/homepage_lower_section_ui.png`.

### Routing Integration

- Wrap the authenticated/content routes (e.g. the homepage) with `MainLayout` so the
  navbar and footer persist across navigation while only the `Outlet` content changes.
- The `/login` and `/signup` pages are standalone and must NOT render inside
  `MainLayout` (they have their own full-screen auth layout per their screenshots).
