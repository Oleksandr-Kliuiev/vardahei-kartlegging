// Working status of findings and the actions behind seminars (3.1). A Finding row never changes
// (2.5), so its status lives in FindingStatus: attaching a finding to a seminar makes it
// `in_seminar`, detaching makes it `open` again, and `closed` ends it. Actions are linked to a rule
// by key (FindingRuleAction), beside the immutable rule versions. Every change is in AuditLog.
// The client page (2.17) shows and changes the status of a client's findings.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { namesOf } from '../auth/people.js';
import { EventsService } from '../events/events.service.js';
import { FindingsService } from '../findings/findings.service.js';
import type { ActionInput, FindingStatusInput } from './seminar-input.js';

@Injectable()
export class FindingStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly findings: FindingsService,
    private readonly events: EventsService,
  ) {}

  private async setIn(
    tx: Prisma.TransactionClient,
    finding: string,
    input: FindingStatusInput,
    who: string,
  ) {
    if (!(await tx.finding.count({ where: { id: finding } })))
      throw new NotFoundException('Funnet finst ikkje.');
    const seminar = input.status === 'open' ? null : (input.seminar ?? null);
    if (seminar && !(await tx.seminar.count({ where: { id: seminar } })))
      throw new NotFoundException('Seminaret finst ikkje.');
    const data = {
      status: input.status,
      seminar_id: seminar,
      changed_by: who,
      changed_at: new Date(),
    };
    const row = await tx.findingStatus.upsert({
      where: { finding_id: finding },
      create: { finding_id: finding, ...data },
      update: data,
    });
    await tx.auditLog.create({
      data: {
        who,
        what: 'findings.status',
        target: `finding:${finding}`,
        details: { status: row.status, seminar: row.seminar_id },
      },
    });
    return {
      finding,
      status: row.status,
      seminar: row.seminar_id,
      changed_by: row.changed_by,
      changed_at: row.changed_at.toISOString(),
    };
  }

  async set(finding: string, input: FindingStatusInput, who: string) {
    const out = await this.prisma.$transaction((tx) => this.setIn(tx, finding, input, who));
    this.events.changed('seminars');
    return out;
  }

  /** The seminar takes up these findings: each becomes `in_seminar` with this seminar. */
  async attach(seminar: string, findings: readonly string[], who: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const f of new Set(findings))
        rows.push(await this.setIn(tx, f, { status: 'in_seminar', seminar }, who));
      return rows;
    });
    this.events.changed('seminars');
    return out;
  }

  /** The follow-up of one client's saved findings (2.17, the client page): per round and rule the
   * row a new status goes to, its status (without one a finding is `open`), the seminar that
   * takes it up and who changed it last, by name as in the journal. No numbers of the finding. */
  async ofClient(client: string, now = new Date()) {
    const found = await this.prisma.client.findUnique({
      where: { id: client },
      select: { kind: true },
    });
    // The technical client of live polls (3.4) is nobody's customer.
    if (found?.kind !== 'client') throw new NotFoundException('Kunden finst ikkje.');
    const saved = await this.findings.ofClient(client);
    const ids = [...new Set(saved.flatMap((f) => f.status?.seminar_id ?? []))];
    const seminars = ids.length
      ? await this.prisma.seminar.findMany({
          where: { id: { in: ids } },
          select: { id: true, topic_nn: true, starts_at: true, ends_at: true },
        })
      : [];
    const names = await namesOf(
      this.prisma,
      saved.map((f) => f.status?.changed_by),
    );
    return {
      rows: saved.map((f) => {
        const s = seminars.find((x) => x.id === f.status?.seminar_id);
        return {
          id: f.id,
          round: f.round,
          rule_key: f.rule_key,
          status: f.status?.status ?? 'open',
          seminar: s
            ? {
                id: s.id,
                topic: s.topic_nn,
                starts_at: s.starts_at.toISOString(),
                held: now >= s.ends_at,
              }
            : null,
          changed_by: f.status ? (names[f.status.changed_by] ?? f.status.changed_by) : null,
          changed_at: f.status?.changed_at.toISOString() ?? null,
        };
      }),
    };
  }

  /** Status of findings; a finding without a row is `open`. */
  async statusOf(findings: readonly string[]) {
    const rows = await this.prisma.findingStatus.findMany({
      where: { finding_id: { in: [...findings] } },
    });
    return Object.fromEntries(
      findings.map((f) => {
        const r = rows.find((x) => x.finding_id === f);
        return [f, { status: r?.status ?? 'open', seminar: r?.seminar_id ?? null }];
      }),
    );
  }

  async actions() {
    const rows = await this.prisma.action.findMany({
      orderBy: { name: 'asc' },
      include: { rules: { select: { rule_key: true }, orderBy: { rule_key: 'asc' } } },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      seminar_topic: a.seminar_topic,
      rules: a.rules.map((r) => r.rule_key),
    }));
  }

  async createAction(input: z.infer<typeof ActionInput>, who: string) {
    if (await this.prisma.action.count({ where: { name: input.name } }))
      throw new ConflictException('Det finst alt eit tiltak med det namnet.');
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.action.create({ data: { ...input, created_by: who } });
      await tx.auditLog.create({
        data: { who, what: 'findings.action.create', target: `action:${a.id}` },
      });
      return { id: a.id };
    });
  }

  /** FindingRule → Action by rule key; `null` removes the link. No rule version is written. */
  linkRule(ruleKey: string, action: string | null, who: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.findingRule.count({ where: { key: ruleKey } })))
        throw new NotFoundException('Regelen finst ikkje.');
      if (action === null) await tx.findingRuleAction.deleteMany({ where: { rule_key: ruleKey } });
      else {
        if (!(await tx.action.count({ where: { id: action } })))
          throw new BadRequestException('Tiltaket finst ikkje.');
        await tx.findingRuleAction.upsert({
          where: { rule_key: ruleKey },
          create: { rule_key: ruleKey, action_id: action, linked_by: who },
          update: { action_id: action, linked_by: who, linked_at: new Date() },
        });
      }
      await tx.auditLog.create({
        data: { who, what: 'findings.rule_action', target: `rule:${ruleKey}`, details: { action } },
      });
      return { rule_key: ruleKey, action };
    });
  }

  /** The action of a rule key, if any (the `action_id?` of ARCHITECTURE §4). */
  async actionOf(ruleKey: string): Promise<string | null> {
    return (
      (await this.prisma.findingRuleAction.findUnique({ where: { rule_key: ruleKey } }))
        ?.action_id ?? null
    );
  }
}
