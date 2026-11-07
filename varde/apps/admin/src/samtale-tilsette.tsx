// «Leiar vs tilsette» (2.22c, decision of Oleksandr 07.11): beside the leader's answer, how the client's
// own employees answered the paired question in its latest released tryggleik survey — the numbers of
// the admin dashboard for that client, groups under 3 hidden. A muted line under «Kva seier kunden?»;
// the question the employees got and the survey the numbers come from open under it. Nothing at all
// when the client has no released survey or the question has no pair.
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { longDate } from './samtale-models.js';
import './samtale-tilsette.css';

interface Question {
  id: string;
  /** The short name of the question in the dashboard, the question itself, several answers or one. */
  label: string;
  text: string;
  multi: boolean;
}
export type TilsetteLinje =
  | (Question & { suppressed: true })
  | (Question & {
      suppressed: false;
      n: number;
      options: { id: string; label: string; count: number }[];
    });
export interface Runde {
  id: string;
  name: string;
  closed_on: string | null;
  /** The survey closed after the day of the conversation (the newest is shown all the same). */
  after_conversation: boolean;
}
export interface TilsetteSvar {
  round: Runde | null;
  questions: { question: string; employees: TilsetteLinje[] }[];
}

/** The employees' lines of one conversation; a released survey changes seldom. */
export const useTilsette = (interview: string) =>
  useQuery({
    queryKey: ['samtalar', 'tilsette', interview],
    queryFn: () => api<TilsetteSvar>(`/api/admin/interviews/${interview}/employees`),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

/** The dot between parts, kept on the part before it when the line breaks. */
const DOT = '\u00a0· ';

/** A share as the dashboard rounds it (`percent(count / n)` in dashboard-models.ts: the same
 * expression, so floating point rounds both alike), «58 %», with a space that keeps the sign on the
 * number. */
export const share = (count: number, n: number) => `${Math.round((count / n) * 100)}\u00a0%`;

/** «Ja 58 % · Nei 33 % · Usikker 8 %» in the template's words, or why there are no numbers. A long
 * label wraps at its own spaces; its last word stays with the number. */
export function tilsetteTal(line: TilsetteLinje): string[] {
  if (line.suppressed || line.n < 1) return ['For få svar til å vise'];
  return line.options.map((o) => `${o.label}\u00a0${share(o.count, line.n)}`);
}

/** «Tilsette · Brukar MFA (12 svar):» */
export const tilsetteKven = (line: TilsetteLinje) =>
  line.suppressed || line.n < 1 ? `${line.label}:` : `${line.label} (${line.n} svar):`;

/** «Frå «Runde 2 IT-tryggleik», avslutta 31. oktober.», with «etter samtalen» when it closed later. */
export const kjelde = (round: Runde) =>
  `Frå «${round.name}»${round.closed_on ? `, avslutta ${longDate(round.closed_on)}` : ''}${
    round.after_conversation ? ', etter samtalen' : ''
  }.`;

/** The lines of one question; each opens to the question the employees got and where it is from. */
export function Linjer({ lines, round }: { lines: readonly TilsetteLinje[]; round: Runde }) {
  return (
    <div className="sm-tl" role="group" aria-label="Svar frå dei tilsette">
      {lines.map((line) => (
        <details key={line.id} className="sm-tl-linje">
          <summary>
            <Icon name="folk" small />
            <span>
              <b>Tilsette</b>
              <span aria-hidden="true">{DOT}</span>
              <span className="sr-only">, </span>
              {tilsetteKven(line)}{' '}
              {tilsetteTal(line).map((part, i) => (
                <span key={i}>
                  {i > 0 && (
                    <>
                      <span aria-hidden="true">{DOT}</span>
                      <span className="sr-only">, </span>
                    </>
                  )}
                  {part}
                </span>
              ))}
            </span>
            <Icon name="chev" small />
          </summary>
          <div className="sm-tl-kjelde">
            <p>
              Spørsmålet til dei tilsette: «{line.text}»
              {line.multi && ' Dei kunne velje fleire svar, så delane kan bli meir enn 100 %.'}
            </p>
            <p>
              {kjelde(round)} Same tal som under «Resultat» i runden. Grupper med færre enn 3 svar
              blir ikkje viste.
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}

/** Under the leader's answer in the conversation: the lines of this question, or nothing. */
export function TilsetteLinjer({ interview, question }: { interview: string; question: string }) {
  const { data } = useTilsette(interview);
  const lines = data?.questions.find((q) => q.question === question)?.employees;
  return data?.round && lines?.length ? <Linjer lines={lines} round={data.round} /> : null;
}
