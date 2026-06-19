/**
 * Unit tests for AddressService.
 *
 * PrismaService and AuthService are replaced with jest mocks so no real
 * database connection is needed. The $transaction mock follows the same
 * Serializable-callback pattern established in cart.service.spec.ts: a
 * dedicated `mockTx` object is passed into the callback by the stub so inner
 * tx-calls can be asserted separately from outer prisma calls.
 *
 * Coverage goals:
 * - getAddresses: active-only filter, ordering, AddressResponse contract
 * - addAddress: limit enforcement (5), first-address auto-default, subsequent false
 * - updateAddress: ownership-scoped updateMany, count=0 → 404, present-keys-only
 * - setDefault: ownership check, unset-others + set-target transaction, refreshed list
 * - removeAddress: soft-delete, count=0 → 404, auto-promote when default removed
 * - assertActiveUser: inactive session → UnauthorizedException before any DB access
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { AddressService } from './address.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AddressMessages, AuthMessages } from '../constants/messages.constant';
import { MAX_ACTIVE_ADDRESSES } from '../constants/values.constant';
import { AddressType } from '../generated/prisma/enums';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

// ---------------------------------------------------------------------------
// Shared fixture IDs
// ---------------------------------------------------------------------------

const USER_ID = 'user-addr-001';
const ADDR_ID_1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ADDR_ID_2 = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

// ---------------------------------------------------------------------------
// tx object — passed into the $transaction callback for transactional methods
// ---------------------------------------------------------------------------

const mockTx = {
  address: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = {
  address: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  // $transaction invokes the callback immediately with mockTx.
  $transaction: jest.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
    callback(mockTx),
  ),
};

// ---------------------------------------------------------------------------
// Mock AuthService
// ---------------------------------------------------------------------------

const mockAuthService = {
  isUserActive: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Builds a minimal AddressResponse-shaped row. */
function makeAddressRow(overrides: {
  address_id?: string;
  address_type?: AddressType;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
  is_default?: boolean;
}) {
  return {
    address_id: overrides.address_id ?? ADDR_ID_1,
    address_type: overrides.address_type ?? AddressType.HOME,
    line1: overrides.line1 ?? '123 Main St',
    line2: overrides.line2 ?? null,
    city: overrides.city ?? 'Mumbai',
    state: overrides.state ?? 'Maharashtra',
    country: overrides.country ?? 'India',
    zip: overrides.zip ?? '400001',
    is_default: overrides.is_default ?? false,
  };
}

const baseDto: CreateAddressDto = {
  address_type: AddressType.HOME,
  line1: '123 Main St',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  zip: '400001',
};

// ---------------------------------------------------------------------------
// Matcher helpers
// ---------------------------------------------------------------------------

/**
 * Thin wrappers over jest's asymmetric matchers. The built-in `expect.*`
 * matchers are typed as `any`, which trips `no-unsafe-assignment` when nested
 * as a property value. Re-typing the result as `unknown` keeps behavior
 * identical while satisfying the type checker.
 */
