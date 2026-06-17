import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { AuthMessages } from '../constants/messages.constant';
import { AddressType } from '../generated/prisma/enums';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('signed-token'),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1d',
    };
    return map[key];
  }),
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1d',
      JWT_SECRET: 'test-secret',
    };
    if (!(key in map)) throw new Error(`Missing config: ${key}`);
    return map[key];
  }),
};

const mockRes = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as import('express').Response;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validSignupDto = {
  email: 'test@example.com',
  password: 'Password1!',
  user_name: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  phone: '9876543210',
  line1: '123 Main St',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  zip: '400001',
  address_type: AddressType.HOME,
};

const validLoginDto = {
  email: 'test@example.com',
  password: 'Password1!',
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -------------------------------------------------------------------------
  // signup
  // -------------------------------------------------------------------------

  describe('signup', () => {
    it('creates user, address and cart atomically and returns success message', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Simulate the transaction by invoking the callback with a mock tx
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const tx = {
            user: { create: jest.fn().mockResolvedValue({ user_id: 'u-1' }) },
            address: { create: jest.fn().mockResolvedValue({ address_id: 'a-1' }) },
            cart: { create: jest.fn().mockResolvedValue({ cart_id: 'c-1' }) },
          };
          await fn(tx);
        },
      );

      const result = await service.signup(validSignupDto);
      expect(result).toEqual({ message: AuthMessages.signupSuccessMessage });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ user_id: 'existing' });

      await expect(service.signup(validSignupDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('hashes the password before storing (never stores plaintext)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      let capturedData: { password_hash?: string } = {};
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const tx = {
            user: {
              create: jest.fn().mockImplementation(
                (args: { data: typeof capturedData }) => {
                  capturedData = args.data;
                  return { user_id: 'u-1' };
                },
              ),
            },
            address: { create: jest.fn().mockResolvedValue({ address_id: 'a-1' }) },
            cart: { create: jest.fn().mockResolvedValue({ cart_id: 'c-1' }) },
          };
          await fn(tx);
        },
      );

      await service.signup(validSignupDto);

      expect(capturedData.password_hash).toBeDefined();
      expect(capturedData.password_hash).not.toBe(validSignupDto.password);
      const isHashed = await bcrypt.compare(
        validSignupDto.password,
        capturedData.password_hash as string,
      );
      expect(isHashed).toBe(true);
    });

    it('account is created inactive (is_active=false) per business rules', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      let capturedUserData: { is_active?: boolean } = {};
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const tx = {
            user: {
              create: jest.fn().mockImplementation(
                (args: { data: typeof capturedUserData }) => {
                  capturedUserData = args.data;
                  return { user_id: 'u-1' };
                },
              ),
            },
            address: { create: jest.fn().mockResolvedValue({ address_id: 'a-1' }) },
            cart: { create: jest.fn().mockResolvedValue({ cart_id: 'c-1' }) },
          };
          await fn(tx);
        },
      );

      await service.signup(validSignupDto);
      expect(capturedUserData.is_active).toBe(false);
    });

    it('throws ConflictException on race-condition duplicate email (P2002)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const prismaError = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7.0.0',
      });
      mockPrisma.$transaction.mockRejectedValue(prismaError);

      await expect(service.signup(validSignupDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------

  describe('login', () => {
    const passwordHash = bcrypt.hashSync(validLoginDto.password, 1);

    const activeUser = {
      user_id: 'u-1',
      email: validLoginDto.email,
      password_hash: passwordHash,
      is_deleted: false,
      deleted_at: null,
    };

    it('returns user data and sets auth cookie on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.user.update.mockResolvedValue({ user_id: 'u-1' });

      const result = await service.login(validLoginDto, mockRes);

      expect(result.message).toBe(AuthMessages.loginSuccessMessage);
      expect(result.user).toEqual({ id: 'u-1', email: validLoginDto.email });
      expect(mockRes.cookie).toHaveBeenCalledTimes(1);
    });

    it('marks the user is_active=true on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.user.update.mockResolvedValue({ user_id: 'u-1' });

      await service.login(validLoginDto, mockRes);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'u-1' },
          data: { is_active: true },
        }),
      );
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(validLoginDto, mockRes)).rejects.toThrow(
        new UnauthorizedException(AuthMessages.invalidCredentialsMessage),
      );
    });

    it('throws UnauthorizedException for a soft-deleted user (is_deleted=true)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        is_deleted: true,
      });

      await expect(service.login(validLoginDto, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a soft-deleted user (deleted_at set)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        deleted_at: new Date(),
      });

      await expect(service.login(validLoginDto, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.login({ ...validLoginDto, password: 'WrongPass1!' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('marks the user inactive and clears the cookie', async () => {
      mockPrisma.user.update.mockResolvedValue({ user_id: 'u-1' });

      const result = await service.logout({ id: 'u-1', email: 'a@b.com' }, mockRes);

      expect(result).toEqual({ message: AuthMessages.logoutSuccessMessage });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { is_active: false } }),
      );
      expect(mockRes.clearCookie).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // getProfile
  // -------------------------------------------------------------------------

  describe('getProfile', () => {
    const activeUser = {
      user_id: 'u-1',
      email: 'a@b.com',
      first_name: 'Alice',
      last_name: 'Smith',
      user_name: 'alice',
      is_active: true,
      is_deleted: false,
      deleted_at: null,
    };

    it('returns user profile when active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await service.getProfile('u-1');

      expect(result).toEqual({
        id: 'u-1',
        email: 'a@b.com',
        first_name: 'Alice',
        last_name: 'Smith',
        user_name: 'alice',
      });
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('u-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user is_active=false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        is_active: false,
      });

      await expect(service.getProfile('u-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        is_deleted: true,
        deleted_at: new Date(),
      });

      await expect(service.getProfile('u-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // isUserActive
  // -------------------------------------------------------------------------

  describe('isUserActive', () => {
    it('returns true for an active, non-deleted user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        is_active: true,
        is_deleted: false,
        deleted_at: null,
      });

      const result = await service.isUserActive('u-1');
      expect(result).toBe(true);
    });

    it('returns false when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.isUserActive('u-1');
      expect(result).toBe(false);
    });

    it('returns false when user is_active=false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        is_active: false,
        is_deleted: false,
        deleted_at: null,
      });

      const result = await service.isUserActive('u-1');
      expect(result).toBe(false);
    });

    it('returns false when user is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        is_active: false,
        is_deleted: true,
        deleted_at: new Date(),
      });

      const result = await service.isUserActive('u-1');
      expect(result).toBe(false);
    });
  });
});
