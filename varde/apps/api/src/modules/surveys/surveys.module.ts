import { CommentsController } from './comments.controller.js';
import { EditorController } from './editor.controller.js';
import { SettingsController } from './settings.controller.js';
import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module.js';
import { MetricsUsesController } from './metrics-uses.controller.js';
import { SurveysCoreModule } from './surveys-core.module.js';

/** Template versions: drafts, translation acceptance, publication, seed (1.5). */
@Module({
  imports: [SurveysCoreModule, MetricsModule],
  controllers: [EditorController, SettingsController, CommentsController, MetricsUsesController],
  exports: [SurveysCoreModule],
})
export class SurveysModule {}
