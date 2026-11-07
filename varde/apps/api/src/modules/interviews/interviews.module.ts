import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { EventsCoreModule } from '../events/events-core.module.js';
import { EmployeeView } from './employee-view.js';
import { EmployeesController } from './employees.controller.js';
import { InterviewActionsService } from './interview-actions.js';
import { InterviewReportService } from './interview-report.service.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/** Samtalar (2.20): conversations with key people that Vardahei fills in at the client's table;
 * the overview, its CSV and the referat (2.21); the actions of the catalogue chosen in them (2.22b). */
@Module({
  // «Leiar vs tilsette» (2.22c) reads the employees' numbers through the dashboard's scope.
  imports: [DashboardModule, EventsCoreModule],
  providers: [InterviewsService, InterviewReportService, EmployeeView, InterviewActionsService],
  controllers: [InterviewsController, EmployeesController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
