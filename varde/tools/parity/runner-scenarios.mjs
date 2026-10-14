// Six paths per questionnaire, selected from synthetic fixture rows, never real answers.
import { readFileSync } from 'node:fs';
import { currentBank } from './bank.mjs';
import { FIXTURES } from './generate.mjs';

export function runnerScenarios() {
  const bank = currentBank();
  const rows = readFileSync(`${FIXTURES}/svar.synthetic.jsonl`, 'utf8').trim().split('\n').map((line, i) => ({ line: i + 1, row: JSON.parse(line) }));
  const out = [];
  for (const survey of ['tryggleik', 'ki']) {
    const form = bank.skjema[survey];
    const role = form.sporsmal.find((q) => q.rolle).id;
    const pool = rows.filter(({ row }) => row.id && row.skjema === survey && row.versjon === bank.versjon);
    const selectors = survey === 'tryggleik'
      ? ['kontor', 'prod', 'sal', 'leiar', 'it', 'anna'].map((r) => ({ name: r, match: (a) => a[role] === r }))
      : [
        { name: 'kontor', match: (a) => a[role] === 'kontor' },
        { name: 'leiar', match: (a) => a[role] === 'leiar' },
        { name: 'praktisk', match: (a) => a[role] === 'prod' },
        { name: 'it', match: (a) => a[role] === 'it' },
        { name: 'ingen', match: (a) => a.K3?.includes('ingen') && !bank.leiarRoller.includes(a[role]) },
        { name: 'fleire', match: (a) => a.K3?.length > 1 && !bank.leiarRoller.includes(a[role]) },
      ];
    const used = new Set();
    for (const selector of selectors) {
      const fixture = pool.find((r) => !used.has(r.line) && selector.match(r.row.svar));
      if (!fixture) throw new Error(`missing synthetic runner scenario ${survey}:${selector.name}`);
      used.add(fixture.line);
      out.push({ id: `${survey}-${selector.name}`, survey, line: fixture.line, answers: fixture.row.svar, free: fixture.row.fri ?? {} });
    }
  }
  return out;
}

/** Bootstrap reference from the old runner's path functions. Browser golden verifies it. */
export function sourcePaths() {
  const bank = currentBank();
  return { scenarios: runnerScenarios().map((s) => {
    const form = bank.skjema[s.survey];
    const role = form.sporsmal.find((q) => q.rolle).id;
    const leader = bank.leiarRoller.includes(s.answers[role]);
    const common = form.sporsmal.filter((q) => q.del === 'A' && (!q.vis || q.vis(s.answers))).map((q) => q.id);
    const b = leader ? ['B-intro', ...form.sporsmal.filter((q) => q.del === 'B' && (!q.vis || q.vis(s.answers))).map((q) => q.id)] : [];
    return { ...s, path: [...common, ...b] };
  }) };
}
