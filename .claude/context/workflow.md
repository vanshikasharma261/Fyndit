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

## Phase 2 — Update current-feature.md

Before implementing, set the active feature in
`.claude/context/current-feature.md`:

- `Current Feature` — name + spec file
- `Status` — in progress
- `Goal`, `Scope / Plan`
- Branch name (cut from `main` unless stated otherwise)

This file is the single source of truth for what is being built right now. The
testing and review agents read it to find the active feature and its spec.

---

## Phase 3 — Feature Implementation

Implement on the feature branch, following:

- `project-overview.md` — requirements, flows, layout
- `business-rules.md` — must be followed strictly
- `development-rules.md` — coding standards, architecture, security
- `database-design.md` / `prisma-schema.md` — if the schema changes
- `screenshots/` — the visual source of truth

Keep code production-ready, typed (no `any`), and feature-isolated.

---

## Phase 4 — Testing (via subagents)

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

## Phase 5 — Review (run in parallel)

After tests pass, run the four review agents **in parallel** on the changed
files:

- `fyndit-quality-reviewer` — architecture, maintainability, API contracts
- `fyndit-prisma-reviewer` — schema, queries, transactions, indexes
- `fyndit-security-reviewer` — auth, ownership, payment security
- `fyndit-ui-reviewer` — screenshot compliance, theme, responsiveness

Each reviewer produces a **review report**: what was checked, the fixes needed,
and suggestions. Do NOT auto-apply changes. Present the consolidated report,
then take **follow-ups** from the user on which fixes to perform — apply only
the approved ones. Record out-of-scope findings as future follow-ups.

---

## Phase 6 — Self-Improvement (context refinement)

After the review, spawn **Explore agents** to explore the whole project as it
stands now (including this feature) and improve the context for future work.

Goals:

- Make the context files (`project-overview.md`, `business-rules.md`,
  `development-rules.md`, `database-design.md`, `prisma-schema.md`,
  `testing-patterns.md`) more **precise** so future features are implemented
  correctly the first time.
- Capture patterns, conventions, and decisions that are now established in the
  codebase but not yet written down.
- **Reduce hallucinations** — correct anything in the context that no longer
  matches the real code, remove stale guidance, and tighten vague rules into
  concrete ones.

Present the proposed context edits and take the user's approval before applying.

---

## Phase 7 — Finalize

- Update `current-feature.md`: set `Status` to Done and add a numbered
  **History** entry describing what shipped, decisions, and what was deferred.
- **Commit message is the user's choice** — the agent only *suggests* a message;
  the user gives the final one. Commit with the user's message, then open the PR.

---

## At a glance

```
raw definition → structured spec (user approves every choice)
  → current-feature updated → implement
  → test (subagents, report-and-wait)
  → review (4 agents in parallel → report + follow-up fixes)
  → self-improvement (Explore agents refine context, reduce hallucinations)
  → history + commit (user's message) + PR
```
