# Fyndit Development Workflow

This is the mandatory delivery workflow for every feature. The phases run in
order — do not start a phase until the previous one is complete. No feature is
"done" until all phases have passed.

---

## Phase 1 — Spec

The user provides a **raw definition** of the feature (a rough description, in a
spec file or message). Structure that raw definition into a proper, well-formed
spec at `specs/00X-<feature>.md` — do not invent scope.

While structuring:

- Take the user's **permission and choices for every change or decision** — do
  not silently add, drop, or reinterpret requirements. Where the raw definition
  is ambiguous or has options, ask and let the user choose.
- Only turn what the user actually defined into structure, naming, and detail.

The structured spec must contain:

- Goal and scope
- Backend plan (modules, endpoints, DTOs, response contracts)
- Frontend plan (pages, features, slices, services, types)
- Screenshot references (source of truth)
- Definition of Done (checklist)

No implementation begins until the structured spec is approved by the user.

---

## Phase 2 — Design (conditional — any new or changed UI)

Run this phase whenever the feature **adds or changes a screen**. Skip it for
backend-only or non-visual work (note "no UI change — design phase skipped" in
`current-feature.md`).

Design the screen in the **claude.ai/design "Fyndit Design System" project** before
writing app code, following `design-system.md`:

- Compose from the `window.FynditUI` components; style glue with **design tokens**
  only — no hardcoded hex, no invented class names, no app wiring (Redux / Router /
  services / Stripe).
- **Screenshots stay the source of truth** for any screen that has one
  (`.claude/screenshots/`); the design must match its layout and rhythm.
- If a reusable building block is missing, **do not hack around it** — propose a new
  primitive (per `design-system.md` → *Adding a new primitive*) and let the user
  decide before designing around it.

The output is an **approved visual prototype**. Like the spec, every composition
choice is the user's — present the design and get approval. The approved prototype
becomes a source of truth for implementation, alongside the screenshot. It is saved in
the design project automatically — do not copy-paste it; **`/design`** in Phase 4
retrieves it directly.

After approval, move to **Phase 3** to record the plan in `current-feature.md` before
any implementation begins.

> **Reforming an existing screen** follows the *same* path: structure the change as a
> spec (Phase 1), redesign it in the Fyndit Design System project here (Phase 2), get
> approval, update `current-feature.md` (Phase 3), then run **`/design`** (Phase 4) to
> translate it and migrate the screen onto `@/ui` components + tokens.

---

## Phase 3 — Update current-feature.md

Before implementing, set the active feature in
`.claude/context/current-feature.md`:

- `Current Feature` — name + spec file
- `Status` — in progress
- `Goal`, `Scope / Plan`
- `Approved Design` — name or path of the approved prototype in the design project
  (only if Phase 2 ran; omit for backend-only features)
- Branch name (cut from `main` unless stated otherwise)

This file is the single source of truth for what is being built right now. Phase 4
implementation — including **`/design`** for UI translation — follows the plan recorded
here. The testing and review agents read it to find the active feature and its spec.

---

## Phase 4 — Feature Implementation

Implement on the feature branch, following:

- `project-overview.md` — requirements, flows, layout
- `business-rules.md` — must be followed strictly
- `development-rules.md` — coding standards, architecture, security
- `database-design.md` / `prisma-schema.md` — if the schema changes
- **`/design`** — run this skill to translate the approved prototype into app code.
  It reads the prototype directly from the claude.ai/design project and uses
  `current-feature.md` + `design-system.md` as scope context. Produces `@/ui`
  components + CSS Modules using `theme.css` tokens; no inline styles; wires
  Redux/Router/services. Reuse `@/ui` rather than rebuilding primitives inline.
- `screenshots/` — the visual source of truth

Keep code production-ready, typed (no `any`), and feature-isolated.

---

## Phase 5 — Testing (via subagents)

Run the testing subagents after implementation:

- `fyndit-backend-tester` — Jest unit + Supertest e2e
- `fyndit-frontend-tester` — Vitest + RTL unit/component + Playwright e2e

Rules:

- Follow the **testing execution plan** defined in `business-rules.md`
  ("Frontend E2E Requires Live Backend"): run unit/component tests first, then
  start the backend and `wait-on` it before Playwright, then kill the backend
  after. Backend e2e mock setup follows the pattern in `development-rules.md`.
- Agents write unit **and** e2e tests, run them **with coverage**, and report
  findings.
- **Report-and-wait:** agents do NOT change application code or "fix" failures
  on their own. They surface each failure with a proposed fix and wait for
  explicit permission before any change.
- Agents read `current-feature.md` + the named spec + `testing-patterns.md`
  before writing tests, and append genuinely new patterns back to
  `testing-patterns.md`.

---

## Phase 6 — Review (run in parallel)

After tests pass, run the four review agents **in parallel** on the changed
files:

- `fyndit-quality-reviewer` — architecture, maintainability, API contracts
- `fyndit-prisma-reviewer` — schema, queries, transactions, indexes
- `fyndit-security-reviewer` — auth, ownership, payment security
- `fyndit-ui-reviewer` — screenshot **and approved-design** compliance, theme/token
  use, `@/ui` reuse (no reinvented primitives or hardcoded values), responsiveness

Each reviewer produces a **review report**: what was checked, the fixes needed,
and suggestions. Do NOT auto-apply changes. Present the consolidated report,
then take **follow-ups** from the user on which fixes to perform — apply only
the approved ones. Record out-of-scope findings as future follow-ups.

---

## Phase 7 — Self-Improvement (context refinement)

After the review, spawn **Explore agents** to explore the whole project as it
stands now (including this feature) and improve the context for future work.

Goals:

- Make the context files (`project-overview.md`, `business-rules.md`,
  `development-rules.md`, `database-design.md`, `prisma-schema.md`,
  `design-system.md`, `testing-patterns.md`) more **precise** so future features
  are implemented correctly the first time.
- Capture patterns, conventions, and decisions that are now established in the
  codebase but not yet written down.
- **Keep the design system in sync** — if this feature added a `@/ui` primitive or
  changed a token, confirm `design-system.md`, `.design-sync/conventions.md`, the
  authored previews, and `tokens.css`/`theme.css` were all updated (per
  `design-system.md` → *Adding a new primitive* / drift guards).
- **Reduce hallucinations** — correct anything in the context that no longer
  matches the real code, remove stale guidance, and tighten vague rules into
  concrete ones.

Present the proposed context edits and take the user's approval before applying.

---

## Phase 8 — Finalize

- Update `current-feature.md`: set `Status` to Done and add a numbered
  **History** entry describing what shipped, decisions, and what was deferred.
- **Commit message is the user's choice** — the agent only *suggests* a message;
  the user gives the final one. Commit with the user's message, then open the PR.

---

## At a glance

```
raw definition → structured spec (user approves every choice)
  → design (if UI: prototype in claude.ai/design w/ FynditUI + tokens, user approves)
  → current-feature updated (plan + approved design reference)
  → implement (run /design → reads prototype from design project → @/ui + CSS Modules)
  → test (subagents, report-and-wait)
  → review (4 agents in parallel → report + follow-up fixes)
  → self-improvement (Explore agents refine context, keep design system in sync)
  → history + commit (user's message) + PR
```

Reforming an existing screen runs the same loop: spec the change → redesign it in
the Fyndit Design System → approve → implement by migrating the screen onto `@/ui`.
