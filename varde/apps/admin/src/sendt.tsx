// What went out by hand (2.18): Varde sends nothing, so the admin marks the invitation, the last
// reminder and the report as sent, with the date. A mark can be taken back; a new reminder moves it.
import { mutate } from './api.js';
import { Icon } from './icons.js';
import type { RoundClient } from './models.js';
import { longDate } from './overview.js';
import { ErrorMessage, useAction } from './queries.js';
import './verkstad-meir.css';

export type Sendt = 'invitation' | 'reminder' | 'report';
const NAME: Record<Sendt, [string, string]> = {
  invitation: ['Invitasjon', 'invitasjonen'],
  reminder: ['Påminning', 'påminninga'],
  report: ['Rapport', 'rapporten'],
};
export const sentAt = (rc: RoundClient, kind: Sendt) =>
  kind === 'invitation'
    ? rc.invitation_sent_at
    : kind === 'reminder'
      ? rc.reminder_sent_at
      : rc.report_sent_at;

/** One row per kind: sent with its date, or a button that marks it. */
export function SendtListe({ rc, kinds }: { rc: RoundClient; kinds: readonly Sendt[] }) {
  const action = useAction();
  const mark = (kind: Sendt, sent: boolean) =>
    action.mutate(() => mutate(`/api/admin/round-clients/${rc.id}/sent`, 'PUT', { kind, sent }));
  return (
    <div className="sendt-liste">
      {kinds.map((kind) => {
        const at = sentAt(rc, kind);
        const [title, word] = NAME[kind];
        return (
          <div key={kind} className="sendt-rad">
            <span className="sendt-namn">{title}</span>
            {at ? (
              <span className="sendt-ja">
                <Icon name="hake" small />
                Sendt {longDate(new Date(at))}
              </span>
            ) : (
              <span className="sendt-nei">Ikkje merkt</span>
            )}
            <span className="sendt-val">
              {(!at || kind === 'reminder') && (
                <button
                  type="button"
                  className="linkbtn"
                  disabled={action.isPending}
                  aria-label={`Merk ${at ? 'ny ' : ''}${word} til ${rc.client.name} som sendt`}
                  onClick={() => mark(kind, true)}
                >
                  {at ? 'Ny sendt' : 'Merk som sendt'}
                </button>
              )}
              {at && (
                <button
                  type="button"
                  className="linkbtn"
                  disabled={action.isPending}
                  aria-label={`Angre at ${word} til ${rc.client.name} er sendt`}
                  onClick={() => mark(kind, false)}
                >
                  Angre
                </button>
              )}
            </span>
          </div>
        );
      })}
      <ErrorMessage error={action.error} />
    </div>
  );
}
