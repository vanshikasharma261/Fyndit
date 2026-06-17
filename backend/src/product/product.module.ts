import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Product browsing module. Read-only catalog endpoints, protected by the JWT
 * guard; `AuthModule` is imported so the service can reuse `AuthService`'s
 * `isUserActive` check. `PrismaService` is provided globally via `PrismaModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
