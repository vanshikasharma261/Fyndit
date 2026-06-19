/**
 * E2E tests for AddressController (GET /address, POST /address,
 * PATCH /address/:addressId, PATCH /address/:addressId/default,
 * DELETE /address/:addressId).
 *
 * PrismaService is replaced with jest mocks (no real DB). JwtModule is
 * configured with a fixed test secret so we can sign real tokens and exercise
 * the full JWT-cookie auth flow. The GlobalValidationPipe (whitelist +
 * forbidNonWhitelisted + transform) is attached so DTO and ParseUUIDPipe
 * validation rejections are tested with real 400 responses.
 *
 * Setup mirrors cart.e2e-spec.ts conventions exactly:
 * - ConfigService provided via useValue (no ConfigModule)
 * - JwtModule.register with a fixed test secret
 * - PrismaService mocked with jest.fn() stubs
 * - AddressService mocked with jest.fn() stubs at the controller layer
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { AddressController } from '../src/address/address.controller';
import { AddressService } from '../src/address/address.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { AddressMessages } from '../src/constants/messages.constant';
import { AddressType } from '../src/generated/prisma/enums';
import { AddressResponse } from '../src/address/types/address.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'e2e-address-test-secret';
const TEST_USER_ID = 'usr-e2e-addr-001';
const TEST_EMAIL = 'address-e2e@example.com';
const ADDRESS_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const OTHER_ADDRESS_UUID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const NON_UUID_ID = 'not-a-uuid';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  address: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

/** AddressService mock that delegates every call to jest.fn() stubs. */
const mockAddressService = {
  getAddresses: jest.fn(),
  addAddress: jest.fn(),
  updateAddress: jest.fn(),
  setDefault: jest.fn(),
  removeAddress: jest.fn(),
};

