import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type {
  AddToCartResponse,
  CartResponse,
  UpdateCartResponse,
} from './types/cart.types';

/**
 * Cart endpoints for the authenticated user. Controllers stay thin: they wire
 * the guard, the `@CurrentUser` decorator and the DTOs, then delegate to
 * {@link CartService}.
 *
 * The user id is always taken from the JWT (`@CurrentUser().id`) — never from
 * the body or params — and `:cartItemId` is validated as a UUID, so a user can
 * only ever act on their own cart.
 */
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: AuthenticatedUser): Promise<CartResponse> {
    return this.cartService.getCart(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  addToCart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCartItemDto,
  ): Promise<AddToCartResponse> {
    // 200 (not 201): this is an upsert — it may create a new line OR just
    // increment an existing one, so it does not always create a resource.
    return this.cartService.addToCart(user.id, dto);
  }

  @Patch(':cartItemId')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<UpdateCartResponse> {
    return this.cartService.updateItem(user.id, cartItemId, dto);
  }

  @Delete(':cartItemId')
  @HttpCode(HttpStatus.OK)
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
  ): Promise<{ message: string }> {
    return this.cartService.removeItem(user.id, cartItemId);
  }
}
