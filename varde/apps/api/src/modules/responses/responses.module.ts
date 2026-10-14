import { Module } from '@nestjs/common';
import { RoundsCoreModule } from '../rounds/rounds-core.module.js';
import { QuotaService } from './quota.service.js';
import { SubmissionController } from './submission.controller.js';
import { SubmissionService } from './submission.service.js';
import { ProgressService } from './progress.service.js';
import { ProgressController } from './progress.controller.js';

@Module({
  imports: [RoundsCoreModule],
  controllers: [SubmissionController, ProgressController],
  providers: [SubmissionService, QuotaService, ProgressService],
  exports: [QuotaService],
})
export class ResponsesModule {}
