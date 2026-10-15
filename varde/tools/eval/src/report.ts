// docs/varde/evidence/stage-0/0.14-report.md: the eval report (Russian, like all evidence),
// bound to the ADR-018 triple. The last ```json block is machine-readable (report-triple test).
import type { EvalConfig, ModelEntry } from './config.js';
import { schemaHash, short } from './hash.js';
import type { ModelResult, Thresholds } from './score.js';

export interface ReportInput {
  config: EvalConfig;
  thresholds: Thresholds;
  base: { prompt_hash: string; briefs_version: string };
  results: ModelResult[];
  inputs: { file: string; sha256: string }[];
  /** Model chosen by Oleksandr with --select (written to varde/config/model.json). */
  selected: ModelEntry | null;
}

const usd = (n: number): string => n.toFixed(4);
/** Local calendar date (Norway), not the UTC date of toISOString. */
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const cell = (codes: string[]): string => (codes.length > 0 ? codes.join(', ') : '—');

function thresholdsText(t: Thresholds, briefs: number): string {
  const slow =
    t.slow_briefs_max === null
      ? `брифы с медианой правки > ${t.slow_minutes} мин — только в отчёте, не порог`
      : `брифов с медианой правки > ${t.slow_minutes} мин ≤ ${t.slow_briefs_max}`;
  return `медиана смысла ≥ ${t.median_meaning}, медиана естественности ≥ ${t.median_naturalness}; брифов без критических ошибок ≥ ${t.critical_free_briefs} из ${briefs}; ${slow}`;
}

export function renderReport(i: ReportInput): string {
  const { config, thresholds: t, base, results } = i;
  const effort = (model: string): string =>
    config.models.find((m) => m.id === model)?.effort ?? '?';
  const briefs = results[0]?.briefs.length ?? 0;
  const profile =
    config.thresholds === 'simplified'
      ? 'упрощённая 0.14 (решение Oleksandr 13.10): одна модель, один прогон на бриф, оценивает Oleksandr'
      : 'полная 0.14 (ADR-010): две модели, два прогона на бриф, два слепых оценщика';
  const lines = [
    '# 0.14 Eval: отчёт',
    '',
    `Сформирован \`pnpm --filter @varde/tools-eval eval:score\` ${today()}. Профиль \`${config.thresholds}\` — ${profile}.`,
    '',
    '## Тройка (ADR-018)',
    '',
    '| Поле | Значение |',
    '| --- | --- |',
    `| \`prompt_hash\` | \`${base.prompt_hash}\` (\`varde/tools/eval/prompt/v1.md\`) |`,
    `| \`briefs_version\` | \`${base.briefs_version}\` (\`varde/tools/eval/briefs/v1/\`, ${briefs} брифов) |`,
    `| \`model\` | ${results.map((r) => `\`${r.model}\` (effort \`${effort(r.model)}\`)`).join(', ')} |`,
    `| \`schema_hash\` | \`${schemaHash()}\` (JSON-схема \`@varde/schema/survey-draft\`) |`,
    '',
    '## Итог',
    '',
    '| Модель | effort | Оценок | Медиана смысла | Медиана естественности | Сумма медиан | Без критических | Правка > 5 мин | $ на бриф | Решение |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| \`${r.model}\` | ${effort(r.model)} | ${r.ratings} | ${r.median_meaning} | ${r.median_naturalness} | ${r.sum_of_medians} | ${r.critical_free_briefs} из ${r.briefs.length} | ${r.slow_briefs.length} | ${usd(r.cost_per_brief_usd)} | **${r.pass ? 'pass' : 'fail'}** |`,
    ),
    '',
    `Пороги: ${thresholdsText(t, briefs)}. Критическая ошибка брифа — любой код оценщика в любом прогоне или автопроверки (refusal, schema_violation, mixed_nn_nb, product_name).`,
  ];
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0)
    lines.push('', ...failed.map((r) => `- \`${r.model}\` fail: ${r.reasons.join('; ')}.`));
  for (const r of results) {
    lines.push('', `## По брифам — \`${r.model}\``, '');
    lines.push('| Бриф | Смысл | Естественность | Минуты правки | Критические ошибки | $ |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const b of r.briefs)
      lines.push(
        `| \`${b.brief}\` | ${b.median_meaning} | ${b.median_naturalness} | ${b.median_edit_minutes}${b.slow ? ' (> 5)' : ''} | ${cell(b.critical)} | ${usd(b.cost_usd)} |`,
      );
  }
  const passed = results.filter((r) => r.pass).map((r) => r.model);
  lines.push('', '## Входы', '');
  for (const f of i.inputs) lines.push(`- \`${f.file}\` — sha256 \`${f.sha256}\``);
  lines.push(
    `- Записанные прогоны: \`varde/tools/eval/runs/${short(base.briefs_version)}/${short(base.prompt_hash)}/\` (прогонов на бриф: ${config.runs_per_brief}).`,
    `- Стоимость — оценка по стандартным ценам из \`models.json\` (проверены ${config.prices_checked}), без надбавки за \`inference_geo: "us"\`.`,
    '',
    '## Решение',
    '',
  );
  if (i.selected)
    lines.push(
      `- Выбор Oleksandr: \`${i.selected.id}\`, effort \`${i.selected.effort}\` → \`varde/config/model.json\` (${today()}).`,
    );
  else if (passed.length > 0)
    lines.push(
      `- Прошли пороги: ${passed.map((m) => `\`${m}\``).join(', ')}. Выбор — за Oleksandr: \`pnpm --filter @varde/tools-eval eval:score -- --select <model>\` пишет \`varde/config/model.json\`.`,
    );
  else
    lines.push(
      '- Ни одна модель не прошла пороги. Contingency (ADR-010): проверка другой модели Anthropic или одного дополнительного провайдера — свой ADR, своя проверка условий, тот же harness. Ворота G0 остаются закрытыми.',
    );
  lines.push(
    '- G0 открывается только при pass и чек-листе 0.13 без `pending` (строгий режим теста).',
  );
  const summary = {
    prompt_hash: base.prompt_hash,
    briefs_version: base.briefs_version,
    schema_hash: schemaHash(),
    thresholds: config.thresholds,
    results: results.map((r) => ({
      model: r.model,
      effort: effort(r.model),
      pass: r.pass,
      median_meaning: r.median_meaning,
      median_naturalness: r.median_naturalness,
      critical_free_briefs: r.critical_free_briefs,
      slow_briefs: r.slow_briefs,
      cost_per_brief_usd: r.cost_per_brief_usd,
    })),
    selected: i.selected?.id ?? null,
  };
  lines.push('', '## Машиночитаемый итог', '', '```json', JSON.stringify(summary, null, 2), '```');
  return `${lines.join('\n')}\n`;
}
