// Task 1.2: sporsmal.js → templates; checks against the source and docs/sonemodell.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import { describe, expect, it } from 'vitest';
import { convertSkjema } from '../src/convert.js';
import { expressionFor } from '../src/expressions.js';
import { diffSeed, seedFiles } from '../src/generate.js';
import { current, old, SEED_DIR, VARDE_DIR } from './support.js';

const tryggleik = convertSkjema(current, 'tryggleik');
const ki = convertSkjema(current, 'ki');
const kiOld = convertSkjema(old, 'ki');
const byId = (t: typeof ki, id: string) => t.questions.find((q) => q.id === id)!;
const parts = (t: typeof ki) => [
  t.questions.filter((q) => q.part === 'common').length,
  t.questions.filter((q) => q.part === 'leader').length,
];

describe('converter sporsmal.js → templates (1.2)', () => {
  it('committed seed files equal a fresh conversion (diff-report: 0 differences)', () => {
    expect(diffSeed(SEED_DIR, seedFiles(current, old))).toEqual([]);
  });

  it('every template file passes the 1.1 schema', () => {
    for (const name of ['tryggleik.2026-10-13', 'ki.2026-10-13', 'ki.2026-10-12']) {
      const file = JSON.parse(
        readFileSync(join(SEED_DIR, 'templates', `${name}.json`), 'utf8'),
      ) as { content: unknown };
      const r = TemplateVersionContent.safeParse(file.content);
      expect(r.success, `${name}: ${JSON.stringify(r.error?.issues.slice(0, 3))}`).toBe(true);
    }
  });

  it('question counts: tryggleik 40 (22 + 18), KI 2026-10-13 32 (21 + 11), KI 2026-10-12 31', () => {
    expect(parts(tryggleik)).toEqual([22, 18]);
    expect(parts(ki)).toEqual([21, 11]);
    expect(kiOld.questions).toHaveLength(31);
  });

  it('question ids, option ids and order equal the source', () => {
    for (const [tpl, k, id] of [
      [tryggleik, current, 'tryggleik'],
      [ki, current, 'ki'],
      [kiOld, old, 'ki'],
    ] as const) {
      const src = k.skjema[id]!.sporsmal;
      expect(tpl.questions.map((q) => q.id)).toEqual(src.map((q) => q.id));
      tpl.questions.forEach((q, i) => {
        const options = 'options' in q ? q.options.map((o) => o.id) : [];
        expect(options, q.id).toEqual((src[i]!.val ?? []).map((v) => v.id));
        if (q.type === 'scale')
          expect(q.rows.map((r) => r.id)).toEqual(src[i]!.rader!.map((r) => r.id));
      });
    }
  });

  it('scores of the 16 scored questions equal farge and the table in docs/sonemodell.md', () => {
    const md = readFileSync(join(VARDE_DIR, '..', 'docs', 'sonemodell.md'), 'utf8');
    const rows = md.split('\n').filter((l) => /^\| F\d+ /.test(l));
    expect(rows).toHaveLength(16);
    const scored = tryggleik.questions.filter(
      (q) => 'options' in q && q.options.some((o) => o.score !== undefined),
    );
    expect(scored.map((q) => q.id)).toEqual(rows.map((r) => r.split('|')[1]!.trim().split(' ')[0]));
    for (const row of rows) {
      const [, label, ja, delvis, nei, usikker, other] = row.split('|').map((c) => c.trim());
      const q = byId(tryggleik, label!.split(' ')[0]!);
      if (!('options' in q)) throw new Error(q.id);
      const score = (nn: string) => q.options.find((o) => o.texts.text.nn === nn)?.score;
      const expected: [string, string | undefined][] = [
        ['Ja', ja],
        ['Delvis', delvis],
        ['Nei', nei],
        ['Usikker', usikker],
      ];
      for (const m of (other ?? '').matchAll(/([A-ZÆØÅa-zæøå ]+?) (\d)/g))
        expected.push([m[1]!.trim(), m[2]]);
      for (const [nn, cell] of expected)
        if (cell) expect(score(nn), `${q.id} ${nn}`).toBe(Number(cell));
      const farge = current.skjema.tryggleik!.sporsmal.find((s) => s.id === q.id)!.farge!;
      expect(Object.fromEntries(q.options.map((o) => [o.id, o.score]))).toEqual(farge);
    }
  });

  it('identifier: F1 in tryggleik, K0 in KI 2026-10-13; KI 2026-10-12 is none', () => {
    expect(tryggleik.identification).toBe('initials');
    expect(tryggleik.questions.filter((q) => q.identifier).map((q) => q.id)).toEqual(['F1']);
    expect(ki.identification).toBe('initials');
    expect(ki.questions.filter((q) => q.identifier).map((q) => q.id)).toEqual(['K0']);
    expect(kiOld.identification).toBe('none');
    expect(kiOld.questions.some((q) => q.identifier)).toBe(false);
  });

  it('F1–F22 frozen with anchor_key = id; K1, K7, K8, K9 anchored without frozen', () => {
    const frozen = tryggleik.questions.filter((q) => q.frozen);
    expect(frozen.map((q) => q.id)).toEqual(Array.from({ length: 22 }, (_, i) => `F${i + 1}`));
    for (const q of frozen) expect(q.anchor_key).toBe(q.id);
    const anchored = ki.questions.filter((q) => q.anchor_key !== undefined);
    expect(anchored.map((q) => q.id).sort()).toEqual(['K1', 'K7', 'K8', 'K9']);
    expect(anchored.every((q) => q.frozen === undefined && q.anchor_key === q.id)).toBe(true);
  });

  it('tips: tryggleik none, KI 8; K21 is a scenario with an explanation', () => {
    expect(tryggleik.tips).toEqual([]);
    expect(ki.tips).toHaveLength(8);
    const k21 = byId(ki, 'K21');
    expect(k21.type === 'single' && k21.scenario?.correct_options).toEqual(['jobb']);
    expect(k21.type === 'single' && k21.scenario?.explanation.text.en).toBeTruthy();
  });

  it('zone.v1.json thresholds = SONER; config/privacy.json k = minGruppe', () => {
    const zone = JSON.parse(
      readFileSync(join(VARDE_DIR, 'packages/schema/fixtures/metrics/zone.v1.json'), 'utf8'),
    ) as {
      key: string;
      thresholds?: { person: { bounds: number[] }; aggregate: { bounds: number[] } };
    }[];
    const z = zone.find((m) => m.key === 'tryggleik.zone')!;
    expect(z.thresholds?.person.bounds).toEqual(current.soner.person);
    expect(z.thresholds?.aggregate.bounds).toEqual(current.soner.samla);
    const privacy = JSON.parse(readFileSync(join(VARDE_DIR, 'config/privacy.json'), 'utf8')) as {
      k: number;
    };
    expect(privacy.k).toBe(current.minGruppe);
  });

  it('tryggleik of f26ee21 and of the current file convert to the same template (import-map basis)', () => {
    expect(convertSkjema(old, 'tryggleik')).toEqual(tryggleik);
  });

  it('a function without a table entry or with changed source stops the converter', () => {
    expect(() => expressionFor('vis:X1', () => true)).toThrow(/no expression for vis:X1/);
    expect(() => expressionFor('vis:K20', () => true)).toThrow(/changed in sporsmal.js/);
  });
});
