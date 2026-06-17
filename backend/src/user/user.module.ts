import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Profile management module. Protected by the JWT guard; `AuthModule` is
 * imported so the service can reuse `AuthService` (`isUserActive` precheck +
 * cookie clearing). `PrismaService` is provided globally via `PrismaModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
