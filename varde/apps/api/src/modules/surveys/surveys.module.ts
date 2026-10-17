import { EditorController } from './editor.controller.js';
import { SettingsController } from './settings.controller.js';
import { Module } from '@nestjs/common';
import { SurveysCoreModule } from './surveys-core.module.js';

/** Template versions: drafts, translation acceptance, publication, seed (1.5). */
@Module({
  imports: [SurveysCoreModule],
  controllers: [EditorController, SettingsController],
  exports: [SurveysCoreModule],
})
export class SurveysModule {}
