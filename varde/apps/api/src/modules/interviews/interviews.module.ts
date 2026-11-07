import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { EmployeeView } from './employee-view.js';
import { EmployeesController } from './employees.controller.js';
import { InterviewReportService } from './interview-report.service.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/** Samtalar (2.20): conversations with key people that Vardahei fills in at the client's table;
 * the overview, its CSV and the referat (2.21). */
@Module({
  // «Leiar vs tilsette» (2.22c) reads the employees' numbers through the dashboard's scope.
  imports: [DashboardModule],
  providers: [InterviewsService, InterviewReportService, EmployeeView],
  controllers: [InterviewsController, EmployeesController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
