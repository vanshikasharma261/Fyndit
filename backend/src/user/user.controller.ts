import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { UserProfile } from './types/user.types';

/**
 * Profile management for the authenticated user. Controllers stay thin: they
 * wire the guard, the `@CurrentUser` decorator and the DTO, then delegate to
 * {@link UserService}.
 *
 * The user id is always taken from the JWT (`@CurrentUser().id`) — it is never
 * read from the body or params, so a user can only act on their own account.
 */
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getUser(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.userService.getUser(user.id);
  }

  @Patch()
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ): Promise<UserProfile> {
    return this.userService.updateUser(user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  deleteUser(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    return this.userService.deleteUser(user.id, res);
  }
}
