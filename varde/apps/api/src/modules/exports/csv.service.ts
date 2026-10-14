import { BadRequestException, Injectable } from '@nestjs/common';
import { DashboardContext } from '../dashboard/dashboard-context.js';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { csv } from './csv.js';

@Injectable()
export class CsvService {
  constructor(
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
  ) {}
  async client(round: string, client: string) {
    const scope = await this.context.load(round, client);
    if (!scope.client) throw new BadRequestException('Vel éin kunde.');
    const cells = await this.privacy.viewCells(
      round,
      'round_client',
      scope.defs.filter((d) => d.part === 'common'),
      scope.client,
      true, // ADR-025: the client channel always reads released cells, even in an open round.
    );
    return csv(
      ['Spørsmål', 'Svar', 'Måling', 'Versjon', 'Gruppe', 'n', 'Teljar', 'Nemnar', 'Del', 'Sone'],
      cells.map((c) => {
        const def = scope.defs
          .filter((d) => c.metric_key.startsWith(d.key + '.'))
          .sort((a, b) => b.key.length - a.key.length)[0];
        const question = scope.content.questions.find(
          (q) => q.id === def?.questions[0]?.key.split('.')[0],
        );
        const option = def ? c.metric_key.slice(def.key.length + 1) : '';
        const label =
          question && 'options' in question
            ? (question.options.find((o) => o.id === option)?.texts.text.nn ?? option)
            : option;
        return [
          question?.texts.text.nn ?? '',
          label,
          c.metric_key,
          c.metric_version,
          c.group,
          ...(c.suppressed
            ? ['', '', '', '', '']
            : [
                c.n,
                c.numerator,
                c.denominator,
                c.denominator ? c.numerator / c.denominator : '',
                c.metric_key.includes('.zone.')
                  ? ['Grøn', 'Gul', 'Oransje', 'Raud'][c.numerator]
                  : '',
              ]),
        ];
      }),
    );
  }
  async rows(round: string, client: string | undefined, session: PrivacySession | undefined) {
    const scope = await this.context.load(round, client);
    const result = await this.privacy.rows(
      { round, ...(scope.client ? { client: scope.client } : {}) },
      session,
    );
    const questions = scope.content.questions.filter((q) => q.part === 'common' && !q.identifier);
    const columns = questions.flatMap((q) => [
      ...(q.type === 'scale' ? q.rows.map((r) => `${q.id}.${r.id}`) : [q.id]),
      ...('free_text' in q && q.free_text ? [`${q.id}.fri`] : []),
    ]);
    const identified = result.mode === 'initials';
    return csv(
      [
        'submission_id',
        'source_id',
        'submitted_day',
        'client',
        'role',
        'lang',
        'duration_s',
        ...(identified ? ['respondent_key'] : []),
        ...columns,
      ],
      result.rows.map((r) => [
        r.submission_id,
        r.source_id,
        r.submitted_day,
        r.client,
        r.role,
        r.lang,
        r.duration_s,
        ...(identified ? [r.respondent_key] : []),
        ...columns.map((c) => {
          const [id, sub] = c.split('.');
          const value =
            sub === 'fri'
              ? r.free?.[id!]
              : sub
                ? (r.answers[id!] as Record<string, unknown> | undefined)?.[sub]
                : r.answers[id!];
          return Array.isArray(value) ? value.join('|') : value;
        }),
      ]),
    );
  }
}
