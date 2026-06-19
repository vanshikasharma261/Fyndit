import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { OrderMessages } from '../constants/messages.constant';
import { PAISE_PER_RUPEE, STRIPE_CURRENCY } from '../constants/values.constant';

/** Context carried on the PaymentIntent so the webhook can place the order. */
export interface PaymentIntentMetadata {
  user_id: string;
  address_id: string;
  /** Empty string when no coupon is applied (Stripe metadata values are strings). */
  coupon_code: string;
}

/**
 * Thin wrapper around the Stripe SDK. This is the module's only dependency on
 * Stripe, so the rest of the app never imports `stripe` directly. It is a leaf
 * service (depends on `ConfigService` alone) to keep the module graph
 * acyclic — `checkout` and `order` both consume it.
 *
 * Amounts are passed to Stripe in the smallest currency unit (paise for INR).
 */
@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'));
    this.webhookSecret = config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }

  /**
   * Creates a PaymentIntent for the given rupee amount. The order is NOT created
   * here — the checkout context travels in `metadata` and the order is placed by
   * the `payment_intent.succeeded` webhook on success.
   */
  async createPaymentIntent(
    amountRupees: string,
    metadata: PaymentIntentMetadata,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: this.toPaise(amountRupees),
      currency: STRIPE_CURRENCY,
      automatic_payment_methods: { enabled: true },
      metadata: { ...metadata },
    });
  }

  /** Issues a full refund for the charge behind a PaymentIntent. */
  async refundPaymentIntent(paymentIntentId: string): Promise<Stripe.Refund> {
    return this.stripe.refunds.create({ payment_intent: paymentIntentId });
  }

  /**
   * Verifies a webhook payload against the signing secret and returns the typed
   * event. Throws a 400 (never a 500) when the signature can't be verified, so a
   * forged/garbled request is rejected cleanly.
   */
  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new BadRequestException(OrderMessages.webhookSignatureInvalid);
    }
  }

  /** Converts a `"123.45"` rupee string to an integer paise amount. */
  private toPaise(amountRupees: string): number {
    return Math.round(Number(amountRupees) * PAISE_PER_RUPEE);
  }
}
