/// <reference types="vite/client" />

/**
 * Typed environment variables exposed to the client. Vite only inlines vars
 * prefixed with `VITE_`. `VITE_API_URL` is the backend base URL (e.g.
 * `http://localhost:3000`) and every auth thunk prefixes its endpoint with it.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Stripe publishable (test) key — drives the Elements card payment form. */
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
