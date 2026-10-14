import { FindingsModule } from '../findings/findings.module.js';
import { ComparisonView } from './comparison-view.js';
import { Module } from '@nestjs/common';
import { RowsView } from './rows-view.js';
import { RowsController } from './rows.controller.js';
import { LeaderView } from './leader-view.js';
import { LeaderController } from './leader.controller.js';
import { MetricsModule } from '../metrics/metrics.module.js';
import { DashboardContext } from './dashboard-context.js';
import { AggregateView } from './aggregate-view.js';
import { DashboardController } from './dashboard.controller.js';

@Module({
  imports: [MetricsModule, FindingsModule],
  controllers: [DashboardController, LeaderController, RowsController],
  providers: [DashboardContext, AggregateView, LeaderView, RowsView, ComparisonView],
  exports: [DashboardContext, AggregateView, RowsView],
})
export class DashboardModule {}
