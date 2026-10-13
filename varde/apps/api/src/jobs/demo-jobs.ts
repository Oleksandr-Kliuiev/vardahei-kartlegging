// Demo job types of stage 0 (task 0.9): demo.sleep for tests, demo.hold-connection for the
// load stand 0.12 (holds a pool connection inside a transaction while it waits for /stub/slow).
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsService } from './jobs.service.js';

/** Interactive transactions close after 5 s by default; the stand needs ≥ 20 s held. */
export const HOLD_TRANSACTION = { timeout: 30_000, maxWait: 5_000 } as const;

export async function holdConnection(
  prisma: Pick<PrismaService, '$transaction'>,
  url: string,
  token: string | undefined,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1`;
    const res = await fetch(url, { headers: { 'x-varde-stub-token': token ?? '' } });
    if (!res.ok) throw new Error(`hold: ${url} answered ${res.status}`);
    await res.arrayBuffer();
  }, HOLD_TRANSACTION);
}

export function setting<T>(jobs: JobsService, name: string, key: string): T {
  return jobs.settings(name)[key] as T;
}

@Injectable()
export class DemoJobs implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const sleepSeconds = setting<number>(this.jobs, 'demo.sleep', 'sleepSeconds');
    await this.jobs.register('demo.sleep', async () => {
      await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
    });
    const holdUrl = setting<string>(this.jobs, 'demo.hold-connection', 'holdUrl');
    await this.jobs.register('demo.hold-connection', () =>
      holdConnection(this.prisma, holdUrl, process.env.VARDE_STUB_TOKEN),
    );
  }
}
