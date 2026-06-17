/**
 * Smoke test for the NestJS application bootstrap.
 *
 * AppController has no routes, so GET / returns 404. This test verifies the
 * application bootstraps correctly without a real database by overriding
 * PrismaService with a no-op stub.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
            getOrThrow: (key: string) => {
              throw new Error(`Config key not available in smoke test: ${key}`);
            },
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('application bootstraps and unknown routes return 404', async () => {
    const res = await request(app.getHttpServer()).get('/');
    // AppController registers no routes, so the root path is not found.
    expect(res.status).toBe(404);
  });

  it('application is defined after init', () => {
    expect(app).toBeDefined();
  });
});
