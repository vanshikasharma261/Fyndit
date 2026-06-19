import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CouponService } from './coupon.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';

/**
 * Checkout module. Protected by the JWT guard; imports `AuthModule` (active
 * session re-check) and `PaymentModule` (Stripe PaymentIntent creation).
 * Exports `CheckoutService` + `CouponService` so the order module reuses the
 * authoritative order breakdown and coupon rules without duplication.
 * `PrismaService` is global via `PrismaModule`.
 */
@Module({
  imports: [AuthModule, PaymentModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, CouponService],
  exports: [CheckoutService, CouponService],
})
export class CheckoutModule {}
