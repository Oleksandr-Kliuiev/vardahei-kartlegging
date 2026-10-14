// Import of kartlegging svar.jsonl (1.8, ADR-024, ADR-025, ADR-006). One transaction: rounds,
// parts, manifest. Per part: tombstone → suppressed, existing (source_id, part) → existing,
// otherwise accepted. Reconciliation by part; a mismatch rolls back and leaves a failed manifest.
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeAnswers, normalizeFree } from '@varde/rules/runner';
import { readConfigJson } from '../../config/config-dir.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService, type ResponsePart } from '../privacy/privacy.service.js';
import { importSubmissionId, partHash } from './import-ids.js';
import { ImportMismatch } from './import-mismatch.js';
import { ImportRounds, type ImportVersion, loadVersion } from './import-rounds.js';
import { type Candidate, type ImportMap, parseSvar } from './svar-lines.js';

type Part = 'common' | 'leader';
type Decision = 'accepted' | 'existing' | 'suppressed';
type PartCounts = Record<Decision, number>;
export interface SvarManifest {
  id: string | null;
  status: 'ok' | 'failed';
  dry_run: boolean;
  source_hash: string;
  round_ids: string[];
  counts: {
    lines: number;
    leiardel: number;
    dropped_answers: number;
    rejected: Record<Part, number>;
    rounds: Record<string, { round_id: string } & Record<Part, PartCounts>>;
  };
  rejected: { line: number; reason: string; parts: Part[] }[];
}

class DryRun extends Error {
  constructor(readonly manifest: SvarManifest) {
    super('dry run');
  }
}

const zero = (): PartCounts => ({ accepted: 0, existing: 0, suppressed: 0 });
const sum = (c: PartCounts) => c.accepted + c.existing + c.suppressed;

function split(
  v: ImportVersion,
  values: Record<string, unknown>,
): Record<Part, Record<string, unknown>> {
  const out: Record<Part, Record<string, unknown>> = { common: {}, leader: {} };
  for (const [id, value] of Object.entries(values)) out[v.partOf.get(id) ?? 'common'][id] = value;
  return out;
}

