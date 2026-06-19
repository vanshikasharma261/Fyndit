/**
 * E2E tests for AuthController
 * (POST /auth/signup, POST /auth/login, POST /auth/logout, GET /auth/me).
 *
 * PrismaService is overridden with jest mocks. bcrypt.hash is called with a low
 * cost-factor (1) for speed, but the real bcrypt module is used so the
 * hash/compare contract is exercised end-to-end.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { AuthMessages } from '../src/constants/messages.constant';
import { AddressType } from '../src/generated/prisma/enums';
import { UserProfile } from '../src/auth/types/auth.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-auth-secret';
const TEST_USER_ID = 'usr-auth-001';
const TEST_EMAIL = 'auth@example.com';
const TEST_PASSWORD = 'Password1!';

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---------------------------------------------------------------------------
// Mock ConfigService
// ---------------------------------------------------------------------------

const mockConfigService = {
  get: (key: string) => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
    };
    return values[key];
  },
  getOrThrow: (key: string) => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
    };
    if (!(key in values)) throw new Error(`Missing config key: ${key}`);
    return values[key];
  },
};

// ---------------------------------------------------------------------------
// Valid signup payload (satisfies all SignupDto validators)
// ---------------------------------------------------------------------------

const validSignup = {
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  user_name: 'authuser',
  first_name: 'Auth',
  last_name: 'User',
  phone: '9876543210',
  line1: '123 Main Street',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  zip: '400001',
  address_type: AddressType.HOME,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCookieHeader(token: string): string {
  return `access_token=${token}`;
}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let validToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );

    await app.init();

    jwtService = module.get<JwtService>(JwtService);
    validToken = await jwtService.signAsync({
      sub: TEST_USER_ID,
      email: TEST_EMAIL,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /auth/signup
  // -------------------------------------------------------------------------

  describe('POST /auth/signup', () => {
    it('returns 201 and success message on valid signup', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          await fn({
            user: { create: jest.fn().mockResolvedValue({ user_id: 'u-1' }) },
            address: {
              create: jest.fn().mockResolvedValue({ address_id: 'a-1' }),
            },
            cart: { create: jest.fn().mockResolvedValue({ cart_id: 'c-1' }) },
          });
        },
      );

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(validSignup);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: AuthMessages.signupSuccessMessage });
    });

    it('returns 409 when email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ user_id: 'existing' });

      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(validSignup);

      expect(res.status).toBe(409);
    });

    it('returns 400 when email is missing', async () => {
      const { email: _e, ...rest } = validSignup;
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(rest);

      expect(res.status).toBe(400);
    });

    it('returns 400 when password does not meet strength requirements', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ ...validSignup, password: 'weak' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when phone is not exactly 10 digits', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ ...validSignup, phone: '123' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when zip is not exactly 6 digits', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ ...validSignup, zip: '1234' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when country is not India', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ ...validSignup, country: 'USA' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when state is not a valid Indian state', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ ...validSignup, state: 'California' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when first_name is missing', async () => {
      const { first_name: _f, ...rest } = validSignup;
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(rest);

      expect(res.status).toBe(400);
    });

    it('returns 400 when line1 is missing', async () => {
      const { line1: _l, ...rest } = validSignup;
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(rest);

      expect(res.status).toBe(400);
    });

    it('returns 400 when email format is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ ...validSignup, email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/login
  // -------------------------------------------------------------------------

  describe('POST /auth/login', () => {
    const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 1);

    const activeUser = {
      user_id: TEST_USER_ID,
      email: TEST_EMAIL,
      password_hash: passwordHash,
      is_deleted: false,
      deleted_at: null,
    };

    it('returns 200 and sets auth cookie on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.user.update.mockResolvedValue({ user_id: TEST_USER_ID });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      const body = res.body as { message: string; user: UserProfile };
      expect(body.message).toBe(AuthMessages.loginSuccessMessage);
      expect(body.user).toMatchObject({
        id: TEST_USER_ID,
        email: TEST_EMAIL,
      });

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('access_token');
    });

    it('returns 401 when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@example.com', password: TEST_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('returns 401 when password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: 'WrongPass1!' });

      expect(res.status).toBe(401);
    });

    it('returns 401 when the user is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        is_deleted: true,
        deleted_at: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('returns 400 when email is malformed', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: TEST_PASSWORD });

      expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_EMAIL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /auth/logout
  // -------------------------------------------------------------------------

  describe('POST /auth/logout', () => {
    it('returns 200 and clears the auth cookie', async () => {
      mockPrisma.user.update.mockResolvedValue({ user_id: TEST_USER_ID });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: AuthMessages.logoutSuccessMessage });

      const cookies = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookies)
        ? cookies.join('; ')
        : (cookies ?? '');
      expect(cookieStr).toContain('access_token');
    });

    it('returns 401 when no auth cookie is present', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(401);
    });

    it('marks the user is_active=false in the database', async () => {
      mockPrisma.user.update.mockResolvedValue({ user_id: TEST_USER_ID });

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', buildCookieHeader(validToken));

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { is_active: false },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /auth/me
  // -------------------------------------------------------------------------

  describe('GET /auth/me', () => {
    const activeProfile = {
      user_id: TEST_USER_ID,
      email: TEST_EMAIL,
      first_name: 'Auth',
      last_name: 'User',
      user_name: 'authuser',
      is_active: true,
      is_deleted: false,
      deleted_at: null,
    };

    it('returns 200 with user profile when authenticated and active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeProfile);

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        first_name: 'Auth',
        last_name: 'User',
        user_name: 'authuser',
      });
      expect(res.body).not.toHaveProperty('password_hash');
      expect(res.body).not.toHaveProperty('is_active');
    });

    it('returns 401 when no auth cookie is present', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 when the account is inactive (JWT valid but session ended)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeProfile,
        is_active: false,
      });

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(401);
    });

    it('returns 401 when the account is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeProfile,
        is_deleted: true,
        deleted_at: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });
});
