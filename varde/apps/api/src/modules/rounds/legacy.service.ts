// Lookup of an old kartlegging link (1.7): (survey, client slug, sha256(code)) against
// RoundClient.legacy_code_hash. The code itself is never stored or logged.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { legacyHash } from './seed.service.js';

@Injectable()
export class LegacyService {
  constructor(private readonly prisma: PrismaService) {}

  async isKnown(s: string, k: string, t: string): Promise<boolean> {
    if (s === '' || k === '' || t === '' || t.length > 64) return false;
    const n = await this.prisma.roundClient.count({
      where: {
        legacy_code_hash: legacyHash(t),
        client: { slug: k },
        round: { template_version: { template: { key: s } } },
      },
    });
    return n > 0;
  }
}
