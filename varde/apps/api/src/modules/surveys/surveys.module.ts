import { Module } from '@nestjs/common';
import { PublishService } from './publish.service.js';
import { SeedTemplatesService } from './seed-templates.js';

/** Template versions: drafts, translation acceptance, publication, seed (1.5). */
@Module({
  providers: [PublishService, SeedTemplatesService],
  exports: [PublishService, SeedTemplatesService],
})
export class SurveysModule {}
