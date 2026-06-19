import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';

async function bootstrap() {
  // `rawBody: true` preserves the unparsed request body (`req.rawBody`) so the
  // Stripe webhook can verify the signature against the exact bytes Stripe sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Serve downloaded product images. The seeder stores relative paths like
  // `/assets/products/<slug>/<color>/1.jpg`; the physical files live under
  // `backend/assets`. The frontend prefixes these with the API origin.
  // `dotfiles: 'deny'` so any sensitive dotfile that ever lands under the
  // (unguarded) assets tree — `.env`, `.git`, etc. — is refused, not served.
  app.useStaticAssets(join(__dirname, '..', 'assets'), {
    prefix: '/assets',
    dotfiles: 'deny',
  });

  // Allow the frontend origin to send credentialed requests so the browser
  // includes and accepts the HTTP-only auth cookie on cross-origin calls.
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  // Parse cookies so the JWT strategy can read the access token cookie.
  app.use(cookieParser());

  // Global DTO validation. Errors are flattened into a `{ field: message }`
  // object via the custom exception factory for a frontend-friendly response.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