const containing = (obj: object): unknown => expect.objectContaining(obj);
const anyOf = (ctor: unknown): unknown => expect.any(ctor);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AddressService', () => {
  let service: AddressService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Re-apply the $transaction implementation after clearAllMocks resets it.
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<AddressService>(AddressService);
  });

  // =========================================================================
  // assertActiveUser — exercised through every public method
  // =========================================================================

  describe('assertActiveUser (inactive session guard)', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(false);
    });

    it('getAddresses → throws UnauthorizedException with inactiveAccountMessage', async () => {
      await expect(service.getAddresses(USER_ID)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.inactiveAccountMessage),
      );
      // No DB access must occur before the check resolves
      expect(mockPrisma.address.findMany).not.toHaveBeenCalled();
    });

    it('addAddress → throws UnauthorizedException before any DB access', async () => {
      await expect(service.addAddress(USER_ID, baseDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('updateAddress → throws UnauthorizedException before any DB access', async () => {
      const dto: UpdateAddressDto = { line1: 'New Street' };
      await expect(
        service.updateAddress(USER_ID, ADDR_ID_1, dto),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.address.updateMany).not.toHaveBeenCalled();
    });

    it('setDefault → throws UnauthorizedException before any DB access', async () => {
      await expect(service.setDefault(USER_ID, ADDR_ID_1)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('removeAddress → throws UnauthorizedException before any DB access', async () => {
      await expect(service.removeAddress(USER_ID, ADDR_ID_1)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getAddresses
  // =========================================================================

  describe('getAddresses', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns an empty array when the user has no active addresses', async () => {
      mockPrisma.address.findMany.mockResolvedValue([]);

      const result = await service.getAddresses(USER_ID);

      expect(result).toEqual([]);
    });

    it('calls findMany with is_removed:false and correct ordering (default-first, then created_at desc)', async () => {
      mockPrisma.address.findMany.mockResolvedValue([]);

      await service.getAddresses(USER_ID);

      expect(mockPrisma.address.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER_ID, is_removed: false },
          orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
        }),
      );
    });

    it('maps rows to AddressResponse contract (no user_id / is_removed / removed_at)', async () => {
      const row = makeAddressRow({ address_id: ADDR_ID_1, is_default: true });
      mockPrisma.address.findMany.mockResolvedValue([row]);

      const result = await service.getAddresses(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        address_id: ADDR_ID_1,
        address_type: AddressType.HOME,
        line1: '123 Main St',
        line2: null,
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        zip: '400001',
        is_default: true,
      });
      // Sensitive / internal columns must not be present
      expect(result[0]).not.toHaveProperty('user_id');
      expect(result[0]).not.toHaveProperty('is_removed');
      expect(result[0]).not.toHaveProperty('removed_at');
    });

    it('returns multiple addresses preserving order returned by the DB', async () => {
      const rows = [
        makeAddressRow({ address_id: ADDR_ID_1, is_default: true }),
        makeAddressRow({ address_id: ADDR_ID_2, is_default: false }),
      ];
      mockPrisma.address.findMany.mockResolvedValue(rows);

      const result = await service.getAddresses(USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].address_id).toBe(ADDR_ID_1);
      expect(result[1].address_id).toBe(ADDR_ID_2);
    });

    it('maps line2 as null when the row has no line2', async () => {
      mockPrisma.address.findMany.mockResolvedValue([
        makeAddressRow({ line2: null }),
      ]);

      const result = await service.getAddresses(USER_ID);

      expect(result[0].line2).toBeNull();
    });

    it('maps line2 as a string when the row has a line2 value', async () => {
      mockPrisma.address.findMany.mockResolvedValue([
        makeAddressRow({ line2: 'Apt 4B' }),
      ]);

      const result = await service.getAddresses(USER_ID);

      expect(result[0].line2).toBe('Apt 4B');
    });
  });

  // =========================================================================
  // addAddress
  // =========================================================================

  describe('addAddress', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('creates the address and returns AddressResponse on success', async () => {
      const createdRow = makeAddressRow({
        address_id: ADDR_ID_1,
        is_default: true,
      });
      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue(createdRow);

      const result = await service.addAddress(USER_ID, baseDto);

      expect(result).toMatchObject({
        address_id: ADDR_ID_1,
        address_type: AddressType.HOME,
        line1: '123 Main St',
        is_default: true,
      });
    });

    it('sets is_default:true for the first active address (count=0)', async () => {
      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue(
        makeAddressRow({ is_default: true }),
      );

      await service.addAddress(USER_ID, baseDto);

      expect(mockTx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: containing({ is_default: true }),
        }),
      );
    });

    it('sets is_default:false for subsequent addresses (count > 0)', async () => {
      mockTx.address.count.mockResolvedValue(2);
      mockTx.address.create.mockResolvedValue(
        makeAddressRow({ is_default: false }),
      );

      await service.addAddress(USER_ID, baseDto);

      expect(mockTx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: containing({ is_default: false }),
        }),
      );
    });

    it('throws BadRequestException limitReached when count equals MAX_ACTIVE_ADDRESSES (5)', async () => {
      mockTx.address.count.mockResolvedValue(MAX_ACTIVE_ADDRESSES);

      await expect(service.addAddress(USER_ID, baseDto)).rejects.toThrow(
        new BadRequestException(AddressMessages.limitReached),
      );
      expect(mockTx.address.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException limitReached when count exceeds MAX_ACTIVE_ADDRESSES', async () => {
      // Should never happen in practice but service uses >= so guard both cases
      mockTx.address.count.mockResolvedValue(MAX_ACTIVE_ADDRESSES + 1);

      await expect(service.addAddress(USER_ID, baseDto)).rejects.toThrow(
        new BadRequestException(AddressMessages.limitReached),
      );
    });

    it('allows adding the 5th address (count=4, boundary)', async () => {
      mockTx.address.count.mockResolvedValue(MAX_ACTIVE_ADDRESSES - 1); // 4
      mockTx.address.create.mockResolvedValue(
        makeAddressRow({ is_default: false }),
      );

      await expect(service.addAddress(USER_ID, baseDto)).resolves.toBeDefined();
      expect(mockTx.address.create).toHaveBeenCalledTimes(1);
    });

    it('runs inside a $transaction (count-check + create are atomic)', async () => {
      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue(makeAddressRow({}));

      await service.addAddress(USER_ID, baseDto);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('passes line2 as null when dto.line2 is undefined', async () => {
      const dtoWithoutLine2: CreateAddressDto = { ...baseDto };
      // line2 is optional — ensure undefined maps to null in the create data
      delete (dtoWithoutLine2 as Partial<CreateAddressDto>).line2;

      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue(makeAddressRow({ line2: null }));

      await service.addAddress(USER_ID, dtoWithoutLine2);

      expect(mockTx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: containing({ line2: null }),
        }),
      );
    });

    it('passes line2 as the provided value when dto.line2 is set', async () => {
      const dtoWithLine2 = { ...baseDto, line2: 'Apt 4B' };
      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue(
        makeAddressRow({ line2: 'Apt 4B' }),
      );

      await service.addAddress(USER_ID, dtoWithLine2);

      expect(mockTx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: containing({ line2: 'Apt 4B' }),
        }),
      );
    });

    it('creates with user_id from the JWT, never from the DTO', async () => {
      mockTx.address.count.mockResolvedValue(0);
      mockTx.address.create.mockResolvedValue(makeAddressRow({}));

      await service.addAddress(USER_ID, baseDto);

      expect(mockTx.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: containing({ user_id: USER_ID }),
        }),
      );
    });
  });

  // =========================================================================
  // updateAddress
  // =========================================================================

  describe('updateAddress', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('updates and returns the updated AddressResponse on success', async () => {
      const updatedRow = makeAddressRow({
        address_id: ADDR_ID_1,
        line1: 'New St',
      });
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.findFirst.mockResolvedValue(updatedRow);

      const dto: UpdateAddressDto = { line1: 'New St' };
      const result = await service.updateAddress(USER_ID, ADDR_ID_1, dto);

      expect(result.line1).toBe('New St');
    });

    it('calls updateMany scoped to {address_id, user_id, is_removed:false} (ownership)', async () => {
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.findFirst.mockResolvedValue(makeAddressRow({}));

      await service.updateAddress(USER_ID, ADDR_ID_1, { line1: 'X' });

      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { address_id: ADDR_ID_1, user_id: USER_ID, is_removed: false },
        }),
      );
    });

    it('throws NotFoundException when updateMany count=0 (foreign or removed id)', async () => {
      mockPrisma.address.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateAddress(USER_ID, ADDR_ID_1, { line1: 'X' }),
      ).rejects.toThrow(new NotFoundException(AddressMessages.notFound));
    });

    it('builds the update payload from only the present DTO keys (present-keys-only)', async () => {
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.findFirst.mockResolvedValue(makeAddressRow({}));

      // Send only zip — no other fields should appear in the data payload
      await service.updateAddress(USER_ID, ADDR_ID_1, { zip: '110001' });

      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { zip: '110001' },
        }),
      );
    });

    it('does NOT include is_default in the update data (that field is set-default only)', async () => {
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.findFirst.mockResolvedValue(makeAddressRow({}));

      await service.updateAddress(USER_ID, ADDR_ID_1, { line1: 'Any' });

      const calls = mockPrisma.address.updateMany.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const callArg = calls[0][0];
      expect(callArg.data).not.toHaveProperty('is_default');
    });

    it('reads back the row after updateMany to build the response', async () => {
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.findFirst.mockResolvedValue(makeAddressRow({}));

      await service.updateAddress(USER_ID, ADDR_ID_1, { line1: 'X' });

      expect(mockPrisma.address.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { address_id: ADDR_ID_1, user_id: USER_ID, is_removed: false },
        }),
      );
    });

    it('throws NotFoundException when findFirst returns null after update (defensive 404)', async () => {
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      // findFirst returns null — should not normally happen but is guarded
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAddress(USER_ID, ADDR_ID_1, { line1: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // setDefault
  // =========================================================================

  describe('setDefault', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('throws NotFoundException when the target address does not belong to the user', async () => {
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(service.setDefault(USER_ID, ADDR_ID_1)).rejects.toThrow(
        new NotFoundException(AddressMessages.notFound),
      );
    });

    it('throws NotFoundException when the target address is already removed', async () => {
      // findFirst with is_removed:false scope returns null → address is removed
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(service.setDefault(USER_ID, ADDR_ID_1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('unsets is_default on all active addresses then sets it on the target (two updateMany calls)', async () => {
      mockTx.address.findFirst.mockResolvedValue({ address_id: ADDR_ID_1 });
      mockTx.address.updateMany.mockResolvedValue({ count: 1 });
      // refreshed list is built on the tx client inside the transaction
      mockTx.address.findMany.mockResolvedValue([
        makeAddressRow({ address_id: ADDR_ID_1, is_default: true }),
      ]);

      await service.setDefault(USER_ID, ADDR_ID_1);

      // unset others
      expect(mockTx.address.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({
            user_id: USER_ID,
            is_removed: false,
            is_default: true,
          }),
          data: { is_default: false },
        }),
      );
      // set target — ownership-scoped updateMany so the flag can't land on a
      // foreign/removed row
      expect(mockTx.address.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({
            address_id: ADDR_ID_1,
            user_id: USER_ID,
            is_removed: false,
          }),
          data: { is_default: true },
        }),
      );
    });

    it('returns the refreshed list after the transaction', async () => {
      mockTx.address.findFirst.mockResolvedValue({ address_id: ADDR_ID_1 });
      mockTx.address.updateMany.mockResolvedValue({ count: 1 });
      mockTx.address.findMany.mockResolvedValue([
        makeAddressRow({ address_id: ADDR_ID_1, is_default: true }),
        makeAddressRow({ address_id: ADDR_ID_2, is_default: false }),
      ]);

      const result = await service.setDefault(USER_ID, ADDR_ID_1);

      expect(result).toHaveLength(2);
      expect(result[0].is_default).toBe(true);
      expect(result[1].is_default).toBe(false);
    });

    it('runs inside a $transaction', async () => {
      mockTx.address.findFirst.mockResolvedValue({ address_id: ADDR_ID_1 });
      mockTx.address.updateMany.mockResolvedValue({ count: 0 });
      mockTx.address.findMany.mockResolvedValue([]);

      await service.setDefault(USER_ID, ADDR_ID_1);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('checks target ownership inside the transaction using is_removed:false scope', async () => {
      mockTx.address.findFirst.mockResolvedValue({ address_id: ADDR_ID_1 });
      mockTx.address.updateMany.mockResolvedValue({ count: 0 });
      mockTx.address.findMany.mockResolvedValue([]);

      await service.setDefault(USER_ID, ADDR_ID_1);

      expect(mockTx.address.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { address_id: ADDR_ID_1, user_id: USER_ID, is_removed: false },
        }),
      );
    });
  });

  // =========================================================================
  // removeAddress
  // =========================================================================

  describe('removeAddress', () => {
    beforeEach(() => {
      mockAuthService.isUserActive.mockResolvedValue(true);
    });

    it('returns removeSuccess message on successful soft-delete', async () => {
      // Non-default address
      mockTx.address.findFirst.mockResolvedValue({ is_default: false });
      mockTx.address.update.mockResolvedValue({ address_id: ADDR_ID_1 });

      const result = await service.removeAddress(USER_ID, ADDR_ID_1);

      expect(result).toEqual({ message: AddressMessages.removeSuccess });
    });

    it('throws NotFoundException when the address does not belong to the user (findFirst returns null)', async () => {
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(service.removeAddress(USER_ID, ADDR_ID_1)).rejects.toThrow(
        new NotFoundException(AddressMessages.notFound),
      );
    });

    it('throws NotFoundException when the address is already removed', async () => {
      // findFirst scoped to is_removed:false returns null
      mockTx.address.findFirst.mockResolvedValue(null);

      await expect(service.removeAddress(USER_ID, ADDR_ID_1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes: sets is_removed=true, removed_at=Date, is_default=false', async () => {
      mockTx.address.findFirst.mockResolvedValue({ is_default: false });
      mockTx.address.updateMany.mockResolvedValue({ count: 1 });

      await service.removeAddress(USER_ID, ADDR_ID_1);

      expect(mockTx.address.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: containing({
            address_id: ADDR_ID_1,
            user_id: USER_ID,
            is_removed: false,
          }),
          data: containing({
            is_removed: true,
            is_default: false,
            removed_at: anyOf(Date),
          }),
        }),
      );
    });

    it('does NOT promote a new default when the removed address was NOT the default', async () => {
      mockTx.address.findFirst
        .mockResolvedValueOnce({ is_default: false }) // the removed address
        // no second call should happen
        .mockResolvedValueOnce(null);

      mockTx.address.updateMany.mockResolvedValue({ count: 1 });

      await service.removeAddress(USER_ID, ADDR_ID_1);

      // findFirst must only be called once (for the ownership/existence check)
      // updateMany must only be called once (the soft-delete)
      expect(mockTx.address.updateMany).toHaveBeenCalledTimes(1);
    });

    it('promotes the newest remaining active address when the removed one WAS the default and others exist', async () => {
      mockTx.address.findFirst
        .mockResolvedValueOnce({ is_default: true }) // removed address was default
        .mockResolvedValueOnce({ address_id: ADDR_ID_2 }); // next candidate

      mockTx.address.updateMany.mockResolvedValue({ count: 1 });

      await service.removeAddress(USER_ID, ADDR_ID_1);

      // updateMany must be called twice: soft-delete + promote
      expect(mockTx.address.updateMany).toHaveBeenCalledTimes(2);
      expect(mockTx.address.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: containing({
            address_id: ADDR_ID_2,
            user_id: USER_ID,
            is_removed: false,
          }),
          data: { is_default: true },
        }),
      );
    });

    it('does NOT promote when removed default was the only address (next candidate is null)', async () => {
      mockTx.address.findFirst
        .mockResolvedValueOnce({ is_default: true }) // removed address was default
        .mockResolvedValueOnce(null); // no remaining active addresses

      mockTx.address.updateMany.mockResolvedValue({ count: 1 });

      await service.removeAddress(USER_ID, ADDR_ID_1);

      // Only one updateMany call (the soft-delete itself)
      expect(mockTx.address.updateMany).toHaveBeenCalledTimes(1);
    });

    it('runs inside a $transaction', async () => {
      mockTx.address.findFirst.mockResolvedValue({ is_default: false });
      mockTx.address.update.mockResolvedValue({ address_id: ADDR_ID_1 });

      await service.removeAddress(USER_ID, ADDR_ID_1);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('checks address ownership/existence inside transaction with is_removed:false scope', async () => {
      mockTx.address.findFirst.mockResolvedValue({ is_default: false });
      mockTx.address.update.mockResolvedValue({ address_id: ADDR_ID_1 });

      await service.removeAddress(USER_ID, ADDR_ID_1);

      expect(mockTx.address.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { address_id: ADDR_ID_1, user_id: USER_ID, is_removed: false },
        }),
      );
    });

    it('searches for the next default candidate using orderBy created_at desc', async () => {
      mockTx.address.findFirst
        .mockResolvedValueOnce({ is_default: true })
        .mockResolvedValueOnce({ address_id: ADDR_ID_2 });
      mockTx.address.update.mockResolvedValue({});

      await service.removeAddress(USER_ID, ADDR_ID_1);

      // The second findFirst call (for promotion candidate) must order by created_at desc
      expect(mockTx.address.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });
  });
});
