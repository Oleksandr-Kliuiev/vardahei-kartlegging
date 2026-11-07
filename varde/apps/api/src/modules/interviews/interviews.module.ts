import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { EmployeeView } from './employee-view.js';
import { EmployeesController } from './employees.controller.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/** Samtalar (2.20): conversations with key people that Vardahei fills in at the client's table. */
@Module({
  // «Leiar vs tilsette» (2.22c) reads the employees' numbers through the dashboard's scope.
  imports: [DashboardModule],
  providers: [InterviewsService, EmployeeView],
  controllers: [InterviewsController, EmployeesController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
