import { EditorService } from './editor.service.js';
import { Module } from '@nestjs/common';
import { PublishService } from './publish.service.js';
import { SeedTemplatesService } from './seed-templates.js';
import { SettingsService } from './settings.service.js';

/** Providers of template versions without HTTP (CLI, rounds core). */
@Module({
  providers: [PublishService, SeedTemplatesService, EditorService, SettingsService],
  exports: [PublishService, SeedTemplatesService, EditorService, SettingsService],
})
export class SurveysCoreModule {}
