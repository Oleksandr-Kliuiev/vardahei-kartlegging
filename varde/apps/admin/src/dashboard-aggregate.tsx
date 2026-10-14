import type { Dashboard, QuestionView, Finding, Bucket } from './dashboard-models.js';
import { numberText, percent, zoneNames, zoneIds } from './dashboard-models.js';

export function Zone({ zone }: { zone: number | null }) {
  return (
    <span className={`sone ${zone === null ? 'ingen' : zoneIds[zone]}`}>
      <i aria-hidden="true" />
      {zone === null ? '–' : zoneNames[zone]}
    </span>
  );
}
export function Findings({ findings }: { findings: Finding[] }) {
  return findings.length ? (
    <ul className="funn">
      {findings.map((f) => (
        <li key={f.key}>
          <span className={`niva ${f.level}`}>
            <i aria-hidden="true" />
            {f.severity === 'opportunity'
              ? f.level === 'high'
                ? 'Stor'
                : 'Verdt'
              : f.level === 'high'
                ? 'Høg'
                : 'Middels'}
          </span>
          <div>
            <b>{f.tal}</b> {f.text}
          </div>
          <div className="tiltak">
            <b>Forslag: </b>
            {f.action}
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="under">Ingen tydelege funn i dette utvalet.</p>
  );
}
export function Zones({ data }: { data: NonNullable<Dashboard['zones']> }) {
  const header = data.questions;
  return (
    <section className="del">
      <h2>Soner</h2>
      <p className="under">
        Same modell som Master_Analyse frå runde 1. Kvart svar har ein farge: grøn 0, gul 1, oransje
        2, raud 3 poeng. Kritisk andel er delen av svara som er oransje eller raude.
      </p>
      <div className="hero">
        <div>
          <b className="stor" data-testid="mean-score">
            {numberText(data.mean)}
          </b>
          <div>snittscore av 3</div>
        </div>
        <div>
          <Zone zone={data.zone} />
          <div>{data.n === null ? '–' : `${data.n} svar`}</div>
        </div>
        <div>
          <b className="stor">{percent(data.critical)}</b>
          <div>kritisk andel</div>
        </div>
        <div>
          {data.persons.map((p, i) => (
            <span key={p.id} className={`sone ${p.id}`}>
              <i />
              {zoneNames[i]} <b>{p.cell && !p.cell.suppressed ? p.cell.numerator : '–'}</b>
            </span>
          ))}
          <div>tilsette per sone</div>
        </div>
      </div>
      <p className="under">
        Spørsmål og bedrift: Grøn til 0,5 · Gul 0,5–1,5 · Oransje 1,5–2,5 · Raud over 2,5. Tilsett:
        Grøn under 1 · Gul 1–2 · Oransje 2–3 · Raud frå 3.
      </p>
      <div className="tabell-wrap">
        <table className="rute">
          <thead>
            <tr>
              <th>Gruppe</th>
              {header.map((q) => (
                <th key={q.id} title={q.label}>
                  {q.label}
                </th>
              ))}
              <th>Samla</th>
              <th>Kritisk andel</th>
            </tr>
          </thead>
          <tbody>
            {data.grid.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                {r.questions.map((q) => (
                  <td
                    key={q.id}
                    className={q.zone === null ? 'ingen' : zoneIds[q.zone]}
                    title={`${q.label}: ${numberText(q.mean)}, ${percent(q.critical)} kritisk, ${q.n ?? '–'} personar`}
                  >
                    {numberText(q.mean, 1)}
                  </td>
                ))}
                <td>{numberText(r.mean, 1)}</td>
                <td>{percent(r.critical)}</td>
              </tr>
            ))}
            <tr className="sumrad">
              <th scope="row">Alle</th>
              {header.map((q) => (
                <td key={q.id} className={q.zone === null ? 'ingen' : zoneIds[q.zone]}>
                  {numberText(q.mean, 1)}
                </td>
              ))}
              <td>{numberText(data.mean, 1)}</td>
              <td>{percent(data.critical)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Ring({
  buckets,
  n,
  critical,
  label,
}: {
  buckets: Bucket[];
  n: number | null;
  critical: number | null;
  label: string;
}) {
  let offset = 0;
  const circumference = 2 * Math.PI * 46;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${percent(critical)} kritisk`}>
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--bar-track)" strokeWidth="18" />
      {buckets
        .slice()
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        .map((b) => {
          if (b.cell.suppressed || !n || !b.cell.numerator) return null;
          const length = (circumference * b.cell.numerator) / n,
            start = offset;
          offset += length;
          return (
            <circle
              key={b.id}
              cx="60"
              cy="60"
              r="46"
              fill="none"
              stroke={`var(--s-${zoneIds[b.score ?? 0]})`}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0, length - 1.5)} ${circumference}`}
              strokeDashoffset={-start}
              transform="rotate(-90 60 60)"
            >
              <title>
                {b.label}: {b.cell.numerator} av {n}
              </title>
            </circle>
          );
        })}
      <text x="60" y="58" textAnchor="middle" className="midt">
        {percent(critical)}
      </text>
      <text x="60" y="73" textAnchor="middle" className="midt-under">
        kritisk
      </text>
    </svg>
  );
}
export function KeyQuestions({ questions }: { questions: Dashboard['key_questions'] }) {
  return (
    <section className="del">
      <h2>Nøkkelspørsmåla</h2>
      <p className="under">Fargane er sonene frå reknearket. Talet i midten er kritisk andel.</p>
      <div className="kaker">
        {questions.map((q) => (
          <article className="kake" key={q.id}>
            <h3 title={q.label}>{q.short_label}</h3>
            <Ring
              label={q.short_label}
              buckets={q.series[0]?.buckets ?? []}
              n={q.series[0]?.n ?? null}
              critical={q.critical}
            />
            <ul>
              {q.series[0]?.buckets.map((b) => (
                <li key={b.id}>
                  <i
                    style={{ background: `var(--s-${zoneIds[b.score ?? 0]})` }}
                    aria-hidden="true"
                  />
                  {b.label}
                  <span>
                    {b.cell.suppressed
                      ? '–'
                      : `${b.cell.numerator} · ${percent(b.cell.numerator / b.cell.denominator)}`}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              {q.n ?? '–'} svar · snittscore {numberText(q.mean)} <Zone zone={q.zone} />
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
export function QuestionBlock({
  question,
  leaders = false,
}: {
  question: QuestionView;
  leaders?: boolean;
}) {
  return (
    <article className="skjemablokk">
      <h3>{question.label}</h3>
      {question.series.map((s) => (
        <div key={s.key}>
          {question.type === 'scale' && <h4>{s.label}</h4>}
          <p className="under">{s.n === null ? '–' : `${s.n} ${leaders ? 'leiarar' : 'svar'}`}</p>
          {s.nps !== null && (
            <p>
              <b className="stor">{s.nps}</b> NPS · snitt {numberText(s.mean, 1)}
            </p>
          )}
          {s.buckets.map((b) => (
            <div className="distribution" key={b.id}>
              <span>{b.label}</span>
              <div className="spor">
                <span
                  style={{
                    width:
                      b.cell.suppressed || !b.cell.denominator
                        ? '0'
                        : `${(100 * b.cell.numerator) / b.cell.denominator}%`,
                  }}
                />
              </div>
              <span>
                {b.cell.suppressed
                  ? '–'
                  : leaders
                    ? `${b.cell.numerator} av ${b.cell.denominator} leiarar`
                    : `${b.cell.numerator} · ${percent(b.cell.numerator / b.cell.denominator)}`}
              </span>
            </div>
          ))}
          {question.type === 'scale' && <p>Snitt {numberText(s.mean, 1)}</p>}
        </div>
      ))}
    </article>
  );
}
export function CommonQuestions({ data }: { data: Dashboard }) {
  const tasks = data.ki?.tasks ?? [];
  return (
    <section className="del">
      <h2>Svar frå alle tilsette</h2>
      <p className="under">Spørsmål for spørsmål, i same rekkjefølgje som i skjemaet.</p>
      {data.ki && (
        <>
          <h3>Kor ofte dei brukar KI, i jobben og privat</h3>
          <div className="rutenett">
            {data.questions
              .filter((q) => ['K7', 'K8'].includes(q.id))
              .map((q) => (
                <QuestionBlock key={q.id} question={q} />
              ))}
          </div>
          <h3>Rutineoppgåvene som tek mest tid</h3>
          <p>Timane er eit anslag: kor ofte dei gjer oppgåva × kor lang tid ho tek.</p>
          <div className="tabell-wrap">
            <table>
              <thead>
                <tr>
                  <th>Oppgåve</th>
                  <th>Tyngst for</th>
                  <th>Timar/veke, samla</th>
                  <th>Kryssa av totalt</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">{t.label}</th>
                    <td>{t.cell.suppressed ? '–' : `${t.cell.n} personar`}</td>
                    <td>
                      {t.cell.suppressed || !t.cell.denominator
                        ? '–'
                        : `≈ ${numberText(t.cell.numerator, t.cell.numerator < 10 ? 1 : 0)}`}
                    </td>
                    <td>{t.total && !t.total.suppressed ? t.total.numerator : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="rutenett">
        {data.questions
          .filter((q) => !data.ki || !['K7', 'K8'].includes(q.id))
          .map((q) => (
            <QuestionBlock key={q.id} question={q} />
          ))}
      </div>
    </section>
  );
}
