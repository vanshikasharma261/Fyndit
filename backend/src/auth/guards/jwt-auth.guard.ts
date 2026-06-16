import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JWT_STRATEGY } from '../constants/auth.constant';

/**
 * Protects routes by running the JWT {@link JwtStrategy}. On success the
 * authenticated principal is attached to `req.user`; otherwise the request is
 * rejected with `401 Unauthorized`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY) {}
