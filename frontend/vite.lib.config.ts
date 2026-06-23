import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Library build for the Fyndit UI design system (`src/ui`).
 *
 * Emits an ESM bundle + a single stylesheet into `dist-ui/`, consumed by
 * `/design-sync` (claude.ai/design). React is externalized as a peer; everything
 * else (lucide-react, react-paginate, the CSS-module styles, and the design
 * tokens) is bundled so the library renders standalone. The `.d.ts` tree is
 * emitted separately by `tsc -p tsconfig.ui.json` (see the `build:ui` script).
 *
 * Build with: `npm run build:ui`
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-ui",
    emptyOutDir: true,
    // Don't copy the app's public/ assets (favicon, icons) into the lib output.
    copyPublicDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, "src/ui/index.ts"),
      formats: ["es"],
      fileName: () => "index.es.js",
    },
    rollupOptions: {
      // Externalize React (peer) AND the component-lib deps. Leaving react-paginate
      // (CJS) / lucide-react as bare imports lets the design-sync converter's
      // esbuild bundle them fresh — it resolves their internal `require("react")`
      // via its React shim, which a pre-wrapped CJS copy from here would break.
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "lucide-react",
        "react-paginate",
      ],
      output: {
        // Single predictable stylesheet name for cfg.cssEntry.
        assetFileNames: (asset) =>
          asset.names?.some((n) => n.endsWith(".css"))
            ? "style.css"
            : "assets/[name][extname]",
      },
    },
  },
});
