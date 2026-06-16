# Feature Specification: Authentication Module

## Feature Overview

This feature implements the complete authentication system for the Fyndit backend.

The authentication module is responsible for:

- User Registration (Signup)
- User Login
- User Logout
- JWT Token Generation
- JWT Validation
- Protected Route Authentication
- User Active Session Verification
- Request User Context Injection

The implementation must use:

- NestJS Authentication Module
- Passport JWT Strategy
- JWT Authentication Guard
- bcrypt Password Hashing
- HTTP Only Cookies for Token Storage

The implementation must follow all project standards defined in:

- `.claude/context/project-overview.md`
- `.claude/context/business-rules.md`
- `.claude/context/development-rules.md`
- `.claude/context/database-design.md`
- `.claude/context/prisma-schema.md`

---

# Objectives

After implementation the application should support:

- User Signup
- User Login
- User Logout
- JWT Authentication
- Protected Routes
- Cookie-Based Authentication
- Request User Injection
- Active User Verification

---

# Module Structure

Required structure:

```text
backend/
└── src/
    └── auth/
        ├── auth.module.ts
        ├── auth.controller.ts
        ├── auth.service.ts
        │
        ├── dto/
        │   ├── login.dto.ts
        │   └── signup.dto.ts
        │
        ├── guards/
        │   └── jwt-auth.guard.ts
        │
        └── strategies/
            └── jwt.strategy.ts

src/
├── constants/
│   └── messages.constant.ts
│
└── types/
    └── express.d.ts
```

---

# Authentication Strategy

Use:

- Passport JWT Strategy
- JwtModule
- JwtService
- JwtAuthGuard

The JWT Strategy must:

1. Extract JWT from cookies
2. Validate JWT signature
3. Validate JWT expiration
4. Attach user information to `req.user`

---

# JWT Payload

JWT payload must contain:

```ts
{
  sub: string;
  email: string;
}
```

Where:

```ts
sub = user_id;
```

---

# Express User Type

Create:

```text
src/types/express.d.ts
```

Augment Express namespace:

```ts
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
    }
  }
}
```

After successful authentication:

```ts
req.user = {
  id,
  email,
};
```

---

# Login Endpoint

## Route

```http
POST /auth/login
```

---

## DTO

Create:

```text
login.dto.ts
```

Fields:

```ts
{
  email: string;
  password: string;
}
```

Validation:

### Email

- Required
- Valid Email Format

### Password

- Required
- Cannot be empty

---

## Validation Error Format

Validation errors must be transformed into a frontend-friendly object.

Example:

```json
{
  "email": "Not a valid email",
  "password": "Password is required"
}
```

Do not return the default NestJS validation array format.

Implement a global validation exception formatter if required.

---

## Login Flow

1. Validate DTO
2. Find user by email
3. Verify password using bcrypt
4. Generate JWT token
5. Set JWT token in HTTP-only cookie
6. Set user `is_active = true`
7. Return success response

---

## JWT Cookie

Store JWT using HTTP-only cookie.

Requirements:

- httpOnly: true
- sameSite: strict
- secure: based on environment

---

## Success Response

```json
{
  "success": true,
  "message": "User logged in successfully"
}
```

Message must come from:

```text
src/constants/messages.constant.ts
```

Example:

```ts
AuthMessages = {
  loginSuccessMessage: "User logged in successfully",
};
```

---

# Signup Endpoint

## Route

```http
POST /auth/signup
```

---

## DTO

Create:

```text
signup.dto.ts
```

---

## Request Body

Must contain:

```ts
{
  first_name: string;
  last_name: string;
  user_name: string;
  email: string;
  password: string;
  phone: string;

  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  }
}
```

---

## Validation Rules

### Email

- Required
- Must be valid email

### Password

Must:

- Be at least 8 characters
- Contain uppercase letter
- Contain lowercase letter
- Contain number
- Contain special character

### First Name

- Required
- Cannot be empty

### Last Name

- Required
- Cannot be empty

### User Name

- Required
- Cannot be empty

### Phone

- Required
- Must be exactly 10 digits

### Address Line 1

- Required
- Cannot be empty

### Address Line 2

- Required
- Cannot be empty

### City

- Required
- Cannot be empty

### State

- Required
- Must be a valid Indian state

### Country

- Must equal:

```text
India
```

### Zip Code

- Must contain exactly 6 digits

---

## Signup Flow

1. Validate DTO
2. Check email uniqueness
3. Hash password using bcrypt
4. Create User
5. Create Default Address
6. Return success response

---

## User Defaults

On signup:

```ts
is_active = false;
session_active = false;
is_deleted = false;
deleted_at = null;
```

Database will automatically maintain:

```ts
created_at;
updated_at;
```

---

# Migration Requirement

Create a migration that adds:

```ts
is_deleted Boolean @default(false)
```

to the User model.

Purpose:

Soft delete support.

Deleted users should remain in the database.

---

# Logout Endpoint

## Route

```http
POST /auth/logout
```

Protected Route:

```ts
@UseGuards(JwtAuthGuard)
```

---

## Logout Flow

1. Read current user from req.user
2. Set user is_active = false
3. Clear authentication cookie
4. Return success response

---

# Active User Utility

Inside:

```text
auth.service.ts
```

Create:

```ts
async isUserActive(
  userId: string,
): Promise<boolean>
```

Purpose:

Verify the current user still has an active session.

---

## Why This Utility Exists

JWT tokens remain valid until expiration.

A user may:

- Logout manually
- Be deactivated by the system

In those cases the JWT may still exist.

Business modules must be able to verify:

```ts
user.is_active === true;
```

before executing protected business logic.

---

## Usage

Future modules:

- Cart
- Checkout
- Orders
- Address
- User

will call:

```ts
await authService.isUserActive(user.id);
```

before executing sensitive operations.

---

# Security Requirements

Passwords must:

- Never be returned in responses
- Never be logged

Use:

```ts
bcrypt.hash();
bcrypt.compare();
```

JWT Secret must come from:

```env
JWT_SECRET=
```

Never hardcode secrets.

---

# Acceptance Criteria

✓ AuthModule created

✓ Login endpoint implemented

✓ Signup endpoint implemented

✓ Logout endpoint implemented

✓ Passport JWT Strategy implemented

✓ JwtAuthGuard implemented

✓ JWT token generated successfully

✓ JWT token stored in HTTP-only cookie

✓ JWT token validated successfully

✓ req.user populated correctly

✓ Express.User type augmentation created

✓ Password hashing implemented

✓ Password comparison implemented

✓ Validation DTOs created

✓ Validation error response transformed

✓ User active utility implemented

✓ Logout updates user is_active status

✓ User model contains is_deleted field

✓ Migration generated successfully

✓ All messages sourced from messages.constant.ts

✓ No authentication secrets hardcoded
