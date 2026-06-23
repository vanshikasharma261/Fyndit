# Fyndit UI

The presentational component library for Fyndit — pure, prop-driven building
blocks extracted from the app and decoupled from Redux / React Router /
services / Stripe, so they render standalone (Claude Design, tests, future
reuse). Every component styles itself only through the design tokens in
[`tokens.css`](./tokens.css) (mirrors `src/styles/theme.css`).

## Usage

```tsx
import { Button, ProductCard, OrderSummary } from "@/ui";

<ProductCard
  name="Aurora Running Shoe"
  brand="Fyndit Sport"
  description="Lightweight daily trainer with a responsive foam midsole."
  imageUrl="/img/shoe.jpg"
  price={89.0}
  compareAt={120.0}
  onSelect={() => navigate(`/product/detail/${slug}`)}
/>

<Button variant="primary" size="lg" fullWidth>Proceed to Checkout</Button>
```

Importing from the barrel (`src/ui`) also loads the design tokens once.

## Components

| Component | Purpose | Used in |
|---|---|---|
| `Button` | Accent CTA / secondary / danger / ghost actions | everywhere |
| `Badge` | Discount / tag / status pills (`accent` `primary` `success` `error` `neutral`) | products, cart, addresses |
| `StatusBadge` | Order-status pill (PENDING…CANCELLED) | orders |
| `PriceTag` | Price + strike-through original + % off | home, products, cart, detail |
| `Card` | Base white surface card | summaries, panels |
| `ProductCard` | Product tile (image, title, brand, price) | home, products grid |
| `QuantityStepper` | +/- quantity control | cart |
| `TextField` | Labelled input with error state | checkout, profile, auth, address |
| `SelectField` | Labelled dropdown with error state | address, signup |
| `OrderSummary` | Totals breakdown + total + savings | cart, checkout |
| `EmptyState` | Empty cart / no orders / no results | cart, orders |
| `Pagination` | Page navigation | products, orders |
| `FilterSidebar` | Price slider + attribute facet pills | products |
| `AddressCard` | Saved address with actions | profile, checkout |

## Build

```bash
npm run build:ui   # → dist-ui/ (ESM bundle + style.css + .d.ts tree)
```

`dist-ui/` is what `/design-sync` imports to publish the library to
claude.ai/design. React is an externalized peer; everything else
(lucide-react, react-paginate, the CSS-module styles, the tokens) is bundled.
