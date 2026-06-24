# 011 — Order Tracking Timeline

> Structured spec (workflow Phase 1). Raw definition: add an order-status tracking
> timeline to the order detail screen, built as a reusable design-system primitive,
> to exercise the design→code workflow end-to-end. Restructured per `workflow.md`;
> every decision below was taken with the user (Phase-1 Q&A) — no scope invented.

## Goal

Give the order detail screen a **visual status timeline** that shows where an order
sits in its lifecycle (`PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`, with
`CANCELLED` as a terminal off-path state), rendered through a new **reusable
`@/ui` `Timeline` primitive**. Purely presentational and frontend-only — derived from
the order's existing single `status` field.

## Scope

**In scope**

- A new generic, prop-driven `@/ui` **`Timeline`** primitive (token-styled, decoupled).
- A page-level helper that derives the order's timeline steps from `status` + `created_at`.
- Integrating the timeline into `OrderDetailPage`.
- **In-scope reform:** replace the inline `statusPill` in `OrderDetailPage`
  ([OrderDetailPage.tsx:92-98](../frontend/src/pages/Orders/OrderDetailPage.tsx#L92-L98))
  with the `@/ui` `StatusBadge` (closes a reuse gap the ui-reviewer flags; the status
  sits next to the new timeline).
- Publishing the new primitive to the Fyndit Design System (design-sync).

**Out of scope (confirmed)**

- **No backend / no migration.** Decided frontend-only, derived: there are no
  per-status timestamps and nothing advances an order past `PENDING` today, so the
  timeline is computed from the current `status`. The only real date shown is the
  "Placed" step's `created_at`. (Adding an `OrderStatusHistory` table for real
  per-step timestamps was explicitly deferred.)
- No status-advancement / admin flow, no new order fields, no OrdersPage (history)
  redesign beyond the StatusBadge swap if trivial.

## Backend plan

**None.** No modules, endpoints, DTOs, schema, or migrations change. The existing
`OrderDetail` payload (`status`, `created_at`) already carries everything needed.

## Frontend plan

### 1. New design-system primitive — `frontend/src/ui/Timeline/`

Generic and presentational (no Redux/Router/services), styled **only** through tokens
(per `design-system.md`). The order-specific derivation lives in the page, not here.

- `Timeline.tsx` + `Timeline.module.css`
- Contract:
  ```ts
  export type TimelineStepState = "complete" | "current" | "upcoming" | "cancelled";
  export interface TimelineStep {
    id?: string;
    label: string;       // e.g. "Shipped"
    caption?: string;    // e.g. the order date on the Placed step
    state: TimelineStepState;
  }
  export interface TimelineProps {
    steps: TimelineStep[];
    orientation?: "horizontal" | "vertical"; // default "horizontal"
  }
  ```
- Visuals (tokens only): node + connector per step. `complete` → success fill /
  `--color-success`; `current` → accent ring (`--color-accent`, `--shadow-focus-accent`);
  `upcoming` → muted (`--color-border` / `--color-text-muted`); `cancelled` → error
  (`--color-error`, `--color-error-subtle`) terminal node with an ✕ glyph. Connector
  between two completed nodes is filled; to/within upcoming is muted. Responsive:
  horizontal on desktop, collapses to vertical (or wraps) on narrow widths.
- Accessible: ordered list semantics; current step marked `aria-current="step"`;
  state conveyed by text/icon, not color alone.

### 2. Derivation helper (page-level)

A pure, typed helper (in `pages/Orders/` or `utils/`) — `buildOrderTimeline(status,
createdAt): TimelineStep[]`:

- Lifecycle order: **Placed (PENDING) → Confirmed (CONFIRMED) → Packed (PACKED) →
  Shipped (SHIPPED) → Delivered (DELIVERED)**.
- Non-cancelled: node at the current status = `current` (or `complete` when status is
  the terminal `DELIVERED`); earlier nodes = `complete`; later = `upcoming`. The
  "Placed" node's `caption` = `formatOrderDate(created_at)`.
- `CANCELLED`: emit `[Placed (complete, dated), Cancelled (cancelled)]` — the unreached
  middle nodes are dropped (no history exists to know how far it got).

### 3. `OrderDetailPage` integration

- Render `<Timeline steps={buildOrderTimeline(detail.status, detail.created_at)} />`
  near the summary header (exact placement decided in Phase 2 — Design).
- Swap the inline `statusPill` for `<StatusBadge status={detail.status} />`.

### 4. Design-sync (publish the primitive)

Per `design-system.md` → *Adding a new primitive*: export `Timeline` from
`frontend/src/ui/index.ts`; add `.design-sync/previews/Timeline.tsx`; add it to the
component list + key props in `.design-sync/conventions.md`; (no new tokens expected —
reuse existing); `npm --prefix frontend run build:ui`; re-sync to the Fyndit Design
System project per `.design-sync/NOTES.md`.

### Types

Reuse `OrderStatus` from `types/order.types.ts`. New `Timeline*` types live with the
component. No API-contract type changes.

## Phase 2 — Design (claude.ai/design)

Before implementing, prototype the timeline in the Fyndit Design System project using
`window.FynditUI` + tokens, agree the visual treatment + placement on the detail page,
and get approval. The timeline node/connector treatment is the main design decision.

## Screenshot references

- `.claude/screenshots/order_detail_ui.png` — the detail layout the timeline slots
  into (source of truth for surrounding chrome/spacing).
- `.claude/screenshots/order_history_ui.png` — status pill styling reference.
- There is **no** screenshot of the timeline itself → the approved Phase-2 design is
  its source of truth.

## Definition of Done

- [ ] `@/ui` `Timeline` primitive: generic, prop-driven, **tokens only** (no hardcoded
      colors, no inline styles), decoupled from Redux/Router/services, accessible.
- [ ] `buildOrderTimeline` helper: typed (no `any`), covers every `OrderStatus`
      including `CANCELLED` terminal node and the `DELIVERED` complete case.
- [ ] `OrderDetailPage` renders the timeline and uses `@/ui` `StatusBadge` (inline
      `statusPill` removed).
- [ ] Primitive published: barrel export + `.design-sync/previews/Timeline.tsx` +
      `conventions.md` updated + `build:ui` clean + re-synced.
- [ ] Tests (Phase 5): Vitest/RTL for `Timeline` (each state renders) and
      `buildOrderTimeline` (all statuses + cancelled), plus an `OrderDetailPage`
      assertion; extend the order Playwright e2e to assert the timeline. Coverage reported.
- [ ] Reviews (Phase 6) pass — especially `fyndit-ui-reviewer` (design-system reuse,
      tokens, no inline styles, no token/primitive drift).
- [ ] `frontend` `npm run lint` + `npm run build` clean; no new dependencies.

## Branch

`feature/order-tracking-timeline` (cut from `main`).
