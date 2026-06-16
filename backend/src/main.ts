import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
