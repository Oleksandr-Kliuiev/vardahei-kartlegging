// More about a question in the workshop (2.18): where it is used — conditions, tips, rules for
// findings and the numbers in the results — with a warning when an edit breaks one; what the last
// round on this survey answered («Innsikt», aggregates under the privacy limit only, as in
// «Resultat»); and notes by admins, which follow the survey to its next draft.
import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { api, mutate } from './api.js';
import { dashboardQuery } from './dashboard-page.js';
import type { RuleSummary } from './funn-models.js';
import { Icon } from './icons.js';
import { follow } from './nav.js';
import { ErrorMessage, useRounds, useVersions } from './queries.js';
import type { EditorVersion } from './survey-models.js';
import { when } from './verkstad-omsetjing.js';
import './verkstad-meir.css';

interface Use {
  key: string;
  kind: string;
  part: string;
  questions: string[];
  holds: boolean;
  /** The questions that changed, when it does not hold. */
  causes?: string[];
}
export interface Note {
  id: string;
  node: string;
  text: string;
  /** The version it was written on; empty when that draft is gone. */
  version_no: number | null;
  created_at: string;
  created_by: string;
  resolved_at: string | null;
  resolved_by: string | null;
}
const KIND: Record<string, string> = {
  zone: 'sona',
  mean_score: 'snittet',
  critical_share: 'den kritiske delen',
  persons_per_zone: 'personar per sone',
  cross: 'krysstabellen',
  routine_hours_week: 'timane med rutinearbeid',
  heaviest_task: 'den tyngste oppgåva',
  distribution: 'fordelinga',
};
const refers = (expression: unknown, id: string) =>
  new RegExp(`"var":"${id}(\\.|")`).test(JSON.stringify(expression));
/** Open notes per trail node, for the marks on the trail. */
export function openNotes(list: readonly Note[] | undefined): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const notes: readonly Note[] = Array.isArray(list) ? list : [];
  for (const n of notes) if (!n.resolved_at) out.set(n.node, (out.get(n.node) ?? 0) + 1);
  return out;
}
export const notesQuery = (versionId: string) => ({
  queryKey: ['surveys', 'comments', versionId],
  queryFn: () => api<Note[]>(`/api/admin/surveys/versions/${versionId}/comments`),
});

export function Meir(p: {
  versionId: string;
  hash: string;
  content: TemplateContent;
  q: Question;
}) {
  return (
    <>
      <BruktI {...p} />
      {p.q.part === 'common' && <Innsikt content={p.content} q={p.q} />}
      <Kommentarar versionId={p.versionId} node={p.q.id} />
    </>
  );
}

