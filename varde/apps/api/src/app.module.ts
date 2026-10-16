import { CutoverModule } from './modules/cutover/cutover.module.js';
import { RetentionModule } from './modules/retention/retention.module.js';
import { SeminarsModule } from './modules/seminars/seminars.module.js';
import { ExportsModule } from './modules/exports/exports.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { RuleEditorModule } from './modules/findings/rule-editor.module.js';
import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { HomeModule } from './home/home.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BreakGlassModule } from './modules/break-glass/break-glass.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';
import { PrivacyModule } from './modules/privacy/privacy.service.js';
import { RoundsModule } from './modules/rounds/rounds.module.js';
import { ResponsesModule } from './modules/responses/responses.module.js';
import { SurveysModule } from './modules/surveys/surveys.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    JobsModule,
    HealthModule,
    AuthModule.register('main'),
    BreakGlassModule,
    PrivacyModule.forApp(),
    SurveysModule,
    RoundsModule,
    ResponsesModule,
    ImportsModule,
    MetricsModule,
    HomeModule,
    AdminModule,
    EventsModule,
    DashboardModule,
    RuleEditorModule,
    ExportsModule,
    ReportsModule,
    RetentionModule,
    CutoverModule,
    SeminarsModule,
  ],
})
export class AppModule {}
