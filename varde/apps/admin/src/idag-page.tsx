// «I dag» (2.17): what waits for you now — deadlines that come close, drafts with what is left before
// publishing, reports that are ready, rounds not opened yet, contacts for the yearly check — the
// place to continue in the workshop, and the open rounds with a short trail per client.
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { lastPlace, placeName, sidan } from './hald-fram.js';
import { Icon, type IconName } from './icons.js';
import type { Progress, Round } from './models.js';
import { follow } from './nav.js';
import { daysTo, Ingress, longDate } from './overview.js';
import { progressQuery } from './progress-page.js';
import { ErrorMessage, useRounds } from './queries.js';
import type { SeminarList } from './seminar-models.js';
import type { SurveySummary } from './survey-models.js';

export interface Ting {
  key: string;
  /** Where the work is done; no link for what is done outside Varde. */
  to?: string;
  tone: 'warn' | 'ok' | '';
  icon: IconName;
  title: string;
  text: string;
}
interface Reminder {
  delete_by: string;
  overdue: boolean;
}
const kundar = (n: number) => `${n} ${n === 1 ? 'kunde' : 'kundar'}`;
const DAYS_AHEAD = 7;
const REPORT_DAYS = 30;

function deadlineTitle(name: string, d: number) {
  if (d < 0) return `${name}: fristen gjekk ut for ${-d} ${d === -1 ? 'dag' : 'dagar'} sidan`;
  if (d === 0) return `${name}: fristen er i dag`;
  return `${name}: fristen er ${d === 1 ? 'i morgon' : `om ${d} dagar`}`;
}

/** Everything that waits, in the order to do it: overdue and close deadlines first. */
export function todos(input: {
  rounds: Round[];
  progress: ReadonlyMap<string, Progress>;
  surveys: SurveySummary[];
  contacts: number;
  reminder: Reminder | null;
  now?: number;
}): Ting[] {
  const now = input.now ?? Date.now();
  const out: Ting[] = [];
  if (input.reminder)
    out.push({
      key: 'arkiv',
      tone: 'warn',
      icon: 'varsel',
      title: 'Arkivet frå kartlegging',
      text: `${input.reminder.overdue ? 'Fristen har gått ut.' : 'Fristen nærmar seg.'} Slett arkivet seinast ${input.reminder.delete_by}. Stadfest slettinga med Vardahei IT.`,
    });
  const deadlines: { d: number; t: Ting }[] = [];
  for (const r of input.rounds.filter((x) => x.status === 'open'))
    for (const rc of r.round_clients) {
      const d = daysTo(rc.deadline, now);
      if (rc.status !== 'open' || d === null || d > DAYS_AHEAD) continue;
      const n = input.progress.get(rc.id)?.responses_total ?? 0,
        pop = rc.population_snapshot;
      if (pop !== null && n >= pop) continue;
      const answered = pop === null ? `${n} svar så langt.` : `${n} av ${pop} har svart.`;
      const reminded = rc.reminder_sent_at
        ? ` Påminning sendt ${longDate(new Date(rc.reminder_sent_at))}.`
        : '';
      deadlines.push({
        d,
        t: {
          key: `frist:${rc.id}`,
          to: `/admin/rounds/${r.id}/utsending?kunde=${rc.id}`,
          tone: 'warn',
          icon: 'flagg',
          title: deadlineTitle(rc.client.name, d),
          text:
            d < 0
              ? `${answered}${reminded} Steng for svar eller flytt fristen.`
              : rc.reminder_sent_at
                ? `${answered}${reminded}`
                : `${answered} Hent påminning og send ho til leiaren.`,
        },
      });
    }
  out.push(...deadlines.sort((a, b) => a.d - b.d).map((x) => x.t));
  for (const r of input.rounds) {
    const closed = r.closed_at ? (now - new Date(r.closed_at).getTime()) / 86_400_000 : 0;
    // Until it is marked as sent (2.18).
    const ready = r.round_clients.filter((rc) => rc.released && !rc.report_sent_at);
    // Imported history (1.4c) has no report to send; a report is news for a month after closing.
    if (
      r.type === 'external_import' ||
      !['closed', 'archived'].includes(r.status) ||
      !ready.length ||
      closed > REPORT_DAYS
    )
      continue;
    const one = ready.length === 1 ? ready[0]! : null;
    out.push({
      key: `rapport:${r.id}`,
      to: `/admin/rounds/${r.id}/rapportar${one ? `/${one.id}` : ''}`,
      tone: 'ok',
      icon: 'dok',
      title: one
        ? `Rapporten til ${one.client.name} er klar`
        : `Rapportane frå «${r.name}» er klare`,
      text: one
        ? `«${r.name}» er avslutta. Les gjennom rapporten og send han.`
        : `${kundar(ready.length)} ventar. Les gjennom kvar rapport og send han.`,
    });
  }
  for (const s of input.surveys)
    if (s.draft)
      out.push({
        key: `utkast:${s.draft.id}`,
        to: `/admin/surveys/${s.draft.id}`,
        tone: s.draft.left ? 'warn' : 'ok',
        icon: 'skjema',
        title: `Utkast v${s.draft.version_no} av «${s.title ?? s.key}»`,
        text: s.draft.left ? `${s.draft.left} ting att før publisering.` : 'Klar til publisering.',
      });
  for (const r of input.rounds.filter((x) => x.status === 'draft'))
    out.push({
      key: `runde:${r.id}`,
      to: `/admin/rounds/${r.id}/utsending`,
      tone: '',
      icon: 'flagg',
      title: `«${r.name}» er ikkje opna enno`,
      text: r.round_clients.length
        ? `${kundar(r.round_clients.length)} er med. Opne for svar når invitasjonen er klar.`
        : 'Legg til kundar og opne for svar.',
    });
  if (input.contacts > 0)
    out.push({
      key: 'kontaktar',
      to: '/admin/personvern/kontaktar',
      tone: '',
      icon: 'skjold',
      title: `${input.contacts === 1 ? 'Éin kontakt ventar' : `${input.contacts} kontaktar ventar`} på den årlege sjekken`,
      text: 'Personvern · Kontaktar',
    });
  return out;
}

