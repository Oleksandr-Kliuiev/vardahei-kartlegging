// «Leiar vs tilsette» (2.22c, decision of Oleksandr 07.11): beside a question of one conversation,
// how the client's own employees answered the paired question (employee-pairs.ts) in the client's
// latest released tryggleik survey. These are one client's round_client cells: decision 16.10 lets
// them out only to that client's own channel and to the admin dashboard, and 07.11 adds Samtalar to
// the dashboard's trusted circle (lint varde/round-client-exits names this file). They are read the
// way the dashboard reads one client — its scope (DashboardContext: the round's definitions),
// privacy.adminClientCells (k = 3 and complementary suppression, applied at release) and
// questionViews (the series the dashboard shows) — so the numbers are the dashboard's. Only a
// closed or archived round with released cells for this client: such a round is read from its
// released snapshots and never counted live. Only the client's total, never a role group, never a
// shared view; a line with a hidden option comes back hidden, without numbers.
import { Injectable } from '@nestjs/common';
import type { ChoiceQuestion, Question as SurveyQuestion } from '@varde/schema/template/question';
import { PrismaService } from '../../prisma/prisma.service.js';
import { labelOf, questionViews } from '../dashboard/aggregate-view.js';
import { DashboardContext, PREVIOUS_TYPES } from '../dashboard/dashboard-context.js';
import { PrivacyService, type ViewCell } from '../privacy/privacy.service.js';
import { EMPLOYEE_PAIRS, employeeQuestion, firstWordings } from './employee-pairs.js';
import { InterviewsService } from './interviews.service.js';

/** The employees' survey of decision 07.11. */
const TRYGGLEIK = 'tryggleik';
/** Statuses whose cells privacy reads from the released snapshots (an open round is live). */
const RELEASED_STATUSES = ['closed', 'archived'];

type Visible = Extract<ViewCell, { suppressed: false }>;
const shown = (c: ViewCell): c is Visible => !c.suppressed;
type Series = ReturnType<typeof questionViews>[number]['series'][number];

interface Question {
  id: string;
  /** The short name the dashboard shows, the full question and whether several answers count. */
  label: string;
  text: string;
  multi: boolean;
}
export type EmployeeLine =
  | (Question & { suppressed: true })
  | (Question & {
      suppressed: false;
      /** People who answered the question, the dashboard's «N svar». */
      n: number;
      options: { id: string; label: string; count: number }[];
    });

/** One question to the employees as the dashboard shows it for the client, or hidden as a whole. */
export function employeeLine(q: ChoiceQuestion, s: Series): EmployeeLine {
  const base = { id: q.id, label: labelOf(q), text: q.texts.text.nn, multi: q.type === 'multi' };
  const cells = s.buckets.map((b) => b.cell);
  if (!cells.every(shown)) return { ...base, suppressed: true };
  return {
    ...base,
    suppressed: false,
    n: cells[0]?.denominator ?? 0,
    options: s.buckets.map((b, i) => ({ id: b.id, label: b.label, count: cells[i]!.numerator })),
  };
}

@Injectable()
export class EmployeeView {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interviews: InterviewsService,
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
  ) {}

  async load(id: string) {
    const conversation = await this.interviews.get(id);
    const none = { class: 'aggregate' as const, round: null, questions: [] };
    const round = await this.latestReleased(conversation.client.id);
    if (!round) return none;
    // The round has the client (else load answers 404), so the scope names it by its slug.
    const scope = await this.context.load(round.id, conversation.client.id);
    const common = scope.defs.filter((d) => d.part === 'common');
    const cells = await this.privacy.adminClientCells(round.id, scope.client!, common);
    const views = questionViews(scope, cells, 'all', 'common');
    // The wording each T question was first published with; the round's own version counts last,
    // for a question no published version had before it.
    const pins = await this.firstWordings(
      round.template_version?.template_id,
      scope.content.questions,
    );
    const questions = conversation.guide.questions.flatMap((g) => {
      const employees = (EMPLOYEE_PAIRS.get(g.id) ?? []).flatMap((ref) => {
        const q = employeeQuestion(scope.content.questions, ref, pins);
        const series = q && views.find((v) => v.id === q.id)?.series[0];
        return q && series ? [employeeLine(q, series)] : [];
      });
      return employees.length ? [{ question: g.id, employees }] : [];
    });
    return {
      class: 'aggregate' as const,
      round: {
        id: round.id,
        name: round.name,
        closed_on: round.closed_at?.toISOString().slice(0, 10) ?? null,
        // The newest survey is shown even when it closed after the conversation (decided 07.11:
        // in the autumn tour the employees answer after the leader); the line then says so.
        after_conversation: after(round.closed_at, conversation.held_on),
      },
      questions,
    };
  }

  /** The client's newest tryggleik survey with released cells for it: an ordinary round or the
   * imported round 1 (PREVIOUS_TYPES, decision 16.10: never a survey after a seminar, never a live
   * poll), closed or archived, newest first as the dashboard orders the rounds of a template. */
  private async latestReleased(client: string) {
    const rounds = await this.prisma.round.findMany({
      where: {
        type: { in: [...PREVIOUS_TYPES] },
        status: { in: RELEASED_STATUSES },
        template_version: { template: { key: TRYGGLEIK } },
        round_clients: { some: { client_id: client } },
      },
      select: {
        id: true,
        name: true,
        closed_at: true,
        template_version: { select: { template_id: true } },
        round_clients: { where: { client_id: client }, select: { id: true } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    const released = await this.privacy.releasedRoundClients(rounds.map((r) => r.id));
    return rounds.find((r) => r.round_clients.some((rc) => released.has(rc.id)));
  }

  /** The wording of each question a pair names by id (T1–T5), as the first published version of the
   * template had it, else as the round's own version has it: a later rewrite gives such a question no
   * new anchor, so its pair ends there (employee-pairs.ts). */
  private async firstWordings(template: string | undefined, own: readonly SurveyQuestion[]) {
    const versions = template
      ? await this.prisma.templateVersion.findMany({
          where: { template_id: template, published_at: { not: null } },
          orderBy: [{ published_at: 'asc' }, { version_no: 'asc' }],
          select: { content: true },
        })
      : [];
    return firstWordings([
      ...versions.map(
        (v) => (v.content as { questions?: SurveyQuestion[] } | null)?.questions ?? [],
      ),
      own,
    ]);
  }
}
export type EmployeeModel = Awaited<ReturnType<EmployeeView['load']>>;

/** Whether the survey closed after the day of the conversation (that day counted whole). */
export const after = (closed: Date | null, heldOn: string | null) =>
  closed !== null && heldOn !== null && closed.getTime() > Date.parse(`${heldOn}T23:59:59.999Z`);
