// The big screen (3.5, Vardestien «Storskjerm»): the open question with «N har svart», a closed
// one waiting to be shown, or the shown result as bars that grow in one after the other. The QR code
// and the link to the phones stay on the side. Numbers come only from the snapshot, which carries
// only what privacy let through: below k = 3 a shown question says «For få svar til å vise tal».
// Reduced motion: the bars and numbers stand at their values at once.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { animate, countTo, ease, ms, reduced } from '@varde/ui/motion';
import type { LiveResult, LiveSnapshot } from './api.js';
import { pick, st, type ScreenLang } from './texts.js';

const percent = (share: number) => `${Math.round(share * 100)} %`;
/** One bar grows in this long (ms, scaled by the motion setting); the next starts 90 ms later. */
const BAR_MS = 760;

/** A server-made QR code (an SVG of squares only); anything else is not drawn. */
function Qr({ svg }: { svg: string }) {
  if (!/^<svg [^<]*><rect [^<]*\/><path d="[Mhvz0-9,-]*" fill="#000"\/><\/svg>$/.test(svg))
    return null;
  // Checked above: the squares of a QR code, no text and no script.
  return <div class="qr-kode" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Rolls to the new count when it grows (the hall sees answers come in). */
function Count({ n }: { n: number }) {
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (el.current) void countTo(el.current, n, { duration: 500 });
  }, [n]);
  return <b class="tal tnum" ref={el} />;
}

/** Bars of a shown result; they grow once per question, then stand still on new snapshots. */
function Bars({
  result,
  options,
  lang,
  motionKey,
}: {
  result: Extract<LiveResult, { suppressed: false }>;
  options: { id: string; text: { nn: string; en?: string } }[];
  lang: ScreenLang;
  motionKey: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rows = [...(root.current?.querySelectorAll<HTMLElement>('.rad') ?? [])];
    const timers: ReturnType<typeof setTimeout>[] = [];
    rows.forEach((row, i) => {
      const bar = row.querySelector<HTMLElement>('.stolpe i');
      const num = row.querySelector<HTMLElement>('.prosent');
      const share = Number(row.dataset['share'] ?? 0);
      const delay = 120 + i * 90;
      void animate(bar, [{ transform: 'scaleX(0)' }, { transform: `scaleX(${share})` }], {
        duration: BAR_MS,
        delay,
        easing: ease.fjor,
        fill: 'backwards',
      });
      if (!num) return;
      // Reduced motion: the number stands at its value at once, as the bar does.
      num.textContent = percent(reduced() ? share : 0);
      num.dataset['value'] = String(reduced() ? Math.round(share * 100) : 0);
      // The number follows its bar: same start, length and curve; the spring's overshoot is not shown.
      const value = Math.round(share * 100);
      if (!reduced())
        timers.push(
          setTimeout(
            () =>
              void countTo(num, value, {
                duration: BAR_MS,
                easing: 'fjor',
                format: (v) => `${Math.min(value, Math.max(0, Math.round(v)))} %`,
              }),
            ms(delay),
          ),
        );
    });
    return () => timers.forEach(clearTimeout);
  }, [motionKey]);
  return (
    <div class="stolpar" ref={root}>
      {result.options.map((o) => {
        const label = pick(options.find((x) => x.id === o.id)?.text, lang);
        return (
          <div class="rad" key={o.id} data-share={o.share}>
            <span class="etikett">{label}</span>
            <span class="stolpe" aria-hidden="true">
              <i style={{ transform: `scaleX(${o.share})` }} />
            </span>
            {/* Written by the motion (countTo), not by Preact: no re-render fights over the number. */}
            <b class="prosent tnum" aria-label={`${label}: ${percent(o.share)}`} />
          </div>
        );
      })}
    </div>
  );
}

export function BigScreen({ snapshot, lang }: { snapshot: LiveSnapshot; lang: ScreenLang }) {
  const c = snapshot.current;
  const state = c?.state;
  const shown = c?.result;
  return (
    <section class="storskjerm" aria-label={st(lang, 'tittel')} data-state={state ?? 'none'}>
      <div class="hovud">
        {c ? (
          <>
            <div class="topp-linje">
              <span class="eyebrow">{st(lang, 'sporsmal', { i: c.no, n: snapshot.total })}</span>
              <span class={`chip tilstand ${state}`}>
                {state === 'open' && <span class="live-dot" />}
                {st(
                  lang,
                  state === 'open'
                    ? 'ope'
                    : state === 'closed'
                      ? 'stengt'
                      : state === 'released'
                        ? 'vist'
                        : 'ventar',
                )}
              </span>
            </div>
            <h1 class="sporsmal-tekst">{pick(c.text, lang)}</h1>
            {(state === 'open' || state === 'closed') && c.answered && (
              <p class="svart" role="status" aria-live="polite">
                {c.answered.suppressed ? (
                  <span class="faerre">{st(lang, 'faerre')}</span>
                ) : (
                  <>
                    <Count n={c.answered.n} /> <span>{st(lang, 'harSvart')}</span>
                  </>
                )}
              </p>
            )}
            {state === 'closed' && <p class="forklaring">{st(lang, 'stengtTekst')}</p>}
            {state === 'released' && shown && !shown.suppressed && (
              <>
                <Bars
                  result={shown}
                  options={c.options}
                  lang={lang}
                  motionKey={`${c.id}:${snapshot.round}`}
                />
                {c.multi && <p class="forklaring">{st(lang, 'fleireVal')}</p>}
              </>
            )}
            {state === 'released' && shown?.suppressed && (
              <div class="for-fa">
                <b>{st(lang, 'forFa')}</b>
                <p>{st(lang, 'forFaTekst')}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <span class="eyebrow">{st(lang, 'eyebrow')}</span>
            <h1 class="sporsmal-tekst">{st(lang, 'svarPaMobilen')}</h1>
            <p class="forklaring stor">{st(lang, 'forste')}</p>
          </>
        )}
      </div>
      {snapshot.link && (
        <aside class="qr-boks" aria-label={st(lang, 'svarPaMobilen')}>
          {snapshot.qr && <Qr svg={snapshot.qr} />}
          <b>{st(lang, 'skann')}</b>
          <span class="lenkje">
            {st(lang, 'elle')} <span class="mono">{snapshot.link.replace(/^https?:\/\//, '')}</span>
          </span>
        </aside>
      )}
      <svg
        class="fjell-band"
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          class="bak"
          d="M0,40 L0,26 L40,18 L80,24 L130,8 L175,20 L220,6 L265,18 L310,10 L355,20 L400,12 L400,40Z"
        />
        <path
          class="fram"
          d="M0,40 L0,30 L50,18 L90,26 L150,8 L210,24 L260,12 L320,26 L370,16 L400,22 L400,40Z"
        />
      </svg>
    </section>
  );
}
