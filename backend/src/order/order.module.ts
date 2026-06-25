import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderWebhookController } from './order-webhook.controller';
import { OrderService } from './order.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { MailModule } from '../mail/mail.module';

/**
 * Order module. Imports `AuthModule` (active-session re-check), `PaymentModule`
 * (Stripe refunds), `CheckoutModule` (the shared authoritative order
 * breakdown + coupon rules), and `MailModule` (order-confirmation email +
 * invoice PDF). Hosts both the authenticated `/order` controller and the
 * unauthenticated Stripe `/payment/webhook` controller.
 */
@Module({
  imports: [AuthModule, PaymentModule, CheckoutModule, MailModule],
  controllers: [OrderController, OrderWebhookController],
  providers: [OrderService],
})
export class OrderModule {}
