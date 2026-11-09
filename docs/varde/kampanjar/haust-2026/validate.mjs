// Checks the campaign drafts with Varde's own code: the template schema (publish-level, no issues),
// the nynorsk stop list, F1–F22 and kept B questions against the seed, and which of the template's
// seeded metric definitions and findings still hold for the new version (the rule of 2.16).
// Usage: node validate.mjs <repo>/varde <out dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [varde, outDir] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(join(varde, p)).href);
const { TemplateVersionContent } = await imp('packages/schema/dist/template/validate.js');
const { findBokmal } = await imp('packages/schema/dist/i18n/nn-stoplist.js');
const { sameMeaning, referenceOf } = await imp('apps/api/dist/modules/metrics/same-meaning.js');
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

const seed = load(join(varde, 'config/seed/templates/tryggleik.2026-10-13.json')).content;
const drafts = {
  tryggleik: load(join(outDir, 'tryggleik-haust-2026.json')),
  'it-kartlegging': load(join(outDir, 'it-kartlegging.json')),
  'nokkelpersonar-intervju': load(join(outDir, 'nokkelpersonar-intervju.json')),
};
let failed = 0;
const fail = (m) => (failed++, console.log('  FAIL', m));

const canon = (v) => JSON.stringify(v, Object.keys(flat(v)).sort());
function flat(v, out = {}) {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out[k] = 1), flat(x, out);
  return out;
}
const nnTexts = (v, path = []) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => (k === 'nn' && typeof x === 'string' ? [[path.join('.'), x]] : nnTexts(x, [...path, k])))
    : [];

for (const [name, c] of Object.entries(drafts)) {
  console.log(`== ${name}`);
  const r = TemplateVersionContent.safeParse(c);
  if (!r.success) for (const i of r.error.issues) fail(`schema ${i.path.join('.')}: ${i.message}`);
  else console.log('  schema: ok (publish-level, nn+en complete)');
  const bokmal = nnTexts(c).flatMap(([p, t]) => findBokmal(t).map((w) => `${p}: «${w}»`));
  bokmal.forEach((b) => fail(`bokmål ${b}`));
  if (!bokmal.length) console.log(`  nn stop list: ok (${nnTexts(c).length} nn strings)`);
  const letter = c.invitation?.letter.nn ?? '';
  for (const ph of ['{minutt}', '{lenkje}', '{host}', '{frist}']) if (!letter.includes(ph)) fail(`invitation lacks ${ph}`);
  const ids = c.questions.map((q) => q.id);
  console.log(`  questions: ${ids.length} (common ${c.questions.filter((q) => q.part === 'common').length}, leader ${c.questions.filter((q) => q.part === 'leader').length})`);
}

// F1–F22 and the B leader questions against the seed (04.11: leader part reverted to the seed's,
// no R block, no condition on B14–B16/B19 any more)
const t = drafts.tryggleik;
const byId = new Map(t.questions.map((q) => [q.id, q]));
const noTitle = (q) => ({ ...q, texts: { ...q.texts, section_title: undefined } });
for (const s of seed.questions) {
  const q = byId.get(s.id);
  if (!q) continue;
  const a = canon(noTitle(s)), b = canon(noTitle(q));
  if (a === b || s.id === 'F1') continue;
  fail(`${s.id} differs from the seed`);
}
const f1 = byId.get('F1'), s1 = seed.questions.find((q) => q.id === 'F1');
const f1Diff = Object.keys({ ...f1.texts, ...s1.texts }).filter((k) => JSON.stringify(f1.texts[k]) !== JSON.stringify(s1.texts[k]));
console.log(`== F1: changed text fields ${JSON.stringify(f1Diff)} (publish as «Rettskriving», same anchor)`);
const kept = seed.questions.filter((q) => byId.has(q.id)).map((q) => q.id);
const dropped = seed.questions.filter((q) => !byId.has(q.id)).map((q) => q.id);
console.log(`== kept from seed: ${kept.length} (${kept.filter((i) => i.startsWith('B')).join(' ')}), dropped: ${dropped.join(' ')}`);

// Which seeded metric definitions and findings hold for the new version (as definitionsFor does)
const defs = [
  ...Object.entries(load(join(varde, 'config/seed/metrics/tryggleik.json'))),
  ...Object.entries(load(join(varde, 'config/seed/metrics/leader-categories.json'))),
];
const holds = sameMeaning(t, [referenceOf(seed)]);
const held = defs.filter(([, d]) => holds(d)).map(([k]) => k);
const lost = defs.filter(([, d]) => !holds(d)).map(([k, d]) => `${k} ← ${holds.causes(d).join(',')}`);
console.log(`== metric definitions: ${held.length}/${defs.length} hold`);
lost.forEach((l) => console.log('  lost', l));
const zone = defs.find(([, d]) => d.kind === 'zone');
console.log(`  zone ${zone?.[0]}: ${zone && holds(zone[1]) ? 'holds' : 'LOST'}`);
if (zone && !holds(zone[1])) fail('the zone definition does not hold');
const findings = load(join(varde, 'config/seed/findings/tryggleik.json'));
const heldSet = new Set(held);
// A finding holds when its metric holds and, for a cross rule, the question it reads is kept exactly
// (a seed question) or is in the version (a question of its own). A rule with metric_key "own"
// (branch varde/haust-leiar) counts the version's own distribution: its question is in the version
// and no template definition of that question holds.
const keptExactly = (id) => {
  const s = seed.questions.find((q) => q.id === id), q = byId.get(id);
  return !!s && !!q && canon(noTitle(s)) === canon(noTitle(q));
};
const inSeed = (id) => seed.questions.some((q) => q.id === id);
const ownQuestion = (id) =>
  byId.has(id) &&
  !defs.some(([k, d]) => heldSet.has(k) && d.kind === 'distribution' && d.questions.some((r) => r.key.split('.')[0] === id));
const ok = (f) =>
  f.metric_key === 'own'
    ? ownQuestion(f.question)
    : heldSet.has(f.metric_key) && (!f.question || (inSeed(f.question) ? keptExactly(f.question) : byId.has(f.question)));
const fHeld = findings.filter(ok).map((f) => f.key);
const fLost = findings.filter((f) => !ok(f)).map((f) => f.key);
console.log(`== findings: ${fHeld.length}/${findings.length} hold; lost: ${fLost.join(' ') || '—'}`);

console.log(failed ? `\n${failed} problem(s)` : '\nall checks passed');
process.exit(failed ? 1 : 0);
