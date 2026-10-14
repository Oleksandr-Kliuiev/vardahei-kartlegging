import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module.js';
import { SurveysModule } from '../surveys/surveys.module.js';
import { CodesService } from './codes.js';
import { LegacyService } from './legacy.service.js';
import { RoundsService } from './rounds.service.js';
import { SeedService } from './seed.service.js';

/** Also used by the CLI: domain providers without HTTP controllers or session guards. */
@Module({
  imports: [SurveysModule, MetricsModule],
  providers: [SeedService, LegacyService, CodesService, RoundsService],
  exports: [SeedService, LegacyService, CodesService, RoundsService],
})
export class RoundsCoreModule {}
