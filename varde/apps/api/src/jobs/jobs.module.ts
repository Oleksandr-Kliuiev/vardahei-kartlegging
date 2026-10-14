import { Global, Module } from '@nestjs/common';
import { readDbBudget } from '../config/db-budget.js';
import { DemoJobs } from './demo-jobs.js';
import { loadJobTypes } from './job-config.js';
import { JobsService } from './jobs.service.js';
import { ProgressTtl } from './progress-ttl.js';

@Global()
@Module({
  providers: [
    {
      provide: JobsService,
      useFactory: () =>
        new JobsService(loadJobTypes(), {
          connectionString: process.env.DATABASE_URL,
          max: readDbBudget().pgboss_pool,
        }),
    },
    DemoJobs,
    ProgressTtl,
  ],
  exports: [JobsService],
})
export class JobsModule {}
