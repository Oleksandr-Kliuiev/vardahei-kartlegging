import type { Prisma } from '@prisma/client';
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { TemplateContent } from '@varde/schema/template/template';

export const editorMetricPrefix = (versionId: string) => `auto.${versionId.replaceAll('-', '')}.`;

/** Version-specific distributions make no claim of comparability across versions (ADR-020). */
export async function createEditorMetrics(
  tx: Prisma.TransactionClient,
  id: string,
  c: TemplateContent,
) {
  for (const [index, q] of c.questions.entries()) {
    const series =
      q.type === 'single' || q.type === 'multi'
        ? [{ key: q.id, values: q.options.map((o) => o.id) }]
        : q.type === 'scale' || q.type === 'nps'
          ? (q.type === 'scale' ? q.rows.map((r) => `${q.id}.${r.id}`) : [q.id]).map((key) => ({
              key,
              values: Array.from({ length: q.scale.max - q.scale.min + 1 }, (_, n) =>
                String(n + q.scale.min),
              ),
            }))
          : [];
    for (const [row, s] of series.entries()) {
      const def = MetricDefinition.parse({
        key: `${editorMetricPrefix(id)}q${index}.r${row}`,
        version: 1,
        kind: 'distribution',
        part: q.part,
        questions: [{ key: s.key, part: q.part }],
        options_mapping: { [s.key]: Object.fromEntries(s.values.map((v) => [v, v])) },
        scale: 'options',
        recall_period: 'Som formulert i spørsmålet.',
        denominator_rule: 'Svar med minst eitt gyldig val; fleirval kan telje i fleire kategoriar.',
        populations: q.part === 'leader' ? ['leaders_all'] : ['round_client', 'all_clients'],
        comparability: [],
        first_version: true,
      });
      await tx.metricDefinition.create({ data: { key: def.key, version: 1, definition: def } });
    }
  }
}
