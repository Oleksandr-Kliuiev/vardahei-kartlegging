// «Før og etter» of a seminar (3.9; Vardestien `semTab === 'etter'`): per question the answers
// before (grey) and after (blue) for the seminar's clients, the snittscore and kritisk andel where
// the question has scores, and per client. Numbers come from privacy (class aggregate, k = 3):
// a hidden group shows «–». A question or metric that cannot be compared says why, with no
// numbers. The caveats are always on the screen: who answered, self-selection, comparability, and
// no claim that the seminar caused the change.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { numberText, percent } from './dashboard-models.js';
import { ErrorMessage } from './queries.js';
import type { SeminarDetail } from './seminar-models.js';
import { RoundsCard } from './seminar-rounds.js';
import {
  type BeforeAfter,
  changeText,
  type Comparable,
  DEGREE,
  HIDDEN_NOTE,
  type QuestionPair,
  type ScorePair,
  svar,
  whereMissing,
} from './seminar-rounds-models.js';
import { Seg } from './widgets.js';

type Ready = Extract<BeforeAfter, { ready: true }>;

function Caveats({ caveats }: { caveats: string[] }) {
  return (
    <div className="sem-atterhald" role="note" aria-label="Atterhald">
      <b>Les dette før du les tala</b>
      <ul>
        {caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

function Mark({ comparable }: { comparable: Comparable }) {
  if (comparable.degree === 'comparable') return null;
  return (
    <p className={`sem-merke ${comparable.degree}`}>
      <b>{DEGREE[comparable.degree]}.</b> {comparable.note}
    </p>
  );
}

/** Comparable but without a number on either side (nobody, or too few, answered): one line, no bars. */
const quiet = (q: QuestionPair) =>
  q.comparable.degree === 'comparable' &&
  (q.before?.n ?? null) === null &&
  (q.after?.n ?? null) === null;

function ScoreLine({
  label,
  score,
  testid,
}: {
  label: string;
  score: Pick<ScorePair, 'change' | 'critical_change'> & {
    before: { mean: number | null; critical: number | null };
    after: { mean: number | null; critical: number | null };
  };
  testid?: string;
}) {
  const { before, after } = score;
  if ([before.mean, after.mean, before.critical, after.critical].every((v) => v === null))
    return null;
  return (
    <p className="sem-fe-score" data-testid={testid}>
      {label} {numberText(before.mean)} → {numberText(after.mean)}
      {score.change && ` (${changeText(score.change)})`} · Kritisk andel {percent(before.critical)}{' '}
      → {percent(after.critical)}
      {score.critical_change && ` (${changeText(score.critical_change, true)})`}
    </p>
  );
}

function Question({ q }: { q: QuestionPair }) {
  const hidden = (q.before?.n ?? null) === null || (q.after?.n ?? null) === null;
  const score = q.score;
  return (
    <article className="sem-fe-sporsmal" data-testid={`fe-${q.id}`}>
      <h3>{q.text}</h3>
      <Mark comparable={q.comparable} />
      {q.before && q.after && (
        <div className="poll sem-fe-poll">
          {q.options.map((o, i) => {
            const before = q.before!.shares[i] ?? null,
              after = q.after!.shares[i] ?? null;
            return (
              <div
                className="poll-rad sem-fe-rad"
                key={o.id}
                aria-label={`${o.label}: før ${percent(before)}, etter ${percent(after)}`}
              >
                <span>{o.label}</span>
                <span className="bar sem-to-band" aria-hidden="true">
                  <span className="for" style={{ transform: `scaleX(${before ?? 0})` }} />
                  <span className="etter" style={{ transform: `scaleX(${after ?? 0})` }} />
                </span>
                <span className="sem-fe-tal" aria-hidden="true">
                  <small>{percent(before)}</small>
                  <b>{percent(after)}</b>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {q.before && q.after && (
        <p className="forklaring sem-fe-n">
          Før: {svar(q.before.n)}. Etter: {svar(q.after.n)}.
          {q.multi && ' Kvar person kunne velje fleire svar.'}
          {hidden && ` ${HIDDEN_NOTE}`}
        </p>
      )}
      {score && score.comparable.degree !== 'incomparable' && score.before && score.after && (
        <ScoreLine
          label="Snittscore"
          score={{ ...score, before: score.before, after: score.after }}
        />
      )}
      {score && score.comparable.degree !== q.comparable.degree && (
        <Mark comparable={score.comparable} />
      )}
    </article>
  );
}

/** All questions with scores together, with what makes them comparable (or why not). */
function Total({ data }: { data: Ready }) {
  const c = data.total.comparable;
  if (!c) return null;
  if (c.degree === 'incomparable') return <Mark comparable={c} />;
  return (
    <>
      <ScoreLine label="Alle spørsmål med poeng: snittscore" score={data.total} testid="fe-samla" />
      {c.degree === 'approximate' ? (
        <Mark comparable={c} />
      ) : (
        <p className="forklaring sem-fe-n">{c.note}</p>
      )}
    </>
  );
}

function Clients({ data }: { data: Ready }) {
  const scores = data.total.comparable !== null && data.total.comparable.degree !== 'incomparable';
  return (
    <section className="kort s12 sem-fe-kundar" aria-labelledby="fe-kundar-tittel">
      <div className="kort-hovud">
        <h2 id="fe-kundar-tittel">Per kunde</h2>
        <p>Lågare snittscore og lågare kritisk andel er betre.</p>
      </div>
      <div className="kort-innhald tabell-wrap">
        <table className="kompakt">
          <thead>
            <tr>
              <th scope="col">Kunde</th>
              <th scope="col">Svar før</th>
              <th scope="col">Svar etter</th>
              {scores && <th scope="col">Snittscore</th>}
              {scores && <th scope="col">Kritisk andel</th>}
            </tr>
          </thead>
          <tbody>
            {[
              { slug: 'alle', name: 'Alle kundane på seminaret', ...data.total },
              ...data.clients,
            ].map((c) => (
              <tr key={c.slug} className={c.slug === 'alle' ? 'sem-sum' : ''}>
                <th scope="row">{c.name}</th>
                <td>{c.before.respondents ?? '–'}</td>
                <td>{c.after.respondents ?? '–'}</td>
                {scores && (
                  <td>
                    {numberText(c.before.mean)} → {numberText(c.after.mean)}
                    {c.change && <small> {changeText(c.change)}</small>}
                  </td>
                )}
                {scores && (
                  <td>
                    {percent(c.before.critical)} → {percent(c.after.critical)}
                    {c.critical_change && <small> {changeText(c.critical_change, true)}</small>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="forklaring">{HIDDEN_NOTE} Då står det «–».</p>
        {data.total.comparable && <Mark comparable={data.total.comparable} />}
      </div>
    </section>
  );
}

/** The tab «Før og etter»: the comparison (s7), «Rundar» (s5), then the table per client (s12). */
export function BeforeAfterTab({
  seminar,
  onLive,
}: {
  seminar: SeminarDetail;
  onLive: () => void;
}) {
  const [client, setClient] = useState('alle');
  const result = useQuery({
    queryKey: ['responses', 'before-after', seminar.id, client],
    queryFn: () =>
      api<BeforeAfter>(
        `/api/admin/seminars/${seminar.id}/before-after${client === 'alle' ? '' : `?client=${encodeURIComponent(client)}`}`,
      ),
  });
  const data = result.data;
  // A client that is no longer in both rounds (a link changed): back to all clients.
  useEffect(() => {
    if (result.error && client !== 'alle') setClient('alle');
  }, [result.error, client]);
  return (
    <div className="flate">
      <section className="kort s7 sem-for-etter" aria-labelledby="for-etter-tittel">
        <div className="kort-hovud">
          <h2 id="for-etter-tittel">Før og etter</h2>
          {data?.ready && (
            <p>
              {data.rounds.before.name} → {data.rounds.after.name}
            </p>
          )}
        </div>
        <div className="kort-innhald sem-fe-innhald">
          <ErrorMessage error={result.error} />
          {data && <Caveats caveats={data.caveats} />}
          {data && !data.ready && (
            <p className="forklaring" data-testid="fe-ikkje-klar">
              {data.missing.before && data.missing.after
                ? 'Vel ei undersøking før og ei etter seminaret'
                : data.missing.before
                  ? 'Vel ei undersøking før seminaret'
                  : 'Start eller vel ei undersøking etter seminaret'}{' '}
              under «Rundar», så kjem samanlikninga her.
            </p>
          )}
          {data?.ready && <Comparison data={data} client={client} onClient={setClient} />}
        </div>
      </section>
      <RoundsCard seminar={seminar} onLive={onLive} />
      {data?.ready && data.client === null && data.cohort.length > 0 && <Clients data={data} />}
    </div>
  );
}

function Comparison({
  data,
  client,
  onClient,
}: {
  data: Ready;
  client: string;
  onClient: (c: string) => void;
}) {
  const source = (s: 'released' | 'live') => (s === 'released' ? 'publiserte tal' : 'levande tal');
  return (
    <>
      {data.cohort.length > 1 && (
        <Seg
          label="Kunde"
          value={client}
          options={[['alle', 'Alle'], ...data.cohort.map((c) => [c.slug, c.name] as const)]}
          onChange={onClient}
        />
      )}
      {data.cohort.length === 0 ? (
        <p className="forklaring" data-testid="fe-ingen">
          Ingen av kundane på seminaret har svart i begge undersøkingane enno.
        </p>
      ) : (
        <>
          <p className="sem-fe-forklaring" data-testid="fe-tal">
            <span className="sem-fe-prikk for" aria-hidden="true" />
            Før seminaret: {svar(data.total.before.respondents)} (
            {source(data.rounds.before.source)}).{' '}
            <span className="sem-fe-prikk etter" aria-hidden="true" />
            Etter: {svar(data.total.after.respondents)} ({source(data.rounds.after.source)}).
          </p>
          <Total data={data} />
          {data.questions
            .filter((q) => !quiet(q))
            .map((q) => (
              <Question key={q.id} q={q} />
            ))}
          {data.questions.some(quiet) && (
            <p className="forklaring" data-testid="fe-utan-tal">
              For få svar til å vise tal:{' '}
              {data.questions
                .filter(quiet)
                .map((q) => q.label)
                .join(', ')}
              .
            </p>
          )}
        </>
      )}
      {data.not_both.length > 0 && (
        <p className="forklaring">
          Ikkje med i samanlikninga:{' '}
          {data.not_both.map((c) => `${c.name} (${whereMissing(c)})`).join(', ')}.
        </p>
      )}
      {data.only_before.length + data.only_after.length > 0 && (
        <p className="forklaring">
          {data.only_before.length > 0 &&
            `Berre i undersøkinga før: ${data.only_before.join(', ')}. `}
          {data.only_after.length > 0 &&
            `Berre i undersøkinga etter: ${data.only_after.join(', ')}.`}
        </p>
      )}
    </>
  );
}
