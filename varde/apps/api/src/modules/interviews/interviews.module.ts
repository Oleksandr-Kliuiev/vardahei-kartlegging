import { Module } from '@nestjs/common';
import { InterviewReportService } from './interview-report.service.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/** Samtalar (2.20): conversations with key people that Vardahei fills in at the client's table;
 * the overview, its CSV and the referat (2.21). */
@Module({
  providers: [InterviewsService, InterviewReportService],
  controllers: [InterviewsController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
