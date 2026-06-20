# 010 — Home Page (Banner + Product Sections)

## Goal & Scope

Replace the current placeholder [HomePage.tsx](../frontend/src/pages/Home/HomePage.tsx)
with the full landing page that matches the lower-section screenshot: a top
banner image followed by horizontal rows of product cards grouped by theme.

**Frontend-only.** No backend, API, Redux, or database work.

### In scope

- Top banner rendered from `frontend/src/assets/hero_section.png`, with the two
  baked-in buttons made interactive via transparent overlay hotspots.
- Five product-card sections, each with a heading and exactly five cards:
  1. **Popular Picks**
  2. **Wear Your Favourite Team**
  3. **Style in Motion**
  4. **Mobiles**
  5. **Laptops**
- Card images are the **static** flixcart.com URLs taken verbatim from the raw
  spec TSX (no backend fetch, no load-more).
- Each card is clickable and navigates to its product category page.
- Responsive layout, theme variables, CSS Modules.

### Out of scope (deferred)

- Backend / dynamic product loading for the sections.
- Horizontal scroll + arrow "load more after five" behaviour (TSX comments).
- Re-creating the banner's text/CTA visuals as DOM (the image already has them
  baked in; we only overlay invisible click targets).
- The standalone footer in the raw TSX — `MainLayout` already renders the global
  footer; the page must **not** add a second one.

---

## Decisions (confirmed)

1. **Data source — static.** Hardcode the image URLs and category targets from
   the raw TSX. No API calls.
2. **Banner — image + interactive hotspots.** Render `hero_section.png`
   full-width as a static image. Overlay two transparent, absolutely-positioned
   clickable buttons aligned to the artwork's buttons:
   - **Start Finding Now** → `/product/All`
   - **Browse Categories** → `/product/All`
3. **Card rows — static five cards.** No scroll / arrow / load-more.
4. **Category slug correction.** The raw TSX targets (`Clothing`, `Shoes`,
   `Mobile`, `Laptop`) are not valid slugs in
   [categories.ts](../frontend/src/constants/categories.ts). They are remapped to
   real slugs so clicks land on populated category pages:

   | Raw TSX target | Real slug       |
   | -------------- | --------------- |
   | `Clothing`     | `clothing`      |
   | `Shoes`        | `footwear`      |
   | `Mobile`       | `mobile-phones` |
   | `Laptop`       | `laptops`       |

---

## Section → card mapping

Image URLs are taken directly from the raw spec TSX. Targets use the corrected
slugs above.

### Popular Picks → all `clothing`

1. `https://rukminim2.flixcart.com/fk-p-flap/700/860/image/2d9d8c9fb492dd38.jpg?q=60`
2. `https://rukminim2.flixcart.com/fk-p-flap/700/860/image/1821d69e76ee8892.jpg?q=60`
3. `https://rukminim2.flixcart.com/fk-p-flap/700/860/image/7438ed63ded19b99.jpg?q=60`
4. `https://rukminim2.flixcart.com/fk-p-flap/700/860/image/e0163ef246e375bc.jpg?q=60`
5. `https://rukminim2.flixcart.com/fk-p-flap/700/860/image/ac8e277f653c7994.jpg?q=60`

### Wear Your Favourite Team → all `clothing`

1. `…/700/1060/image/5bd22dbdc21e57ac.jpg?q=60`
2. `…/700/1060/image/f78294dc8af98998.jpg?q=60`
3. `…/700/1060/image/4d68f2710ca6c253.jpg?q=60`
4. `…/700/1060/image/47823f658f5280b9.jpg?q=60`
5. `…/700/1060/image/788bfcb9db241fa8.jpg?q=60`

### Style in Motion → mixed

1. `…/1668/2220/image/6d37add41d213973.jpg?q=60` → `clothing`
2. `…/1668/2220/image/f7dbce57472cf8a8.jpg?q=60` → `footwear` (crocs)
3. `…/1668/2220/image/7cd6d63ca018fdc8.jpg?q=60` → `footwear` (shoes)
4. `…/1668/2220/image/36f634428837c2a8.png?q=60` → `clothing`
5. `…/1668/2220/image/c149e2ffa7bf5083.jpg?q=60` → `clothing`

### Mobiles → all `mobile-phones`

1. `…/700/800/image/d9b00e8caa4f3277.jpg?q=60`
2. `…/700/800/image/5d530d8223692ec0.jpg?q=60`
3. `…/700/800/image/066e945b8dd4dfd8.jpg?q=60`
4. `…/700/800/image/74b3945b833bf02c.jpg?q=60`
5. `…/700/800/image/4f92df0f8d1e5b61.jpg?q=60`

### Laptops → all `laptops`

1. `…/700/1060/image/2451ec5d7348a2d5.png?q=60`
2. `…/700/1060/image/4e3df072a908cf94.png?q=60`
3. `…/700/1060/image/60125891fd394d41.png?q=60`
4. `…/700/1060/image/0cc1b052716ac056.png?q=60`
5. `…/700/1060/image/778ab5c5b67356c9.png?q=60`

(Full URLs preserved in implementation; abbreviated here for readability.)

---

## Frontend Plan

### Files

- **`frontend/src/pages/Home/HomePage.tsx`** — rewrite. Renders the banner + the
  five sections from a typed, in-file data structure (no hardcoded JSX
  repetition). Uses `useNavigate` for card and banner-button clicks.
- **`frontend/src/pages/Home/Home.module.css`** — rewrite to match the
  screenshot: page container, banner (relative wrapper + absolute hotspots),
  section heading, horizontal card row, product card.
- Banner asset: `frontend/src/assets/hero_section.png` (already present).

### Types / structure

A local typed model drives rendering (no `any`):

```ts
interface HomeCard {
  image: string;
  alt: string;
  category: string; // valid slug from categories.ts
}
interface HomeSection {
  title: string;
  cards: HomeCard[];
}
```

Sections are defined as a `const HOME_SECTIONS: HomeSection[]` and mapped to JSX.

### Behaviour

- Banner: `<img>` of `hero_section.png`, full-width, responsive. Two transparent
  overlay `<button>`s positioned over the artwork buttons, each →
  `navigate('/product/All')`, with `aria-label`s ("Start finding products",
  "Browse all categories").
- Each section: heading (`title`) + a row of five cards.
- Each card: image with `alt`; click → `navigate('/product/<category>')`.
- Cards and hotspots are keyboard-accessible (button semantics, focusable).

### Visual reference (source of truth)

- [homepage_lower_section_ui.png](../.claude/screenshots/homepage_lower_section_ui.png)
  — section headings + 5-card rows.
- [homepage_ui.png](../.claude/screenshots/homepage_ui.png) — overall page rhythm
  (banner at top, sections below). Banner artwork itself comes from
  `hero_section.png`, not this screenshot.

### Standards

- CSS Modules only; theme variables (`--color-*`, `--space-*`, `--radius-*`).
- TypeScript strict, no `any`.
- No new dependencies.

---

## Definition of Done

- [ ] `HomePage` renders the `hero_section.png` banner full-width at the top.
- [ ] The banner's two buttons are clickable and navigate to `/product/All`.
- [ ] Five sections render in order with correct headings and five cards each.
- [ ] Card images use the static URLs from the raw TSX.
- [ ] Clicking a card navigates to its **valid** category slug.
- [ ] No duplicate footer (global footer from `MainLayout` only).
- [ ] Layout matches the screenshot rhythm; responsive at mobile widths.
- [ ] `npm run lint` and `npm run build` pass in `frontend/`.
- [ ] Tests (Phase 4) and reviews (Phase 5) pass per workflow.
