import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Cart module. Protected by the JWT guard; `AuthModule` is imported so the
 * service can reuse `AuthService.isUserActive` for the active-session precheck.
 * `PrismaService` is provided globally via `PrismaModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
