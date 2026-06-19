import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { AddressMessages, AuthMessages } from '../constants/messages.constant';
import { MAX_ACTIVE_ADDRESSES } from '../constants/values.constant';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponse } from './types/address.types';

/**
 * Columns exposed in the address contract. Ownership/internal columns
 * (`user_id`, `is_removed`, `removed_at`, timestamps) are deliberately never
 * selected so they cannot leak in a response.
 */
const ADDRESS_SELECT = {
  address_id: true,
  address_type: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  country: true,
  zip: true,
  is_default: true,
} as const;

type AddressRow = Prisma.AddressGetPayload<{ select: typeof ADDRESS_SELECT }>;

/** Only active (non-removed) addresses are ever visible. */
const activeScope = (userId: string) => ({
  user_id: userId,
  is_removed: false,
});

/**
 * Address management for the authenticated user. Every method acts only on the
 * id resolved from the JWT (`@CurrentUser().id`) — never a client-supplied id —
 * and re-checks the active session first, since a valid JWT can outlive a
 * logout or soft delete. Writes are ownership-scoped (`updateMany`/`deleteMany`
 * with `count === 0 → 404`) so a user can only ever touch their own addresses.
 *
 * Invariant: a user has exactly one default address whenever they have ≥1 active
 * address. The first address auto-defaults; set-default and remove maintain it
 * inside transactions so it can't be raced.
 */
@Injectable()
export class AddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Lists the user's active addresses, default first then newest. */
  async getAddresses(userId: string): Promise<AddressResponse[]> {
    await this.assertActiveUser(userId);
    return this.listActive(this.prisma, userId);
  }

  /**
   * Adds an address. Enforces the active-address limit and auto-defaults the
   * user's very first address. The count-check + create run in one transaction
   * so two concurrent adds can't both clear the limit and overshoot it.
   */
  async addAddress(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponse> {
    await this.assertActiveUser(userId);

    // Serializable so two concurrent first-time adds can't both read count 0
    // and both create a default (mirrors the cart add-to-cart guard).
    const created = await this.prisma.$transaction(
      async (tx) => {
        const activeCount = await tx.address.count({
          where: activeScope(userId),
        });
        if (activeCount >= MAX_ACTIVE_ADDRESSES) {
          throw new BadRequestException(AddressMessages.limitReached);
        }

        return tx.address.create({
          data: {
            user_id: userId,
            address_type: dto.address_type,
            line1: dto.line1,
            line2: dto.line2 ?? null,
            city: dto.city,
            state: dto.state,
            country: dto.country,
            zip: dto.zip,
            // The first active address is the default.
            is_default: activeCount === 0,
          },
          select: ADDRESS_SELECT,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toAddress(created);
  }

  /**
   * Updates the present fields of one address. Ownership-scoped: a foreign or
   * already-removed id resolves as a 404 (never a Prisma P2025/500). Does not
   * touch `is_default` — that is set only via {@link setDefault}.
   */
  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponse> {
    await this.assertActiveUser(userId);

    // Build the payload from only the keys actually present, rather than
    // relying on Prisma's "explicit undefined = skip" behaviour.
    const data: Prisma.AddressUpdateManyMutationInput = {};
    if (dto.address_type !== undefined) data.address_type = dto.address_type;
    if (dto.line1 !== undefined) data.line1 = dto.line1;
    if (dto.line2 !== undefined) data.line2 = dto.line2;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.zip !== undefined) data.zip = dto.zip;

    const updated = await this.prisma.address.updateMany({
      where: { address_id: addressId, ...activeScope(userId) },
      data,
    });
    if (updated.count === 0) {
      throw new NotFoundException(AddressMessages.notFound);
    }

    return this.findOwnedAddress(userId, addressId);
  }

  /**
   * Makes one address the user's default. Runs in a transaction: verify
   * ownership (else 404), clear `is_default` on all the user's active
   * addresses, then set it on the target. Returns the refreshed list.
   */
  async setDefault(
    userId: string,
    addressId: string,
  ): Promise<AddressResponse[]> {
    await this.assertActiveUser(userId);

    // Serializable + the refreshed list built inside the transaction: the
    // "exactly one default" invariant holds under concurrency, and we avoid a
    // second `assertActiveUser` round trip after the commit.
    return this.prisma.$transaction(
      async (tx) => {
        const target = await tx.address.findFirst({
          where: { address_id: addressId, ...activeScope(userId) },
          select: { address_id: true },
        });
        if (!target) {
          throw new NotFoundException(AddressMessages.notFound);
        }

        await tx.address.updateMany({
          where: { ...activeScope(userId), is_default: true },
          data: { is_default: false },
        });
        // Ownership-scoped so the flag can never land on a foreign/removed row.
        await tx.address.updateMany({
          where: { address_id: addressId, ...activeScope(userId) },
          data: { is_default: true },
        });

        return this.listActive(tx, userId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Soft-removes an address (`is_removed`/`removed_at`, and clears its
   * `is_default`). If the removed address was the default and the user still
   * has active addresses, the most-recently-created one is promoted to default
   * — all in one transaction so the "exactly one default" invariant holds.
   */
  async removeAddress(
    userId: string,
    addressId: string,
  ): Promise<{ message: string }> {
    await this.assertActiveUser(userId);

    // Serializable so a concurrent set-default between the read and the write
    // can't leave the user with no default after a default is removed.
    await this.prisma.$transaction(
      async (tx) => {
        const target = await tx.address.findFirst({
          where: { address_id: addressId, ...activeScope(userId) },
          select: { is_default: true },
        });
        if (!target) {
          throw new NotFoundException(AddressMessages.notFound);
        }

        await tx.address.updateMany({
          where: { address_id: addressId, ...activeScope(userId) },
          data: {
            is_removed: true,
            removed_at: new Date(),
            is_default: false,
          },
        });

        // Promote a replacement default only when the removed one was default.
        // `activeScope` now excludes the just-removed row (is_removed is true).
        if (target.is_default) {
          const next = await tx.address.findFirst({
            where: activeScope(userId),
            orderBy: { created_at: 'desc' },
            select: { address_id: true },
          });
          if (next) {
            await tx.address.updateMany({
              where: { address_id: next.address_id, ...activeScope(userId) },
              data: { is_default: true },
            });
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { message: AddressMessages.removeSuccess };
  }

  // ----- Helpers -----

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
   * Lists the user's active addresses (default first, then newest). Takes the
   * Prisma client so it can run on the base connection or inside a transaction
   * (e.g. set-default builds its refreshed list within the same tx).
   */
  private async listActive(
    client: Prisma.TransactionClient,
    userId: string,
  ): Promise<AddressResponse[]> {
    const rows = await client.address.findMany({
      where: activeScope(userId),
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      select: ADDRESS_SELECT,
    });
    return rows.map((row) => this.toAddress(row));
  }

  /** Reads back an owned, active address for the response (else 404). */
  private async findOwnedAddress(
    userId: string,
    addressId: string,
  ): Promise<AddressResponse> {
    const row = await this.prisma.address.findFirst({
      where: { address_id: addressId, ...activeScope(userId) },
      select: ADDRESS_SELECT,
    });
    if (!row) {
      throw new NotFoundException(AddressMessages.notFound);
    }
    return this.toAddress(row);
  }

  private toAddress(row: AddressRow): AddressResponse {
    return {
      address_id: row.address_id,
      address_type: row.address_type,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      state: row.state,
      country: row.country,
      zip: row.zip,
      is_default: row.is_default,
    };
  }
}
