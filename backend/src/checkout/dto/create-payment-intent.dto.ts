import { IsUUID } from 'class-validator';

/**
 * `POST /checkout/payment-intent` — the shipping address for the card order. The
 * address id travels into the PaymentIntent metadata so the webhook can place
 * the order on payment success. The user id is always taken from the JWT.
 */
export class CreatePaymentIntentDto {
  @IsUUID()
  address_id!: string;
}