function TingRad({ t }: { t: Ting }) {
  const body = (
    <>
      <span className={`ting-ikon ${t.tone}`} aria-hidden="true">
        <Icon name={t.icon} small />
      </span>
      <span className="ting-tekst">
        <b>{t.title}</b>
        <small>{t.text}</small>
      </span>
      {t.to && (
        <span className="ting-gaa" aria-hidden="true">
          <Icon name="chev" small />
        </span>
      )}
    </>
  );
  return t.to ? (
    <a className="ting" href={t.to} onClick={(e) => follow(e, t.to!)}>
      {body}
    </a>
  ) : (
    <div className="ting">{body}</div>
  );
}

/** A short trail: one stone per employee (or per group on large clients), filled as answers come. */
function MiniStig({ n, pop }: { n: number; pop: number | null }) {
  const stones = Math.min(24, pop ?? 24),
    per = pop ? pop / stones : 1,
    on = Math.min(stones, Math.floor(n / per));
  return (
    <span className="mini-stig" aria-hidden="true">
      {Array.from({ length: stones }, (_, i) => (
        <i
          key={i}
          className={i < on ? 'on' : undefined}
          style={{
            left: `${(stones === 1 ? 50 : (100 * i) / (stones - 1)).toFixed(1)}%`,
            top: `${(14 - (10 * i) / Math.max(1, stones - 1)).toFixed(1)}px`,
          }}
        />
      ))}
    </span>
  );
}

function OpenRound({ round, progress }: { round: Round; progress: Progress[] | undefined }) {
  const to = `/admin/rounds/${round.id}`;
  return (
    <section className="kort idag-runde" aria-label={round.name}>
      <div className="kort-hovud">
        <h2>{round.name}</h2>
        <span className="chip ok">Open</span>
      </div>
      <div className="kort-innhald">
        <ul className="mini-stigar">
          {round.round_clients.map((rc) => {
            const n = progress?.find((p) => p.round_client_id === rc.id)?.responses_total ?? 0;
            return (
              <li key={rc.id}>
                <b>{rc.client.name}</b>
                <MiniStig n={n} pop={rc.population_snapshot} />
                <span>
                  {n}
                  {rc.population_snapshot !== null && ` av ${rc.population_snapshot}`}
                </span>
              </li>
            );
          })}
        </ul>
        <a className="lenkje" href={to} onClick={(e) => follow(e, to)}>
          Opne runden
          <Icon name="pil" small />
        </a>
      </div>
    </section>
  );
}

