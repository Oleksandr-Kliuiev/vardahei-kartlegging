// Oversikt (Vardestien): key numbers that roll to new values, and one trail per client with a dot per
// employee; new answers fill dots as they arrive over SSE. Only aggregates from the progress API (ADR-021).
import { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, countTo, ease, reduced, stagger } from '@varde/ui/motion';
import type { Cell, Progress, Round } from './models.js';
import { Icon } from './icons.js';

const DAYS = ['sundag', 'måndag', 'tysdag', 'onsdag', 'torsdag', 'fredag', 'laurdag'];
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
/** «15. oktober», with the year when it is not this year. */
export const longDate = (d: Date) =>
  `${d.getDate()}. ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}`;
const greeting = (h: number) =>
  h < 10 ? 'God morgon' : h < 13 ? 'God dag' : h < 18 ? 'God ettermiddag' : 'God kveld';
const visible = (c: Cell) => (c.suppressed ? null : c.value);
/** Calendar days from today to a deadline (0 on the day, negative after it); null without one. */
export const daysTo = (deadline: string | null, now = Date.now()) => {
  if (deadline === null) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(`${deadline.slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / 86_400_000,
  );
};

/** Today's date and a greeting with the first name, then what the page has to say. */
export function Ingress({ name, text }: { name: string | null; text: string }) {
  const now = new Date(),
    first = name?.split(/\s+/)[0];
  const day = DAYS[now.getDay()]!;
  return (
    <p className="ingress">
      <span className="eyebrow">
        {day[0]!.toUpperCase() + day.slice(1)} {longDate(now)}
      </span>
      <br />
      {greeting(now.getHours())}
      {first ? `, ${first}` : ''}. {text}
    </p>
  );
}

/** A number that rolls from its previous value; screen readers get the end value (aria-live on the card). */
function Rolling({ value, format }: { value: number | null; format?: (v: number) => string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!el.current) return;
    if (value === null) {
      el.current.textContent = '–';
      delete el.current.dataset['value'];
      return;
    }
    if (el.current.dataset['value'] === undefined && !reduced()) el.current.dataset['value'] = '0';
    void countTo(el.current, value, { duration: 900, ...(format ? { format } : {}) });
  }, [value]);
  return <span ref={el} />;
}

export function Kpis({ clients }: { clients: Progress[] }) {
  const known = clients.filter((c) => c.population_snapshot !== null);
  const total = clients.reduce((s, c) => s + c.responses_total, 0);
  const population = known.reduce((s, c) => s + (c.population_snapshot ?? 0), 0);
  const answeredKnown = known.reduce((s, c) => s + c.responses_total, 0);
  const active = clients.map((c) => visible(c.in_progress)).filter((v): v is number => v !== null);
  const last = clients
    .map((c) => c.last_response_day)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);
  const lastText = last
    ? last.slice(0, 10) === new Date().toISOString().slice(0, 10)
      ? 'i dag'
      : longDate(new Date(last))
    : '–';
  return (
    <div className="flate kpi" aria-live="polite">
      <div className="kort s3 talkort">
        <span className="etikett">
          <Icon name="hake" small />
          Svar i runden
        </span>
        <span className="stort">
          <Rolling value={total} /> {population > 0 && <small>av {population}</small>}
        </span>
        <span className="under">Dei felles spørsmåla, alle kundar</span>
      </div>
      <div className="kort s3 talkort">
        <span className="etikett">
          <Icon name="graf" small />
          Oppslutning
        </span>
        <span className="stort">
          <Rolling value={population > 0 ? Math.round((100 * answeredKnown) / population) : null} />{' '}
          <small>%</small>
        </span>
        <span className="under">Av tilsette i runden</span>
      </div>
      <div className="kort s3 talkort">
        <span className="etikett">
          <span className="live-dot" aria-hidden="true" />
          Svarar no
        </span>
        <span className="stort">
          <Rolling value={active.length ? active.reduce((a, b) => a + b, 0) : null} />
        </span>
        <span className="under">Aktive økter siste 15 min. Under 3 blir ikkje viste</span>
      </div>
      <div className="kort s3 talkort">
        <span className="etikett">
          <Icon name="info" small />
          Siste svar
        </span>
        <span className="stort">{lastText}</span>
        <span className="under">Siste dag med innsendt svar</span>
      </div>
    </div>
  );
}

/** One dot per employee (or per group of employees on large clients), rising to the right. */
const MAX_DOTS = 50;
const dotPos = (i: number, n: number): [number, number] => {
  const x = n === 1 ? 50 : 2 + (96 * i) / (n - 1);
  return [x, 25 - 14 * (x / 100) + Math.sin(i * 1.3) * 1.1];
};
function MiniHiker() {
  return (
    <svg viewBox="-6 -25 14 26" width="13" height="24" aria-hidden="true">
      <line
        x1="0"
        y1="-8.5"
        x2="-1.6"
        y2="0"
        stroke="var(--ink-strong)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity=".7"
      />
      <rect x="-4.6" y="-16.6" width="3.6" height="6.4" rx="1.4" fill="var(--sekk)" />
      <line
        x1="0"
        y1="-8.5"
        x2=".8"
        y2="-15.5"
        stroke="var(--accent)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <line
        x1="0"
        y1="-8.5"
        x2="1.8"
        y2="0"
        stroke="var(--ink-strong)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="4.6"
        y1="-13.5"
        x2="5.6"
        y2="0"
        stroke="var(--stein)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="1.4" cy="-19" r="2.6" fill="var(--hud)" />
      <path d="M-1.3,-19.4 A2.75,2.75 0 0 1 4.1,-19.4 Z" fill="var(--lue)" />
      <circle cx="1.4" cy="-22.4" r="1" fill="var(--lue)" />
    </svg>
  );
}

function TrailRow({ name, p, deadline }: { name: string; p: Progress; deadline: string | null }) {
  const pop = p.population_snapshot;
  const per = pop !== null && pop > MAX_DOTS ? Math.ceil(pop / MAX_DOTS) : 1;
  // Unknown head count: an open-ended trail, the hiker walks by the number of answers (up to MAX_DOTS).
  const n = pop === null ? MAX_DOTS : Math.ceil(pop / per),
    on = Math.min(n, Math.floor(p.responses_total / per));
  const row = useRef<HTMLDivElement>(null),
    before = useRef<number | null>(null);
  // New answers since the last update: the dots pop and the row flashes once.
  useLayoutEffect(() => {
    const was = before.current;
    before.current = on;
    if (was === null || on <= was || reduced() || !row.current) return;
    const dots = [...row.current.querySelectorAll('.p.on')].slice(was);
    void stagger(dots, [{ transform: 'scale(2.4)' }, { transform: 'none' }], {
      duration: 700,
      step: 60,
      easing: ease.sprett,
      fill: 'none',
    });
    void animate(
      row.current,
      [
        { background: 'color-mix(in oklab, var(--accent) 16%, transparent)' },
        { background: 'transparent' },
      ],
      { duration: 1400, fill: 'none' },
    );
  }, [on]);
  const [hx, hy] = dotPos(Math.max(0, on - 1), n);
  const active = visible(p.in_progress),
    left = daysTo(deadline);
  const percent = pop ? Math.round((100 * p.responses_total) / pop) : null;
  return (
    <div
      className="spor-rad"
      ref={row}
      role="group"
      aria-label={`${name}: ${p.responses_total} svar${pop !== null ? ` av ${pop}` : ''}`}
    >
      <div className="spor-namn">
        {name}
        <small>
          {pop === null ? 'Tal tilsette manglar, stien viser berre svar' : `${pop} tilsette`}
        </small>
      </div>
      <div className="spor-felt" aria-hidden="true">
        <svg className="spor-line" viewBox="0 0 100 34" preserveAspectRatio="none">
          <path d="M2,25 L98,11.6" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="spor-prikkar">
          {Array.from({ length: pop === null ? on : n }, (_, i) => {
            const [x, y] = dotPos(i, n);
            return (
              <span
                key={i}
                className={i < on ? 'p on' : 'p'}
                style={{ left: `${x.toFixed(2)}%`, top: `${y.toFixed(1)}px` }}
              />
            );
          })}
        </div>
        <span
          className="mini-gaar"
          style={{ left: `${hx.toFixed(2)}%`, top: `${(hy - 22).toFixed(1)}px` }}
        >
          <MiniHiker />
        </span>
      </div>
      <div className="spor-tal">
        <b>
          {p.responses_total}
          {pop !== null && ` av ${pop}`}
        </b>
        <small>{percent === null ? '–' : `${Math.min(999, percent)} % har svart`}</small>
      </div>
      <div className={active === null ? 'aktive skjult' : 'aktive'}>
        {active === null ? (
          <span title="Færre enn tre blir ikkje viste">–</span>
        ) : (
          <>
            <span className="live-dot" aria-hidden="true" />
            {active} no
          </>
        )}
      </div>
      <div className={left !== null && left <= 10 ? 'frist snart' : 'frist'}>
        {left === null
          ? 'Inga frist'
          : left < 0
            ? 'Frist gått ut'
            : left <= 10
              ? `Om ${left} ${left === 1 ? 'dag' : 'dagar'}`
              : longDate(new Date(deadline!))}
      </div>
    </div>
  );
}

export function ClientTrails({ round, clients }: { round: Round; clients: Progress[] }) {
  const large = clients.some((c) => (c.population_snapshot ?? 0) > MAX_DOTS);
  return (
    <section className="kort s12 stigen">
      <div className="kort-hovud">
        <h2>Stigen per kunde</h2>
        <p>
          {large
            ? 'Prikkane står for tilsette (store kundar: éin prikk per gruppe).'
            : 'Éin prikk per tilsett.'}{' '}
          Turgåaren står der svara har kome til.
        </p>
      </div>
      <div className="kort-innhald">
        <div className="fjellbord-hovud" aria-hidden="true">
          <span>Kunde</span>
          <span>Svar</span>
          <span />
          <span>Aktive</span>
          <span>Frist</span>
        </div>
        <div className="fjellbord">
          {round.round_clients.map((rc) => {
            const p = clients.find((c) => c.round_client_id === rc.id);
            return p ? (
              <TrailRow key={rc.id} name={rc.client.name} p={p} deadline={rc.deadline} />
            ) : null;
          })}
        </div>
        <p className="forklaring">
          Aktive økter under 3 blir ikkje viste («–»). Svara per person ligg berre under «Resultat»
          og blir logga når nokon opnar dei. Varde veit kor mange som har svart, ikkje kven: be
          leiaren hos kunden minne på undersøkinga (fana «Utsending»: Påminning).
        </p>
      </div>
    </section>
  );
}
