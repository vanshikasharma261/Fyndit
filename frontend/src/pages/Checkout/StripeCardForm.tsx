import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CheckoutMessages } from "../../constants/messages.constant";
import styles from "./Checkout.module.css";

interface StripeCardFormProps {
  /** Where Stripe should return after any redirect-based payment method. */
  returnUrl: string;
  /** Fired when the PaymentIntent succeeds (no redirect needed). */
  onSucceeded: () => void;
  /** Fired with a human-readable message when confirmation fails. */
  onError: (message: string) => void;
}

/**
 * The Stripe Payment Element + "Confirm & Pay" button (matches
 * `stripe_payment_ui.png`). Rendered inside `<Elements>` so it can use the
 * Stripe hooks. On success the order is placed server-side by the webhook, so
 * this only confirms the payment and signals the parent.
 */
function StripeCardForm({
  returnUrl,
  onSucceeded,
  onError,
}: StripeCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      // Stay on the page for card payments that don't require a redirect.
      redirect: "if_required",
    });

    setSubmitting(false);

    if (error) {
      onError(error.message ?? CheckoutMessages.genericError);
      return;
    }
    // `succeeded` → paid; `processing` → an async method that will settle and
    // fire payment_intent.succeeded later. Either way the order is placed by the
    // webhook, so advance the user and let the order surface once it lands.
    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing")
    ) {
      onSucceeded();
    }
  };

  return (
    <div className={styles.stripeForm}>
      <PaymentElement />
      <button
        type="button"
        className={styles.placeButton}
        disabled={!stripe || submitting}
        onClick={() => void handleConfirm()}
      >
        {CheckoutMessages.confirmPay}
      </button>
    </div>
  );
}

export default StripeCardForm;
