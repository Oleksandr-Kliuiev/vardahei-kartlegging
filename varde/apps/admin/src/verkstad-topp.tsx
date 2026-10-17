// The workshop's header (2.15): where you are, the version and its base, the save state, undo, the
// language you write in, and the way to publishing; below it the messages that need a decision.
import { Icon } from './icons.js';
import { Seg } from './widgets.js';
import { goTo } from './nav.js';
import { LANG_NAME } from './verkstad-felt.js';
import type { SaveState } from './verkstad-lagring.js';
import type { Lang } from './verkstad-model.js';
import type { EditorVersion } from './survey-models.js';
import { longDate } from './overview.js';

const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;

export function Lagrestatus({
  state,
  onRetry,
  onFix,
}: {
  state: SaveState;
  onRetry: () => void;
  /** Goes to the first thing that stops the save, when the shared validator knows it. */
  onFix?: (() => void) | undefined;
}) {
  return (
    <span className={`vk-lagring ${state.kind}`} role="status">
      <span className="vk-lagring-prikk" aria-hidden="true" />
      {state.kind === 'saved' ? (
        state.at ? (
          `Lagra kl. ${clock(state.at)}`
        ) : (
          'Alt er lagra'
        )
      ) : state.kind === 'waiting' || state.kind === 'saving' ? (
        'Lagrar …'
      ) : state.kind === 'blocked' ? (
        onFix ? (
          <>
            Ikkje lagra ·{' '}
            <button type="button" className="linkbtn" onClick={onFix}>
              Vis kva som manglar
            </button>
          </>
        ) : (
          'Ikkje lagra: rett feilen som er merkt'
        )
      ) : state.kind === 'conflict' ? (
        'Ikkje lagra'
      ) : (
        <>
          Ikkje lagra ·{' '}
          <button type="button" className="linkbtn" onClick={onRetry}>
            Prøv igjen
          </button>
        </>
      )}
    </span>
  );
}

export function Topp(p: {
  title: string;
  saved: EditorVersion;
  readOnly: boolean;
  base: EditorVersion | null;
  save: SaveState;
  onRetry: () => void;
  onFix?: (() => void) | undefined;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  lang: Lang;
  languages: readonly Lang[];
  missing: (lang: Lang) => number;
  onLang: (lang: Lang) => void;
  phone: boolean;
  onPhone: () => void;
  busy: boolean;
  draftNo: number | null;
  nextNo: number;
  left: number;
  onNewDraft: () => void;
  onPanel: () => void;
}) {
  return (
    <header className="vk-topp">
      <div className="vk-tittel">
        <a
          href="/admin/surveys"
          className="vk-smule"
          onClick={(e) => {
            if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            goTo('/admin/surveys');
          }}
        >
          Skjema
        </a>
        <span aria-hidden="true">/</span>
        <h1>{p.title}</h1>
        <span className={p.readOnly ? 'chip ok' : 'chip warn'}>
          {p.readOnly ? `Publisert v${p.saved.version_no}` : `Utkast v${p.saved.version_no}`}
        </span>
        {p.base && !p.readOnly && (
          <span className="vk-dempa vk-base">
            Bygd på v{p.base.version_no}
            {p.base.published_at ? `, publisert ${longDate(new Date(p.base.published_at))}` : ''}
          </span>
        )}
      </div>
      <div className="vk-handlingar">
        {!p.readOnly && <Lagrestatus state={p.save} onRetry={p.onRetry} onFix={p.onFix} />}
        {!p.readOnly && (
          <>
            <button
              type="button"
              className="iconbtn"
              aria-label="Angre (⌘Z)"
              title="Angre (⌘Z)"
              disabled={!p.history.canUndo}
              onClick={p.history.undo}
            >
              <Icon name="angre" small />
            </button>
            <button
              type="button"
              className="iconbtn"
              aria-label="Gjer om (⇧⌘Z)"
              title="Gjer om (⇧⌘Z)"
              disabled={!p.history.canRedo}
              onClick={p.history.redo}
            >
              <Icon name="gjerom" small />
            </button>
          </>
        )}
        {p.languages.length > 1 && (
          <Seg
            label="Språk du skriv på"
            value={p.lang}
            options={p.languages.map((l) => [l, LANG_NAME[l]] as const)}
            onChange={p.onLang}
          />
        )}
        {p.languages
          .filter((l) => l !== 'nn' && p.missing(l) > 0)
          .map((l) => (
            <button
              key={l}
              type="button"
              className="chip warn vk-chipknapp"
              onClick={() => p.onLang(l)}
            >
              {LANG_NAME[l]}: {p.missing(l)} manglar
            </button>
          ))}
        <button
          type="button"
          className="btn sm ghost vk-telefonknapp"
          aria-pressed={p.phone}
          onClick={p.onPhone}
        >
          <Icon name="telefon" small />
          Telefon
        </button>
        {p.readOnly ? (
          <button type="button" className="btn sm primary" disabled={p.busy} onClick={p.onNewDraft}>
            <Icon name="pluss" small />
            {p.draftNo !== null ? `Opne utkastet v${p.draftNo}` : `Lag utkast v${p.nextNo}`}
          </button>
        ) : (
          <button type="button" className="btn sm primary" onClick={p.onPanel}>
            Gjer klar til publisering
            {p.left ? (
              <span className="vk-tal-merke" aria-label={`${p.left} ting att`}>
                {p.left}
              </span>
            ) : (
              <Icon name="hake" small />
            )}
          </button>
        )}
      </div>
    </header>
  );
}

export function Meldingar(p: {
  readOnly: boolean;
  versionNo: number;
  backup: { at: string } | null;
  /** The draft was saved again after the kept work was written. */
  backupOutdated: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  conflict: boolean;
  confirmReload: boolean;
  onReload: () => void;
  onOverwrite: () => void;
}) {
  return (
    <>
      {p.readOnly && (
        <p className="vk-melding">
          <Icon name="las" small />
          <span>v{p.versionNo} er publisert og låst. Rundar som brukar han, endrar seg ikkje.</span>
        </p>
      )}
      {p.backup && (
        <div className="vk-melding vk-varsel" role="status">
          <Icon name="info" small />
          <span>
            Det finst ulagra endringar frå {longDate(new Date(p.backup.at))} i denne nettlesaren.
            {p.backupOutdated &&
              ' Utkastet er lagra på nytt sidan då; du får velje før noko blir skrive over.'}
          </span>
          <button type="button" className="btn sm" onClick={p.onRestore}>
            Hent dei inn
          </button>
          <button type="button" className="btn sm ghost" onClick={p.onDiscard}>
            Forkast
          </button>
        </div>
      )}
      {p.conflict && (
        <div className="vk-melding vk-feilmelding" role="alert">
          <Icon name="varsel" small />
          <span>
            Utkastet er endra ein annan stad sidan du opna det. Endringane dine her er ikkje lagra,
            men dei er ikkje borte.
          </span>
          <button type="button" className="btn sm" onClick={p.onReload}>
            {p.confirmReload
              ? 'Klikk igjen: endringane dine her blir borte'
              : 'Hent det lagra utkastet'}
          </button>
          <button type="button" className="btn sm ghost" onClick={p.onOverwrite}>
            Lagre mine over
          </button>
        </div>
      )}
    </>
  );
}
