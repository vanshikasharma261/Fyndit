import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AuthMessages } from '../constants/messages.constant';
import { AddressType } from '../generated/prisma/enums';
import { ACCESS_TOKEN_COOKIE } from './constants/auth.constant';
import { resolveCookieMaxAge } from './helpers/cookie-max-age.helper';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthenticatedUser, JwtPayload, UserProfile } from './types/auth.types';

const BCRYPT_SALT_ROUNDS = 12;
const PRISMA_UNIQUE_CONSTRAINT = 'P2002';

@Injectable()
export class AuthService {
  private readonly isProduction: boolean;
  private readonly cookieMaxAgeMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
    this.cookieMaxAgeMs = resolveCookieMaxAge(
      config.get<string>('JWT_EXPIRES_IN'),
    );
  }

  /**
   * Registers a new account. Email is checked for uniqueness, the password is
   * hashed with bcrypt, and the User, their default Address and an empty Cart
   * are created atomically (cart-on-signup per business rules).
   *
   * `is_active` is intentionally the single session signal — the account starts
   * inactive and only flips active on login. (The spec mentions a separate
   * `session_active` field; it is absent from the schema and database-design,
   * so it is deliberately not used here.)
   */
  async signup(dto: SignupDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { user_id: true },
    });

    if (existing) {
      throw new ConflictException(AuthMessages.emailAlreadyExistsMessage);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            password_hash: passwordHash,
            user_name: dto.user_name,
            first_name: dto.first_name,
            last_name: dto.last_name,
            phone: dto.phone,
            // Account is inactive until the user logs in.
            is_active: false,
            is_deleted: false,
            deleted_at: null,
          },
          select: { user_id: true },
        });

        await tx.address.create({
          data: {
            user_id: user.user_id,
            line1: dto.line1,
            line2: dto.line2 ?? null,
            city: dto.city,
            state: dto.state,
            country: dto.country,
            zip: dto.zip,
            address_type: dto.address_type ?? AddressType.HOME,
          },
          select: { address_id: true },
        });

        await tx.cart.create({
          data: { user_id: user.user_id },
          select: { cart_id: true },
        });
      });
    } catch (error) {
      // Safety net for the race between the uniqueness pre-check and the insert:
      // a concurrent signup with the same email trips the DB unique constraint.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT
      ) {
        throw new ConflictException(AuthMessages.emailAlreadyExistsMessage);
      }
      throw error;
    }

    return { message: AuthMessages.signupSuccessMessage };
  }

  /**
   * Authenticates a user, marks the account active, and sets the access token
   * as an HTTP-only cookie. Soft-deleted users (either `is_deleted` or
   * `deleted_at` set) are rejected with the same generic message as bad
   * credentials to avoid account enumeration.
   */
  async login(
    dto: LoginDto,
    res: Response,
  ): Promise<{ message: string; user: AuthenticatedUser }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        user_id: true,
        email: true,
        password_hash: true,
        is_deleted: true,
        deleted_at: true,
      },
    });

    if (!user || user.is_deleted || user.deleted_at !== null) {
      throw new UnauthorizedException(AuthMessages.invalidCredentialsMessage);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(AuthMessages.invalidCredentialsMessage);
    }

    await this.prisma.user.update({
      where: { user_id: user.user_id },
      data: { is_active: true },
      select: { user_id: true },
    });

    const payload: JwtPayload = { sub: user.user_id, email: user.email };
    const token = await this.jwtService.signAsync(payload);

    res.cookie(ACCESS_TOKEN_COOKIE, token, this.buildCookieOptions());

    return {
      message: AuthMessages.loginSuccessMessage,
      user: { id: user.user_id, email: user.email },
    };
  }

  /**
   * Logs the user out: marks the account inactive and clears the auth cookie.
   */
  async logout(
    user: AuthenticatedUser,
    res: Response,
  ): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { user_id: user.id },
      data: { is_active: false },
      select: { user_id: true },
    });

    this.clearSessionCookie(res);

    return { message: AuthMessages.logoutSuccessMessage };
  }

  /**
   * Clears the auth cookie, ending the browser session. Exposed so other
   * modules that terminate a session (e.g. account soft-delete in `UserModule`)
   * reuse the exact cookie attributes the cookie was set with.
   */
  clearSessionCookie(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.buildClearCookieOptions());
  }

  /**
   * Returns the current user's profile for session restore (`GET /auth/me`). A
   * JWT can outlive a logout or soft delete, so a stale-but-valid token is
   * rejected with 401 — the client treats that as "not signed in".
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        email: true,
        first_name: true,
        last_name: true,
        user_name: true,
        is_active: true,
        is_deleted: true,
        deleted_at: true,
      },
    });

    if (
      !user ||
      !user.is_active ||
      user.is_deleted ||
      user.deleted_at !== null
    ) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }

    return {
      id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      user_name: user.user_name,
    };
  }

  /**
   * Tells whether a user is currently allowed to perform sensitive operations.
   * A JWT can outlive a logout or a soft delete, so protected modules should
   * call this before acting on the authenticated principal.
   */
  async isUserActive(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: { is_active: true, is_deleted: true, deleted_at: true },
    });

    return Boolean(
      user && user.is_active && !user.is_deleted && user.deleted_at === null,
    );
  }

  /** Cookie flags used when setting the access token on login. */
  private buildCookieOptions(): CookieOptions {
    return { ...this.buildClearCookieOptions(), maxAge: this.cookieMaxAgeMs };
  }

  /**
   * Identifying cookie attributes used to clear the cookie on logout. `maxAge`
   * is intentionally omitted — `clearCookie` expires the cookie, and the rest of
   * the attributes must match those used to set it for the browser to remove it.
   */
  private buildClearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.isProduction,
      path: '/',
    };
  }
}
