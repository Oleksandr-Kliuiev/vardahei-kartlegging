import { Module } from '@nestjs/common';
import { EventsCoreModule } from '../events/events-core.module.js';
import { FindingStatusService } from './finding-status.service.js';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import { PublicSeminarController } from './public-seminar.controller.js';
import { PublicSeminarService } from './public-seminar.service.js';
import { SeminarsController } from './seminars.controller.js';
import { SeminarsService } from './seminars.service.js';

/** Seminars (stage 3): admin, findings status, actions, material and the public page.
 * Participants live in privacy. */
@Module({
  imports: [EventsCoreModule],
  providers: [SeminarsService, FindingStatusService, PublicSeminarService, MaterialsService],
  controllers: [SeminarsController, PublicSeminarController, MaterialsController],
  exports: [SeminarsService, FindingStatusService],
})
export class SeminarsModule {}
