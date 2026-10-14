import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../jobs/jobs.service.js';
import { RetentionRun } from './run.service.js';

@Injectable()
export class RetentionJob implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly retention: RetentionRun,
  ) {}
  async onModuleInit() {
    await this.jobs.register('retention.run', async () => {
      await this.retention.run();
    });
    await this.jobs.schedule('retention.run', '0 3 * * *', {
      id: '00000000-0000-4000-8000-000000000002',
    });
  }
}
