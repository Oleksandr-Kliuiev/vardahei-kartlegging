import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { HomeModule } from './home/home.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BreakGlassModule } from './modules/break-glass/break-glass.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    JobsModule,
    HealthModule,
    AuthModule.register('main'),
    BreakGlassModule,
    HomeModule,
  ],
})
export class AppModule {}
