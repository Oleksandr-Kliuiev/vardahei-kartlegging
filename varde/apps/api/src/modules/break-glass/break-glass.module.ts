import { Module } from '@nestjs/common';
import { BreakGlassService } from './break-glass.service.js';

/** Main-app side of break-glass; its routes exist only on the socket listener (404 here). */
@Module({ providers: [BreakGlassService], exports: [BreakGlassService] })
export class BreakGlassModule {}
