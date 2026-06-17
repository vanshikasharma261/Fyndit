# 005 — Products Page UI Improvement: Discount Badge

## Summary

A small, focused visual polish on the **products listing page** (`/product/:category`) to bring it in line with the prototype `products_page_clothing_category.png`. The single gap: the per-product **discount indicator on each product card** currently renders as plain accent‑coloured text (e.g. `5% off`), whereas the prototype shows it as a **badge** — a small rounded pill with a soft accent background sitting next to the price.

This is a CSS-only / presentation change. No API, data contract, Redux, routing, or business-logic changes are involved. The discount value, percentage computation (`formatDiscountBadge`), and where it appears in the card all stay exactly as they are.

## Background

Feature 004 shipped the listing page and computes the discount as a percentage from the flat discount amount via `formatDiscountBadge(price, discount)` in `frontend/src/utils/format.ts`. It is rendered on the card by `ProductCard` inside `frontend/src/pages/Products/ProductsPage.tsx`:

```tsx
{badge && <span className={styles.cardBadge}>{badge}</span>}
```

The `.cardBadge` class in `frontend/src/pages/Products/Products.module.css` is currently just coloured text:

```css
.cardBadge {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-accent);
}
```

The prototype shows this as a true badge — a pill with a light accent background, accent text, small horizontal padding, and rounded corners — visually distinct from the surrounding text.

## Scope

**In scope**

- Restyle `.cardBadge` in `frontend/src/pages/Products/Products.module.css` so the discount renders as a badge/pill matching `products_page_clothing_category.png`:
  - soft accent-tinted background
  - accent text
  - rounded corners (pill)
  - small horizontal + vertical padding
  - keeps the existing small font size / weight and its position next to the price in `.cardPriceRow`
- Use **theme variables only** (`--color-accent`, accent-subtle tints, radius/space tokens). If a suitable accent-subtle token does not exist in `frontend/src/styles/theme.css`, add one (mirroring the existing `--color-error-subtle` pattern) rather than hardcoding a colour.

**Out of scope**

- The product **detail/preview page** discount (`.discount` in `ProductDetail.module.css`) — the spec text and screenshot reference only the listing page card. Leave it unchanged unless a follow-up explicitly asks for it.
- Any change to `formatDiscountBadge`, the badge text/percentage logic, the API/`ProductListItem` contract, Redux, or routing.
- Card layout, image, name, brand, description, price formatting, grid, pagination, or filter sidebar.

## Implementation Notes

- The badge must align cleanly on the price row. `.cardPriceRow` uses `align-items: baseline`; a pill with vertical padding may need `align-self: center` (or switching the row to `center`) so the badge is vertically centred against the price rather than baseline-aligned. Verify against the screenshot.
- Keep the badge compact — it should not wrap or push the price. `white-space: nowrap` is appropriate.
- Reuse existing spacing/radius tokens (`--space-1`/`--space-2`, `--radius-*`). Prefer an accent-subtle background token over an ad‑hoc `rgba()`; add the token to `theme.css` if missing.

## Definition of Done

- ☐ Discount on each product **listing** card renders as a rounded pill/badge (soft accent background + accent text), matching `products_page_clothing_category.png`.
- ☐ Badge is vertically aligned with the price and does not wrap or shift the price.
- ☐ Theme variables only — no hardcoded colours; any new accent-subtle token added to `theme.css` following the existing convention.
- ☐ No change to badge text/percentage logic, API contract, Redux, or routing.
- ☐ Detail page left unchanged (out of scope).
- ☐ `npm run lint` and `npm run build` clean in `frontend/`.
- ☐ Verified visually against the prototype screenshot at desktop and mobile breakpoints (`≤900px`, `≤540px`).

## References

- Prototype (source of truth): `.claude/screenshots/products_page_clothing_category.png`
- `frontend/src/pages/Products/ProductsPage.tsx` — `ProductCard`, `.cardBadge` usage
- `frontend/src/pages/Products/Products.module.css` — `.cardBadge`, `.cardPriceRow`
- `frontend/src/utils/format.ts` — `formatDiscountBadge` (unchanged)
- `frontend/src/styles/theme.css` — theme tokens (existing `--color-error-subtle` is the pattern for any new accent-subtle token)
