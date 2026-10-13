import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';

/** Metric definitions and released snapshots of rounds (1.10). */
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
