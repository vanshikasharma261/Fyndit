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
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { AddressResponse } from './types/address.types';

/**
 * Address endpoints for the authenticated user. Controllers stay thin: they
 * wire the guard, the `@CurrentUser` decorator and the DTOs, then delegate to
 * {@link AddressService}.
 *
 * The user id is always taken from the JWT (`@CurrentUser().id`) — never from
 * the body or params — and `:addressId` is validated as a UUID, so a user can
 * only ever act on their own addresses.
 */
@Controller('address')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get()
  getAddresses(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AddressResponse[]> {
    return this.addressService.getAddresses(user.id);
  }

  @Post()
  addAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponse> {
    return this.addressService.addAddress(user.id, dto);
  }

  @Patch(':addressId')
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponse> {
    return this.addressService.updateAddress(user.id, addressId, dto);
  }

  @Patch(':addressId/default')
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<AddressResponse[]> {
    return this.addressService.setDefault(user.id, addressId);
  }

  @Delete(':addressId')
  @HttpCode(HttpStatus.OK)
  removeAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<{ message: string }> {
    return this.addressService.removeAddress(user.id, addressId);
  }
}