@Injectable()
export class SvarImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: PrivacyService,
  ) {}

  async importSvar(text: string, opts: { who: string; dryRun?: boolean }): Promise<SvarManifest> {
    const map = readConfigJson('seed/import-map.json') as ImportMap;
    const clients = new Set(
      (await this.prisma.client.findMany({ select: { slug: true } })).map((c) => c.slug),
    );
    const parsed = parseSvar(text, map, clients);
    const sourceHash = createHash('sha256').update(text).digest('hex');
    try {
      return await this.prisma.$transaction((tx) => this.run(tx, parsed, sourceHash, opts), {
        timeout: 120_000,
        maxWait: 10_000,
      });
    } catch (error) {
      if (error instanceof DryRun) return error.manifest;
      if (error instanceof ImportMismatch && opts.dryRun !== true) {
        await this.prisma.importManifest.create({
          data: {
            source: 'svar',
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
    parsed: ReturnType<typeof parseSvar>,
    sourceHash: string,
    opts: { who: string; dryRun?: boolean },
  ): Promise<SvarManifest> {
    const rounds = new ImportRounds(tx);
    const versions = new Map<string, ImportVersion>();
    const ids = parsed.candidates.map((c) => c.id);
    await this.privacy.store.lockSubmissions(
      tx,
      ids.flatMap((id) => [importSubmissionId(id, 'common'), importSubmissionId(id, 'leader')]),
    );
    const existing = new Set(
      (await this.privacy.store.existingKeys(tx, ids)).map((e) => `${e.source_id}|${e.part}`),
    );
    const tombs = await tx.deletionTombstone.findMany({
      where: { source_id: { in: ids } },
      select: { source_id: true, part: true },
    });
    const suppressed = new Set(tombs.map((t) => `${t.source_id ?? ''}|${t.part}`));
    const manifest: SvarManifest = {
      id: null,
      status: 'ok',
      dry_run: opts.dryRun === true,
      source_hash: sourceHash,
      round_ids: [],
      counts: {
        lines: parsed.lines,
        leiardel: parsed.leiardel,
        dropped_answers: 0,
        rejected: { common: 0, leader: 0 },
        rounds: {},
      },
      rejected: parsed.rejected.map((r) => ({
        line: r.line,
        reason: r.reason,
        parts: r.leiardel ? ['common', 'leader'] : ['common'],
      })),
    };
    for (const r of parsed.rejected) {
      manifest.counts.rejected.common += 1;
      if (r.leiardel) manifest.counts.rejected.leader += 1;
    }
    const inserts: ResponsePart[] = [];
    for (const c of parsed.candidates) {
      let v = versions.get(c.version);
      if (v === undefined) {
        v = await loadVersion(tx, c.version);
        versions.set(c.version, v);
      }
      const round = await rounds.round(v);
      const counts = (manifest.counts.rounds[round.name] ??= {
        round_id: round.id,
        common: zero(),
        leader: zero(),
      });
      const parts = await this.parts(rounds, v, c, manifest);
      for (const part of ['common', 'leader'] as const) {
        const p = parts[part];
        if (p === undefined) continue;
        const key = `${c.id}|${part}`;
        const decision: Decision = suppressed.has(key)
          ? 'suppressed'
          : existing.has(key)
            ? 'existing'
            : 'accepted';
        counts[part][decision] += 1;
        if (decision === 'accepted') inserts.push(p);
      }
    }
    await this.privacy.store.insertParts(tx, inserts);
    const rs = Object.values(manifest.counts.rounds);
    const common = rs.reduce((n, r) => n + sum(r.common), 0) + manifest.counts.rejected.common;
    const leader = rs.reduce((n, r) => n + sum(r.leader), 0) + manifest.counts.rejected.leader;
    if (common !== parsed.lines || leader !== parsed.leiardel) {
      throw new ImportMismatch(
        `reconciliation: common ${common}/${parsed.lines}, leader ${leader}/${parsed.leiardel}`,
      );
    }
    manifest.round_ids = rounds.ids();
    const saved = await tx.importManifest.create({
      data: {
        source: 'svar',
        source_hash: sourceHash,
        round_ids: manifest.round_ids,
        counts: manifest.counts,
        rejected: manifest.rejected,
        status: 'ok',
        started_by: opts.who,
      },
    });
    manifest.id = saved.id;
    if (opts.dryRun === true) throw new DryRun({ ...manifest, id: null });
    return manifest;
  }

  /** Common part always; leader part only with leiardel (no B answers → rejected leader_empty). */
  private async parts(
    rounds: ImportRounds,
    v: ImportVersion,
    c: Candidate,
    manifest: SvarManifest,
  ): Promise<Partial<Record<Part, ResponsePart>>> {
    const n = normalizeAnswers(v, c.svar);
    manifest.counts.dropped_answers += n.dropped;
    const answers = split(v, n.answers);
    const free = split(v, normalizeFree(v, c.fri)) as Record<Part, Record<string, string>>;
    const role =
      v.roleId === undefined ? null : ((n.answers[v.roleId] as string | undefined) ?? null);
    const rc = await rounds.roundClient(v, c.k);
    const key = v.identification === 'initials' ? n.respondent_key : null;
    const make = (part: Part): ResponsePart => {
      const body = {
        part,
        role,
        lang: c.lang,
        respondent_key: key,
        answers: answers[part],
        free: free[part],
        submitted_day: c.day,
      };
      return {
        ...body,
        round_client_id: rc,
        submission_id: importSubmissionId(c.id, part),
        content_hash: partHash(body),
        source_id: c.id,
        duration_s: c.sekund,
      };
    };
    const out: Partial<Record<Part, ResponsePart>> = { common: make('common') };
    if (c.leiardel) {
      if (Object.keys(answers.leader).length > 0) out.leader = make('leader');
      else {
        manifest.counts.rejected.leader += 1;
        manifest.rejected.push({ line: c.line, reason: 'leader_empty', parts: ['leader'] });
      }
    }
    return out;
  }
}
