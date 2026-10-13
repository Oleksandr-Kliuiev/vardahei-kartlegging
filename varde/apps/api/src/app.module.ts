import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, JobsModule, HealthModule],
})
export class AppModule {}
