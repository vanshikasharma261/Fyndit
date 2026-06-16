import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE, JWT_STRATEGY } from '../constants/auth.constant';
import { AuthMessages } from '../../constants/messages.constant';
import { AuthenticatedUser, JwtPayload } from '../types/auth.types';

/**
 * Extracts the access token from the HTTP-only `access_token` cookie, verifies
 * its signature and expiry, and returns the principal attached to `req.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null =>
          (req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Passport calls this after the token is verified. The returned value becomes
   * `req.user`.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException(AuthMessages.unauthorizedMessage);
    }
    return { id: payload.sub, email: payload.email };
  }
}
