import { Module } from '@nestjs/common';
import { ArchiveService } from './archive.service.js';
import { ArchiveController } from './archive.controller.js';

@Module({ providers: [ArchiveService], exports: [ArchiveService] })
export class CutoverCoreModule {}
@Module({ imports: [CutoverCoreModule], controllers: [ArchiveController] })
export class CutoverModule {}
