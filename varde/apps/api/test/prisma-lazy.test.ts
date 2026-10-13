import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const original = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = original;
});

describe('PrismaService is lazy', () => {
  it('AppModule starts with an unreachable DATABASE_URL; the first query fails', async () => {
    process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await expect(app.get(PrismaService).auditLog.count()).rejects.toThrow();
    await app.close();
  });
});
