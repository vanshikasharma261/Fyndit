import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { AuthMessages, UserMessages } from '../constants/messages.constant';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfile } from './types/user.types';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';

/**
 * Columns exposed in the profile contract. Sensitive fields (`password_hash`)
 * and internal flags (`is_active`/`is_deleted`/`deleted_at`) are deliberately
 * never selected so they cannot leak in a response.
 */
const PROFILE_SELECT = {
  user_id: true,
  email: true,
  first_name: true,
  last_name: true,
  user_name: true,
  phone: true,
} as const;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

/**
 * Profile management for the authenticated user. Every operation acts only on
 * the id resolved from the JWT (`@CurrentUser().id`) — never a client-supplied
 * id — and re-checks the active session first, since a valid JWT can outlive a
 * logout or soft delete.
 */
@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Returns the authenticated user's profile (incl. `phone`). */
  async getUser(userId: string): Promise<UserProfile> {
    await this.assertActiveUser(userId);

    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: PROFILE_SELECT,
    });

    // isUserActive already proved the row exists and is active, but narrow the
    // nullable lookup type and stay defensive against a concurrent delete.
    if (!user) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }

    return this.toProfile(user);
  }

  /**
   * Updates only the whitelisted fields present in the DTO and returns the
   * refreshed profile. An email change must stay unique — a `P2002` collision
   * is surfaced as a field error on `email` (mirrors the signup conflict).
   */
  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserProfile> {
    await this.assertActiveUser(userId);

    // Build the update payload from only the keys actually present, rather
    // than relying on Prisma's "explicit undefined = skip" behaviour.
    const data: Prisma.UserUpdateInput = {};
    if (dto.first_name !== undefined) data.first_name = dto.first_name;
    if (dto.last_name !== undefined) data.last_name = dto.last_name;
    if (dto.user_name !== undefined) data.user_name = dto.user_name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;

    try {
      const user = await this.prisma.user.update({
        where: { user_id: userId },
        data,
        select: PROFILE_SELECT,
      });

      return this.toProfile(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT &&
        this.isEmailConflict(error)
      ) {
        // Reuse the flat `{ errors: { field } }` validation envelope so the
        // frontend renders this under the email row, like a 400.
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          errors: { email: UserMessages.emailAlreadyExists },
        });
      }
      throw error;
    }
  }

  /**
   * Soft-deletes the account: flags `is_deleted`/`deleted_at`, marks it
   * inactive, and clears the auth cookie so the session ends. The record is
   * never hard-deleted (business rule).
   */
  async deleteUser(
    userId: string,
    res: Response,
  ): Promise<{ message: string }> {
    await this.assertActiveUser(userId);

    await this.prisma.user.update({
      where: { user_id: userId },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
        is_active: false,
      },
      select: { user_id: true },
    });

    this.authService.clearSessionCookie(res);

    return { message: UserMessages.deleteSuccess };
  }

  /**
   * Re-verifies the active session before any read/write. A JWT can outlive a
   * logout or soft delete, so an inactive principal is rejected with 401.
   */
  private async assertActiveUser(userId: string): Promise<void> {
    const active = await this.authService.isUserActive(userId);
    if (!active) {
      throw new UnauthorizedException(AuthMessages.inactiveAccountMessage);
    }
  }

  /**
   * Whether a unique-constraint violation was caused by the `email` column.
   * Guards against masking a future unique field (e.g. `user_name`) as an
   * email collision; any other target is re-thrown unchanged.
   */
  private isEmailConflict(
    error: Prisma.PrismaClientKnownRequestError,
  ): boolean {
    const target = error.meta?.target;
    return Array.isArray(target) && target.includes('email');
  }

  private toProfile(user: ProfileRow): UserProfile {
    return {
      id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      user_name: user.user_name,
      phone: user.phone,
    };
  }
}
