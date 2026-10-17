// «Hent spørsmål» (2.18): a ready question from the bank, or one from another survey, copied with a
// new id. A copy has no lock, anchor, role or initials flag and no condition (those point into the
// other survey); its wording, answers and scores come along, so it reads the same and is tested in
// the phone like any new question.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { api } from './api.js';
import { Icon } from './icons.js';
import type { EditorVersion, SurveySummary } from './survey-models.js';
import { Seg } from './widgets.js';
import './verkstad-meir.css';

type Words = Record<string, string>;
const words = (languages: readonly string[], nn: string, en: string): Words =>
  Object.fromEntries(languages.map((l) => [l, l === 'nn' ? nn : l === 'en' ? en : '']));

/** Ready questions, in the languages of the survey (English where the survey has it). */
export function standard(languages: readonly string[]): { title: string; q: Question }[] {
  const t = (nn: string, en: string) => words(languages, nn, en);
  return [
    {
      title: 'Kor sannsynleg er det at du vil tilrå oss? (NPS 0–10)',
      q: {
        id: 'NY',
        type: 'nps',
        part: 'common',
        texts: {
          text: t(
            'Kor sannsynleg er det at du vil tilrå oss til ein kollega?',
            'How likely are you to recommend us to a colleague?',
          ),
        },
        scale: {
          min: 0,
          max: 10,
          low: t('Lite sannsynleg', 'Not at all likely'),
          high: t('Svært sannsynleg', 'Extremely likely'),
        },
      } as Question,
    },
    {
      title: 'Ja, nei eller usikker',
      q: {
        id: 'NY',
        type: 'single',
        part: 'common',
        texts: { text: t('', '') },
        options: [
          { id: 'ja', texts: { text: t('Ja', 'Yes') } },
          { id: 'nei', texts: { text: t('Nei', 'No') } },
          { id: 'usikker', texts: { text: t('Usikker', 'Not sure') } },
        ],
      } as Question,
    },
    {
      title: 'Kor einig er du? (1–5)',
      q: {
        id: 'NY',
        type: 'scale',
        part: 'common',
        texts: { text: t('', '') },
        scale: {
          min: 1,
          max: 5,
          low: t('Heilt ueinig', 'Strongly disagree'),
          high: t('Heilt einig', 'Strongly agree'),
        },
        rows: [{ id: 'r1', texts: { text: t('', '') } }],
      } as Question,
    },
  ];
}

/** A question of another survey as a new one here: its own id, none of the other survey's ties. */
export function copyOf(q: Question, languages: readonly string[]): Question {
  const copy = structuredClone(q) as Question & Record<string, unknown>;
  for (const key of ['frozen', 'anchor_key', 'role', 'identifier', 'visible_if']) delete copy[key];
  // Every text gets the languages of this survey; one it lacks is written here.
  const fit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(fit);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (
        typeof o['nn'] === 'string' &&
        Object.keys(o).every((k) => ['nn', 'en', 'nb'].includes(k))
      )
        return Object.fromEntries(languages.map((l) => [l, typeof o[l] === 'string' ? o[l] : '']));
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fit(x)]));
    }
    return v;
  };
  return { ...(fit(copy) as Question), part: 'common' };
}

export function Bank(p: {
  content: TemplateContent;
  languages: readonly string[];
  onPick: (q: Question) => void;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const [from, setFrom] = useState<'standard' | 'skjema'>('standard');
  const surveys = useQuery({
    queryKey: ['surveys'],
    queryFn: () => api<SurveySummary[]>('/api/admin/surveys'),
  });
  const others = (surveys.data ?? []).filter(
    (s) => s.key !== p.content.key && s.versions.some((v) => v.status === 'published'),
  );
  const [survey, setSurvey] = useState('');
  const chosen = others.find((s) => s.id === survey);
  const versionId = chosen?.versions.find((v) => v.status === 'published')?.id;
  const version = useQuery({
    queryKey: ['surveys', 'version', versionId],
    queryFn: () => api<EditorVersion>(`/api/admin/surveys/versions/${versionId}`),
    enabled: !!versionId,
  });
  const questions = (version.data?.content.questions ?? []).filter((q) => !q.role && !q.identifier);
  return (
    <aside className="vk-skuff vk-bank" role="dialog" aria-modal="true" aria-labelledby="vk-bank">
      <header className="vk-skuff-topp">
        <h2 id="vk-bank">Hent spørsmål</h2>
        <button ref={close} type="button" className="iconbtn" aria-label="Lukk" onClick={p.onClose}>
          <Icon name="lukk" />
        </button>
      </header>
      <div className="vk-skuff-innhald">
        <Seg
          label="Kvar frå"
          value={from}
          options={[
            ['standard', 'Ferdige spørsmål'],
            ['skjema', 'Frå eit anna skjema'],
          ]}
          onChange={setFrom}
        />
        {from === 'standard' ? (
          <ul className="vk-bank-liste">
            {standard(p.languages).map((s) => (
              <li key={s.title}>
                <button type="button" className="vk-bank-val" onClick={() => p.onPick(s.q)}>
                  <b>{s.title}</b>
                  <small>Kjem inn som eit nytt spørsmål du kan endre.</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <label className="vk-felt">
              Skjema
              <select className="input" value={survey} onChange={(e) => setSurvey(e.target.value)}>
                <option value="">Vel eit skjema</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title ?? s.key}
                  </option>
                ))}
              </select>
            </label>
            {chosen && !version.data && <p role="status">Hentar spørsmåla …</p>}
            <ul className="vk-bank-liste">
              {questions.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    className="vk-bank-val"
                    onClick={() => p.onPick(copyOf(q, p.languages))}
                  >
                    <b>
                      {q.id}: {q.texts.text.nn || 'Utan tekst'}
                    </b>
                    <small>
                      {'options' in q
                        ? q.options.map((o) => o.texts.text.nn).join(' · ')
                        : q.type === 'nps'
                          ? 'Skala 0–10'
                          : q.type === 'scale'
                            ? 'Skala'
                            : 'Fritekst'}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            <p className="vk-dempa">
              Kopien får ein ny ID og ingen vilkår. Fast-låsen og samanlikninga følgjer ikkje med.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
