import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderWebhookController } from './order-webhook.controller';
import { OrderService } from './order.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { CheckoutModule } from '../checkout/checkout.module';

/**
 * Order module. Imports `AuthModule` (active-session re-check), `PaymentModule`
 * (Stripe refunds), and `CheckoutModule` (the shared authoritative order
 * breakdown + coupon rules). Hosts both the authenticated `/order` controller
 * and the unauthenticated Stripe `/payment/webhook` controller, since the
 * webhook drives order placement/cancellation.
 */
@Module({
  imports: [AuthModule, PaymentModule, CheckoutModule],
  controllers: [OrderController, OrderWebhookController],
  providers: [OrderService],
})
export class OrderModule {}
