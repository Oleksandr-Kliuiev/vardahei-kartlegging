// Demo job type of stage 0 (task 0.9): demo.sleep for tests. The hold job of the load stand 0.12
// was removed in 1.0 (decision 13.10: no load tests).
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

export function setting<T>(jobs: JobsService, name: string, key: string): T {
  return jobs.settings(name)[key] as T;
}

@Injectable()
export class DemoJobs implements OnModuleInit {
  constructor(private readonly jobs: JobsService) {}

  async onModuleInit(): Promise<void> {
    const sleepSeconds = setting<number>(this.jobs, 'demo.sleep', 'sleepSeconds');
    await this.jobs.register('demo.sleep', async () => {
      await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
    });
  }
}
