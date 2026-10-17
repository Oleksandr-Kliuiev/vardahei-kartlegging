// «Rapportar» (5.1, ADR-025, Vardestien mockup): choose a closed round and a client, read the A4
// preview, then save a PDF with the browser's print dialog and send it yourself. Varde sends
// nothing. Only the A4 pages are printed (report.css).
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage, useRounds } from './queries.js';
import { ReportSheet } from './report-sheet.js';
import { type ClientReport, LANGUAGE_NAMES, type ReportLang } from './report-texts.js';
import './report.css';

const A4_PX = 794; // 210 mm at 96 dpi
const FOUND = ['', 'Det viktigaste funnet', 'Dei to viktigaste funna', 'Dei tre viktigaste funna'];

/** What the reviewer gets in this report; missing parts say why. */
function contents(r: ClientReport): [boolean, string][] {
  const n = r.findings.length;
  return [
    [
      r.zone !== null && r.zone.mean !== null,
      r.zone === null
        ? 'Skjemaet har ingen soner'
        : r.zone.mean === null
          ? 'Ingen sone: for få svar'
          : 'Sone for bedrifta og kritisk andel',
    ],
    [n > 0, FOUND[n] ?? 'Ingen tydelege funn'],
    [
      r.comparison !== null,
      r.comparison
        ? `Samanlikning med ${r.comparison.round.name}, med atterhald`
        : 'Inga samanlikning med ein tidlegare runde',
    ],
    [n > 0, 'Kva Vardahei føreslår'],
  ];
}

/** The A4 preview scales down to its column; print always uses the real size. */
function useFit() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () =>
      el.style.setProperty('--forhand-zoom', String(Math.min(1, el.clientWidth / A4_PX)));
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function ReportPage({ initial }: { initial: string | undefined }) {
  const rounds = useRounds();
  const [selected, setSelected] = useState(initial ?? '');
  const [roundId, setRoundId] = useState('');
  const [lang, setLang] = useState<ReportLang | undefined>();
  const [read, setRead] = useState(false);
  const fit = useFit();
  const closed = (rounds.data ?? []).filter(
    (r) => ['closed', 'archived'].includes(r.status) && r.round_clients.some((rc) => rc.released),
  );
  const round =
    closed.find((r) => r.round_clients.some((rc) => rc.id === selected)) ??
    closed.find((r) => r.id === roundId) ??
    closed[0];
  const report = useQuery({
    queryKey: ['report', selected, lang ?? ''],
    queryFn: () =>
      api<ClientReport>(
        `/api/admin/round-clients/${selected}/report${lang ? `?lang=${lang}` : ''}`,
      ),
    enabled: selected !== '',
  });
  const data = selected ? report.data : undefined;
  // The title becomes the suggested file name of the PDF.
  useEffect(() => {
    if (!data) return;
    const before = document.title;
    document.title = `Rapport ${data.client.name} ${data.round.name}`;
    return () => {
      document.title = before;
    };
  }, [data]);
  const choose = (rc: string) => {
    setSelected(rc);
    setLang(undefined);
    setRead(false);
    window.history.replaceState(null, '', rc ? `/admin/reports/${rc}` : '/admin/reports');
  };
  return (
    <div className="rapport">
      <div className="kort rapport-varsel" role="note">
        <span className="chip warn">Førehandsvising</span>
        <p>
          Les gjennom rapporten før du sender han. Varde sender ingenting sjølv: du lagrar PDF-en og
          sender han til kunden. Aldri med i rapporten: initialar, leiarsvar og grupper under tre
          personar.
        </p>
      </div>
      <div className="flate">
        <section className="kort s5 rapport-kontroll" aria-labelledby="rapport-innhald">
          <div className="kort-hovud">
            <h2 id="rapport-innhald">Innhald</h2>
          </div>
          <div className="kort-innhald">
            <label className="field">
              <span>Runde</span>
              <select
                aria-label="Runde"
                value={round?.id ?? ''}
                onChange={(e) => {
                  setRoundId(e.target.value);
                  choose('');
                }}
              >
                {closed.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Kunde</span>
              <select aria-label="Kunde" value={selected} onChange={(e) => choose(e.target.value)}>
                <option value="">Vel kunde</option>
                {round?.round_clients
                  .filter((rc) => rc.released)
                  .map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.client.name}
                    </option>
                  ))}
              </select>
            </label>
            {data && (
              <div className="field">
                <span>Språk</span>
                <div className="seg" role="group" aria-label="Språk i rapporten">
                  {data.languages.map((code) => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={data.lang === code}
                      onClick={() => {
                        setLang(code);
                        setRead(false);
                      }}
                    >
                      {LANGUAGE_NAMES[code]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {data && (
              <ul className="sjekk" aria-label="Dette er med">
                {contents(data).map(([ok, text]) => (
                  <li key={text}>
                    <span className={ok ? 'ok' : 'mangel'}>
                      <Icon name={ok ? 'hake' : 'info'} small />
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            )}
            <label className="brytar">
              <input
                type="checkbox"
                checked={read}
                disabled={!data}
                onChange={(e) => setRead(e.target.checked)}
              />
              Eg har lese gjennom rapporten
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!data || !read}
              onClick={() => window.print()}
            >
              <Icon name="ned" small />
              Lagre som PDF
            </button>
            <p className="forklaring">
              I utskriftsvindauget vel du «Lagre som PDF». Fila får namnet «
              {data ? `Rapport ${data.client.name} ${data.round.name}` : 'Rapport …'}». Menyen og
              denne delen kjem ikkje med.
            </p>
          </div>
        </section>
        <section className="s7 rapport-forhand" aria-label="Førehandsvising av rapporten" ref={fit}>
          <ErrorMessage error={rounds.error ?? (selected ? report.error : null)} />
          {data ? (
            <ReportSheet report={data} />
          ) : (
            <div className="rapport-tom">
              <p>
                {rounds.data && closed.length === 0
                  ? 'Ingen avslutta rundar har publiserte tal enno.'
                  : selected
                    ? 'Hentar rapporten …'
                    : 'Vel ein kunde for å sjå rapporten.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
