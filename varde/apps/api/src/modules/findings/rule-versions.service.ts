// Versions of FindingRule (2.5, ADR-020/026): list, history and a new version. A version is never
// changed; a change is saved as version max + 1 under a per-key advisory lock, with its AuditLog
// entry in the same transaction. What the rule measures (IDENTITY_FIELDS) stays the same.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { canonical } from '../surveys/hashes.js';
import {
  type Channel,
  FindingRule,
  IDENTITY_FIELDS,
  PLACEHOLDERS,
  RuleDraft,
} from './finding-rule.js';
import {
  checkOptions,
  familyQuestions,
  metricOf,
  questionsOf,
  ruleContext,
  type RuleContext,
} from './rule-choices.js';

/** Fields that decide whether a rule fires; the preview reads only these from a draft. */
export const EVAL_FIELDS = ['options', 'threshold', 'min_count', 'level', 'minimum_hours'] as const;

function message(issue: z.core.$ZodIssue): string {
  const m = issue.message;
  if (m.startsWith('threshold'))
    return 'Tersklane må vere mellom 0 og 100 %, og «høg» kan ikkje vere lågare enn «middels».';
  if (m === 'text: empty') return 'Skriv teksten både på nynorsk og engelsk.';
  if (m.startsWith('text: unknown placeholder'))
    return `Teksten har ein ukjend plasshaldar: ${m.slice('text: unknown placeholder '.length)}.`;
  if (m === 'options: duplicate') return 'Kvart svar kan berre veljast éin gong.';
  if (issue.path[0] === 'min_count') return '«Minst personar» må vere eit heilt tal frå 1.';
  return 'Kontroller verdien i dette feltet.';
}
function parseRule<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const issues = r.error.issues.map((i) => ({ path: i.path, message: message(i) }));
  throw new BadRequestException({ message: issues[0]?.message ?? 'Kontroller felta.', issues });
}
/** Top-level fields that differ between two versions (history and AuditLog, never values). */
export function changedFields(a: object, b: object) {
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])]
    .filter((k) => k !== 'version' && canonical(x[k] ?? null) !== canonical(y[k] ?? null))
    .sort();
}
const unique = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';

@Injectable()
export class RuleVersions {
  constructor(private readonly prisma: PrismaService) {}

  async list(family: string, channel: Channel) {
    const rows = await this.prisma.findingRule.findMany({
      where: { key: { startsWith: `${family}.` }, channel },
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });
    const latest = new Map<string, { rule: FindingRule; versions: number; updated_at: Date }>();
    for (const r of rows)
      latest.set(r.key, {
        rule: FindingRule.parse(r.definition),
        versions: (latest.get(r.key)?.versions ?? 0) + 1,
        updated_at: r.created_at,
      });
    const question = await familyQuestions(this.prisma, family);
    const out = [];
    for (const x of [...latest.values()].sort((a, b) => a.rule.order - b.rule.order)) {
      const def = await metricOf(this.prisma, x.rule.metric_key);
      out.push({
        key: x.rule.key,
        version: x.rule.version,
        versions: x.versions,
        updated_at: x.updated_at,
        rule: x.rule,
        questions: questionsOf(x.rule, def, question),
      });
    }
    return out;
  }

  /** The latest version of a rule and what its options may be. */
  async current(key: string) {
    const row = await this.prisma.findingRule.findFirst({
      where: { key },
      orderBy: { version: 'desc' },
    });
    if (!row) throw new NotFoundException('Regelen finst ikkje.');
    const rule = FindingRule.parse(row.definition);
    return { rule, context: await ruleContext(this.prisma, rule) };
  }

  async history(key: string) {
    const { rule, context } = await this.current(key);
    const rows = await this.prisma.findingRule.findMany({
      where: { key },
      orderBy: { version: 'desc' },
    });
    const versions = rows.map((r) => FindingRule.parse(r.definition));
    return {
      key,
      rule,
      ...context,
      placeholders: PLACEHOLDERS[rule.computed ?? ''] ?? [],
      versions: rows.map((r, i) => ({
        version: r.version,
        created_at: r.created_at,
        changed: versions[i + 1] ? changedFields(versions[i + 1]!, versions[i]!) : [],
        rule: versions[i]!,
      })),
    };
  }

  /** A full draft for a new version: schema, invariants, same identity, valid options. */
  draft(current: FindingRule, input: unknown, context: RuleContext): RuleDraft {
    const draft = parseRule(RuleDraft, input);
    const changed = IDENTITY_FIELDS.filter(
      (f) => canonical(current[f] ?? null) !== canonical(draft[f] ?? null),
    );
    if (changed.length)
      throw new BadRequestException({
        message: `Regelen må måle det same som før. Desse felta kan ikkje endrast: ${changed.join(', ')}.`,
        issues: changed.map((f) => ({ path: [f], message: 'Kan ikkje endrast.' })),
      });
    checkOptions(current, draft, context);
    return draft;
  }

  /** The current version with the fields that decide the outcome taken from a draft (preview). */
  previewDraft(current: FindingRule, input: unknown, context: RuleContext): FindingRule {
    const raw =
      typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = { ...current };
    for (const f of EVAL_FIELDS) if (f in raw) merged[f] = raw[f];
    const rule = parseRule(FindingRule, merged);
    checkOptions(current, rule, context);
    return rule;
  }

  async create(
    key: string,
    input: { base_version?: number | undefined; rule: unknown },
    who: string,
  ) {
    const { rule: before, context } = await this.current(key);
    this.draft(before, input.rule, context);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`finding_rule:${key}`}, 0))`;
        const latest = await tx.findingRule.findFirstOrThrow({
          where: { key },
          orderBy: { version: 'desc' },
        });
        if (input.base_version !== undefined && input.base_version !== latest.version)
          throw new ConflictException(
            `Nokon har lagra versjon ${latest.version} i mellomtida. Hent regelen på nytt før du lagrar.`,
          );
        const current = FindingRule.parse(latest.definition);
        const draft = this.draft(current, input.rule, context);
        const sorted = (r: object) => ({
          ...r,
          version: 0,
          options: [...(r as RuleDraft).options].sort(),
        });
        if (canonical(sorted(draft)) === canonical(sorted(current)))
          throw new BadRequestException('Ingen endringar å lagre.');
        const next = FindingRule.parse({ ...draft, version: latest.version + 1 });
        const row = await tx.findingRule.create({
          data: { key, version: next.version, channel: next.channel, definition: next },
        });
        await tx.auditLog.create({
          data: {
            who,
            what: 'findings.rule_version',
            target: `finding_rule:${key}`,
            details: {
              version: next.version,
              from: latest.version,
              changed: changedFields(current, next),
            },
          },
        });
        return { key, version: next.version, created_at: row.created_at, rule: next };
      });
    } catch (e) {
      if (unique(e)) throw new ConflictException('Ein annan lagra same versjonen. Prøv igjen.');
      throw e;
    }
  }
}
