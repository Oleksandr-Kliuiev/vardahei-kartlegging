#!/usr/bin/env node
// Synthetic fixtures in kartlegging formats (1.2b): svar.synthetic.jsonl, runde1.synthetic.js,
// tilgang.json, kundar.json and README.md with the expected counts. Fixed seed, answers along
// the old runner path (vis, option vis, valFraa, aleine, maks). Initials are synthetic only.
//   node tools/parity/generate.mjs           write fixtures/
//   node tools/parity/generate.mjs --check   regenerate into a temporary folder and compare
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentBank, oldBank } from './bank.mjs';
import { readme } from './readme.mjs';

export const SEED = 20261013;
export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
export const CLIENTS = ['daco', 'gasta', 'kviknes', 'maskinsenteret', 'sfhs', 'tharaso'];

/** Synthetic initials «Q?X??»: no name gives this pattern (2 first + 3 last letters). */
export const INITIALS = [...'ABCDEFGH'].flatMap((a) =>
  [...'ABCDEFGHJK'].flatMap((b) => [...'MNP'].map((c) => `Q${a}X${b}${c}`)),
);

const PLAN = {
  tryggleik: {
    daco: { kontor: 7, prod: 6, sal: 2, leiar: 2, it: 1 },
    gasta: { kontor: 6, sal: 4, prod: 2, leiar: 2, anna: 1 },
    kviknes: { prod: 7, kontor: 5, leiar: 2, it: 1 },
    maskinsenteret: { prod: 6, sal: 4, kontor: 2, leiar: 1, it: 1 },
    sfhs: { kontor: 7, anna: 4, leiar: 2, it: 1 },
    tharaso: { kontor: 1, leiar: 1 },
  },
  ki: {
    daco: { kontor: 6, prod: 5, leiar: 2, it: 1 },
    gasta: { kontor: 5, sal: 3, leiar: 2, anna: 2 },
    kviknes: { prod: 6, kontor: 3, leiar: 1, it: 1 },
    maskinsenteret: { prod: 5, sal: 3, kontor: 2, leiar: 1 },
    sfhs: { kontor: 6, anna: 3, leiar: 1, it: 1 },
    tharaso: { kontor: 1, leiar: 1 },
  },
};
/** KI 2026-10-12 (no K0): ≥ 3 leaders with a leader part, ≥ 1 with free text. */
const KI_OLD = [
  { k: 'daco', role: 'leiar', leader: true },
  { k: 'gasta', role: 'it', leader: true },
  { k: 'kviknes', role: 'leiar', leader: true, free: true },
  { k: 'daco', role: 'kontor' },
  { k: 'sfhs', role: 'prod', free: true },
];
const RUNDE1 = { daco: 10, gasta: 9, kviknes: 8, maskinsenteret: 7, sfhs: 6 };
const KUNDAR = {
  daco: { tilsette: 25, open: true, frist: null },
  gasta: { tilsette: 18, open: true, frist: null },
  kviknes: { tilsette: 30, open: true, frist: '2027-06-30' },
  maskinsenteret: { tilsette: 22, open: true, frist: null },
  sfhs: { tilsette: null, open: true, frist: null },
  tharaso: { tilsette: 6, open: true, frist: '2027-06-30' },
};
const TEXTS = [
  'Meir opplæring hadde vore fint.',
  'Veit ikkje heilt.',
  'Det fungerer stort sett bra.',
  'Vi treng enklare rutinar.',
  'Ingen kommentar utover dette.',
];

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with the seeded rng (Array#sort with a random comparator depends on the engine). */
export function shuffle(xs, r) {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function uuid(r) {
  const hex = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16)).join('');
  const variant = '89ab'[Math.floor(r() * 4)];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** One respondent along kartlegging index.html (synleg, valAv, aleine, maks, leader part). */
export function respond(
  bank,
  sid,
  r,
  { role, init, leader = false, leaderEmpty = false, free = false },
) {
  const sk = bank.skjema[sid];
  const idq = sk.initialar ?? (sid === 'tryggleik' ? 'F1' : undefined);
  const s = {};
  const fri = {};
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const answer = (q) => {
    if (q.vis && !q.vis(s)) return;
    if (q.id === idq) return void (s[q.id] = init);
    if (q.rolle) return void (s[q.id] = role);
    if (q.type === 'text') {
      if (free && r() < 0.8) s[q.id] = pick(TEXTS);
      return;
    }
    if (!q.paakravd && r() < 0.08) return;
    const source = q.valFraa ? (s[q.valFraa] ?? []) : null;
    const options = (q.val ?? []).filter(
      (o) => (!o.vis || o.vis(s)) && (!source || source.includes(o.id)),
    );
    if (q.type === 'single' && options.length) s[q.id] = pick(options).id;
    else if (q.type === 'multi' && options.length) {
      const n = 1 + Math.floor(r() * Math.min(q.maks ?? 3, options.length, 3));
      const chosen = shuffle(options, r).slice(0, n);
      const alone = chosen.find((o) => o.aleine);
      s[q.id] = alone ? [alone.id] : chosen.map((o) => o.id);
    } else if (q.type === 'scale') {
      const rows = (q.rader ?? []).filter(() => r() < 0.85);
      if (rows.length)
        s[q.id] = Object.fromEntries(
          rows.map((row) => [
            row.id,
            q.skala.min + Math.floor(r() * (q.skala.max - q.skala.min + 1)),
          ]),
        );
    } else if (q.type === 'nps') s[q.id] = Math.floor(r() * 11);
    if (q.fritekst && free && s[q.id] !== undefined && r() < 0.7) fri[q.id] = pick(TEXTS);
  };
  sk.sporsmal.filter((q) => q.del === 'A').forEach(answer);
  const leiardel = leader && bank.leiarRoller.includes(role);
  if (leiardel && !leaderEmpty) sk.sporsmal.filter((q) => q.del === 'B').forEach(answer);
  return { svar: s, fri, leiardel };
}

function row(r, { sid, k, versjon, day, answers, id = uuid(r) }) {
  const time = `${String(8 + Math.floor(r() * 9)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`;
  const out = id === null ? {} : { id };
  return {
    ...out,
    tid: `${day}T${time}.${String(Math.floor(r() * 1000)).padStart(3, '0')}Z`,
    skjema: sid,
    k,
    lang: r() < 0.1 ? 'en' : 'nn',
    versjon,
    leiardel: answers.leiardel,
    sekund: 120 + Math.floor(r() * 780),
    svar: answers.svar,
    fri: answers.fri,
  };
}

/** Python json.dumps(..., ensure_ascii=False, separators=(", ", ": ")) as runde1_fra_excel.py. */
const py = (v) =>
  Array.isArray(v)
    ? `[${v.map(py).join(', ')}]`
    : v !== null && typeof v === 'object'
      ? `{${Object.entries(v)
          .map(([k, x]) => `${JSON.stringify(k)}: ${py(x)}`)
          .join(', ')}}`
      : JSON.stringify(v);

export function generateFixtures() {
  const r = rng(SEED);
  const bank = currentBank();
  const old = oldBank();
  const pool = shuffle(INITIALS, r);
  const take = () => pool.pop();
  const regular = [];
  for (const sid of ['tryggleik', 'ki']) {
    for (const k of CLIENTS) {
      for (const [role, n] of Object.entries(PLAN[sid][k])) {
        for (let i = 0; i < n; i += 1) {
          const leaderRole = bank.leiarRoller.includes(role);
          const leader = leaderRole && r() < 0.7;
          // One leader enters the leader part and answers nothing there (leader_empty in 1.8).
          const leaderEmpty = sid === 'tryggleik' && k === 'gasta' && role === 'leiar' && i === 1;
          const versjon = sid === 'ki' || r() < 0.5 ? '2026-10-13' : '2026-10-12';
          const answers = respond(bank, sid, r, {
            role,
            init: take(),
            leader: leader || leaderEmpty,
            leaderEmpty,
            free: r() < 0.16,
          });
          regular.push(row(r, { sid, k, versjon, day: versjon, answers }));
        }
      }
    }
  }
  // Namesakes: two different people with the same initials in one client (daco, tryggleik).
  const dacoT = regular.filter((x) => x.skjema === 'tryggleik' && x.k === 'daco');
  dacoT[1].svar.F1 = dacoT[0].svar.F1;
  // Round 1: 40 records in 5 clients; 2 per client share (k, init) with round 2 tryggleik.
  const runde1 = [];
  for (const [k, n] of Object.entries(RUNDE1)) {
    const shared = regular
      .filter((x) => x.skjema === 'tryggleik' && x.k === k)
      .slice(2, 4)
      .map((x) => x.svar.F1);
    for (let i = 0; i < n; i += 1) {
      const svar = {};
      for (const q of bank.skjema.tryggleik.sporsmal.filter((x) => /^F([2-9]|1\d)$/.test(x.id))) {
        const ids = q.val.map((o) => o.id);
        const some = ids.filter(() => r() < 0.4).slice(0, 3);
        svar[q.id] =
          q.type === 'multi'
            ? some.length > 0
              ? some
              : [ids[0]]
            : ids[Math.floor(r() * ids.length)];
      }
      runde1.push({ k, init: i < shared.length ? shared[i] : take(), svar });
    }
  }
  const kiOld = KI_OLD.map((p) =>
    row(r, {
      sid: 'ki',
      k: p.k,
      versjon: '2026-10-12',
      day: '2026-10-12',
      answers: respond(old, 'ki', r, { ...p, init: undefined }),
    }),
  );
  const answersOf = (role, leader = false) =>
    respond(bank, 'tryggleik', r, { role, init: take(), leader });
  const dup = uuid(r);
  const edges = [
    {
      reason: 'no id',
      row: row(r, {
        sid: 'tryggleik',
        k: 'daco',
        versjon: '2026-10-13',
        day: '2026-10-13',
        answers: answersOf('kontor'),
        id: null,
      }),
    },
    {
      reason: 'duplicate id',
      row: row(r, {
        sid: 'tryggleik',
        k: 'gasta',
        versjon: '2026-10-13',
        day: '2026-10-13',
        answers: answersOf('sal'),
        id: dup,
      }),
    },
    {
      reason: 'duplicate id',
      row: row(r, {
        sid: 'tryggleik',
        k: 'kviknes',
        versjon: '2026-10-13',
        day: '2026-10-13',
        answers: answersOf('prod'),
        id: dup,
      }),
    },
    {
      reason: 'unknown versjon',
      row: row(r, {
        sid: 'tryggleik',
        k: 'sfhs',
        versjon: '2026-09-01',
        day: '2026-10-13',
        answers: answersOf('kontor'),
      }),
    },
    {
      reason: 'unknown k',
      row: row(r, {
        sid: 'tryggleik',
        k: 'ukjend',
        versjon: '2026-10-13',
        day: '2026-10-13',
        answers: answersOf('kontor'),
      }),
    },
    {
      reason: 'leiardel without id',
      row: row(r, {
        sid: 'tryggleik',
        k: 'maskinsenteret',
        versjon: '2026-10-13',
        day: '2026-10-13',
        answers: answersOf('leiar', true),
        id: null,
      }),
    },
  ];
  const lines = [...regular, ...kiOld].sort((a, b) => a.tid.localeCompare(b.tid));
  // Edge rows at fixed places so that their line numbers are stable.
  [5, 30, 31, 60, 90, 120].forEach((at, i) => lines.splice(at, 0, edges[i].row));
  const edgeLines = edges.map((e) => ({ line: lines.indexOf(e.row) + 1, reason: e.reason }));
  const kiOldLines = kiOld.map((x) => lines.indexOf(x) + 1).sort((a, b) => a - b);
  const tilgang = Object.fromEntries(
    CLIENTS.map((k) => [
      k,
      Array.from(
        { length: 10 },
        () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(r() * 57)],
      ).join(''),
    ]),
  );
  const files = new Map();
  files.set('svar.synthetic.jsonl', lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  files.set(
    'runde1.synthetic.js',
    `/* Runde 1, SYNTETISK: laga av varde/tools/parity/generate.mjs (seed ${SEED}) i formatet til tools/runde1_fra_excel.py, ${runde1.length} svar.\n` +
      '   Ingen ekte initialar eller svar. */\n' +
      `window.RUNDE1 = {\n  namn: "Runde 1 (Forms)",\n  dato: "2026-01",\n  svar: [\n${runde1.map((x) => `    ${py(x)}`).join(',\n')}\n  ]\n};\n`,
  );
  files.set('tilgang.json', `${JSON.stringify(tilgang, null, 2)}\n`);
  files.set('kundar.json', `${JSON.stringify(KUNDAR, null, 2)}\n`);
  files.set('README.md', readme({ lines, edgeLines, kiOldLines, runde1, bank }));
  return files;
}

function main() {
  const files = generateFixtures();
  if (!process.argv.includes('--check')) {
    for (const [name, body] of files) writeFileSync(join(FIXTURES, name), body);
    console.log(`fixtures written: ${files.size} files`);
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'varde-fixtures-'));
  try {
    const diffs = [];
    for (const [name, body] of files) {
      writeFileSync(join(tmp, name), body);
      let committed = null;
      try {
        committed = readFileSync(join(FIXTURES, name), 'utf8');
      } catch {
        committed = null;
      }
      if (committed !== readFileSync(join(tmp, name), 'utf8')) diffs.push(name);
    }
    if (diffs.length > 0) {
      console.log(`fixtures differ: ${diffs.join(', ')}`);
      process.exit(1);
    }
    console.log('fixtures identical');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
