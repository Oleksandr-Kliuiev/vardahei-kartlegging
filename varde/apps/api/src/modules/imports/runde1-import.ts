// Import of round 1 (Forms, runde1.js; 1.9, ADR-024): each record → one common Response of the
// round «Runde 1 (Forms, januar 2026)» (external_import, initials). source_id =
// sha256("runde1|" + k + "|" + init) — the key runde1_fra_excel.py groups by; no leader part.
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeAnswers, normalizeRespondentKey } from '@varde/rules/runner';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService, type ResponsePart } from '../privacy/privacy.service.js';
import { RUNDE1_LABEL } from '../rounds/seed.service.js';
import { importSubmissionId, partHash } from './import-ids.js';
import { ImportMismatch } from './import-mismatch.js';
import { loadVersion } from './import-rounds.js';
import { runde1SourceId } from './runde1-source-id.mjs';

export { runde1SourceId } from './runde1-source-id.mjs';

export const RUNDE1_ROUND = 'Runde 1 (Forms, januar 2026)';

export interface Runde1Manifest {
  id: string | null;
  status: 'ok';
  dry_run: boolean;
  source_hash: string;
  round_ids: string[];
  counts: {
    records: number;
    dropped_answers: number;
    rejected: number;
    common: { accepted: number; existing: number; suppressed: number };
    leader: number;
    clients: Record<string, number>;
  };
  rejected: { record: number; reason: string }[];
}

interface Record1 {
  k?: unknown;
  init?: unknown;
  svar?: unknown;
}

class DryRun extends Error {
  constructor(readonly manifest: Runde1Manifest) {
    super('dry run');
  }
}

/** window.RUNDE1 of runde1.js, loaded the way server.js loads sporsmal.js (vm, 1 s). */
export function loadRunde1(src: string): { dato: string; svar: Record1[] } {
  const window: { RUNDE1?: { dato?: unknown; svar?: unknown } } = {};
  vm.runInNewContext(src, { window }, { timeout: 1000 });
  const r = window.RUNDE1;
  if (r === undefined || !Array.isArray(r.svar) || typeof r.dato !== 'string')
    throw new Error('runde1.js: no window.RUNDE1');
  return { dato: r.dato, svar: r.svar as Record1[] };
}

@Injectable()
export class Runde1ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}

  async importRunde1(
    src: string,
    opts: { who: string; dryRun?: boolean },
  ): Promise<Runde1Manifest> {
    const data = loadRunde1(src);
    const sourceHash = createHash('sha256').update(src).digest('hex');
    try {
      return await this.prisma.$transaction((tx) => this.run(tx, data, sourceHash, opts), {
        timeout: 120_000,
        maxWait: 10_000,
      });
    } catch (error) {
      if (error instanceof DryRun) return error.manifest;
      if (error instanceof ImportMismatch && opts.dryRun !== true) {
        await this.prisma.importManifest.create({
          data: {
            source: 'runde1',
            source_hash: sourceHash,
            round_ids: [],
            counts: { error: error.message },
            rejected: [],
            status: 'failed',
            started_by: opts.who,
          },
        });
      }
      throw error;
    }
  }

  private async run(
    tx: Prisma.TransactionClient,
    data: { dato: string; svar: Record1[] },
    sourceHash: string,
    opts: { who: string; dryRun?: boolean },
  ): Promise<Runde1Manifest> {
    const v = await loadVersion(tx, `tryggleik@${RUNDE1_LABEL}`);
    const round = await tx.round.findFirstOrThrow({
      where: { name: RUNDE1_ROUND, template_version_id: v.id },
    });
    const rcs = await tx.roundClient.findMany({
      where: { round_id: round.id },
      include: { client: true },
    });
    const rcOf = new Map(rcs.map((rc) => [rc.client.slug, rc.id]));
    const day = /^\d{4}-\d{2}$/.test(data.dato) ? `${data.dato}-01` : data.dato.slice(0, 10);
    const keys = data.svar.map((r) => `${String(r.k)}|${String(r.init)}`);
    const m: Runde1Manifest = {
      id: null,
      status: 'ok',
      dry_run: opts.dryRun === true,
      source_hash: sourceHash,
      round_ids: [round.id],
      counts: {
        records: data.svar.length,
        dropped_answers: 0,
        rejected: 0,
        common: { accepted: 0, existing: 0, suppressed: 0 },
        leader: 0,
        clients: {},
      },
      rejected: [],
    };
    const candidates: { record: number; k: string; sourceId: string; part: ResponsePart }[] = [];
    data.svar.forEach((r, i) => {
      const k = typeof r.k === 'string' ? r.k : '';
      const init = typeof r.init === 'string' ? r.init : '';
      const reject = (reason: string) => {
        m.counts.rejected += 1;
        m.rejected.push({ record: i + 1, reason });
      };
      const rc = rcOf.get(k);
      const key = normalizeRespondentKey(init);
      if (rc === undefined) return reject('unknown_client');
      if (key === null) return reject('no_init');
      if (keys.filter((x) => x === keys[i]).length > 1) return reject('duplicate_key');
      const n = normalizeAnswers(
        v,
        r.svar !== null && typeof r.svar === 'object' ? (r.svar as Record<string, unknown>) : {},
      );
      m.counts.dropped_answers += n.dropped;
      const sourceId = runde1SourceId(k, init);
      const role =
        v.roleId === undefined ? null : ((n.answers[v.roleId] as string | undefined) ?? null);
      const body = {
        part: 'common' as const,
        role,
        lang: 'nn' as const,
        respondent_key: key,
        answers: n.answers,
        free: {},
        submitted_day: day,
      };
      candidates.push({
        record: i + 1,
        k,
        sourceId,
        part: {
          ...body,
          round_client_id: rc,
          submission_id: importSubmissionId(sourceId, 'common'),
          content_hash: partHash(body),
          source_id: sourceId,
          duration_s: null,
        },
      });
    });
    const ids = candidates.map((c) => c.sourceId);
    await this.privacy.store.lockSubmissions(
      tx,
      candidates.map((c) => c.part.submission_id),
    );
    const existing = new Set(
      (await this.privacy.store.existingKeys(tx, ids))
        .filter((e) => e.part === 'common')
        .map((e) => e.source_id),
    );
    const tombs = await tx.deletionTombstone.findMany({
      where: { source_id: { in: ids }, part: 'common' },
      select: { source_id: true },
    });
    const suppressed = new Set(tombs.map((t) => t.source_id));
    const inserts: ResponsePart[] = [];
    for (const c of candidates) {
      const decision = suppressed.has(c.sourceId)
        ? 'suppressed'
        : existing.has(c.sourceId)
          ? 'existing'
          : 'accepted';
      m.counts.common[decision] += 1;
      m.counts.clients[c.k] = (m.counts.clients[c.k] ?? 0) + 1;
      if (decision === 'accepted') inserts.push(c.part);
    }
    await this.privacy.store.insertParts(tx, inserts);
    const { accepted, existing: ex, suppressed: sup } = m.counts.common;
    if (accepted + ex + sup + m.counts.rejected !== m.counts.records)
      throw new ImportMismatch('runde1 import: reconciliation failed');
    const saved = await tx.importManifest.create({
      data: {
        source: 'runde1',
        source_hash: sourceHash,
        round_ids: m.round_ids,
        counts: m.counts,
        rejected: m.rejected,
        status: 'ok',
        started_by: opts.who,
      },
    });
    m.id = saved.id;
    if (opts.dryRun === true) throw new DryRun({ ...m, id: null });
    return m;
  }
}
