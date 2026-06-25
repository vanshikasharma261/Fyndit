import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';
import { isEmail } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { OrderDetail } from '../order/types/order.types';

interface MailUser {
  name: string;
  email: string;
}

interface TemplateData {
  invoiceNumber: string;
  date: string;
  orderNumber: string;
  orderId: string;
  paymentMethod: string;
  user: MailUser;
  shipTo: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  items: Array<{
    sno: number;
    product_name: string;
    quantity: number;
    purchase_price: string;
    line_total: string;
  }>;
  subTotal: string;
  couponDiscount: string;
  hasCouponDiscount: boolean;
  shippingFee: string;
  grandTotal: string;
  freeShipping: boolean;
}

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly invoiceDir: string;
  // Compiled once at startup — rendering is a plain function call per email.
  private readonly templates = new Map<
    string,
    (data: TemplateData) => string
  >();
  private browser: Browser | null = null;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: Number(config.getOrThrow<string>('SMTP_PORT')),
      auth: {
        user: config.getOrThrow<string>('SMTP_USER'),
        pass: config.getOrThrow<string>('SMTP_PASS'),
      },
    });

    this.invoiceDir = path.join(process.cwd(), 'assets', 'invoices');
    fs.mkdirSync(this.invoiceDir, { recursive: true });

    // Compile HBS templates once so per-email rendering skips disk I/O.
    // The asset rule in nest-cli.json copies *.hbs to dist/, so __dirname
    // resolves correctly in both dev (src/mail/) and production (dist/mail/).
    const templateDir = path.join(__dirname, 'templates');
    for (const name of ['invoice', 'order-confirmation']) {
      const source = fs.readFileSync(
        path.join(templateDir, `${name}.hbs`),
        'utf-8',
      );
      this.templates.set(name, Handlebars.compile(source));
    }
  }

  async onModuleInit(): Promise<void> {
    // --no-sandbox is required in containerised environments where running as
    // root without a user namespace is standard. The singleton avoids spawning
    // Chromium per email; pages are isolated within the shared browser.
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.logger.log('Puppeteer browser initialized');
    } catch (err) {
      this.logger.error(
        `Failed to initialize Puppeteer browser — PDF generation will be unavailable: ${String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  /**
   * Generates the PDF invoice and sends the order-confirmation email.
   * Throws on any failure so the caller's fire-and-forget `.catch()` is the
   * single place that swallows and logs the error.
   */
  async sendOrderConfirmation(
    order: OrderDetail,
    user: MailUser,
  ): Promise<void> {
    if (!isEmail(user.email)) {
      throw new Error(
        `Invalid recipient email "${user.email}" for order ${order.order_id} — email skipped`,
      );
    }

    const data = this.buildTemplateData(order, user);
    const invoicePath = await this.generateInvoicePdf(data);
    const emailHtml = this.renderTemplate('order-confirmation', data);

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: user.email,
      subject: `Your order ${order.order_number} has been placed — Fyndit`,
      html: emailHtml,
      attachments: [
        {
          filename: `invoice_${order.order_id}.pdf`,
          path: invoicePath,
        },
      ],
    });

    this.logger.log(
      `Order confirmation sent to ${user.email} for order ${order.order_id}`,
    );
  }

  private async generateInvoicePdf(data: TemplateData): Promise<string> {
    if (!this.browser) {
      throw new Error('Puppeteer browser is not initialized');
    }

    const html = this.renderTemplate('invoice', data);
    const pdfPath = path.join(this.invoiceDir, `invoice_${data.orderId}.pdf`);

    // Open a fresh page per invoice so concurrent orders don't share context;
    // the singleton browser avoids the cost of spawning Chromium each time.
    const page = await this.browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      });
    } finally {
      await page.close();
    }

    return pdfPath;
  }

  private renderTemplate(name: string, data: TemplateData): string {
    const compiled = this.templates.get(name);
    if (!compiled) {
      throw new Error(`Template "${name}" not found`);
    }
    return compiled(data);
  }

  private buildTemplateData(order: OrderDetail, user: MailUser): TemplateData {
    const address = order.shipping_address;
    const paymentMethodLabel =
      order.payment_method === 'STRIPE'
        ? 'Credit / Debit Card'
        : 'Cash on Delivery';

    return {
      // Derive invoice number from the already-computed order_number so the two
      // identifiers stay in sync and the derivation lives in one place.
      // "#A2224894" → "INV-A2224894"
      invoiceNumber: `INV-${order.order_number.replace('#', '')}`,
      date: this.formatDate(order.created_at),
      orderNumber: order.order_number,
      orderId: order.order_id,
      paymentMethod: paymentMethodLabel,
      user,
      shipTo: {
        line1: address.line1,
        line2: address.line2 ?? null,
        city: address.city,
        state: address.state,
        country: address.country,
        zip: address.zip,
      },
      items: order.items.map((item, index) => ({
        sno: index + 1,
        product_name: item.product_name,
        quantity: item.quantity,
        purchase_price: item.purchase_price,
        line_total: item.line_total,
      })),
      subTotal: order.sub_total,
      couponDiscount: order.coupon_discount,
      // Compare against the serialized "0.00" string — avoids a float round-trip
      // on a value already safely serialized by Prisma Decimal.
      hasCouponDiscount: order.coupon_discount !== '0.00',
      shippingFee: order.shipping_fee,
      grandTotal: order.total_amount,
      freeShipping: order.shipping_fee === '0.00',
    };
  }

  private formatDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
