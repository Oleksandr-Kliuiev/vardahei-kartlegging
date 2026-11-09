// Walks the drafts with Varde's runner rules (the same code the server uses to recompute a path):
// who sees which questions for a few typical respondents.
// Usage: node paths.mjs <repo>/varde <out dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [varde, outDir] = process.argv.slice(2);
const { visibleQuestions } = await import(pathToFileURL(join(varde, 'packages/rules/dist/runner/index.js')).href);
const load = (f) => JSON.parse(readFileSync(join(outDir, f), 'utf8'));
const t = load('tryggleik-haust-2026.json');
const it = load('it-kartlegging.json');

const show = (name, version, answers, expect) => {
  const ids = visibleQuestions(version, answers).map((q) => q.id);
  const bad = Object.entries(expect).filter(([id, want]) => ids.includes(id) !== want);
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${name}: ${ids.length} questions${bad.length ? ' — unexpected ' + bad.map(([i, w]) => `${i}${w ? ' missing' : ' shown'}`).join(', ') : ''}`);
  return bad.length;
};
const np = load('nokkelpersonar-intervju.json');

let bad = 0;
bad += show('tilsett (kontor)', t, { F1: 'OLNOR', F2: 'kontor' }, { T1: true, T5: true, F22: true, B1: false });
bad += show('leiar', t, { F1: 'OLNOR', F2: 'leiar' }, { T1: true, B1: true, B14: true, B15: true, B16: true, B19: true });
bad += show('IT / superbrukar', t, { F1: 'OLNOR', F2: 'it' }, { B1: true });
bad += show('IT: intern, berre sky, MFA nei', it, { I1: 'OLNOR', I2: 'intern', I3: 'intern', I25: 'nei', I9: 'nei' }, { I4: false, I10: false, I26: false, I27: false });
bad += show('IT: ekstern, server, MFA alle', it, { I1: 'OLNOR', I2: 'ekstern', I3: 'ekstern', I25: 'ein', I9: 'alle' }, { I4: true, I10: true, I26: true, I27: true });
bad += show('nokkelpersonar-intervju: leiar', np, { N1: 'leiar' }, { N2: true, N28: true });
const count = (v, part) => v.questions.filter((q) => q.part === part).length;
console.log(`tilsette: ${count(t, 'common')} common; leiar: +${count(t, 'leader')} leader; IT: ${it.questions.length}; nokkelpersonar-intervju: ${np.questions.length}`);
process.exit(bad ? 1 : 0);
