import { Module } from '@nestjs/common';
import { SurveysModule } from '../surveys/surveys.module.js';
import { LegacyController } from './legacy.controller.js';
import { LegacyService } from './legacy.service.js';
import { SeedService } from './seed.service.js';

/** Clients, rounds and round clients: seed of kartlegging and old links (1.7). */
@Module({
  imports: [SurveysModule],
  controllers: [LegacyController],
  providers: [SeedService, LegacyService],
  exports: [SeedService],
})
export class RoundsModule {}
