// The pages of the admin by address (2.17, decision 1 of 17.10): five places for the work and two
// below, each round and client with its own page, so nothing asks for the round or the client again.
// Addresses from before 2.17 lead to their new place without a new history entry.
import { useEffect, type ReactNode } from 'react';
import { FindingsPage } from './funn-page.js';
import { IdagPage } from './idag-page.js';
import { KundarPage } from './kundar-page.js';
import { KundePage } from './kunde-page.js';
import { replaceTo } from './nav.js';
import { PERSONVERN, PersonvernPage, personvernTab } from './personvern-page.js';
import { useRounds } from './queries.js';
import { RundarPage } from './rundar-page.js';
import { RundePage } from './runde-page.js';
import { SeminarPage } from './seminar-page.js';
import { SettingsPage } from './settings-page.js';
import { sectionOf } from './shell.js';
import { SurveysPage } from './surveys-page.js';
import { VerkstadPage } from './verkstad-page.js';
import { Faner } from './widgets.js';

export interface Page {
  element: ReactNode;
  /** The shell writes this heading; the page of one round, client or survey writes its own.
   * `doc` names the view in the tab title when one heading has several views. */
  heading: { title: string; intro?: string | undefined; doc?: string } | null;
  /** The workshop: wider than the reading width of other pages. */
  wide?: boolean;
}

const ID = '([0-9a-f-]{36})';
const match = (path: string, pattern: string) => new RegExp(`^${pattern}$`, 'i').exec(path);

/** Where an address from before 2.17 leads now, when the new place is known without data. */
export function moved(path: string, search: string): string | null {
  const q = new URLSearchParams(search);
  const rule = q.get('rule');
  if (path === '/admin/findings')
    return `/admin/surveys/funn${rule ? `?rule=${encodeURIComponent(rule)}` : ''}`;
  if (path === '/admin/export') return '/admin/personvern/eksport';
  if (path === '/admin/deletion') return '/admin/personvern/sletting';
  const round = q.get('round');
  if (path === '/admin/dashboard' && round && /^[0-9a-f-]{36}$/i.test(round))
    return `/admin/rounds/${round}/resultat`;
  return null;
}

/** Swaps the address once the place is known; until then the page says where it goes. */
function Flytt({ to }: { to: string | null }) {
  useEffect(() => {
    if (to) replaceTo(to);
  }, [to]);
  return (
    <section className="del">
      <p role="status">Opnar den nye staden for sida …</p>
    </section>
  );
}

/** «Dashbord» and «Rapportar» lived outside the rounds; they now open on the round they show. */
function FlyttRunde({ kind, rc }: { kind: 'resultat' | 'rapportar'; rc?: string | undefined }) {
  const rounds = useRounds();
  const list = rounds.data;
  let to: string | null = null;
  if (list) {
    const round =
      kind === 'resultat'
        ? (list.find((r) => r.has_data) ?? list.find((r) => r.status === 'open') ?? list[0])
        : rc
          ? list.find((r) => r.round_clients.some((c) => c.id === rc))
          : list.find(
              (r) =>
                ['closed', 'archived'].includes(r.status) &&
                r.round_clients.some((c) => c.released),
            );
    to = round
      ? `/admin/rounds/${round.id}/${kind}${rc && round.round_clients.some((c) => c.id === rc) ? `/${rc}` : ''}`
      : '/admin/rounds';
  }
  if (rounds.error) to = '/admin/rounds';
  return <Flytt to={to} />;
}

const SKJEMA_FANER = [
  ['/admin/surveys', 'Skjema'],
  ['/admin/surveys/funn', 'Funn-reglar'],
] as const;

/** The page of an address, or a pointer to where it moved. */
export function resolve(path: string, search: string): Page {
  const section = sectionOf(path);
  const heading = section
    ? { title: section.title ?? section.label, intro: section.intro }
    : { title: 'Sida finst ikkje' };
  const page = (element: ReactNode, own?: Page['heading']): Page => ({
    element,
    heading: own === undefined ? heading : own,
  });
  const to = moved(path, search);
  if (to) return page(<Flytt to={to} />, { title: 'Flyttar …' });
  if (path === '/admin/dashboard')
    return page(<FlyttRunde kind="resultat" />, { title: 'Flyttar …' });
  const report = match(path, `/admin/reports(?:/${ID})?`);
  if (report) return page(<FlyttRunde kind="rapportar" rc={report[1]} />, { title: 'Flyttar …' });
  if (path === '/admin') return page(<IdagPage />);
  if (path === '/admin/surveys')
    return page(
      <>
        <Faner label="Skjema" items={SKJEMA_FANER} current={path} />
        <SurveysPage />
      </>,
    );
  if (path === '/admin/surveys/funn')
    return page(
      <>
        <Faner label="Skjema" items={SKJEMA_FANER} current={path} />
        <FindingsPage />
      </>,
      { title: 'Funn-reglar' },
    );
  const workshop = match(path, `/admin/surveys/${ID}`);
  if (workshop)
    return {
      element: <VerkstadPage key={workshop[1]} id={workshop[1]!} />,
      heading: null,
      wide: true,
    };
  if (path === '/admin/rounds') return page(<RundarPage key={search} />);
  const round = match(path, `/admin/rounds/${ID}(?:/([a-z]+)(?:/${ID})?)?`);
  if (round)
    return page(
      <RundePage key={round[1]} id={round[1]!} tab={round[2]} rc={round[3]} search={search} />,
      null,
    );
  if (path === '/admin/clients') return page(<KundarPage />);
  const client = match(path, `/admin/clients/${ID}`);
  if (client) return page(<KundePage key={client[1]} id={client[1]!} search={search} />, null);
  const seminar = match(path, `/admin/seminars(?:/${ID})?`);
  // One seminar has its own heading and tab title, the topic, as a round and a client have.
  if (seminar) return page(<SeminarPage id={seminar[1]} />, seminar[1] ? null : undefined);
  const personvern = match(path, '/admin/personvern(?:/([a-z]+))?');
  if (personvern) {
    const tab = personvernTab(personvern[1]);
    const label = PERSONVERN.find(([k]) => k === tab)![1];
    return page(<PersonvernPage tab={tab} />, { ...heading, doc: `${label} · Personvern` });
  }
  if (path === '/admin/settings') return page(<SettingsPage />);
  return page(
    <section className="del">
      <p>Vel ein del i menyen.</p>
    </section>,
    { title: 'Sida finst ikkje' },
  );
}
