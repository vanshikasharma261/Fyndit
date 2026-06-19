import { Module } from '@nestjs/common';
import { AddressController } from './address.controller';
import { AddressService } from './address.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Address module. Protected by the JWT guard; `AuthModule` is imported so the
 * service can reuse `AuthService.isUserActive` for the active-session precheck.
 * `PrismaService` is provided globally via `PrismaModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [AddressController],
  providers: [AddressService],
})
export class AddressModule {}