function BruktI({
  versionId,
  hash,
  content,
  q,
}: {
  versionId: string;
  hash: string;
  content: TemplateContent;
  q: Question;
}) {
  const uses = useQuery({
    queryKey: ['surveys', 'metrics', versionId, hash],
    queryFn: () => api<Use[]>(`/api/admin/surveys/versions/${versionId}/metrics`),
  });
  // Rules for findings exist for the seeded surveys; they read questions by id.
  const family = content.key === 'tryggleik' || content.key === 'ki' ? content.key : null;
  const rules = useQueries({
    queries: (['aggregate', 'leader'] as const).map((channel) => ({
      queryKey: ['findings', 'rules', family, channel],
      queryFn: () =>
        api<RuleSummary[]>(`/api/admin/finding-rules?family=${family}&channel=${channel}`),
      enabled: family !== null,
    })),
  });
  const conditions = content.questions.filter(
    (x) => x.visible_if !== undefined && refers(x.visible_if, q.id),
  );
  const tips = content.tips.filter((t) => refers(t.when, q.id));
  const mine = (Array.isArray(uses.data) ? uses.data : []).filter((u) =>
    u.questions.includes(q.id),
  );
  // The summary numbers first: zone, mean, critical share, then the distribution.
  const order = Object.keys(KIND);
  const rank = (kind: string) => (order.includes(kind) ? order.indexOf(kind) : order.length);
  const words = (list: Use[]) =>
    [...new Set(list.map((u) => u.kind))]
      .sort((a, b) => rank(a) - rank(b))
      .map((k) => KIND[k] ?? k);
  const kept = mine.filter((u) => u.holds);
  // A distribution that no longer holds is counted again by the version's own (2.16): it is only no
  // longer compared. What drops out is the rest, said on the question that changed and named on the
  // others that lose it with it.
  const lost = mine.filter((u) => !u.holds && u.kind !== 'distribution');
  const here = lost.filter((u) => (u.causes ?? [q.id]).includes(q.id));
  const elsewhere = lost.filter((u) => !(u.causes ?? [q.id]).includes(q.id));
  const recounted = mine.some(
    (u) => !u.holds && u.kind === 'distribution' && (u.causes ?? [q.id]).includes(q.id),
  );
  const because = [...new Set(elsewhere.flatMap((u) => u.causes ?? []))];
  const own = rules
    .flatMap((r) => (Array.isArray(r.data) ? r.data : []))
    .filter((r) => r.rule.question === q.id || r.questions.some((x) => x.id === q.id));
  const options = 'options' in q ? new Set(q.options.map((o) => o.id)) : null;
  // The answers a rule counts: the raw answers of a leader rule, the answers of a distribution
  // otherwise (a cross or a computed rule counts no answers of its own here).
  const counted = (r: RuleSummary) =>
    (r.rule.raw_options ?? r.rule.options).filter((o) => !o.includes('.'));
  const broken = own.flatMap((r) =>
    options &&
    (r.rule.question === q.id || (r.questions.length === 1 && r.questions[0]!.id === q.id)) &&
    (!r.rule.computed || r.rule.computed === 'f12_b13')
      ? counted(r)
          .filter((o) => !options.has(o))
          .map((o) => ({ rule: r, option: o }))
      : [],
  );
  if (!conditions.length && !tips.length && !own.length && !mine.length) return null;
  return (
    <div className="vk-blokk vk-bruk">
      <div className="vk-etikett">Brukt i</div>
      <p className="vk-brukt">
        {conditions.map((u) => (
          <span key={u.id} className="chip accent">
            Vilkåret til {u.id}
          </span>
        ))}
        {tips.map((t) => (
          <span key={t.id} className="chip accent">
            Rådet «{t.title.nn}»
          </span>
        ))}
        {own.map((r) => {
          const to = `/admin/surveys/funn?rule=${encodeURIComponent(r.key)}`;
          return (
            <a key={r.key} className="chip accent" href={to} onClick={(e) => follow(e, to)}>
              Funn: {r.rule.text.nn.replace(/\{[a-z_]+\}\s*/g, '').slice(0, 48)}
            </a>
          );
        })}
        {kept.length > 0 && (
          <span className="chip ok">Tal i resultatet: {words(kept).join(', ')}</span>
        )}
      </p>
      {here.length > 0 && (
        <p className="vk-problem">
          <Icon name="varsel" small />
          Spørsmålet har endra meining eller svar, så rundar på denne versjonen får ikkje{' '}
          {words(here).join(', ')}.
        </p>
      )}
      {elsewhere.length > 0 && (
        <p className="vk-problem">
          <Icon name="varsel" small />
          {because.join(', ')} har endra meining eller svar, så rundar på denne versjonen får ikkje{' '}
          {words(elsewhere).join(', ')}.
        </p>
      )}
      {recounted && (
        <p className="vk-dempa">
          Svara blir talde på nytt, men blir ikkje samanlikna med tidlegare rundar.
        </p>
      )}
      {broken.map(({ rule, option }) => (
        <p key={`${rule.key}:${option}`} className="vk-problem">
          <Icon name="varsel" small />
          Funn-regelen «{rule.rule.text.nn.slice(0, 60)}» tel svaret «{option}», som ikkje finst i
          spørsmålet lenger.
        </p>
      ))}
    </div>
  );
}

/**
 * An earlier answer belongs to this question when it means the same — the rule of «Før og etter»
 * (round-pair.ts `questionChange`): the same type, answers and scores, rows and scale; the same
 * anchor, or, without anchors on both, the same wording.
 */
export function same(before: Question, now: Question) {
  if (before.type !== now.type) return false;
  if (before.anchor_key && now.anchor_key) {
    if (before.anchor_key !== now.anchor_key) return false;
  } else if (before.texts.text.nn !== now.texts.text.nn) return false;
  const answers = (q: Question) =>
    'options' in q
      ? q.options.map((o) => `${o.id}:${o.score ?? ''}`).join('|')
      : q.type === 'scale' || q.type === 'nps'
        ? [q.scale.min, q.scale.max, ...(q.type === 'scale' ? q.rows.map((r) => r.id) : [])].join(
            '|',
          )
        : '';
  return answers(before) === answers(now);
}

function Innsikt({ content, q }: { content: TemplateContent; q: Question }) {
  // Free text has no numbers to show.
  if (q.type === 'text') return null;
  return <InnsiktTal content={content} q={q} />;
}

