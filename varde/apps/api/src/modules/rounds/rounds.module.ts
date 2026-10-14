import { Module } from '@nestjs/common';
import { LegacyController } from './legacy.controller.js';
import { RoundsController } from './rounds.controller.js';
import { RoundsCoreModule } from './rounds-core.module.js';
import { RunnerController } from './runner.controller.js';
import { InvitationController } from './invitation.controller.js';
import { InvitationService } from './invitation.service.js';

@Module({
  imports: [RoundsCoreModule],
  controllers: [LegacyController, RunnerController, RoundsController, InvitationController],
  providers: [InvitationService],
  exports: [RoundsCoreModule],
})
export class RoundsModule {}
