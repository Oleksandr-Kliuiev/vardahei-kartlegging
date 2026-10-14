// seedTemplates (1.5, for 1.7): every file of config/seed/templates is created, accepted (nn, en)
// and published once; idempotent by (key, label, content_hash).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { contentHash } from './hashes.js';
import { type Origin, PublishRejected, PublishService } from './publish.service.js';

export interface SeedTemplateFile {
  label: string;
  origin: Origin;
  content: { key: string; required_languages: ('nn' | 'en' | 'nb')[] } & Record<string, unknown>;
}

export interface SeedResult {
  created: string[];
  unchanged: string[];
}

export function readSeedTemplates(dir: string): SeedTemplateFile[] {
  const templates = join(dir, 'templates');
  return readdirSync(templates)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(templates, f), 'utf8')) as SeedTemplateFile);
}

@Injectable()
export class SeedTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PublishService,
  ) {}

  /** Publishes one seed file unless (key, label) exists with the same content hash. */
  async seedOne(file: SeedTemplateFile, who: string): Promise<'created' | 'unchanged'> {
    const key = file.content.key;
    const existing = await this.prisma.templateVersion.findFirst({
      where: { label: file.label, template: { key } },
    });
    if (existing !== null) {
      if (existing.content_hash !== contentHash(file.content) || existing.status !== 'published') {
        throw new PublishRejected(`${key}@${file.label} exists with other content or unpublished`);
      }
      return 'unchanged';
    }
    const draft = await this.publisher.createDraft(key, file.content, {
      label: file.label,
      origin: file.origin,
    });
    for (const lang of file.content.required_languages)
      await this.publisher.acceptTranslation(draft.id, lang, who);
    await this.publisher.publish(draft.id, who);
    return 'created';
  }

  async seedTemplates(dir: string, who: string): Promise<SeedResult> {
    const result: SeedResult = { created: [], unchanged: [] };
    for (const file of readSeedTemplates(dir)) {
      result[await this.seedOne(file, who)].push(`${file.content.key}@${file.label}`);
    }
    return result;
  }
}
