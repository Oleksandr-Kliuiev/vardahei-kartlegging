import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { AnalyseService } from './analyse.service.js';
import { CsvService } from './csv.service.js';
import { RoundArchiveModule } from './round-archive.module.js';
import { ExportsController } from './exports.controller.js';

@Module({
  imports: [DashboardModule, RoundArchiveModule],
  providers: [CsvService, AnalyseService],
  controllers: [ExportsController],
})
export class ExportsModule {}
