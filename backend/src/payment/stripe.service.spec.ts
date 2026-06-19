/**
 * Unit tests for StripeService.
 *
 * The `stripe` SDK is fully mocked — never hits the real Stripe API.
 * Covers: toPaise conversion, constructWebhookEvent happy path, and
 * constructWebhookEvent throwing BadRequestException on bad signature.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { OrderMessages } from '../constants/messages.constant';
import { PAISE_PER_RUPEE } from '../constants/values.constant';

// ---------------------------------------------------------------------------
// Mock the stripe module so no real SDK is instantiated
// ---------------------------------------------------------------------------

const mockPaymentIntentsCreate = jest.fn();
const mockRefundsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
    refunds: { create: mockRefundsCreate },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

// ---------------------------------------------------------------------------
// Config mock
// ---------------------------------------------------------------------------

const TEST_STRIPE_SECRET = 'sk_test_mock_secret';
const TEST_WEBHOOK_SECRET = 'whsec_test_mock_secret';

const mockConfigService = {
  getOrThrow: (key: string): string => {
    const values: Record<string, string> = {
      STRIPE_SECRET_KEY: TEST_STRIPE_SECRET,
      STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    };
    if (!(key in values)) throw new Error(`Missing config key: ${key}`);
    return values[key];
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const containing = (obj: object): unknown => expect.objectContaining(obj);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  // =========================================================================
  // toPaise — amount conversion
  // =========================================================================

  describe('toPaise conversion (via createPaymentIntent)', () => {
    it('converts "500.00" rupees to 50000 paise', async () => {
      const fakeIntent = { id: 'pi_test', client_secret: 'pi_test_secret' };
      mockPaymentIntentsCreate.mockResolvedValue(fakeIntent);

      await service.createPaymentIntent('500.00', {
        user_id: 'u1',
        address_id: 'a1',
        coupon_code: '',
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        containing({ amount: 50000 }), // 500 * 100
      );
    });

    it('converts "1.50" rupees to 150 paise (rounds correctly)', async () => {
      const fakeIntent = { id: 'pi_test', client_secret: 'pi_test_secret' };
      mockPaymentIntentsCreate.mockResolvedValue(fakeIntent);

      await service.createPaymentIntent('1.50', {
        user_id: 'u1',
        address_id: 'a1',
        coupon_code: '',
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        containing({ amount: 150 }), // 1.50 * 100
      );
    });

    it('converts "0.99" to 99 paise', async () => {
      const fakeIntent = { id: 'pi_test', client_secret: 'pi_test_secret' };
      mockPaymentIntentsCreate.mockResolvedValue(fakeIntent);

      await service.createPaymentIntent('0.99', {
        user_id: 'u1',
        address_id: 'a1',
        coupon_code: '',
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        containing({ amount: 99 }),
      );
    });

    it('PAISE_PER_RUPEE constant is 100', () => {
      expect(PAISE_PER_RUPEE).toBe(100);
    });

    it('passes metadata through to the Stripe SDK', async () => {
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test',
        client_secret: 'secret',
      });

      await service.createPaymentIntent('1000.00', {
        user_id: 'usr-123',
        address_id: 'addr-456',
        coupon_code: 'SAVE10',
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        containing({
          metadata: containing({
            user_id: 'usr-123',
            address_id: 'addr-456',
            coupon_code: 'SAVE10',
          }),
        }),
      );
    });

    it('passes currency "inr" to the Stripe SDK', async () => {
      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test',
        client_secret: 'secret',
      });

      await service.createPaymentIntent('200.00', {
        user_id: 'u1',
        address_id: 'a1',
        coupon_code: '',
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        containing({ currency: 'inr' }),
      );
    });
  });

  // =========================================================================
  // constructWebhookEvent — happy path
  // =========================================================================

  describe('constructWebhookEvent', () => {
    it('returns the event when signature is valid', () => {
      const fakeEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', metadata: {} } },
      };
      mockWebhooksConstructEvent.mockReturnValue(fakeEvent);

      const result = service.constructWebhookEvent(
        Buffer.from('payload'),
        'valid-signature',
      );

      expect(result).toEqual(fakeEvent);
    });

    it('calls stripe.webhooks.constructEvent with the raw buffer and signature', () => {
      const fakeEvent = { id: 'evt_test', type: 'ping' };
      mockWebhooksConstructEvent.mockReturnValue(fakeEvent);

      const payload = Buffer.from('{"type":"ping"}');
      const signature = 't=123,v1=abc';

      service.constructWebhookEvent(payload, signature);

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        TEST_WEBHOOK_SECRET,
      );
    });

    it('throws BadRequestException(webhookSignatureInvalid) when signature is wrong', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      expect(() =>
        service.constructWebhookEvent(
          Buffer.from('bad-payload'),
          'wrong-signature',
        ),
      ).toThrow(new BadRequestException(OrderMessages.webhookSignatureInvalid));
    });

    it('throws BadRequestException (not a raw Error) on Stripe signature failure', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Stripe webhook signature mismatch');
      });

      expect(() =>
        service.constructWebhookEvent(Buffer.from('x'), 'bad'),
      ).toThrow(BadRequestException);
    });

    it('wraps Stripe errors as BadRequestException (never a 500)', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Unexpected token in JSON');
      });

      // Must be BadRequestException, not InternalServerErrorException
      let thrown: Error | undefined;
      try {
        service.constructWebhookEvent(Buffer.from('not-json'), 'sig');
      } catch (err) {
        thrown = err as Error;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
    });
  });

  // =========================================================================
  // refundPaymentIntent
  // =========================================================================

  describe('refundPaymentIntent', () => {
    it('calls stripe.refunds.create with the payment_intent id', async () => {
      const fakeRefund = { id: 'ref_test', status: 'succeeded' };
      mockRefundsCreate.mockResolvedValue(fakeRefund);

      const result = await service.refundPaymentIntent('pi_test_123');

      expect(mockRefundsCreate).toHaveBeenCalledWith(
        containing({ payment_intent: 'pi_test_123' }),
      );
      expect(result).toEqual(fakeRefund);
    });
  });
});
