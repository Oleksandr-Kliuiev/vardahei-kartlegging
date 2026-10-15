// Nest application context of the CLI commands (1.7+): database modules only, no HTTP, no jobs.
import { Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CutoverCoreModule } from '../modules/cutover/cutover.module.js';
import { RoundArchiveModule } from '../modules/exports/round-archive.module.js';
import { RetentionCoreModule } from '../modules/retention/retention.module.js';
import { ImportsModule } from '../modules/imports/imports.module.js';
import { MetricsModule } from '../modules/metrics/metrics.module.js';
import { PrivacyModule } from '../modules/privacy/privacy.service.js';
import { RoundsCoreModule } from '../modules/rounds/rounds-core.module.js';
import { SurveysCoreModule } from '../modules/surveys/surveys-core.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    PrivacyModule.forApp(),
    SurveysCoreModule,
    RoundsCoreModule,
    ImportsModule,
    MetricsModule,
    RetentionCoreModule,
    CutoverCoreModule,
    RoundArchiveModule,
  ],
})
export class CliModule {}

export async function withContext<T>(
  fn: (get: <S>(token: Type<S>) => S) => Promise<T>,
  module: Type = CliModule,
): Promise<T> {
  const app = await NestFactory.createApplicationContext(module, { logger: ['error'] });
  try {
    return await fn((token) => app.get(token));
  } finally {
    await app.close();
  }
}

/** `--name value` pairs of argv; unknown flags and missing values are errors. */
export function flags(
  args: string[],
  names: readonly string[],
  booleans: readonly string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const name = (args[i] ?? '').replace(/^--/, '');
    if (booleans.includes(name)) {
      out[name] = 'true';
      continue;
    }
    const value = args[i + 1];
    if (!names.includes(name) || value === undefined)
      throw new Error(`unknown or incomplete flag ${args[i] ?? ''}`);
    out[name] = value;
    i += 1;
  }
  for (const n of names) if (out[n] === undefined) throw new Error(`missing --${n}`);
  return out;
}
