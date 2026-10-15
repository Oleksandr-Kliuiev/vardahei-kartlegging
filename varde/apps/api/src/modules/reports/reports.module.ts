import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';

/** Client report from released snapshots (5.1). */
@Module({ imports: [MetricsModule], providers: [ReportService], controllers: [ReportController] })
export class ReportsModule {}
