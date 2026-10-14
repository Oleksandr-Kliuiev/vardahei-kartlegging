import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { readRetentionConfig } from '../modules/retention/retention.config.js';
import { JobsService } from './jobs.service.js';

export const PROGRESS_TTL_JOB = 'retention.progress-ttl';
@Injectable()
export class ProgressTtl implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}
  async onModuleInit() {
    await this.jobs.register(PROGRESS_TTL_JOB, async () => {
      await this.run();
    });
    await this.jobs.schedule(PROGRESS_TTL_JOB, '0 * * * *', {
      id: '00000000-0000-4000-8000-000000000001',
    });
  }
  run(now = new Date()) {
    const hours = readRetentionConfig().classes.progress_event.ttl_hours;
    return this.prisma.progressEvent.deleteMany({
      where: { at: { lt: new Date(now.getTime() - hours * 3600_000) } },
    });
  }
}
