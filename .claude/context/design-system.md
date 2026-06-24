# Fyndit Design System

This file governs how Fyndit's UI is designed and how designs become app code. Read
it before running `/design`, before reforming any screen, and before adding a UI
primitive. It is the single source of truth for the design system; the files it
points to (`conventions.md`, the component `.d.ts`/`.prompt.md`, `NOTES.md`) are
canonical for their specifics — link to them, don't duplicate them here.

---

## What the design system is

The design system is **`frontend/src/ui/`** — a presentational component library of
15 prop-driven, token-styled building blocks **extracted** from the Fyndit app and
**decoupled** from Redux / React Router / services / Stripe so they render
standalone. It is **hand-maintained** (extracted, not a published package): new app
components do **not** appear here automatically.

That library is published to the **claude.ai/design "Fyndit Design System"** project
(id `b3bd2271-d97f-487e-ba6d-d74ab36b9927`, see `.design-sync/config.json`) so
screens can be designed against the real components. So there are **two surfaces**
for the same components, and the rules differ between them:

| | Design surface (claude.ai/design) | App surface (`frontend/`) |
|---|---|---|
| Import | `const { Button } = window.FynditUI` (global) | `import { Button } from "../../ui"` (relative — no `@` alias exists) |
| Styling glue | inline `style={{ ... }}` using **tokens** | **CSS Modules** using the same tokens (`theme.css`) |
| Wiring | none — presentational only | Redux slices / services / Router / Stripe |
| Purpose | prototype + agree on layout | shippable feature |

The components are identical; only the glue and wiring change. A design is a
**visual contract**, not code to paste.

---

## Component catalog

`Button` · `Badge` · `StatusBadge` · `PriceTag` · `Card` · `ProductCard` ·
`QuantityStepper` · `TextField` · `SelectField` · `OrderSummary` · `EmptyState` ·
`Pagination` · `FilterSidebar` · `AddressCard` · `Timeline`

Exported from the barrel `frontend/src/ui/index.ts` (importing it also loads the
tokens). The per-component contract lives in:

- `.design-sync/conventions.md` — token vocabulary + the key prop conventions
  (`Button` variants, `Badge`/`StatusBadge` tones, `PriceTag` `compareAt`, form-field
  rules, etc.). **Read this first when composing.**
- `frontend/src/ui/README.md` — what each component is and where it's used in the app.
- Each component's `<Name>.d.ts` (exact prop contract) and `<Name>.prompt.md` (usage
  notes + examples) on the design surface.

The component CSS-module class names are **not** an API — never style by inventing or
targeting class names. Drive appearance through **props** and **tokens** only.

---

## Token vocabulary

Style your own layout/spacing/color glue with the design tokens — never hardcode hex
values. The full enumerated list lives in `.design-sync/conventions.md`; the summary:

