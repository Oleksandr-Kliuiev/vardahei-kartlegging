import { Module } from '@nestjs/common';
import { EventsCoreModule } from '../events/events-core.module.js';
import { RoundsCoreModule } from '../rounds/rounds-core.module.js';
import { LiveAdminController } from './live-admin.controller.js';
import { LiveAdminService } from './live-admin.service.js';
import { LivePollService } from './live-poll.service.js';
import { LiveRunnerController } from './live-runner.controller.js';
import { LiveView } from './live-view.js';
import { PresenterController } from './presenter.controller.js';
import { PresenterGuard } from './presenter.guard.js';
import { PresenterTokenService } from './presenter-token.service.js';

/** Seminar live poll (stage 3, 3.4): states of the questions, the presenter key and its API, the
 * admin panel and the phone's view. Answers are Responses (privacy). */
@Module({
  imports: [EventsCoreModule, RoundsCoreModule],
  providers: [
    LivePollService,
    LiveView,
    LiveAdminService,
    PresenterTokenService,
    PresenterGuard,
  ],
  controllers: [PresenterController, LiveAdminController, LiveRunnerController],
})
export class LiveModule {}
