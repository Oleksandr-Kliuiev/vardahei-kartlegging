// fixtures/README.md of 1.2b: what is where and the expected counts (generated, see generate.mjs).

const ROUND = (x) =>
  x.skjema === 'tryggleik' ? 'tryggleik' : x.versjon === '2026-10-12' ? 'ki-2026-10-12' : 'ki';

/** Expected import counts of 1.8 on a fresh database (all decisions `accepted` or `rejected`). */
export function expectedCounts(lines, edgeLines, bank) {
  const edge = new Set(edgeLines.map((e) => e.line));
  const leaderIds = (sid) =>
    new Set(bank.skjema[sid].sporsmal.filter((q) => q.del === 'B').map((q) => q.id));
  const rounds = {};
  const rejected = { common: edgeLines.length, leader: 0, reasons: {} };
  for (const e of edgeLines) rejected.reasons[e.reason] = (rejected.reasons[e.reason] ?? 0) + 1;
  lines.forEach((x, i) => {
    if (edge.has(i + 1)) {
      if (x.leiardel) rejected.leader += 1;
      return;
    }
    const r = (rounds[ROUND(x)] ??= { common: 0, leader: 0, clients: {} });
    r.common += 1;
    r.clients[x.k] = (r.clients[x.k] ?? 0) + 1;
    if (!x.leiardel) return;
    const ids = leaderIds(x.skjema);
    if (Object.keys(x.svar).some((id) => ids.has(id))) r.leader += 1;
    else {
      rejected.leader += 1;
      rejected.reasons.leader_empty = (rejected.reasons.leader_empty ?? 0) + 1;
    }
  });
  for (const r of Object.values(rounds))
    r.clients = Object.fromEntries(Object.entries(r.clients).sort());
  const leiardel = lines.filter((x) => x.leiardel).length;
  return { lines: lines.length, leiardel, rounds, rejected, dropped_answers: 0 };
}

export function readme({ lines, edgeLines, kiOldLines, runde1, bank }) {
  const counts = expectedCounts(lines, edgeLines, bank);
  const perClient = {};
  for (const x of runde1) perClient[x.k] = (perClient[x.k] ?? 0) + 1;
  const free = lines.filter(
    (x) => Object.keys(x.fri).length > 0 || ['F20', 'F21', 'F22', 'K15'].some((id) => x.svar[id]),
  ).length;
  return `# Синтетические fixtures паритета (1.2b)

Сгенерировано \`varde/tools/parity/generate.mjs\` (seed фиксирован), руками не править: \`pnpm parity:fixtures\` пишет, \`pnpm parity:fixtures --check\` сравнивает. Настоящих данных здесь нет: инициалы — только из списка \`INITIALS\` (шаблон «Q?X??», ни одно имя такого не даёт), ответы сгенерированы по банку вопросов \`kartlegging/public/sporsmal.js\` (KI 2026-10-12 — по \`f26ee21\`) по пути старого runner (\`vis\`, \`vis\` вариантов, \`valFraa\`, \`aleine\`, \`maks\`).

| Файл | Что |
| --- | --- |
| \`svar.synthetic.jsonl\` | ${counts.lines} строк формата kartlegging \`svar.jsonl\`; 6 клиентов; tryggleik 2026-10-12 и 2026-10-13, KI 2026-10-13 с K0, KI 2026-10-12 без K0; свободный текст у ${free} строк |
| \`runde1.synthetic.js\` | ${runde1.length} записей раунда 1 в формате \`tools/runde1_fra_excel.py\` (\`window.RUNDE1 = {namn, dato, svar: [{k, init, svar}]}\`), 5 клиентов: ${Object.entries(
    perClient,
  )
    .map(([k, n]) => `${k} ${n}`)
    .join(
      ', ',
    )}; F2–F19, F15 массивом; 10 пар \`(k, init)\` совпадают с tryggleik раунда 2 (по 2 на клиента) |
| \`tilgang.json\` | код ссылки на клиента, 10 символов, как \`lagKode()\` |
| \`kundar.json\` | \`tilsette\`, \`open\`, \`frist\` (у sfhs \`tilsette = null\`) |

Особенности: у daco и gasta есть роли с ≥ 3 и < 3 ответами; у tharaso всего 2 ответа в каждом опроснике; два разных человека с одинаковыми инициалами в daco (tryggleik, однофамильцы); одна строка tryggleik gasta с \`leiardel = true\` без ответов части B (\`leader_empty\` в 1.8).

## Краевые строки (номера строк файла, с 1)

${edgeLines.map((e) => `- ${e.line}: ${e.reason}`).join('\n')}

## Строки KI 2026-10-12 (анонимный раунд)

${kiOldLines.join(', ')}

## Прогоны golden 1.2c

- (а) все строки, кроме краевых и KI 2026-10-12.
- (б) только строки KI 2026-10-12.

## Ожидаемые счётчики импорта 1.8 (пустая база)

\`\`\`json
${JSON.stringify(counts, null, 2)}
\`\`\`

Сверка: строк = common \`accepted\` (сумма по раундам) + \`rejected.common\`; строк с \`leiardel = true\` (${counts.leiardel}) = leader \`accepted\` + \`rejected.leader\`. Раунд 1 (1.9): \`accepted ${runde1.length}\`, leader 0.
`;
}
