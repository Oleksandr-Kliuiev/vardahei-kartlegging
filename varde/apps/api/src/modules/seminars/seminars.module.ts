import { Module } from '@nestjs/common';
import { EventsCoreModule } from '../events/events-core.module.js';
import { FindingStatusService } from './finding-status.service.js';
import { InvitationService } from './invitation.service.js';
import { MaterialsService } from './materials.service.js';
import { InvitationController } from './invitation.controller.js';
import { MaterialsController } from './materials.controller.js';
import { PublicSeminarController } from './public-seminar.controller.js';
import { PublicSeminarService } from './public-seminar.service.js';
import { SeminarsController } from './seminars.controller.js';
import { SeminarsService } from './seminars.service.js';

/** Seminars (stage 3): admin, findings status, actions and the public page. Participants live in
 * privacy. */
@Module({
  imports: [EventsCoreModule],
  providers: [
    SeminarsService,
    FindingStatusService,
    PublicSeminarService,
    MaterialsService,
    InvitationService,
  ],
  controllers: [
    SeminarsController,
    PublicSeminarController,
    MaterialsController,
    InvitationController,
  ],
  exports: [SeminarsService, FindingStatusService],
})
export class SeminarsModule {}
