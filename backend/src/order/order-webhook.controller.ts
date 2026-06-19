import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrderService } from './order.service';
import { StripeService } from '../payment/stripe.service';
import type { PaymentIntentMetadata } from '../payment/stripe.service';
import { OrderMessages } from '../constants/messages.constant';

/**
 * Stripe webhook receiver. Unauthenticated by design — the request is
 * authenticated by its Stripe signature (verified against the raw body) rather
 * than a JWT. It drives the card order lifecycle:
 *
 * - `payment_intent.succeeded` → place the order from the intent metadata.
 * - `charge.refunded` → finalise a cancellation (CANCELLED + REFUNDED + restock).
 *
 * Always returns 200 with `{ received: true }` so Stripe does not retry handled
 * events; a bad signature is the only 400.
 */
@Controller('payment')
export class OrderWebhookController {
  constructor(
    private readonly stripe: StripeService,
    private readonly orderService: OrderService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException(OrderMessages.webhookSignatureInvalid);
    }

    const event = this.stripe.constructWebhookEvent(req.rawBody, signature);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        await this.orderService.placeStripeOrder(
          intent.metadata as unknown as PaymentIntentMetadata,
          intent.id,
        );
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
        if (paymentIntentId) {
          await this.orderService.finalizeRefund(paymentIntentId);
        }
        break;
      }
      default:
        break; // unhandled event types are acknowledged, not processed
    }

    return { received: true };
  }
}
