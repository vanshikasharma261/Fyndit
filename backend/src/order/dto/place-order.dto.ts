import { IsUUID } from 'class-validator';

/**
 * `POST /order` — places a Cash-on-Delivery order against the chosen shipping
 * address. Card orders never use this endpoint; they are placed by the Stripe
 * webhook. The user id is always taken from the JWT.
 */
export class PlaceOrderDto {
  @IsUUID()
  address_id!: string;
}
