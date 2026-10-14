// Rounds for integration tests (1.4b): a template with a draft version, a round in a given mode
// and status, and round clients. Responses are inserted with plain `pg` (`insertResponse`):
// outside modules/privacy no code reads or writes `response` through Prisma (lint 0.2b).
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { databaseUrl } from './prisma-cli.js';

export interface TestRound {
  round: string;
  version: string;
  clients: Record<string, { id: string; roundClient: string }>;
}

export async function makeRound(
  prisma: PrismaService,
  opts: {
    mark: string;
    identification: 'initials' | 'none' | null;
    status?: string;
    clients?: string[];
  },
): Promise<TestRound> {
  const template = await prisma.surveyTemplate.create({
    data: {
      key: `${opts.mark}-${randomUUID().slice(0, 8)}`,
      audience: 'client_survey',
      required_languages: ['nn', 'en'],
    },
  });
  const version = await prisma.templateVersion.create({
    data: {
      template_id: template.id,
      label: 'v1',
      version_no: 1,
      required_languages: ['nn', 'en'],
      content: {},
      origin: 'authored',
      content_hash: '0'.repeat(64),
      identification: opts.identification ?? 'initials',
    },
  });
  const status = opts.status ?? 'closed';
  const round = await prisma.round.create({
    data: {
      name: opts.mark,
      type: 'regular',
      status,
      template_version_id: version.id,
      identification: opts.identification,
    },
  });
  const clients: TestRound['clients'] = {};
  for (const slug of opts.clients ?? ['kunde-a']) {
    const client = await prisma.client.upsert({
      where: { slug: `${opts.mark}-${slug}` },
      create: { slug: `${opts.mark}-${slug}`, name: slug },
      update: {},
    });
    const rc = await prisma.roundClient.create({
      data: { round_id: round.id, client_id: client.id, status },
    });
    clients[slug] = { id: client.id, roundClient: rc.id };
  }
  return { round: round.id, version: version.id, clients };
}

export interface ResponseInsert {
  round_client_id: string;
  part?: 'common' | 'leader';
  role?: string;
  respondent_key?: string | null;
  answers?: object;
  submission_id?: string;
  source_id?: string | null;
}

export async function withPg<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export function insertResponse(c: pg.Client, r: ResponseInsert): Promise<pg.QueryResult> {
  return c.query(
    `INSERT INTO response (round_client_id, part, role, lang, respondent_key, answers, submission_id, content_hash, source_id, submitted_day)
     VALUES ($1, $2, $3, 'nn', $4, $5, $6, $7, $8, DATE '2026-10-13')`,
    [
      r.round_client_id,
      r.part ?? 'common',
      r.role ?? 'kontor',
      r.respondent_key ?? null,
      JSON.stringify(r.answers ?? { F12: 'ja' }),
      r.submission_id ?? randomUUID(),
      'h'.repeat(64),
      r.source_id ?? null,
    ],
  );
}
