import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthMessages } from '../../constants/messages.constant';
import { AuthenticatedUser } from '../../auth/types/auth.types';

/**
 * Injects the authenticated principal (populated by {@link JwtAuthGuard}) into a
 * route handler. Prefer this over reading `req.user` directly so the auth shape
 * is resolved in one place.
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Post('logout')
 * logout(@CurrentUser() user: AuthenticatedUser) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;
    // Guards against use on an unprotected route (where req.user is undefined).
    if (!user) {
      throw new UnauthorizedException(AuthMessages.unauthorizedMessage);
    }
    return user;
  },
);
