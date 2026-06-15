# CLAUDE.md

This file provides guidance to Claude Code when working with the Fyndit repository.

---

# Project Overview

Fyndit is a modern full-stack e-commerce platform built using:

Frontend:

- React 19
- TypeScript
- Redux Toolkit
- React Router
- CSS Modules
- Stripe Elements

Backend:

- NestJS 11
- Prisma 7
- PostgreSQL
- JWT Authentication
- Passport Strategy
- Stripe Payments
- Nodemailer SMTP

The platform supports:

- User Authentication
- Product Discovery
- Product Search
- Category Browsing
- Cart Management
- Checkout
- Coupons
- Stripe Payments
- Cash On Delivery
- Order Management
- Address Management
- Invoice Emails

---

# Important Context Files

Before implementing any feature, ALWAYS consult the relevant context files.

Location:

.claude/context/

Files:

## project-overview.md

Contains:

- Product requirements
- User flows
- Features
- Theme information
- Layout structure
- Business goals

Read first when implementing new features.

---

## business-rules.md

Contains:

- Business constraints
- User rules
- Cart rules
- Checkout rules
- Order rules
- Payment rules

Must be followed strictly.

---

## development-rules.md

Contains:

- Coding standards
- NestJS architecture rules
- Redux rules
- DTO rules
- Validation rules
- Security requirements

Must be followed for every implementation.

---

## database-design.md

Contains:

- Entity relationships
- Database architecture
- Indexing strategy
- Money handling rules

Read before modifying database models.

---

## prisma-schema.md

Contains:

- Prisma 7 conventions
- Migration strategy
- Query standards
- Transaction requirements

Must be followed when editing schema.prisma.

---

# UI Design References

Design screenshots are available in:

screenshots/

Use these screenshots as the primary source of truth for layouts and visual implementation.

## Homepage

screenshots/homepage_ui.png

Contains:

- Main homepage layout
- Hero section
- Category sections
- Product sections
- General spacing and visual hierarchy

---

## Homepage Lower Sections

screenshots/homepage_lower_section_ui.png

Contains:

- Lower homepage content
- Additional product sections
- Footer-related layouts

---

## Cart

screenshots/cart_ui.png

Contains:

- Cart layout
- Cart item cards
- Order summary section

---

## Checkout (COD)

screenshots/checkout_cod_ui.png

Contains:

- Address selection
- Cash on Delivery flow
- Checkout summary

---

## Checkout (Stripe)

screenshots/checkout_stripe_ui.png

Contains:

- Stripe checkout flow
- Payment selection UI

---

## Stripe Payment Form

screenshots/stripe_payment_ui.png

Contains:

- Stripe Elements integration layout
- Card form UI

---

## Profile Dropdown

screenshots/dropdown_profile_ui.png

Contains:

- User profile dropdown
- Navigation actions

---

## Order History

screenshots/order_history_ui.png

Contains:

- Order history page
- Order card layouts
- Order details structure

---

# Repository Structure

Fyndit consists of two separate applications.

There is no monorepo tooling.

There is no root package.json.

Run commands from the respective application folder.

---

# Backend Structure

backend/

Main architecture:

src/

├── app/
├── auth/
├── user/
├── address/
├── product/
├── cart/
├── checkout/
├── payment/
├── order/
├── mail/
├── prisma/
├── constants/
├── common/
├── config/
└── types/

Rules:

- Feature-based architecture.
- One module per domain.
- Controllers contain no business logic.
- Services contain business logic.
- DTO validation required.
- PrismaService only.

---

# Frontend Structure

frontend/src/

├── layouts/
├── pages/
├── components/
├── features/
├── services/
├── store/
├── routes/
├── constants/
├── types/
└── assets/

Rules:

- Redux Toolkit for state management.
- AsyncThunk for API calls.
- CSS Modules only.
- No direct fetch calls inside components.
- Business logic belongs in slices/services.

---

# Theme

Primary Theme Variables:

```css
:root {
  --color-primary: #1a2744;
  --color-primary-light: #243460;
  --color-primary-dark: #111a30;

  --color-accent: #ff5c35;
  --color-accent-hover: #e64d28;

  --color-surface: #f1f2f4;
  --color-surface-card: #ffffff;

  --color-text: #1a1a2e;
  --color-text-muted: #6b7280;

  --color-border: #e5e7eb;
}
```

Design Style:

- Modern Ecommerce
- Shopify-inspired
- Apple-inspired
- Clean and spacious
- Product-focused
- Responsive
- Minimal shadows
- Soft borders
- Consistent spacing

---

# Database Rules

Database:

- PostgreSQL

ORM:

- Prisma 7

Important:

- Never use db push.
- Always use migrations.
- Use Decimal for money values.
- Use transactions for order placement.
- Use PrismaService only.

Commands:

```bash
npx prisma migrate dev
npx prisma migrate deploy
npx prisma generate
```

---

# Backend Commands

```bash
cd backend

npm run start:dev
npm run build
npm run start:prod

npm run lint

npm test
npm run test:watch
npm run test:cov
npm run test:e2e
```

---

# Frontend Commands

```bash
cd frontend

npm run dev
npm run build
npm run preview

npm run lint
```

---

# Implementation Priorities

When implementing features:

1. Read project-overview.md
2. Read business-rules.md
3. Read development-rules.md
4. Read database-design.md if database changes are required
5. Read prisma-schema.md if schema changes are required
6. Check screenshots/ for UI references
7. Follow existing project structure
8. Keep code production-ready
9. Maintain TypeScript strict compatibility
10. Follow Prisma 7 best practices

---

# General Rules

- Never use any.
- Prefer interfaces for contracts.
- Prefer composition over duplication.
- Reuse DTOs when possible.
- Reuse components when possible.
- Keep files focused and small.
- Maintain feature isolation.
- Follow existing naming conventions.
- Do not introduce new architectural patterns without necessity.

# Available Review Agents

Use these agents after completing features.

## fyndit-quality-reviewer

Review:

- Architecture
- Maintainability
- Code quality

## fyndit-prisma-reviewer

Review:

- Prisma schema
- Queries
- Transactions
- Indexes

## fyndit-security-reviewer

Review:

- Authentication
- Authorization
- Ownership checks
- Stripe security

## fyndit-ui-reviewer

Review:

- Screenshot compliance
- Layout
- Theme
- Responsiveness

## fyndit-redux-reviewer

Review:

- Redux Toolkit
- Async thunks
- State management

## fyndit-api-reviewer

Review:

- API contracts
- DTOs
- Response consistency
