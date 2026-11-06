import { Module } from '@nestjs/common';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/** Samtalar (2.20): conversations with key people that Vardahei fills in at the client's table. */
@Module({
  providers: [InterviewsService],
  controllers: [InterviewsController],
  exports: [InterviewsService],
})
export class InterviewsModule {}
