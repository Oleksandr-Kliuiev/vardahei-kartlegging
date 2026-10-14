import { Module } from '@nestjs/common';
import { EventsCoreModule } from '../events/events-core.module.js';
import { BreakGlassService } from './break-glass.service.js';

/** Main-app side of break-glass; its routes exist only on the socket listener (404 here). */
@Module({
  imports: [EventsCoreModule],
  providers: [BreakGlassService],
  exports: [BreakGlassService],
})
export class BreakGlassModule {}
