/**
 * E2E tests for UserController (GET/PATCH/DELETE /user).
 *
 * PrismaService is overridden with a jest mock so no real database connection
 * is required. JwtModule is configured with a test secret so we can sign real
 * tokens and exercise the full JWT-cookie auth flow.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { UserController } from '../src/user/user.controller';
import { UserService } from '../src/user/user.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { UserMessages } from '../src/constants/messages.constant';
import { UserProfile } from '../src/user/types/user.types';

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-user-test-secret';
const TEST_USER_ID = 'usr-e2e-001';
const TEST_EMAIL = 'e2e@example.com';

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Mock ConfigService – provides the JWT secret used by JwtStrategy
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
// Helpers
// ---------------------------------------------------------------------------

function buildCookieHeader(token: string): string {
  return `access_token=${token}`;
}

function validUserProfile() {
  return {
    user_id: TEST_USER_ID,
    email: TEST_EMAIL,
    first_name: 'Alice',
    last_name: 'Smith',
    user_name: 'alice',
    phone: '9876543210',
  };
}

describe('UserController (e2e)', () => {
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
      controllers: [UserController],
      providers: [
        UserService,
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
  // GET /user
  // -------------------------------------------------------------------------

  describe('GET /user', () => {
    it('returns 200 with profile when authenticated and active', async () => {
      // First call: isUserActive check inside UserService.assertActiveUser
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          is_active: true,
          is_deleted: false,
          deleted_at: null,
        })
        // Second call: the actual getUser findUnique
        .mockResolvedValueOnce(validUserProfile());

      const res = await request(app.getHttpServer())
        .get('/user')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        first_name: 'Alice',
        last_name: 'Smith',
        user_name: 'alice',
      });
      // password_hash must never appear in the response
      expect(res.body).not.toHaveProperty('password_hash');
    });

    it('returns 401 when no auth cookie is present', async () => {
      const res = await request(app.getHttpServer()).get('/user');
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is malformed', async () => {
      const res = await request(app.getHttpServer())
        .get('/user')
        .set('Cookie', 'access_token=not.a.valid.jwt');
      expect(res.status).toBe(401);
    });

    it('returns 401 when user is inactive (JWT still valid but session ended)', async () => {
      // isUserActive returns false → UnauthorizedException from UserService
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_active: false,
        is_deleted: false,
        deleted_at: null,
      });

      const res = await request(app.getHttpServer())
        .get('/user')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /user
  // -------------------------------------------------------------------------

  describe('PATCH /user', () => {
    it('returns 200 with updated profile on valid partial update', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_active: true,
        is_deleted: false,
        deleted_at: null,
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        ...validUserProfile(),
        first_name: 'Alicia',
      });

      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Cookie', buildCookieHeader(validToken))
        .send({ first_name: 'Alicia' });

      expect(res.status).toBe(200);
      const body = res.body as UserProfile;
      expect(body.first_name).toBe('Alicia');
    });

    it('returns 400 when email is not a valid email format', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Cookie', buildCookieHeader(validToken))
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when phone does not match 10-digit format', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Cookie', buildCookieHeader(validToken))
        .send({ phone: '123' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when a non-whitelisted field is included (password escalation attempt)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Cookie', buildCookieHeader(validToken))
        .send({ password: 'NewPass1!' });

      expect(res.status).toBe(400);
    });

    it('returns 401 when no auth cookie is present', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user')
        .send({ first_name: 'Bob' });

      expect(res.status).toBe(401);
    });

    it('returns 200 when all optional fields are provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_active: true,
        is_deleted: false,
        deleted_at: null,
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        ...validUserProfile(),
        first_name: 'Bob',
        last_name: 'Jones',
        user_name: 'bobby',
        email: 'bob@example.com',
        phone: '1234567890',
      });

      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Cookie', buildCookieHeader(validToken))
        .send({
          first_name: 'Bob',
          last_name: 'Jones',
          user_name: 'bobby',
          email: 'bob@example.com',
          phone: '1234567890',
        });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /user
  // -------------------------------------------------------------------------

  describe('DELETE /user', () => {
    it('returns 200 with success message on account deletion', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_active: true,
        is_deleted: false,
        deleted_at: null,
      });
      mockPrisma.user.update.mockResolvedValueOnce({ user_id: TEST_USER_ID });

      const res = await request(app.getHttpServer())
        .delete('/user')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: UserMessages.deleteSuccess });
    });

    it('returns 401 when no auth cookie is present', async () => {
      const res = await request(app.getHttpServer()).delete('/user');
      expect(res.status).toBe(401);
    });

    it('clears the auth cookie in the Set-Cookie response header after deletion', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_active: true,
        is_deleted: false,
        deleted_at: null,
      });
      mockPrisma.user.update.mockResolvedValueOnce({ user_id: TEST_USER_ID });

      const res = await request(app.getHttpServer())
        .delete('/user')
        .set('Cookie', buildCookieHeader(validToken));

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'] as
        | string[]
        | string
        | undefined;
      const cookieStr = Array.isArray(setCookie)
        ? setCookie.join('; ')
        : (setCookie ?? '');
      expect(cookieStr).toContain('access_token');
    });
  });
});
