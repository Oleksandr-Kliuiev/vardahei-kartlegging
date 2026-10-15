import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module.js';
import { RoundArchiveService } from './round-archive.service.js';

/** Round archive of aggregates (5.2): export in the admin API, restore in the CLI. */
@Module({
  imports: [MetricsModule],
  providers: [RoundArchiveService],
  exports: [RoundArchiveService],
})
export class RoundArchiveModule {}
