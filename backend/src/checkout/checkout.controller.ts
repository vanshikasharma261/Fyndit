import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type {
  CheckoutSummary,
  PaymentIntentResponse,
} from './types/checkout.types';

/**
 * Checkout endpoints for the authenticated user. Thin controller: it wires the
 * guard, `@CurrentUser`, and the DTOs, then delegates to {@link CheckoutService}.
 * The user id is always taken from the JWT — never from the body.
 */
@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get()
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<CheckoutSummary> {
    return this.checkoutService.getSummary(user.id);
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  applyCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyCouponDto,
  ): Promise<CheckoutSummary> {
    return this.checkoutService.applyCoupon(user.id, dto);
  }

  @Delete('coupon')
  @HttpCode(HttpStatus.OK)
  removeCoupon(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CheckoutSummary> {
    return this.checkoutService.removeCoupon(user.id);
  }

  @Post('payment-intent')
  @HttpCode(HttpStatus.OK)
  createPaymentIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentIntentDto,
  ): Promise<PaymentIntentResponse> {
    return this.checkoutService.createPaymentIntent(user.id, dto);
  }
}
