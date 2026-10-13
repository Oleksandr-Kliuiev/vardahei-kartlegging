import { Module } from '@nestjs/common';
import { SvarImportService } from './svar-import.js';

/** Provable import of kartlegging (1.8, 1.9; ADR-024). */
@Module({ providers: [SvarImportService], exports: [SvarImportService] })
export class ImportsModule {}
