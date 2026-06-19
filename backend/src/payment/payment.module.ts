import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/**
 * Payment module. Exposes {@link StripeService} (the sole Stripe SDK wrapper) to
 * the `checkout` and `order` modules. Deliberately a leaf module — it depends
 * only on `ConfigService` — so the module graph stays acyclic.
 */
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentModule {}
