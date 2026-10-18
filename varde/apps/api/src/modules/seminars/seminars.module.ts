import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { EventsCoreModule } from '../events/events-core.module.js';
import { FindingsModule } from '../findings/findings.module.js';
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

/** Seminars (stage 3): admin, findings status (also of one client, 2.17), actions, the public page,
 * the rounds before, during and after (3.8) and «Før og etter» (3.9, a view of the dashboard).
 * Participants live in privacy. */
@Module({
  imports: [EventsCoreModule, DashboardModule, FindingsModule],
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
