// The referat of one conversation for the client (2.21, concept): two A4 sheets in Nynorsk. The first
// says who took part, how it was rated, the overall impression, what to look at with the conclusions,
// what is in place and what was agreed; the second every question with what they told, the rating and
// the conclusion. Never a note: the API does not give them. While not finished it is a draft.
// Printing follows the client report (5.1, report.css): only the sheets, always light, one per page;
// the browser saves the PDF and Vardahei sends it. Varde sends nothing.
import { useEffect } from 'react';
import { Icon } from './icons.js';
import logo from './logo.png';
import { follow } from './nav.js';
import { ErrorMessage } from './queries.js';
import { peopleText, RATING, type Rating, type Referat, useReferat } from './samtale-models.js';
import { ReferatTiltak } from './samtale-tiltak-oversikt.js';
import './report.css';
import './samtale.css';
import './samtale-referat.css';

const MONTHS = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
];
/** 2026-11-25 → «25. november 2026»: a document keeps its year, and the day never breaks over lines. */
export const fullDate = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])}.\u00a0${MONTHS[Number(m[2]) - 1]}\u00a0${m[1]}` : '';
};

/** « · » between the parts of a line: a line may break after the dot, never before it. */
const DOT = '\u00a0· ';

/** A rating on paper: its glyph in a disc, the word beside it. */
const Pm = ({ r }: { r: Rating }) => (
  <span className={`sm-pm sm-pm-${RATING[r].cls}`} aria-hidden="true">
    {RATING[r].glyph}
  </span>
);
const Vurdering = ({ r }: { r: Rating | null }) =>
  r ? (
    <span className="sm-ark-v">
      <Pm r={r} />
      {RATING[r].word}
    </span>
  ) : (
    <>–</>
  );

function Topp({
  kicker,
  title,
  meta,
  small,
}: {
  kicker: string;
  title: string;
  meta?: string;
  small?: boolean;
}) {
  return (
    <header className="sm-ark-topp">
      <div>
        <p className="sm-ark-kicker">{kicker}</p>
        <h2 className={small ? 'sm-ark-liten' : undefined}>{title}</h2>
        {meta && <p className="sm-ark-meta">{meta}</p>}
      </div>
      <img className="sm-ark-logo" src={logo} alt="Vardahei IT" />
    </header>
  );
}

export function Ark({ r }: { r: Referat }) {
  const fix = [
    ...r.questions.filter((q) => q.rating === 'manglar'),
    ...r.questions.filter((q) => q.rating === 'forbetring'),
  ];
  const ok = r.questions.filter((q) => q.rating === 'ivaretatt');
  const ours = r.interviewers.join(' og ');
  const meta = [fullDate(r.held_on), peopleText(r.interviewees), ours && `frå Vardahei IT: ${ours}`]
    .filter(Boolean)
    .join(DOT);
  return (
    <div className="sm-ark-rad" lang="nn">
      <article className="sm-ark" aria-label="Side 1 av referatet">
        <Topp kicker="Samtale om IT-tryggleik" title={r.client.name} meta={meta} />
        <p className="sm-ark-fordeling">
          {(['ivaretatt', 'forbetring', 'manglar'] as const).map((k) => (
            <span key={k}>
              <Pm r={k} />
              {RATING[k].word}: {r.counts[k]}
            </span>
          ))}
          {r.counts.ikkje_aktuelt > 0 && (
            <span>
              <Pm r="ikkje_aktuelt" />
              Ikkje aktuelt: {r.counts.ikkje_aktuelt}
            </span>
          )}
        </p>
        {r.summary.trim() && (
          <section className="sm-ark-del">
            <h3>Samla inntrykk</h3>
            <p className="sm-ark-tekst">{r.summary}</p>
          </section>
        )}
        <section className="sm-ark-del">
          <h3>Dette bør de sjå på</h3>
          {fix.length ? (
            <div
              className="tabell-wrap sm-ark-rull"
              tabIndex={0}
              role="region"
              aria-label="Dette bør de sjå på"
            >
              <table className="sm-ark-tabell sm-ark-fix">
                <thead>
                  <tr>
                    <th>Nr</th>
                    <th>Spørsmål</th>
                    <th>Vurdering</th>
                    <th>Tiltak</th>
                  </tr>
                </thead>
                <tbody>
                  {fix.map((q) => (
                    <tr key={q.id}>
                      <td>{q.no}</td>
                      <td>{q.short}</td>
                      <td>
                        <Vurdering r={q.rating} />
                      </td>
                      <td className="sm-ark-tekst">
                        <ReferatTiltak action={q.action} catalog={q.catalog} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Ingen punkt er vurderte som Manglar eller Forbetringspotensial.</p>
          )}
        </section>
        <section className="sm-ark-del">
          <h3>Dette er på plass</h3>
          <p>{ok.map((q) => q.short).join(' · ') || '–'}</p>
        </section>
        {r.agreed.trim() && (
          <section className="sm-ark-del">
            <h3>Avtalt vidare</h3>
            <p className="sm-ark-tekst">{r.agreed}</p>
          </section>
        )}
        <footer className="sm-ark-fot">
          <span>Vardahei IT · Varde</span>
          <span className="sm-ark-side">Side 1 av 2</span>
        </footer>
      </article>
      <article className="sm-ark" aria-label="Side 2 av referatet">
        <Topp kicker="Alle spørsmål" title="Kva de fortalde, og vurderinga vår" small />
        <div
          className="tabell-wrap sm-ark-rull"
          tabIndex={0}
          role="region"
          aria-label="Alle spørsmål"
        >
          <table className="sm-ark-tabell sm-ark-full">
            <thead>
              <tr>
                <th>Nr</th>
                <th>Spørsmål</th>
                <th>Kva de fortalde</th>
                <th>Vurdering</th>
                <th>Tiltak</th>
              </tr>
            </thead>
            <tbody>
              {r.questions.map((q) => (
                <tr key={q.id}>
                  <td>{q.no}</td>
                  <td>{q.short}</td>
                  <td className="sm-ark-tekst">{q.answer}</td>
                  <td>
                    <Vurdering r={q.rating} />
                  </td>
                  <td className="sm-ark-tekst">
                    <ReferatTiltak action={q.action} catalog={q.catalog} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="sm-ark-fot">
          <span>Eigne notat frå Vardahei er ikkje med.</span>
          <span className="sm-ark-side">Side 2 av 2</span>
        </footer>
      </article>
    </div>
  );
}

export function ReferatPage({ id }: { id: string }) {
  const q = useReferat(id);
  const r = q.data;
  // The title becomes the suggested name of the PDF, as for the client report.
  useEffect(() => {
    if (!r) return;
    const before = document.title;
    document.title = `Referat ${r.client.name} ${r.held_on ?? ''}`.trim();
    return () => {
      document.title = before;
    };
  }, [r]);
  const back = `/admin/samtalar/${id}/oppsummering`;
  return (
    <div className="sm-referat">
      <div className="rom-topp">
        <a className="rom-tilbake" href={back} onClick={(e) => follow(e, back)}>
          <Icon name="tilbake" small />
          Oppsummering
        </a>
        <div className="sidetittel">
          <div>
            <h1>Referat</h1>
            <p>
              {r
                ? [r.client.name, r.round.name, fullDate(r.held_on)].filter(Boolean).join(DOT)
                : !q.error && 'Hentar referatet …'}
            </p>
          </div>
          <button type="button" className="btn" disabled={!r} onClick={() => window.print()}>
            <Icon name="ned" small />
            Skriv ut eller lagre som PDF
          </button>
        </div>
      </div>
      <ErrorMessage error={q.error} />
      {r && r.status !== 'done' && (
        <div className="sm-melding sm-info sm-utkast" role="note">
          <span>
            <Icon name="info" small />
            Utkast: samtalen er ikkje fullført enno. Eigne notat kjem aldri med i referatet.
          </span>
        </div>
      )}
      {r && <Ark r={r} />}
    </div>
  );
}
