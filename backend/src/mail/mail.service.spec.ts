/**
 * Unit tests for MailService (post-review architecture).
 *
 * Key architectural points tested:
 * - Puppeteer browser is a singleton launched in onModuleInit, not per-email (H4)
 * - A fresh page (not a fresh browser) is opened per invoice PDF
 * - Templates are compiled once in the constructor (H3)
 * - sendOrderConfirmation throws on failure — fire-and-forget is in OrderService (H2)
 * - Email validation rejects bad addresses before touching Puppeteer (M3)
 * - invoiceNumber derives from order_number, not orderId (M2)
 * - Money comparisons use string equality on "0.00" (M1)
 *
 * External dependencies that touch the filesystem, network, and headless
 * browser are fully mocked so these tests run in CI without Chromium or SMTP:
 *   - nodemailer.createTransport  → returns a { sendMail: jest.fn() } mock
 *   - puppeteer.launch            → returns a mock browser/page chain
 *   - handlebars.compile          → returns a stub template function
 *   - fs.readFileSync             → returns a stub HBS source string
 *   - fs.mkdirSync                → no-op
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted before any imports that use them.
// ---------------------------------------------------------------------------

// ---- fs ----
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn().mockReturnValue('<html>{{orderId}}</html>');

jest.mock('fs', () => ({
  mkdirSync: (...args: unknown[]): void => {
    mockMkdirSync(...args);
  },
  readFileSync: (...args: unknown[]): string =>
    mockReadFileSync(...args) as string,
}));

// ---- nodemailer ----
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockTransporter = { sendMail: mockSendMail };
const mockCreateTransport = jest.fn().mockReturnValue(mockTransporter);

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: (...args: unknown[]): typeof mockTransporter =>
      mockCreateTransport(...args) as typeof mockTransporter,
  },
  createTransport: (...args: unknown[]): typeof mockTransporter =>
    mockCreateTransport(...args) as typeof mockTransporter,
}));

// ---- puppeteer ----
const mockPdf = jest.fn().mockResolvedValue(Buffer.from('pdf-content'));
const mockSetContent = jest.fn().mockResolvedValue(undefined);
const mockPageClose = jest.fn().mockResolvedValue(undefined);
const mockNewPage = jest.fn().mockResolvedValue({
  setContent: mockSetContent,
  pdf: mockPdf,
  close: mockPageClose,
});
const mockBrowserClose = jest.fn().mockResolvedValue(undefined);
const mockBrowser = { newPage: mockNewPage, close: mockBrowserClose };
const mockLaunch = jest.fn().mockResolvedValue(mockBrowser);

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: (...args: unknown[]): typeof mockBrowser =>
      mockLaunch(...args) as typeof mockBrowser,
  },
  launch: (...args: unknown[]): typeof mockBrowser =>
    mockLaunch(...args) as typeof mockBrowser,
}));

// ---- handlebars ----
const mockTemplateResult = '<html>compiled</html>';
const mockTemplate = jest.fn().mockReturnValue(mockTemplateResult);
const mockCompile = jest.fn().mockReturnValue(mockTemplate);

jest.mock('handlebars', () => ({
  __esModule: true,
  default: {
    compile: (...args: unknown[]): typeof mockTemplate =>
      mockCompile(...args) as typeof mockTemplate,
  },
  compile: (...args: unknown[]): typeof mockTemplate =>
    mockCompile(...args) as typeof mockTemplate,
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import { MailService } from './mail.service';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  AddressType,
} from '../generated/prisma/enums';
import type { OrderDetail } from '../order/types/order.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ADDRESS_ID = 'b0000000-0000-4000-8000-000000000001';
const MAIL_FROM = 'noreply@fyndit.com';

const mockConfigService = {
  getOrThrow: (key: string): string => {
    const values: Record<string, string> = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user@example.com',
      SMTP_PASS: 'secret',
      MAIL_FROM,
    };
    if (!(key in values)) throw new Error(`Missing config key: ${key}`);
    return values[key];
  },
};

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    order_id: ORDER_ID,
    order_number: '#A1B2C3D4',
    created_at: new Date('2026-06-01T10:00:00Z').toISOString(),
    status: OrderStatus.PENDING,
    payment_method: PaymentMethod.COD,
    payment_status: PaymentStatus.PENDING,
    sub_total: '1000.00',
    coupon_discount: '0.00',
    shipping_fee: '0.00',
    total_amount: '1000.00',
    shipping_address: {
      address_id: ADDRESS_ID,
      address_type: AddressType.HOME,
      line1: '123 Main St',
      line2: null,
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      zip: '400001',
      is_default: true,
    },
    items: [
      {
        order_item_id: 'item-001',
        product_name: 'Blue Shirt',
        brand: 'FashionCo',
        image_url: '/img/shirt.jpg',
        attributes: { color: 'Blue', size: 'M' },
        purchase_price: '500.00',
        quantity: 2,
        line_total: '1000.00',
      },
    ],
    can_cancel: true,
    ...overrides,
  };
}

const testUser = { name: 'Jane Doe', email: 'jane@example.com' };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Restore default mock implementations after resetAllMocks clears them.
    mockReadFileSync.mockReturnValue('<html>{{orderId}}</html>');
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
    mockTemplate.mockReturnValue(mockTemplateResult);
    mockCompile.mockReturnValue(mockTemplate);
    mockSetContent.mockResolvedValue(undefined);
    mockPdf.mockResolvedValue(Buffer.from('pdf-content'));
    mockPageClose.mockResolvedValue(undefined);
    mockNewPage.mockResolvedValue({
      setContent: mockSetContent,
      pdf: mockPdf,
      close: mockPageClose,
    });
    mockBrowserClose.mockResolvedValue(undefined);
    mockLaunch.mockResolvedValue(mockBrowser);
    mockCreateTransport.mockReturnValue(mockTransporter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);

    // Trigger lifecycle: launch the singleton Puppeteer browser.
    await service.onModuleInit();
  });

  afterEach(async () => {
    // Close the singleton browser after each test.
    await service.onModuleDestroy();
  });

  // =========================================================================
  // onModuleInit — Puppeteer singleton
  // =========================================================================

  describe('onModuleInit', () => {
    it('calls puppeteer.launch once to initialise the singleton browser', () => {
      // beforeEach already called onModuleInit() — expect exactly one launch call.
      expect(mockLaunch).toHaveBeenCalledTimes(1);
    });

    it('passes no-sandbox flags to puppeteer.launch', () => {
      const call = (mockLaunch.mock.calls as Array<[{ args: string[] }]>)[0][0];
      expect(call.args).toEqual(
        expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
      );
    });
  });

  // =========================================================================
  // sendOrderConfirmation — happy path
  // =========================================================================

  describe('sendOrderConfirmation — happy path', () => {
    it('does NOT call puppeteer.launch per email (uses singleton browser)', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      // One launch in onModuleInit, zero more during sendOrderConfirmation.
      expect(mockLaunch).toHaveBeenCalledTimes(1);
    });

    it('calls browser.newPage to open a fresh page per email', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      expect(mockNewPage).toHaveBeenCalledTimes(1);
    });

    it('calls page.setContent with the compiled invoice HTML', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      expect(mockSetContent).toHaveBeenCalledTimes(1);
      expect(mockSetContent).toHaveBeenCalledWith(
        mockTemplateResult,
        expect.objectContaining({ waitUntil: 'load' }),
      );
    });

    it('calls page.pdf to produce the PDF file', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      expect(mockPdf).toHaveBeenCalledTimes(1);
    });

    it('closes the page (not the browser) after PDF generation', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      expect(mockPageClose).toHaveBeenCalledTimes(1);
      expect(mockBrowserClose).not.toHaveBeenCalled();
    });

    it('calls sendMail with the correct from address', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      const call = (mockSendMail.mock.calls as Array<[{ from: string }]>)[0][0];
      expect(call.from).toBe(MAIL_FROM);
    });

    it('calls sendMail with the user email as the to address', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      const call = (mockSendMail.mock.calls as Array<[{ to: string }]>)[0][0];
      expect(call.to).toBe(testUser.email);
    });

    it('calls sendMail with subject containing the order_number', async () => {
      const order = makeOrderDetail();
      await service.sendOrderConfirmation(order, testUser);

      const call = (
        mockSendMail.mock.calls as Array<[{ subject: string }]>
      )[0][0];
      expect(call.subject).toContain(order.order_number);
    });

    it('attaches the PDF with filename invoice_{orderId}.pdf', async () => {
      const order = makeOrderDetail();
      await service.sendOrderConfirmation(order, testUser);

      const call = (
        mockSendMail.mock.calls as Array<
          [{ attachments: Array<{ filename: string }> }]
        >
      )[0][0];
      expect(call.attachments[0].filename).toBe(`invoice_${ORDER_ID}.pdf`);
    });

    it('sends the email exactly once', async () => {
      await service.sendOrderConfirmation(makeOrderDetail(), testUser);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // sendOrderConfirmation — email validation (M3)
  // =========================================================================

  describe('sendOrderConfirmation — email validation', () => {
    it('throws for an invalid email address', async () => {
      const badUser = { name: 'Bad User', email: 'not-an-email' };

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), badUser),
      ).rejects.toThrow(/Invalid recipient email/);
    });

    it('throws for an empty email string', async () => {
      const emptyUser = { name: 'No Email', email: '' };

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), emptyUser),
      ).rejects.toThrow();
    });

    it('does NOT open a Puppeteer page when the email is invalid', async () => {
      const badUser = { name: 'Bad User', email: 'invalid' };

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), badUser),
      ).rejects.toThrow();

      expect(mockNewPage).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // sendOrderConfirmation — throws on failure (H2: no internal try/catch)
  // =========================================================================

  describe('sendOrderConfirmation — throws on failure', () => {
    it('throws when browser is not initialized (onModuleInit not called)', async () => {
      // Create a fresh service WITHOUT calling onModuleInit.
      jest.resetAllMocks();
      mockReadFileSync.mockReturnValue('<html>{{orderId}}</html>');
      mockTemplate.mockReturnValue(mockTemplateResult);
      mockCompile.mockReturnValue(mockTemplate);
      mockCreateTransport.mockReturnValue(mockTransporter);

      const freshModule = await Test.createTestingModule({
        providers: [
          MailService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const freshService = freshModule.get<MailService>(MailService);

      // Do NOT call freshService.onModuleInit().
      await expect(
        freshService.sendOrderConfirmation(makeOrderDetail(), testUser),
      ).rejects.toThrow('Puppeteer browser is not initialized');
    });

    it('throws when browser.newPage fails', async () => {
      mockNewPage.mockRejectedValueOnce(new Error('browser crashed'));

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), testUser),
      ).rejects.toThrow('browser crashed');
    });

    it('throws when page.pdf fails', async () => {
      mockPdf.mockRejectedValueOnce(new Error('pdf render failed'));

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), testUser),
      ).rejects.toThrow('pdf render failed');
    });

    it('throws when sendMail fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), testUser),
      ).rejects.toThrow('SMTP connection refused');
    });

    it('closes the page even when page.pdf throws', async () => {
      mockPdf.mockRejectedValueOnce(new Error('pdf render failed'));

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), testUser),
      ).rejects.toThrow();

      expect(mockPageClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call sendMail when PDF generation fails', async () => {
      mockPdf.mockRejectedValueOnce(new Error('pdf render failed'));

      await expect(
        service.sendOrderConfirmation(makeOrderDetail(), testUser),
      ).rejects.toThrow();

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // buildTemplateData — COD order (payment method label, free shipping, no coupon)
  // =========================================================================

  describe('buildTemplateData — COD order', () => {
    it('sets paymentMethod to "Cash on Delivery" for COD orders', async () => {
      const order = makeOrderDetail({
        payment_method: PaymentMethod.COD,
        coupon_discount: '0.00',
        shipping_fee: '0.00',
      });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ paymentMethod: string }]>
      )[0];
      expect(templateCall[0].paymentMethod).toBe('Cash on Delivery');
    });

    it('sets hasCouponDiscount to false when coupon_discount is "0.00"', async () => {
      const order = makeOrderDetail({ coupon_discount: '0.00' });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ hasCouponDiscount: boolean }]>
      )[0];
      expect(templateCall[0].hasCouponDiscount).toBe(false);
    });

    it('sets freeShipping to true when shipping_fee is "0.00"', async () => {
      const order = makeOrderDetail({ shipping_fee: '0.00' });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ freeShipping: boolean }]>
      )[0];
      expect(templateCall[0].freeShipping).toBe(true);
    });

    it('sets freeShipping to false when shipping_fee is "100.00"', async () => {
      const order = makeOrderDetail({ shipping_fee: '100.00' });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ freeShipping: boolean }]>
      )[0];
      expect(templateCall[0].freeShipping).toBe(false);
    });

    it('includes orderId in the template data', async () => {
      const order = makeOrderDetail();

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ orderId: string }]>
      )[0];
      expect(templateCall[0].orderId).toBe(ORDER_ID);
    });
  });

  // =========================================================================
  // buildTemplateData — Stripe order (payment method label, coupon applied)
  // =========================================================================

  describe('buildTemplateData — Stripe order', () => {
    it('sets paymentMethod to "Credit / Debit Card" for STRIPE orders', async () => {
      const order = makeOrderDetail({
        payment_method: PaymentMethod.STRIPE,
        coupon_discount: '100.00',
        shipping_fee: '0.00',
      });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ paymentMethod: string }]>
      )[0];
      expect(templateCall[0].paymentMethod).toBe('Credit / Debit Card');
    });

    it('sets hasCouponDiscount to true when coupon_discount is not "0.00"', async () => {
      const order = makeOrderDetail({
        payment_method: PaymentMethod.STRIPE,
        coupon_discount: '100.00',
      });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ hasCouponDiscount: boolean }]>
      )[0];
      expect(templateCall[0].hasCouponDiscount).toBe(true);
    });

    it('includes subTotal, couponDiscount, and grandTotal in template data', async () => {
      const order = makeOrderDetail({
        payment_method: PaymentMethod.STRIPE,
        sub_total: '900.00',
        coupon_discount: '100.00',
        total_amount: '800.00',
      });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<
          [
            {
              subTotal: string;
              couponDiscount: string;
              grandTotal: string;
            },
          ]
        >
      )[0];
      expect(templateCall[0].subTotal).toBe('900.00');
      expect(templateCall[0].couponDiscount).toBe('100.00');
      expect(templateCall[0].grandTotal).toBe('800.00');
    });
  });

  // =========================================================================
  // buildTemplateData — invoice number (M2: from order_number, not orderId)
  // =========================================================================

  describe('buildTemplateData — invoice metadata', () => {
    it('derives invoiceNumber from order_number (M2: INV-{order_number without #})', async () => {
      // order_number = '#A1B2C3D4' → invoiceNumber = 'INV-A1B2C3D4'
      const order = makeOrderDetail({ order_number: '#A1B2C3D4' });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ invoiceNumber: string }]>
      )[0];
      expect(templateCall[0].invoiceNumber).toBe('INV-A1B2C3D4');
    });

    it('maps items with sequential sno starting from 1', async () => {
      const order = makeOrderDetail();

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<
          [{ items: Array<{ sno: number; product_name: string }> }]
        >
      )[0];
      expect(templateCall[0].items[0].sno).toBe(1);
      expect(templateCall[0].items[0].product_name).toBe('Blue Shirt');
    });

    it('includes user name and email in template data', async () => {
      const order = makeOrderDetail();

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<
          [{ user: { name: string; email: string } }]
        >
      )[0];
      expect(templateCall[0].user.name).toBe(testUser.name);
      expect(templateCall[0].user.email).toBe(testUser.email);
    });
  });

  // =========================================================================
  // Invoice filename includes orderId
  // =========================================================================

  describe('invoice filename', () => {
    it('uses invoice_{orderId}.pdf as the attachment filename', async () => {
      const order = makeOrderDetail();

      await service.sendOrderConfirmation(order, testUser);

      const call = (
        mockSendMail.mock.calls as Array<
          [{ attachments: Array<{ filename: string }> }]
        >
      )[0][0];
      expect(call.attachments[0].filename).toBe(`invoice_${ORDER_ID}.pdf`);
    });

    it('the PDF path passed to page.pdf contains invoice_{orderId}.pdf', async () => {
      const order = makeOrderDetail();

      await service.sendOrderConfirmation(order, testUser);

      const pdfCall = (mockPdf.mock.calls as Array<[{ path: string }]>)[0][0];
      expect(pdfCall.path).toContain(`invoice_${ORDER_ID}.pdf`);
    });
  });

  // =========================================================================
  // formatDate — Indian locale
  // =========================================================================

  describe('formatDate', () => {
    it('formats ISO date as an Indian locale date string (en-IN)', async () => {
      const order = makeOrderDetail({
        created_at: new Date('2026-06-01T10:00:00Z').toISOString(),
      });

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ date: string }]>
      )[0];
      expect(templateCall[0].date).toMatch(
        /\d{1,2}.*June.*2026|June.*\d{1,2}.*2026|2026.*June.*\d{1,2}/i,
      );
    });

    it('the formatted date is a non-empty string', async () => {
      const order = makeOrderDetail();

      await service.sendOrderConfirmation(order, testUser);

      const templateCall = (
        mockTemplate.mock.calls as Array<[{ date: string }]>
      )[0];
      expect(typeof templateCall[0].date).toBe('string');
      expect(templateCall[0].date.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Constructor behaviour
  // =========================================================================

  describe('constructor', () => {
    it('calls fs.mkdirSync to ensure the invoices directory exists', () => {
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('invoices'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('calls nodemailer.createTransport to set up the SMTP transporter', () => {
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          auth: expect.objectContaining({
            user: 'user@example.com',
          }) as unknown,
        }),
      );
    });

    it('compiles both HBS templates at startup (H3: once, not per email)', () => {
      // Two calls: 'invoice' and 'order-confirmation'.
      expect(mockCompile).toHaveBeenCalledTimes(2);
    });

    it('reads each HBS template source file at startup (H3)', () => {
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // onModuleDestroy — browser cleanup
  // =========================================================================

  describe('onModuleDestroy', () => {
    it('calls browser.close to release Chromium on shutdown', async () => {
      await service.onModuleDestroy();
      expect(mockBrowserClose).toHaveBeenCalled();
    });
  });
});
