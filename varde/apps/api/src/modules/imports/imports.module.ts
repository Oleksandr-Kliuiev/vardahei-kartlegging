import { Module } from '@nestjs/common';
import { Runde1ImportService } from './runde1-import.js';
import { SvarImportService } from './svar-import.js';

/** Provable import of kartlegging (1.8, 1.9; ADR-024). */
@Module({
  providers: [SvarImportService, Runde1ImportService],
  exports: [SvarImportService, Runde1ImportService],
})
export class ImportsModule {}
