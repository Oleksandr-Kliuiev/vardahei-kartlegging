import { Module } from '@nestjs/common';
import { EventsCoreModule } from '../events/events-core.module.js';
import { FindingStatusService } from './finding-status.service.js';
import { InvitationService } from './invitation.service.js';
import { MaterialsService } from './materials.service.js';
import { InvitationController } from './invitation.controller.js';
import { MaterialsController } from './materials.controller.js';
import { PublicSeminarController } from './public-seminar.controller.js';
import { PublicSeminarService } from './public-seminar.service.js';
import { SeminarRoundsController } from './seminar-rounds.controller.js';
import { SeminarRoundsService } from './seminar-rounds.service.js';
import { SeminarsController } from './seminars.controller.js';
import { SeminarsService } from './seminars.service.js';

/** Seminars (stage 3): admin, findings status, actions, the public page and the rounds before,
 * during and after (3.8). Participants live in privacy. */
@Module({
  imports: [EventsCoreModule],
  providers: [
    SeminarsService,
    FindingStatusService,
    PublicSeminarService,
    MaterialsService,
    InvitationService,
    SeminarRoundsService,
  ],
  controllers: [
    SeminarsController,
    PublicSeminarController,
    MaterialsController,
    InvitationController,
    SeminarRoundsController,
  ],
  exports: [SeminarsService, FindingStatusService],
})
export class SeminarsModule {}
