import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { readDbBudget } from '../config/config-dir.js';

/**
 * Adds `connection_limit` from varde/config/db-budget.json (`prisma_pool`) to DATABASE_URL:
 * the number lives in one place; bootstrap.sh (0.5b) writes the URL without it.
 */
export function withConnectionLimit(url: string, limit: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('connection_limit', String(limit));
  return parsed.toString();
}

/**
 * Prisma connects lazily on the first query (no `$connect` in `onModuleInit`): the app starts
 * without a database (image job in CI, `/health` → 503 in 0.6).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    super(
      url === undefined || url === ''
        ? {}
        : { datasourceUrl: withConnectionLimit(url, readDbBudget().prisma_pool) },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
