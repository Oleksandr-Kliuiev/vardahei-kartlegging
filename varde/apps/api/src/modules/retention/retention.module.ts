import { Module } from '@nestjs/common';
import { HandoverService } from './handover.js';
import { HandoverController } from './handover.controller.js';
import { EventsCoreModule } from '../events/events-core.module.js';
import { ForgetService } from './forget.service.js';
import { ForgetController } from './forget.controller.js';
import { DeletionLedger } from './ledger.js';
import { RetentionRun } from './run.service.js';
import { RetentionJob } from './retention-job.js';

@Module({
  imports: [EventsCoreModule],
  providers: [RetentionRun, ForgetService, DeletionLedger],
  exports: [RetentionRun, ForgetService, DeletionLedger],
})
export class RetentionCoreModule {}
@Module({
  imports: [RetentionCoreModule],
  providers: [RetentionJob, HandoverService],
  controllers: [ForgetController, HandoverController],
})
export class RetentionModule {}