function InnsiktTal({ content, q }: { content: TemplateContent; q: Question }) {
  const rounds = useRounds(),
    versions = useVersions();
  const mine = new Set(
    (Array.isArray(versions.data) ? versions.data : [])
      .filter((v) => v.template.key === content.key)
      .map((v) => v.id),
  );
  // The newest round on this survey with answers (the list is newest first).
  const round = (Array.isArray(rounds.data) ? rounds.data : []).find(
    (r) => r.has_data && r.template_version_id !== null && mine.has(r.template_version_id),
  );
  const version = useQuery({
    queryKey: ['surveys', 'version', round?.template_version_id],
    queryFn: () => api<EditorVersion>(`/api/admin/surveys/versions/${round!.template_version_id}`),
    enabled: !!round,
  });
  const then = version.data?.content.questions.find((x) => x.id === q.id);
  const comparable = !!then && same(then, q);
  const result = useQuery({
    ...dashboardQuery(new URLSearchParams({ round: round?.id ?? '' }).toString()),
    enabled: !!round && comparable,
  });
  if (!round || !then) return null;
  const series = result.data?.questions.find((x) => x.id === q.id)?.series ?? [];
  return (
    <div className="vk-blokk vk-innsikt">
      <div className="vk-etikett">Innsikt frå {round.name}</div>
      {!comparable ? (
        <p className="vk-dempa">
          Spørsmålet har endra svar eller meining sidan då, så svara kan ikkje visast her.
        </p>
      ) : result.error ? (
        <p className="vk-dempa">Kunne ikkje hente svara frå runden.</p>
      ) : !result.data ? (
        <p className="vk-dempa" role="status">
          Hentar svara …
        </p>
      ) : !series.length ? (
        <p className="vk-dempa">Ingen samla tal for spørsmålet i runden.</p>
      ) : (
        series.map((s) => (
          <div key={s.key} className="vk-innsikt-serie">
            {series.length > 1 && <b>{s.label}</b>}
            <ul>
              {s.buckets.map((b) => {
                const share = b.cell.suppressed ? null : b.cell.numerator / b.cell.denominator;
                const unsure = b.id === 'usikker' || /^usikker$|veit ikkje/i.test(b.label);
                return (
                  <li key={b.id} className={unsure ? 'usikker' : undefined}>
                    <span>{b.label}</span>
                    <span className="vk-innsikt-stolpe" aria-hidden="true">
                      <i style={{ width: `${Math.round((share ?? 0) * 100)}%` }} />
                    </span>
                    <span>{share === null ? '–' : `${Math.round(share * 100)} %`}</span>
                  </li>
                );
              })}
            </ul>
            <small>
              {s.n === null ? 'Talet på svar er ikkje vist' : `${s.n} svar`}. Grupper under tre blir
              ikkje viste («–»).
            </small>
          </div>
        ))
      )}
    </div>
  );
}

function Kommentarar({ versionId, node }: { versionId: string; node: string }) {
  const queries = useQueryClient();
  const list = useQuery(notesQuery(versionId));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mine = (Array.isArray(list.data) ? list.data : []).filter((c) => c.node === node);
  const open = mine.filter((c) => !c.resolved_at),
    done = mine.filter((c) => c.resolved_at);
  const run = (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    work()
      .then(async () => {
        after?.();
        await queries.invalidateQueries({ queryKey: ['surveys', 'comments', versionId] });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error('Noko gjekk gale.')))
      .finally(() => setBusy(false));
  };
  const resolve = (id: string, resolved: boolean) =>
    run(() => mutate(`/api/admin/surveys/comments/${id}`, 'PUT', { resolved }));
  const id = `vk-ny-kommentar-${node}`;
  return (
    <div className="vk-blokk vk-kommentarar">
      <div className="vk-etikett">Kommentarar</div>
      {open.map((c) => (
        <article key={c.id} className="vk-kommentar">
          <p>{c.text}</p>
          <small>
            {c.created_by} · {when(c.created_at)}
            {c.version_no !== null && ` · v${c.version_no}`}
          </small>
          <button
            type="button"
            className="linkbtn"
            disabled={busy}
            onClick={() => resolve(c.id, true)}
          >
            Merk som løyst
          </button>
        </article>
      ))}
      {done.length > 0 && (
        <details className="vk-kommentar-loyste">
          <summary>
            {done.length} {done.length === 1 ? 'løyst kommentar' : 'løyste kommentarar'}
          </summary>
          {done.map((c) => (
            <article key={c.id} className="vk-kommentar loyst">
              <p>{c.text}</p>
              <small>
                {c.created_by} · {when(c.created_at)} · løyst av {c.resolved_by}
              </small>
              <button
                type="button"
                className="linkbtn"
                disabled={busy}
                onClick={() => resolve(c.id, false)}
              >
                Opne att
              </button>
            </article>
          ))}
        </details>
      )}
      <label className="sr-only" htmlFor={id}>
        Ny kommentar
      </label>
      <textarea
        id={id}
        className="input"
        rows={2}
        maxLength={2000}
        value={text}
        placeholder="Til dømes: Kan vi seie dette enklare?"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="vk-knappar">
        <button
          type="button"
          className="btn sm"
          disabled={busy || !text.trim()}
          onClick={() =>
            run(
              () =>
                mutate(`/api/admin/surveys/versions/${versionId}/comments`, 'POST', {
                  node,
                  text: text.trim(),
                }),
              () => setText(''),
            )
          }
        >
          <Icon name="prat" small />
          Legg til kommentar
        </button>
      </div>
      <ErrorMessage error={error ?? list.error} />
    </div>
  );
}
