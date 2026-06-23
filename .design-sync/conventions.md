# Fyndit Design System — how to build with it

Fyndit is a modern e-commerce UI: clean, spacious, Shopify/Apple-inspired, with a
navy primary and an orange accent. Build screens by composing the components
below; style your own layout glue with the design tokens. There is **no utility-class
system** and the component CSS-module class names are **not** part of the API —
drive appearance through props and tokens, never by inventing class names.

## Setup — no provider needed

The tokens are plain CSS custom properties defined at `:root` in `styles.css`
(which every design already receives). Just render the components from
`window.FynditUI` — there is no ThemeProvider or wrapper to mount. React is
provided globally.

```jsx
const { ProductCard, Button, OrderSummary, Card } = window.FynditUI;
```

## Components

`Button` · `Badge` · `StatusBadge` · `PriceTag` · `Card` · `ProductCard` ·
`QuantityStepper` · `TextField` · `SelectField` · `OrderSummary` · `EmptyState` ·
`Pagination` · `FilterSidebar` · `AddressCard`

Each component's `<Name>.d.ts` is the exact prop contract and `<Name>.prompt.md`
has usage notes + examples — read those before composing a component.

## Styling idiom: design tokens (CSS variables)

For your own spacing, color, and layout glue, use these tokens — never hardcode
hex values or invent class names:

- **Color** — `--color-primary` (#1a2744 navy), `--color-primary-light`,
  `--color-primary-dark`, `--color-accent` (#ff5c35 orange), `--color-accent-hover`,
  `--color-surface` (page bg), `--color-surface-card` (white card bg),
  `--color-text`, `--color-text-muted`, `--color-border`,
  `--color-success`, `--color-error`, and the subtle tints
  `--color-accent-subtle`, `--color-primary-light-subtle`, `--color-success-subtle`,
  `--color-error-subtle`.
- **Spacing** — `--space-1` (0.25rem) … `--space-8` (3rem).
- **Radius** — `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (16px),
  `--radius-pill`.
- **Elevation / focus** — `--shadow-card`, `--shadow-focus-accent`.

The accent (`--color-accent`) is for primary CTAs and highlights; the navy
(`--color-primary`) is for selected/active states and headings.

## Key prop conventions

- `Button` — `variant`: `primary` (accent CTA) · `secondary` (bordered) ·
  `danger` · `ghost`; `size`: `sm`|`md`|`lg`; `fullWidth`; `leadingIcon`.
- `Badge` — `tone`: `accent`|`primary`|`success`|`error`|`neutral`.
- `StatusBadge` — `status`: `PENDING`|`CONFIRMED`|`PACKED`|`SHIPPED`|`DELIVERED`|`CANCELLED`.
- `PriceTag` — `price`, optional `compareAt` (shows strike + % off), `size`.
- `ProductCard` — `name`, `brand`, `description`, `imageUrl`, `price`, `compareAt`.
- Form fields (`TextField`, `SelectField`) take `label` + `error` and own their
  focus ring; don't wrap them in your own label.

## One idiomatic example

```jsx
const { ProductCard, Button } = window.FynditUI;

function PopularPicks({ products, onOpen }) {
  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "var(--space-6)" }}>
      <h2 style={{ margin: "0 0 var(--space-5)", color: "var(--color-text)" }}>
        Popular Picks
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-5)" }}>
        {products.map((p) => (
          <ProductCard key={p.id} name={p.name} brand={p.brand}
            description={p.description} imageUrl={p.imageUrl}
            price={p.price} compareAt={p.compareAt} onSelect={() => onOpen(p)} />
        ))}
      </div>
      <Button variant="primary" size="lg" style={{ marginTop: "var(--space-6)" }}>
        View all
      </Button>
    </section>
  );
}
```
