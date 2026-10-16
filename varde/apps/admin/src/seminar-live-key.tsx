// The presenter key of a seminar (3.4, ADR-008): «Lag lenkje til storskjermen» makes a key and shows
// its link once (Varde keeps only a hash of it). It works from the day before to the day after the
// seminar, also when Entra is down; «Trekk tilbake» stops it at once. A new link replaces the old.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import type { IssuedKey, LivePanel } from './seminar-live-models.js';
import { copy, shortDate } from './seminar-models.js';
import { useToast } from './shell.js';

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A button that asks once more before it acts (6 s to confirm). */
function TwoStep({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? 'btn sm danger' : 'btn sm ghost'}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function PresenterKey({
  seminar,
  presenter,
}: {
  seminar: string;
  presenter: LivePanel['presenter'];
}) {
  const toast = useToast();
  const queries = useQueryClient();
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await queries.invalidateQueries({ queryKey: ['live', seminar] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Noko gjekk gale.'));
    } finally {
      setBusy(false);
    }
  };
  const issue = () =>
    run(async () => {
      setIssued(await mutate<IssuedKey>(`/api/admin/seminars/${seminar}/presenter`));
    });
  const revoke = () =>
    run(async () => {
      await mutate(`/api/admin/seminars/${seminar}/presenter`, 'DELETE');
      setIssued(null);
      toast('Nøkkelen er trekt tilbake');
    });
  const active = presenter.active;
  return (
    <section className="kort s7 live-nokkel" aria-labelledby="nokkel-tittel">
      <div className="kort-hovud">
        <h2 id="nokkel-tittel">
          <Icon name="skjerm" small />
          Nøkkel til storskjermen
        </h2>
        {active && (
          <span className={presenter.valid_now ? 'chip ok' : 'chip'}>
            {presenter.valid_now ? 'Verkar no' : 'Verkar ikkje no'}
          </span>
        )}
      </div>
      <div className="kort-innhald">
        {issued ? (
          <div className="live-ny-nokkel" role="status">
            <p>
              <b>Lenkja blir vist berre no.</b> Opne ho på maskina som er kopla til storskjermen,
              eller send ho til den som skal styre spørsmåla. Ho gjeld {issued.valid_text}.
            </p>
            <div className="sem-lenkje">
              <code data-testid="storskjerm-lenkje">{issued.link}</code>
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(issued.link, toast, 'Lenkja er kopiert')}
              >
                <Icon name="kopi" small />
                Kopier
              </button>
              <a
                className="btn sm primary"
                href={issued.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Opne storskjermen
              </a>
            </div>
          </div>
        ) : active ? (
          <p>
            Ein nøkkel er laga {shortDate(active.issued_at)} kl.{' '}
            {TIME.format(new Date(active.issued_at)).replace(':', '.')}. Han gjeld{' '}
            {presenter.valid_text}. Lenkja kan ikkje visast igjen: lag ei ny om du treng ho.
          </p>
        ) : (
          <p>
            Ei eiga lenkje opnar storskjermen og styrer spørsmåla utan innlogging. Ho gjeld{' '}
            {presenter.valid_text}.
          </p>
        )}
        <div className="handlingar live-nokkel-knappar">
          {!active && !issued && (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void issue()}
            >
              Lag lenkje til storskjermen
            </button>
          )}
          {(active || issued) && (
            <>
              <TwoStep
                label="Lag ny lenkje"
                confirmLabel="Stadfest: ny lenkje"
                disabled={busy}
                onConfirm={() => void issue()}
              />
              <TwoStep
                label="Trekk tilbake"
                confirmLabel="Stadfest: trekk tilbake"
                disabled={busy}
                onConfirm={() => void revoke()}
              />
            </>
          )}
        </div>
        <ErrorMessage error={error} />
      </div>
    </section>
  );
}
