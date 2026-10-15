// Frame around every runner screen: logo and language at the top, the landscape under, and the action bar at the bottom.
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import type { Lang } from '@varde/schema/template/texts';
import { ui } from './i18n/ui.js';
import { Icon } from './icons.js';
import type { Landscape } from './landscape/landscape.js';
import { LandscapeView } from './landscape/view.js';
import logo from './logo.png';
import { useFlip } from './motion-hooks.js';

const NAMES: Record<Lang, string> = { nn: 'Nynorsk', nb: 'Bokmål', en: 'English' };

export function Shell({
  lang,
  languages,
  setLang,
  locked,
  badge,
  onLand,
  children,
}: {
  lang: Lang;
  languages?: readonly Lang[];
  setLang?: (l: Lang) => void;
  locked?: boolean;
  badge?: string;
  onLand: (land: Landscape | null) => void;
  children: ComponentChildren;
}) {
  return (
    <>
      <header class="topbar">
        <span class="logo-plate">
          <img class="logo" src={logo} alt="Vardahei IT" width={120} height={24} />
        </span>
        {badge && <span class="chip warn">{badge}</span>}
        {languages && languages.length > 1 && setLang && (
          <div class="seg sprak" role="group" aria-label={ui(lang, 'sprak')}>
            {languages.map((l) => (
              <button
                type="button"
                id={`sprak-${l}`}
                disabled={locked}
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
              >
                {NAMES[l]}
              </button>
            ))}
          </div>
        )}
      </header>
      <LandscapeView onReady={onLand} />
      {children}
    </>
  );
}

export interface BarButton {
  id: string;
  label: string;
  kind: 'back' | 'skip' | 'next';
  disabled?: boolean;
  busy?: boolean;
  full?: boolean;
  onClick: () => void;
}

/** Bottom bar: Back, Skip, Next. Buttons glide (FLIP) when the set changes; Next wakes up when it becomes possible. */
export function ActionBar({
  buttons,
  hidden,
  lang,
}: {
  buttons: BarButton[];
  hidden: boolean;
  lang: Lang;
}) {
  const root = useRef<HTMLElement>(null);
  useFlip(root, buttons.map((b) => b.id).join('|'));
  return (
    <nav
      class="handling"
      ref={root}
      aria-label={ui(lang, 'navigasjon')}
      data-skjult={hidden ? 'true' : 'false'}
    >
      <div class="handling-inn">
        {buttons.map((b) =>
          b.kind === 'back' ? (
            <button
              type="button"
              class="btn ghost tilbake"
              id={b.id}
              data-flip={b.id}
              aria-label={b.label}
              disabled={b.disabled}
              onClick={b.onClick}
            >
              <Icon name="bak" small />
              <span class="lbl">{b.label}</span>
            </button>
          ) : b.kind === 'skip' ? (
            <button
              type="button"
              class="linkbtn"
              id={b.id}
              data-flip={b.id}
              disabled={b.disabled}
              onClick={b.onClick}
            >
              {b.label}
            </button>
          ) : (
            <button
              type="button"
              class={`btn primary neste${b.full ? ' full' : ''}`}
              id={b.id}
              data-flip={b.id}
              disabled={b.disabled}
              aria-busy={b.busy ? 'true' : undefined}
              onClick={b.onClick}
            >
              {b.busy && <span class="spinn" aria-hidden="true" />}
              <span class="lbl">{b.label}</span>
              {!b.busy && <Icon name="fram" small />}
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
