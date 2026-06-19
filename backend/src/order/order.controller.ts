import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { OrderDetail, OrderListResponse } from './types/order.types';

/**
 * Order endpoints for the authenticated user. Thin controller: it wires the
 * guard, `@CurrentUser`, and the DTOs, then delegates to {@link OrderService}.
 * The user id is always the JWT id; `:orderId` is validated as a UUID, so a user
 * can only act on their own orders.
 */
@Controller('order')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlaceOrderDto,
  ): Promise<OrderDetail> {
    return this.orderService.placeCodOrder(user.id, dto);
  }

  @Get()
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderListResponse> {
    return this.orderService.listOrders(user.id, query);
  }

  @Get(':orderId')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<OrderDetail> {
    return this.orderService.getOrder(user.id, orderId);
  }

  @Patch(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<{ message: string }> {
    return this.orderService.cancelOrder(user.id, orderId);
  }
}
