// MetricDefinitions of a template (1.10, ADR-020): a distribution for every question of the
// common part (round_client, all_clients) and of the leader part (leaders_all only); the zone
// set of tryggleik and K7 × K8 come from the 0.16 fixtures; KI routine hours and the heaviest
// task use the tables of kartlegging private/dashboard.html 363–366 (TIMAR, GONGER, MINUTT).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type MetricDefinition,
  MetricDefinitionSet,
} from '@varde/schema/metrics/metric-definition';
import type { Question } from '@varde/schema/template/question';
import type { TemplateContent } from '@varde/schema/template/template';

const FIXTURES = fileURLToPath(
  new URL('../../../packages/schema/fixtures/metrics/', import.meta.url),
);
const fixture = (name: string) =>
  MetricDefinitionSet.parse(JSON.parse(readFileSync(`${FIXTURES}${name}`, 'utf8')));

/** dashboard.html 363: TIMAR (hours a week per K4 answer). */
export const TIMAR = { u1: 0.5, '1-3': 2, '3-5': 4, '5-10': 7.5, o10: 12 };
/** dashboard.html 365–366: GONGER (times a week per K17), MINUTT (minutes per time per K18). */
export const GONGER = { fleiredag: 15, dag: 5, veke: 3, sjeldnare: 0.5 };
export const MINUTT = { u5: 3, '5-15': 10, '15-30': 22, '30-60': 45, o60: 75 };

const identity = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, id]));
const range = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, i) => String(min + i));

function distributionsOf(key: string, q: Question): MetricDefinition[] {
  const leader = q.part === 'leader';
  const base = {
    version: 1,
    kind: 'distribution' as const,
    part: q.part,
    scale: 'categorical',
    recall_period: 'as_worded',
    denominator_rule: 'answered',
    populations: leader ? (['leaders_all'] as const) : (['round_client', 'all_clients'] as const),
    comparability: [],
    first_version: true as const,
  };
  const name = (suffix: string) =>
    `${key}.${leader ? 'leiar_' : ''}${suffix.toLowerCase()}.distribution`;
  const one = (qkey: string, suffix: string, buckets: readonly string[]): MetricDefinition => ({
    ...base,
    populations: [...base.populations],
    key: name(suffix),
    questions: [{ key: qkey, part: q.part }],
    options_mapping: { [qkey]: identity(buckets) },
  });
  if (q.identifier || q.type === 'text') return [];
  if (q.type === 'single' || q.type === 'multi')
    return [
      one(
        q.id,
        q.id,
        q.options.map((o) => o.id),
      ),
    ];
  if (q.type === 'nps') return [one(q.id, q.id, range(0, 10))];
  return q.rows.map((r) =>
    one(`${q.id}.${r.id}`, `${q.id}_${r.id}`, range(q.scale.min, q.scale.max)),
  );
}

function kiExtras(): MetricDefinition[] {
  const common = {
    version: 1,
    part: 'common' as const,
    recall_period: 'as_worded',
    populations: ['round_client' as const, 'all_clients' as const],
    comparability: [],
    first_version: true as const,
  };
  return [
    ...fixture('k7xk8.v1.json'),
    {
      ...common,
      key: 'ki.routine_hours_week',
      kind: 'routine_hours_week',
      questions: [{ key: 'K4', part: 'common' }],
      options_mapping: { K4: TIMAR },
      scale: 'hours-week',
      denominator_rule: 'answered_mapped',
    },
    {
      ...common,
      key: 'ki.heaviest_task',
      kind: 'heaviest_task',
      questions: [
        { key: 'K16', part: 'common' },
        { key: 'K17', part: 'common' },
        { key: 'K18', part: 'common' },
      ],
      options_mapping: { K16: {}, K17: GONGER, K18: MINUTT },
      scale: 'hours-week',
      denominator_rule: 'answered_task; time when K17 and K18 are mapped',
    },
  ];
}

/** Every MetricDefinition of a template, validated by the 0.16 schema. */
export function metricDefinitions(t: TemplateContent): MetricDefinition[] {
  const defs = t.questions.flatMap((q) => distributionsOf(t.key, q));
  if (t.key === 'tryggleik') defs.push(...fixture('zone.v1.json'));
  if (t.key === 'ki') {
    const k16 = t.questions.find((q) => q.id === 'K16');
    const extras = kiExtras();
    const heavy = extras.find((d) => d.kind === 'heaviest_task');
    if (heavy !== undefined && k16 !== undefined && 'options' in k16)
      heavy.options_mapping.K16 = identity(k16.options.map((o) => o.id));
    defs.push(...extras);
  }
  return MetricDefinitionSet.parse(defs);
}
