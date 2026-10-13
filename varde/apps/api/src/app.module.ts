import { Module } from '@nestjs/common';
import { JobsModule } from './jobs/jobs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, JobsModule],
})
export class AppModule {}
