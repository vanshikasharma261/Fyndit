# design-sync notes — Fyndit Design System

Repo-specific gotchas for syncing `frontend/src/ui` to claude.ai/design.

## Layout / how this repo is wired

- The design system is **not a standalone package** — it's `frontend/src/ui/`, a
  presentational library extracted from the Fyndit app (decoupled from
  Redux/Router/services/Stripe). The app proper lives in `frontend/`.
- The package root the converter uses is `frontend/` (derived from `--entry`).
  `frontend/package.json` has `module`/`types` pointing at `dist-ui/` so the
  converter's `.d.ts` discovery finds the entry — **do not remove those fields**
  or component discovery returns `[ZERO_MATCH]`.
- Config home is the **repo root** `.design-sync/`. Run the converter/driver from
  the repo root with:
  - `--entry ./frontend/dist-ui/index.es.js`
  - `--node-modules ./frontend/node_modules`
  - `--out ./ds-bundle`
- `cfg.*` path fields (`srcDir`, `cssEntry`, `tsconfig`) are relative to
  `frontend/`; `.design-sync/` and `--out` are relative to the repo root cwd.

## Build

- Rebuild the library first: `npm --prefix frontend run build:ui` (this is
  `cfg.buildCmd`). It runs `vite build --config vite.lib.config.ts` (ESM bundle +
  `style.css`) then `tsc -p tsconfig.ui.json` (the `.d.ts` tree). Both land in
  `frontend/dist-ui/` (gitignored).
- **Externals matter**: `vite.lib.config.ts` externalizes `react`, `react-dom`,
  `react/jsx-runtime`, `lucide-react`, AND `react-paginate`. The last two are
  externalized on purpose — react-paginate is CJS, and if it's pre-bundled here
  rolldown wraps it in a `__commonJS` shim whose internal `require("react")`
  survives and breaks the converter's esbuild IIFE wrap ("Dynamic require of
  'react' is not supported" → `[BUNDLE_EXPORT]` 0 components on the global). Let
  the converter bundle them fresh instead (it reports "inlined npm packages: 2").

## Render check

- Playwright lives in `.ds-sync/` (installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`),
  pinned to **1.61.0** to match the repo's cached `chromium-1228`. If the cache
  build changes, re-pin playwright in `.ds-sync` to the version whose
  `browsers.json` matches.

## Known render warns

- `[GRID_OVERFLOW]` on `AddressCard`, `Pagination`, `TextField` — handled via
  `cfg.overrides.<Name>.cardMode = "column"`. Expected; not new warns.
- `.d.ts parse check skipped — typescript not in node_modules` — non-blocking;
  `typescript` isn't installed in `.ds-sync`. Add it there if you want the check.

## Re-sync risks (watch-list for the next run)

- **Tokens are duplicated**: `frontend/src/ui/tokens.css` mirrors
  `frontend/src/styles/theme.css`. If the app theme changes, update `tokens.css`
  too or the DS drifts from the app.
- **conventions.md enumerates token + component names** — re-validate them against
  the fresh `dist-ui`/`ds-bundle` build on every re-sync (grep tokens against
  `ds-bundle/styles.css` + `_ds_bundle.css`; component names against
  `ds-bundle/components/general/`). Update the header if any name changes.
- The library is **hand-maintained** (extracted, not a published package). New app
  components don't appear here automatically — add them to `src/ui` + the barrel
  to sync them.
- All 14 previews are authored in `.design-sync/previews/` and graded good
  (carried forward on re-sync). No floor cards.
