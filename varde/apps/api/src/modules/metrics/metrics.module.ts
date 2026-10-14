import { FindingsModule } from '../findings/findings.module.js';
import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';

/** Metric definitions and released snapshots of rounds (1.10). */
@Module({ imports: [FindingsModule], providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
