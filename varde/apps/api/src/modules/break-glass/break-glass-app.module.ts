// The second app instance on the break-glass Unix socket (0.8): admin API with the session
// store and Prisma client of the main app, plus POST /break-glass/login. No jobs here.
import { type DynamicModule, Module } from '@nestjs/common';
import type { BreakGlassConfig } from '../../config/break-glass-config.js';
import { HealthModule } from '../../health/health.module.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { SharedPrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import type { SessionStore } from '../auth/session.store.js';
import { BreakGlassController } from './break-glass.controller.js';
import { BREAK_GLASS_ON } from './break-glass.tokens.js';

@Module({})
export class BreakGlassAppModule {
  static create(shared: {
    prisma: PrismaService;
    store: SessionStore;
    config: Extract<BreakGlassConfig, { state: 'on' }>;
  }): DynamicModule {
    return {
      module: BreakGlassAppModule,
      imports: [
        SharedPrismaModule.with(shared.prisma),
        HealthModule,
        AuthModule.register('break_glass', shared.store),
      ],
      controllers: [BreakGlassController],
      providers: [{ provide: BREAK_GLASS_ON, useValue: shared.config }],
    };
  }
}