- **Color** — `--color-primary` (#1a2744 navy) + light/dark, `--color-accent`
  (#ff5c35 orange) + hover, `--color-surface` / `--color-surface-card`,
  `--color-text` / `--color-text-muted`, `--color-border`, `--color-success` /
  `--color-error`, and the subtle tints (`--color-accent-subtle`,
  `--color-primary-light-subtle`, `--color-success-subtle`, `--color-error-subtle`).
- **Spacing** — `--space-1` (0.25rem) … `--space-8` (3rem).
- **Radius** — `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (16px),
  `--radius-pill`.
- **Elevation / focus** — `--shadow-card`, `--shadow-focus-accent`.

Accent = primary CTAs and highlights; navy = selected/active states and headings.

The tokens are defined **twice on purpose** — `frontend/src/styles/theme.css` (the
app) and `frontend/src/ui/tokens.css` (the library, mirrors theme.css). On the design
surface they arrive as `:root` custom properties in `styles.css` automatically (no
ThemeProvider). **Drift guard: if you change `theme.css`, mirror it into `tokens.css`
in the same change** or the design system diverges from the app.

---

## Running `/design` (Claude Design flow)

When `/design` runs, you are composing screens **in the claude.ai/design "Fyndit
Design System" project**, not editing the app. Rules:

1. **Target the Fyndit Design System project** (id above). Don't create a new
   project; the library is already imported there.
2. **Compose from `window.FynditUI` components.** Read `.design-sync/conventions.md`
   and the relevant `<Name>.d.ts` / `<Name>.prompt.md` before using a component.
3. **Tokens for all glue.** Layout, spacing, and color come from the tokens via
   inline `style`. **No hardcoded hex, no invented class names, no utility-class
   system** (there isn't one).
4. **Presentational only.** Do not wire Redux, Router, services, or Stripe. Feed
   components plain props / mock data; represent actions as no-op handlers.
5. **Screenshots remain the source of truth** for any screen that has one (see
   CLAUDE.md → UI Design References / `.claude/screenshots/`). The design must match
   the screenshot's layout, hierarchy, and spacing rhythm.
6. **If the library is missing a piece**, do not hack around it with raw markup that
   reinvents a component. Either compose it from existing components + tokens, or
   **flag it as a new primitive** (see "Adding a new primitive") and get the user's
   decision before designing around it.

The output of a design session is an **approved visual prototype** that becomes a
source of truth for implementation, alongside the screenshot.

---

## Bringing a design into app code (design → code)

When implementing an approved design in `frontend/`, translate — do not paste:

- **Imports:** `window.FynditUI.X` → `import { X } from "../../ui"` (relative path; no `@` alias is configured in `vite.config.ts` or `tsconfig.app.json`).
- **Styling:** the prototype's inline token styles → **CSS Modules** (`*.module.css`)
  that use the **same tokens** from `theme.css`. The app rule is **no inline styling**
  (`development-rules.md` → Frontend / Styling Rules) — the inline styles only existed
  to glue the prototype together.
- **Wiring:** add the Redux/Router/services/Stripe the prototype omitted, per
  `development-rules.md` (feature folder `slice.ts`/`service.ts`/`types.ts`, async
  thunks only, no fetch in components). A purely presentational page may keep its
  content in a local typed constant with no slice/service.
- **Keep the split:** `@/ui` components stay prop-driven and presentational; business
  logic and data live in slices/services. Don't push app concerns into `src/ui`.
- **Reuse the library.** Prefer an existing `@/ui` component over re-building one
  inline in a page; that's why the library exists.

---

## Adding a new primitive

Only when a genuinely reusable building block is missing (not a one-off page layout).
Because the library is hand-maintained and feeds the design surface, all of these
steps are required so the two surfaces stay in sync:

1. Create `frontend/src/ui/<Name>/<Name>.tsx` + `<Name>.module.css` — prop-driven,
   **decoupled** from Redux/Router/services/Stripe, styled **only** through tokens.
2. Export it (default + prop types) from the barrel `frontend/src/ui/index.ts`.
3. Add an authored preview at `.design-sync/previews/<Name>.tsx` (graded "good" — no
   floor cards; see `NOTES.md`).
4. If it introduced new tokens, add them to **both** `theme.css` and `tokens.css`.
5. Update `.design-sync/conventions.md` — add the component to the list and document
   its key props (this header enumerates component + token names).
6. Rebuild and re-sync (below).

---

## Sync pipeline + invariants

The library reaches claude.ai/design via `.design-sync/` (config + `conventions.md`
header + authored previews) and the build output:

- **Build first:** `npm --prefix frontend run build:ui` → `frontend/dist-ui/` (ESM
  bundle + `style.css` + `.d.ts` tree; gitignored). This is `cfg.buildCmd`.
- Run the converter/driver from the **repo root**; config home is the repo-root
  `.design-sync/`. Exact `--entry` / `--node-modules` / `--out` flags and the
  externals that must stay externalized (`react`, `react-dom`, `react/jsx-runtime`,
  `lucide-react`, `react-paginate`) are documented in **`.design-sync/NOTES.md`** —
  read it before any re-sync; getting externals wrong yields `[BUNDLE_EXPORT]` 0
  components.

Invariants to protect (from `NOTES.md`):

- `frontend/package.json` `module`/`types` must keep pointing at `dist-ui/` — removing
  them makes component discovery return `[ZERO_MATCH]`.
- `tokens.css` mirrors `theme.css` — keep them in lockstep.
- `conventions.md` enumerates token + component names — re-validate them against the
  fresh build on every re-sync; update the header if any name changes.
- New app components don't sync automatically — add them to `src/ui` + the barrel.

---

## Source-of-truth precedence

1. **Screenshots** (`.claude/screenshots/`) — layout + visual truth for screens that
   have one.
2. **Approved `/design` prototype** — the agreed composition for screens being newly
   designed or reformed.
3. **`@/ui` components + tokens** — the implementation vocabulary; never bypass them
   with raw markup or hardcoded values.

When these conflict, ask the user rather than guessing.

---

## Known gaps / gotchas

**No `@` path alias.** The README and older docs use `@/ui` as shorthand, but
`vite.config.ts` and `tsconfig.app.json` define no alias. All app imports must use
relative paths, e.g. `import { Button } from "../../ui"`.

**No font-size or fixed-sizing token scale.** The token set covers color, spacing
(`--space-*`), radius (`--radius-*`), and elevation. For component-internal fixed
pixel dimensions (e.g. dot size, icon size) where no spacing token fits exactly, raw
`px` / `rem` values in component CSS modules are acceptable and consistent with
existing practice. Do not introduce new tokens for component-private sizes.

**`OrderStatus` lives in `frontend/src/types/order.types.ts`.** Import it from there;
do not re-declare the union inside individual components (e.g. `StatusBadge` has a
duplicate that should be migrated).

**Timeline connector fill direction.** The outgoing connector (right-side span) of a
step fills green when *that step* is `complete` — not when the next step is complete.
The condition is `step.state === "complete"`, not `steps[index + 1].state === "complete"`.
Getting this backwards leaves a grey gap between the last complete node and the current
dot on any in-progress order.
