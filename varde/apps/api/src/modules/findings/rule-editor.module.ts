import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { FindingsModule } from './findings.module.js';
import { RuleEditorController } from './rule-editor.controller.js';
import { RulePreview } from './rule-preview.service.js';
import { RuleVersions } from './rule-versions.service.js';

/** FindingRule editor with preview (2.5); the preview reads through the dashboard's privacy paths. */
@Module({
  imports: [FindingsModule, DashboardModule],
  controllers: [RuleEditorController],
  providers: [RuleVersions, RulePreview],
})
export class RuleEditorModule {}
