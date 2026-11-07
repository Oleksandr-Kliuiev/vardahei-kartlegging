import { Module } from '@nestjs/common';
import { InterviewActionsService } from './interview-actions.js';
import { InterviewReportService } from './interview-report.service.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/** Samtalar (2.20): conversations with key people that Vardahei fills in at the client's table;
 * the overview, its CSV and the referat (2.21); the actions of the catalogue chosen in them (2.22b). */
@Module({
  providers: [InterviewsService, InterviewReportService, InterviewActionsService],
  controllers: [InterviewsController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
