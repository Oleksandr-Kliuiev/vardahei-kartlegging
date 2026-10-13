import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Health {
  status: 'ok' | 'degraded';
  version: string;
  db: 'ok' | 'down';
}

/** Image tag (commit sha), set at build time (infra/Dockerfile ARG VARDE_VERSION). */
export function appVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.VARDE_VERSION !== undefined && env.VARDE_VERSION !== '' ? env.VARDE_VERSION : 'dev';
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<Health> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', version: appVersion(), db: 'ok' };
    } catch {
      return { status: 'degraded', version: appVersion(), db: 'down' };
    }
  }
}