function HaldFram() {
  const s = lastPlace();
  if (!s) return null;
  const to = `/admin/surveys/${s.id}`;
  return (
    <section className="kort idag-hald" aria-labelledby="idag-hald">
      <div className="kort-hovud">
        <h2 id="idag-hald">Hald fram</h2>
      </div>
      <div className="kort-innhald">
        <TingRad
          t={{
            key: 'hald',
            to,
            tone: '',
            icon: 'skjema',
            title: s.title || 'Skjemaet du arbeidde med',
            text: `Du var på ${placeName(s.node)} ${sidan(s.at)}.`,
          }}
        />
      </div>
    </section>
  );
}

export function IdagPage() {
  const rounds = useRounds();
  const surveys = useQuery({
    queryKey: ['surveys'],
    queryFn: () => api<SurveySummary[]>('/api/admin/surveys'),
  });
  const seminars = useQuery({
    queryKey: ['seminars', 'list'],
    queryFn: () => api<SeminarList>('/api/admin/seminars'),
  });
  const reminder = useQuery({
    queryKey: ['archive-reminder'],
    queryFn: () => api<Reminder | null>('/api/admin/cutover/reminder'),
  });
  const open = (rounds.data ?? []).filter((r) => r.status === 'open');
  const progress = useQueries({ queries: open.map((r) => progressQuery(r.id)) });
  const byClient = new Map(
    progress.flatMap((p) => p.data?.clients ?? []).map((p) => [p.round_client_id, p]),
  );
  const name = useQueryClient().getQueryData<{ name: string | null }>(['session'])?.name ?? null;
  const loaded = rounds.data && surveys.data;
  const items = loaded
    ? todos({
        rounds: rounds.data ?? [],
        progress: byClient,
        surveys: Array.isArray(surveys.data) ? surveys.data : [],
        contacts: seminars.data?.contacts_to_review ?? 0,
        reminder: typeof reminder.data?.delete_by === 'string' ? reminder.data : null,
      })
    : [];
  return (
    <>
      <Ingress
        name={name}
        text={
          !loaded
            ? 'Hentar det som ventar …'
            : items.length
              ? 'Dette ventar på deg.'
              : 'Ingenting ventar på deg no.'
        }
      />
      <ErrorMessage error={rounds.error ?? surveys.error} />
      <div className="flate idag">
        <section className="kort s7 idag-ventar" aria-labelledby="idag-ventar">
          <div className="kort-hovud">
            <h2 id="idag-ventar">Ventar på deg</h2>
            {loaded && <span className="idag-tal">{items.length} ting</span>}
          </div>
          <div className="kort-innhald">
            {loaded && items.length === 0 && (
              <p className="tom">
                Ingen fristar, utkast eller rapportar ventar. Nye ting dukkar opp her.
              </p>
            )}
            <ul className="ting-liste">
              {items.map((t) => (
                <li key={t.key}>
                  <TingRad t={t} />
                </li>
              ))}
            </ul>
          </div>
        </section>
        <div className="s5 idag-side">
          <HaldFram />
          {open.map((r, i) => (
            <OpenRound key={r.id} round={r} progress={progress[i]?.data?.clients} />
          ))}
          {rounds.data && open.length === 0 && (
            <section className="kort idag-runde">
              <div className="kort-hovud">
                <h2>Opne rundar</h2>
              </div>
              <div className="kort-innhald">
                <p className="idag-ingen">Ingen rundar er opne no.</p>
                <a
                  className="lenkje"
                  href="/admin/rounds?ny=1"
                  onClick={(e) => follow(e, '/admin/rounds?ny=1')}
                >
                  Start ein runde
                  <Icon name="pil" small />
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
