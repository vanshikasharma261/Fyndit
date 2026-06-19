import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { ConfigMessages } from "../constants/messages.constant";

/**
 * Memoised Stripe.js loader. `loadStripe` must be called exactly once and its
 * promise reused (calling it per render re-downloads the script and breaks
 * Elements), so the promise is created once at module load from the publishable
 * key. Components pass this promise to `<Elements stripe={stripePromise}>`.
 */
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(ConfigMessages.missingStripeKey);
}

export const stripePromise: Promise<Stripe | null> = loadStripe(publishableKey);
