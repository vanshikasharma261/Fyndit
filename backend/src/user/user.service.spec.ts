import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuthMessages, UserMessages } from '../constants/messages.constant';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '../generated/prisma/client';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockAuthService = {
  isUserActive: jest.fn(),
  clearSessionCookie: jest.fn(),
};

// A minimal mock of the Response object needed by deleteUser
const mockRes = {
  clearCookie: jest.fn(),
} as unknown as import('express').Response;

/**
 * Thin wrapper over jest's `expect.objectContaining`. The built-in matcher is
 * typed as `any`, which trips `no-unsafe-assignment` when nested as a property
 * value. Re-typing the result as `unknown` keeps behavior identical while
 * satisfying the type checker.
 */
const containing = (obj: object): unknown => expect.objectContaining(obj);

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  // -------------------------------------------------------------------------
  // getUser
  // -------------------------------------------------------------------------

  describe('getUser', () => {
    const userId = 'user-001';

    const dbRow = {
      user_id: userId,
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      user_name: 'alice',
      phone: '9876543210',
    };

    it('returns the user profile when account is active', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.findUnique.mockResolvedValue(dbRow);

      const result = await service.getUser(userId);

      expect(result).toEqual({
        id: dbRow.user_id,
        email: dbRow.email,
        first_name: dbRow.first_name,
        last_name: dbRow.last_name,
        user_name: dbRow.user_name,
        phone: dbRow.phone,
      });
      expect(mockAuthService.isUserActive).toHaveBeenCalledWith(userId);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: userId } }),
      );
    });

    it('includes phone: null when user has no phone', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...dbRow,
        phone: null,
      });

      const result = await service.getUser(userId);
      expect(result.phone).toBeNull();
    });

    it('throws UnauthorizedException when account is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.getUser(userId)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when findUnique returns null (concurrent delete)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUser(userId)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.inactiveAccountMessage),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateUser
  // -------------------------------------------------------------------------

  describe('updateUser', () => {
    const userId = 'user-001';

    const updatedRow = {
      user_id: userId,
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      user_name: 'alice',
      phone: '9876543210',
    };

    it('updates only the provided fields and returns the refreshed profile', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue(updatedRow);

      const dto: UpdateUserDto = { first_name: 'Alicia' };
      const result = await service.updateUser(userId, dto);

      expect(result).toEqual({
        id: updatedRow.user_id,
        email: updatedRow.email,
        first_name: updatedRow.first_name,
        last_name: updatedRow.last_name,
        user_name: updatedRow.user_name,
        phone: updatedRow.phone,
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: userId },
          data: { first_name: 'Alicia' },
        }),
      );
    });

    it('sends only provided keys in the update payload (partial update)', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue(updatedRow);

      const dto: UpdateUserDto = {
        email: 'new@example.com',
        phone: '1234567890',
      };
      await service.updateUser(userId, dto);

      const updateCalls = mockPrismaService.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const callArg = updateCalls[0][0];
      expect(callArg.data).toEqual({
        email: 'new@example.com',
        phone: '1234567890',
      });
      // first_name, last_name, user_name must not be in the data payload
      expect(callArg.data).not.toHaveProperty('first_name');
      expect(callArg.data).not.toHaveProperty('last_name');
      expect(callArg.data).not.toHaveProperty('user_name');
    });

    it('throws UnauthorizedException when account is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(
        service.updateUser(userId, { first_name: 'Bob' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException with email field error on email uniqueness collision', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);

      const prismaError = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.0.0',
        meta: { target: ['email'] },
      });
      mockPrismaService.user.update.mockRejectedValue(prismaError);

      const dto: UpdateUserDto = { email: 'taken@example.com' };

      await expect(service.updateUser(userId, dto)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await service.updateUser(userId, dto);
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          statusCode: 400,
          errors: { email: UserMessages.emailAlreadyExists },
        });
      }
    });

    it('re-throws unexpected Prisma errors unchanged', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);

      const unexpectedError = new Error('DB crashed');
      mockPrismaService.user.update.mockRejectedValue(unexpectedError);

      await expect(
        service.updateUser(userId, { first_name: 'Alice' }),
      ).rejects.toThrow('DB crashed');
    });

    it('re-throws P2002 on a non-email unique field without wrapping it', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);

      const prismaError = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.0.0',
        meta: { target: ['user_name'] }, // different field
      });
      mockPrismaService.user.update.mockRejectedValue(prismaError);

      await expect(
        service.updateUser(userId, { user_name: 'taken' }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });
  });

  // -------------------------------------------------------------------------
  // deleteUser
  // -------------------------------------------------------------------------

  describe('deleteUser', () => {
    const userId = 'user-001';

    it('soft-deletes the account and clears the session cookie', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue({ user_id: userId });
      mockAuthService.clearSessionCookie.mockImplementation(() => undefined);

      const result = await service.deleteUser(userId, mockRes);

      expect(result).toEqual({ message: UserMessages.deleteSuccess });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: userId },
          data: containing({
            is_deleted: true,
            is_active: false,
          }),
        }),
      );
      expect(mockAuthService.clearSessionCookie).toHaveBeenCalledWith(mockRes);
    });

    it('sets deleted_at to a Date instance during soft-delete', async () => {
      mockAuthService.isUserActive.mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue({ user_id: userId });

      await service.deleteUser(userId, mockRes);

      const updateCalls = mockPrismaService.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const callArg = updateCalls[0][0];
      expect(callArg.data.deleted_at).toBeInstanceOf(Date);
    });

    it('throws UnauthorizedException when account is inactive', async () => {
      mockAuthService.isUserActive.mockResolvedValue(false);

      await expect(service.deleteUser(userId, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });
});
