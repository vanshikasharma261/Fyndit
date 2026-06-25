# Fyndit Project Specifications

# Problem (Core Idea)

Modern e-commerce websites often overwhelm users with cluttered interfaces, slow checkout experiences, and complicated navigation.

Fyndit aims to provide a clean, modern, and smooth shopping experience where users can quickly discover products, manage their cart, complete purchases, and track orders with minimal friction.

The platform focuses on:

- Fast product discovery
- Category-based shopping
- Intelligent search
- Smooth checkout experience
- Secure authentication
- Multiple payment methods
- Order management
- Mobile-friendly responsive design

The goal is to create a professional full-stack e-commerce platform similar to modern experiences provided by Amazon, Myntra, Flipkart, and Shopify-powered stores while maintaining a simpler and cleaner user experience.

---

# Users

Fyndit is an authenticated-only application. There is no guest browsing — every
content page (homepage, listing, detail, cart, checkout, orders, profile)
requires a signed-in session. Unauthenticated visitors are redirected to login
before any protected page renders or any data fetch runs.

## Authenticated User

Can:

- Login / Logout
- Browse homepage
- Browse categories
- Search products
- View product details
- Manage profile
- Manage addresses
- Add to cart / update quantity / remove items
- Apply / remove coupons
- Checkout (Cash on Delivery or Stripe card)
- Place orders
- View order history
- Cancel eligible orders

---

# Features

## A. Authentication

Authentication is handled using JWT Authentication and Passport Strategy.

Features:

- User Signup
- User Login
- JWT Access Token
- Protected Routes
- Logout
- Soft Deleted User Protection
- Active User Validation

---

## B. Homepage

Homepage serves as the primary discovery page.

Sections:

- Hero Banner
- Promotional Banners
- Featured Categories
- Trending Products
- New Arrivals
- Best Sellers
- Search Bar
- Footer Information

Homepage should be optimized for performance and engagement.

---

## C. Product Discovery

Users can browse products using:

### Search

Search should support:

- Product Name
- Brand Name
- Category Name
- Keywords

Examples:

- "Nike Shoes"
- "Mobiles"
- "Headphones"
- "Under 500"
- "Below 1000"

### Category Browsing

Users can browse:

- Parent Categories
- Child Categories

Example:

Electronics
├── Mobile Phones
├── Laptops
└── Accessories

Fashion
├── Men
├── Women
└── Footwear

---

## D. Product Details

Each product page should display:

- Product Images
- Product Name
- Brand
- Description
- Available Variants
- Attributes
- Pricing
- Discount
- Stock Availability

---

## E. Cart

Each authenticated user owns exactly one cart.

Features:

- Add Item
- Remove Item
- Update Quantity
- Apply Coupon
- Remove Coupon
- View Cart Summary

Rules:

- Quantity cannot exceed stock.
- Quantity cannot be below 1.

---

## F. Checkout

Checkout validates inventory before order placement.

Features:

- Inventory Verification
- Coupon Validation
- Shipping Fee Calculation
- Order Summary Generation

Summary Includes:

- Subtotal
- Coupon Discount
- Shipping Charges
- Final Total

---

## G. Payments

### Cash On Delivery

- Order created immediately
- Payment Status = Pending

### Stripe Payments

- Create Payment Intent
- Confirm Payment
- Create Order After Successful Payment

Payment statuses:

- Pending
- Paid
- Failed
- Refunded

---

## H. Orders

Users can:

- Place Order
- View Order History
- View Single Order
- Cancel Order

Order Status Flow:

PENDING
→ CONFIRMED
→ PACKED
→ SHIPPED
→ DELIVERED

Cancellation allowed only before SHIPPED.

---

## I. Address Management

Users can:

- Add Address
- Update Address
- Delete Address (Soft Delete)
- Select Address During Checkout

Address Types:

- Home
- Work
- Other

---

## J. Email System

Order placement (both COD and Stripe) triggers a fire-and-forget email:

- **HTML email** rendered from `order-confirmation.hbs` (Handlebars template)
- **PDF invoice** generated from `invoice.hbs` via Puppeteer (headless Chromium
  → A4 PDF), attached to the email
- Delivered via Nodemailer SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM` env vars)

PDFs are stored permanently in `backend/assets/invoices/` and are NOT publicly
accessible (Express middleware blocks the path).

Email failures are logged and silently discarded — they never block or roll back
an order.

---

# Data Models

Core Entities:

- User
- Address
- Category
- Product
- ProductVariant
- ProductImage
- Cart
- CartItem
- Order
- OrderItem

---

# Tech Stack

## Frontend

- React 19
- TypeScript
- Redux Toolkit
- React Router
- Stripe Elements
- CSS Modules

## Backend

- NestJS
- Prisma 7
- PostgreSQL
- JWT
- Passport
- Stripe
- Nodemailer
- Puppeteer (PDF generation)
- Handlebars (email + invoice templates)

---

# Theme System

Fyndit uses a modern ecommerce theme inspired by Shopify and Apple Store interfaces.

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

Design Principles:

- Clean
- Spacious
- Modern
- Product Focused
- Mobile Responsive

---

# Layout

## Global Layout

Navbar
↓
Page Content
↓
Footer

---

## Navbar

Contains:

- Logo
- Search Bar
- Categories Dropdown
- Cart Icon
- Profile Menu

---

## Homepage Layout

Hero Banner

Featured Categories

Trending Products

New Arrivals

Promotional Banner

Best Sellers

Footer

---

## Product Listing Page

Filters Sidebar

Products Grid

Pagination

---

## Product Details Page

Product Gallery

Product Information

Variant Selector

Add To Cart

Related Products

---

## Cart Page

Reference: screenshots/cart_ui.png

- Cart Items list
- Cart Summary (shown before any coupon is applied)
- Checkout Button

---

## Checkout Page

References:
- screenshots/checkout_cod_ui.png — Cash on Delivery flow
- screenshots/checkout_stripe_ui.png — Stripe card payment flow

The user moves to checkout to:

- Select a delivery address
- Select a payment option (Cash on Delivery or Stripe card)
- Review the Checkout Summary

Checkout Summary includes:

- Subtotal
- Coupon discount
- Shipping fee
- Final total

Coupon application happens on this page, before any payment is made: the user
can apply a valid coupon (the discount is reflected in the summary) and remove
it again before placing the order.

Place Order Button

---

# Development Goals

- Clean Architecture
- Feature-Based Structure
- Reusable Components
- Type Safety
- Responsive Design
- Production-Ready Code
- Scalable Backend
- Prisma 7 Best Practices
- AI-Assisted Development Friendly Structure
