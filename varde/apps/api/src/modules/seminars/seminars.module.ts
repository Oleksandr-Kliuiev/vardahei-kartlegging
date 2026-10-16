import { Module } from '@nestjs/common';
import { FindingStatusService } from './finding-status.service.js';
import { SeminarsController } from './seminars.controller.js';
import { SeminarsService } from './seminars.service.js';

/** Seminars (stage 3): admin, findings status and actions. Participants live in privacy. */
@Module({
  providers: [SeminarsService, FindingStatusService],
  controllers: [SeminarsController],
  exports: [SeminarsService, FindingStatusService],
})
export class SeminarsModule {}
