import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { seedContent } from './seed-dir.js';

/** Isolated synthetic round; leaves immutable published versions for migration-test cleanup. */
export async function runnerRound(prisma: PrismaService, mark: string, status = 'open') {
  const template = await prisma.surveyTemplate.create({ data: {
    key: `test-${randomUUID()}`, audience: 'client_survey', required_languages: ['nn', 'en'],
  } });
  const content = seedContent('tryggleik.2026-10-13') as Prisma.InputJsonObject;
  const version = await prisma.templateVersion.create({ data: {
    template_id: template.id, label: 'v1', version_no: 1, identification: 'initials',
    required_languages: ['nn', 'en'], content, origin: 'authored', content_hash: '0'.repeat(64),
    status: 'published', published_at: new Date(), published_by: mark,
  } });
  const client = await prisma.client.create({ data: { slug: `test-${randomUUID()}`, name: mark } });
  const round = await prisma.round.create({ data: {
    name: mark, type: 'regular', template_version_id: version.id,
    identification: status === 'draft' ? null : 'initials', status,
  } });
  const rc = await prisma.roundClient.create({ data: {
    round_id: round.id, client_id: client.id, status, population_snapshot: 12,
    deadline: new Date('2099-06-01'),
  } });
  return { round, rc, version, client };
}

export async function removeRunnerRound(prisma: PrismaService, id: string) {
  await prisma.roundClient.deleteMany({ where: { round_id: id } });
  await prisma.round.delete({ where: { id } });
}