const mockConfigService = {
  get: (key: string): string | undefined => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      JWT_EXPIRES_IN: '1h',
      JWT_SECRET: TEST_JWT_SECRET,
    };
    return values[key];
  },
  getOrThrow: (key: string): string => {
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

function cookieHeader(token: string): string {
  return `access_token=${token}`;
}

/**
 * Thin wrapper over jest's `expect.any`. The built-in matcher is typed as
 * `any`, which trips `no-unsafe-assignment` when nested as a property value.
 * Re-typing the result as `unknown` keeps behavior identical while satisfying
 * the type checker.
 */
const anyOf = (ctor: unknown): unknown => expect.any(ctor);

/** Valid CreateAddressDto payload. */
function validAddressPayload() {
  return {
    address_type: AddressType.HOME,
    line1: '123 Main Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    zip: '400001',
  };
}

/** Minimal AddressResponse fixture. */
function addressResponse(
  overrides: Partial<{
    address_id: string;
    is_default: boolean;
    line2: string | null;
  }> = {},
) {
  return {
    address_id: overrides.address_id ?? ADDRESS_UUID,
    address_type: AddressType.HOME,
    line1: '123 Main Street',
    line2: overrides.line2 ?? null,
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    zip: '400001',
    is_default: overrides.is_default ?? false,
  };
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

describe('AddressController (e2e)', () => {
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
      controllers: [AddressController],
      providers: [
        { provide: AddressService, useValue: mockAddressService },
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
    // JwtStrategy calls prisma.user.findUnique to validate the token subject.
    mockPrisma.user.findUnique.mockResolvedValue({
      is_active: true,
      is_deleted: false,
      deleted_at: null,
    });
  });

  // =========================================================================
  // Auth guard enforcement — every route must reject without a valid token
  // =========================================================================

  describe('Auth guard — all routes require JWT', () => {
    it('GET /address → 401 when no cookie is provided', async () => {
      const res = await request(app.getHttpServer()).get('/address');
      expect(res.status).toBe(401);
    });

    it('POST /address → 401 when no cookie is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .send(validAddressPayload());
      expect(res.status).toBe(401);
    });

    it('PATCH /address/:id → 401 when no cookie is provided', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .send({ line1: 'Updated' });
      expect(res.status).toBe(401);
    });

    it('PATCH /address/:id/default → 401 when no cookie is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/address/${ADDRESS_UUID}/default`,
      );
      expect(res.status).toBe(401);
    });

    it('DELETE /address/:id → 401 when no cookie is provided', async () => {
      const res = await request(app.getHttpServer()).delete(
        `/address/${ADDRESS_UUID}`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 401 when the JWT token is malformed', async () => {
      const res = await request(app.getHttpServer())
        .get('/address')
        .set('Cookie', 'access_token=not.a.real.jwt');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // ParseUUIDPipe — :addressId param validation
  // =========================================================================

  describe('ParseUUIDPipe — :addressId param', () => {
    it('PATCH /address/:id returns 400 when addressId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${NON_UUID_ID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ line1: 'Updated Street' });
      expect(res.status).toBe(400);
    });

    it('PATCH /address/:id/default returns 400 when addressId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${NON_UUID_ID}/default`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(400);
    });

    it('DELETE /address/:id returns 400 when addressId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/address/${NON_UUID_ID}`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(400);
    });

    it('PATCH /address/:id accepts a valid UUID', async () => {
      mockAddressService.updateAddress.mockResolvedValue(addressResponse());

      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ line1: 'Updated Street' });
      expect(res.status).toBe(200);
    });

    it('DELETE /address/:id accepts a valid UUID', async () => {
      mockAddressService.removeAddress.mockResolvedValue({
        message: AddressMessages.removeSuccess,
      });

      const res = await request(app.getHttpServer())
        .delete(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken));
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // GET /address
  // =========================================================================

  describe('GET /address', () => {
    it('returns 200 with an array of AddressResponse when authenticated', async () => {
      mockAddressService.getAddresses.mockResolvedValue([addressResponse()]);

      const res = await request(app.getHttpServer())
        .get('/address')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const body = res.body as AddressResponse[];
      expect(body[0]).toMatchObject({
        address_id: ADDRESS_UUID,
        address_type: AddressType.HOME,
        city: 'Mumbai',
        is_default: anyOf(Boolean),
      });
    });

    it('returns 200 with an empty array when the user has no addresses', async () => {
      mockAddressService.getAddresses.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/address')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('calls addressService.getAddresses with the user id from the JWT', async () => {
      mockAddressService.getAddresses.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/address')
        .set('Cookie', cookieHeader(validToken));

      expect(mockAddressService.getAddresses).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
    });

    it('forwards 401 from service (inactive session) to the response', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAddressService.getAddresses.mockRejectedValue(
        new UnauthorizedException(AddressMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .get('/address')
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /address — CreateAddressDto validation
  // =========================================================================

  describe('POST /address', () => {
    it('returns 201 with AddressResponse on a valid request', async () => {
      mockAddressService.addAddress.mockResolvedValue(
        addressResponse({ is_default: true }),
      );

      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send(validAddressPayload());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        address_id: ADDRESS_UUID,
        address_type: AddressType.HOME,
        is_default: true,
      });
    });

    it('calls addressService.addAddress with user id and the validated DTO', async () => {
      mockAddressService.addAddress.mockResolvedValue(addressResponse());

      await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send(validAddressPayload());

      expect(mockAddressService.addAddress).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          address_type: AddressType.HOME,
          line1: '123 Main Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          zip: '400001',
        }),
      );
    });

    it('returns 400 when address_type is missing', async () => {
      const { address_type: _omitted, ...payload } = validAddressPayload();

      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send(payload);

      expect(res.status).toBe(400);
    });

    it('returns 400 when address_type is not a valid AddressType enum value', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), address_type: 'INVALID_TYPE' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when line1 is missing', async () => {
      const { line1: _omitted, ...payload } = validAddressPayload();

      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send(payload);

      expect(res.status).toBe(400);
    });

    it('returns 400 when line1 is empty string', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), line1: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when zip is not a 6-digit number (ValidationMessages.zipInvalid)', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), zip: '1234' }); // 4 digits → invalid

      expect(res.status).toBe(400);
    });

    it('returns 400 when zip contains letters', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), zip: 'ABCDEF' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when state is not a valid Indian state (ValidationMessages.stateInvalid)', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), state: 'InvalidState' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when country is not India (ValidationMessages.countryInvalid)', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), country: 'USA' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when city is missing', async () => {
      const { city: _omitted, ...payload } = validAddressPayload();

      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send(payload);

      expect(res.status).toBe(400);
    });

    it('accepts a valid payload with optional line2', async () => {
      mockAddressService.addAddress.mockResolvedValue(
        addressResponse({ line2: 'Apt 4B' }),
      );

      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), line2: 'Apt 4B' });

      expect(res.status).toBe(201);
      const body = res.body as AddressResponse;
      expect(body.line2).toBe('Apt 4B');
    });

    it('returns 400 when an extra (non-whitelisted) key is sent', async () => {
      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send({ ...validAddressPayload(), is_default: true }); // not in DTO

      expect(res.status).toBe(400);
    });

    it('forwards 400 from AddressService (e.g. limitReached) to the response', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockAddressService.addAddress.mockRejectedValue(
        new BadRequestException(AddressMessages.limitReached),
      );

      const res = await request(app.getHttpServer())
        .post('/address')
        .set('Cookie', cookieHeader(validToken))
        .send(validAddressPayload());

      expect(res.status).toBe(400);
      const body = res.body as { message: string };
      expect(body.message).toContain(AddressMessages.limitReached);
    });
  });

  // =========================================================================
  // PATCH /address/:addressId — UpdateAddressDto validation
  // =========================================================================

  describe('PATCH /address/:addressId', () => {
    it('returns 200 with updated AddressResponse on a valid partial update', async () => {
      const updated = addressResponse({ line2: 'Floor 3' });
      mockAddressService.updateAddress.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ line2: 'Floor 3' });

      expect(res.status).toBe(200);
      const body = res.body as AddressResponse;
      expect(body.line2).toBe('Floor 3');
    });

    it('calls addressService.updateAddress with user id, addressId, and the DTO', async () => {
      mockAddressService.updateAddress.mockResolvedValue(addressResponse());

      await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ city: 'Delhi' });

      expect(mockAddressService.updateAddress).toHaveBeenCalledWith(
        TEST_USER_ID,
        ADDRESS_UUID,
        expect.objectContaining({ city: 'Delhi' }),
      );
    });

    it('accepts an empty body (UpdateAddressDto is fully partial)', async () => {
      mockAddressService.updateAddress.mockResolvedValue(addressResponse());

      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({});

      expect(res.status).toBe(200);
    });

    it('returns 400 when zip is invalid in the partial payload', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ zip: 'bad-zip' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when state is invalid in the partial payload', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ state: 'NotAState' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when an extra key is sent (whitelist enforcement)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ city: 'Delhi', is_default: true }); // is_default not in DTO

      expect(res.status).toBe(400);
    });

    it('forwards 404 from AddressService (ownership failure) to the response', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockAddressService.updateAddress.mockRejectedValue(
        new NotFoundException(AddressMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken))
        .send({ city: 'Delhi' });

      expect(res.status).toBe(404);
      const body = res.body as { message: string };
      expect(body.message).toContain(AddressMessages.notFound);
    });
  });

  // =========================================================================
  // PATCH /address/:addressId/default
  // =========================================================================

  describe('PATCH /address/:addressId/default', () => {
    it('returns 200 with refreshed AddressResponse[] on success', async () => {
      const list = [
        addressResponse({ address_id: ADDRESS_UUID, is_default: true }),
        addressResponse({ address_id: OTHER_ADDRESS_UUID, is_default: false }),
      ];
      mockAddressService.setDefault.mockResolvedValue(list);

      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}/default`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const body = res.body as AddressResponse[];
      expect(body[0].is_default).toBe(true);
    });

    it('calls addressService.setDefault with user id and the addressId param', async () => {
      mockAddressService.setDefault.mockResolvedValue([]);

      await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}/default`)
        .set('Cookie', cookieHeader(validToken));

      expect(mockAddressService.setDefault).toHaveBeenCalledWith(
        TEST_USER_ID,
        ADDRESS_UUID,
      );
    });

    it('forwards 404 from AddressService (address not found or foreign) to the response', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockAddressService.setDefault.mockRejectedValue(
        new NotFoundException(AddressMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .patch(`/address/${ADDRESS_UUID}/default`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(404);
    });

    it('returns 400 when addressId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/address/${NON_UUID_ID}/default`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // DELETE /address/:addressId
  // =========================================================================

  describe('DELETE /address/:addressId', () => {
    it('returns 200 with removeSuccess message on successful soft-delete', async () => {
      mockAddressService.removeAddress.mockResolvedValue({
        message: AddressMessages.removeSuccess,
      });

      const res = await request(app.getHttpServer())
        .delete(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: AddressMessages.removeSuccess });
    });

    it('calls addressService.removeAddress with user id and the addressId', async () => {
      mockAddressService.removeAddress.mockResolvedValue({
        message: AddressMessages.removeSuccess,
      });

      await request(app.getHttpServer())
        .delete(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(mockAddressService.removeAddress).toHaveBeenCalledWith(
        TEST_USER_ID,
        ADDRESS_UUID,
      );
    });

    it('forwards 404 from AddressService (ownership failure) to the response', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockAddressService.removeAddress.mockRejectedValue(
        new NotFoundException(AddressMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .delete(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(404);
      const body = res.body as { message: string };
      expect(body.message).toContain(AddressMessages.notFound);
    });

    it('forwards 401 from AddressService (inactive session) to the response', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAddressService.removeAddress.mockRejectedValue(
        new UnauthorizedException(AddressMessages.notFound),
      );

      const res = await request(app.getHttpServer())
        .delete(`/address/${ADDRESS_UUID}`)
        .set('Cookie', cookieHeader(validToken));

      expect(res.status).toBe(401);
    });
  });
});
