import { useEffect, useRef, useState } from 'preact/hooks';
import type { Lang } from '@varde/schema/template/texts';
import { ui } from './i18n/ui.js';
import { Campfire, Hiker, Tent, Tree } from './profile-art.js';

type Point = readonly [number, number];
const RIDGE: Point[] = [
  [0, 0.02],
  [0.06, 0.11],
  [0.1, 0.06],
  [0.18, 0.25],
  [0.23, 0.17],
  [0.32, 0.38],
  [0.37, 0.3],
  [0.46, 0.5],
  [0.51, 0.42],
  [0.6, 0.62],
  [0.65, 0.55],
  [0.73, 0.79],
  [0.77, 0.73],
  [0.81, 0.94],
  [0.9, 0.96],
  [1, 0.93],
];
const BACK: Point[] = [
  [0, 0.34],
  [0.08, 0.5],
  [0.15, 0.38],
  [0.27, 0.7],
  [0.34, 0.55],
  [0.47, 0.86],
  [0.55, 0.66],
  [0.68, 0.9],
  [0.78, 0.74],
  [0.9, 0.8],
  [1, 0.62],
];
const TOP = 0.81,
  START = 0.015,
  H = 118;
function height(x: number) {
  for (let i = 1; i < RIDGE.length; i++) {
    const a = RIDGE[i - 1]!,
      b = RIDGE[i]!;
    if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return RIDGE.at(-1)![1];
}

export function Profile({
  count,
  question,
  done,
  lang,
}: {
  count: number;
  question: number;
  done: boolean;
  lang: Lang;
}) {
  const ref = useRef<HTMLDivElement>(null),
    previous = useRef(question);
  const [width, setWidth] = useState(360),
    [walking, setWalking] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media?.matches ?? false);
    media?.addEventListener('change', change);
    return () => media?.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const update = () => setWidth(Math.max(240, ref.current?.clientWidth ?? 360));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const moved = previous.current !== question;
    previous.current = question;
    setWalking(!reduced && moved);
    if (!reduced && moved) {
      const timer = setTimeout(() => setWalking(false), 950);
      return () => clearTimeout(timer);
    }
  }, [question, done, reduced]);
  const n = Math.max(1, count),
    number = Math.min(n, Math.max(1, question));
  const X = (x: number) => 6 + x * (width - 12),
    Y = (h: number) => 114 - h * 58;
  const point = (x: number): Point => [X(x), Y(height(x))];
  const line = (points: Point[]) =>
    points.map(([x, h]) => `${X(x).toFixed(1)},${Y(h).toFixed(1)}`).join(' ');
  const area = (points: Point[]) =>
    `M${X(0)},${H} L${line(points).replaceAll(' ', ' L')} L${X(1)},${H} Z`;
  const scale = Math.min(1.45, Math.max(1.12, width / 360));
  const p = point(done ? TOP + 0.005 : START + ((number - 1) / n) * (TOP - START));
  const label = done ? ui(lang, 'toppen') : `${number} ${ui(lang, 'av')} ${n}`;
  return (
    <div
      ref={ref}
      id="fjell"
      class={`fjell${done ? ' ferdig' : ''}${walking && !reduced ? ' gaar-no' : ''}`}
      data-reduced-motion={reduced}
      role="progressbar"
      aria-label={lang === 'en' ? 'Survey progress' : 'Framdrift'}
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={done ? n : number - 1}
      aria-valuetext={label}
    >
      <svg id="fjell-svg" viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="fjell-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--accent)" stop-opacity=".38" />
            <stop offset="1" stop-color="var(--accent)" stop-opacity=".06" />
          </linearGradient>
          <clipPath id="fjell-gatt">
            <rect class="gatt-rect" x="0" y="0" width={done ? width : p[0] + 1} height={H} />
          </clipPath>
        </defs>
        <path d={area(BACK)} fill="var(--fjell-bak)" />
        <path d={area(RIDGE)} fill="var(--fjell)" />
        <path d={area(RIDGE)} fill="url(#fjell-g)" clip-path="url(#fjell-gatt)" />
        <polyline
          points={line(RIDGE.filter(([x]) => x <= TOP))}
          fill="none"
          stroke="var(--muted)"
          stroke-width="1.6"
          stroke-dasharray="1 5"
          stroke-linecap="round"
          opacity=".7"
        />
        <polyline
          points={line(RIDGE.filter(([x]) => x <= TOP))}
          fill="none"
          stroke="var(--accent)"
          stroke-width="2.6"
          stroke-linejoin="round"
          stroke-linecap="round"
          clip-path="url(#fjell-gatt)"
        />
        {[
          [0.99, 15],
          [0.963, 26],
          [0.937, 19],
        ].map(([x, h]) => (
          <Tree x={point(x!)[0]} y={point(x!)[1] + 1} h={h! * scale} />
        ))}
        {done && (
          <>
            <g transform={`translate(${point(0.887)[0]},${point(0.887)[1] + 0.5}) scale(${scale})`}>
              <Tent />
            </g>
            <g transform={`translate(${point(0.849)[0]},${point(0.849)[1] + 0.5}) scale(${scale})`}>
              <Campfire />
            </g>
          </>
        )}
        {Array.from({ length: n }, (_, i) => {
          const dot = point(START + (i / n) * (TOP - START)),
            made = done || i < number - 1;
          return (
            <circle
              class="prikk"
              cx={dot[0]}
              cy={dot[1]}
              r="2.3"
              stroke-width="1.2"
              fill={made ? 'var(--accent)' : 'var(--bg)'}
              stroke={made ? 'var(--accent)' : 'var(--muted)'}
              opacity={!done && i === number - 1 ? 0 : 1}
            />
          );
        })}
        <g
          class="gaar"
          style={{ transform: `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)` }}
        >
          <g transform={`scale(${scale})`}>
            <Hiker />
          </g>
        </g>
      </svg>
      <span
        id="fjell-merke"
        class="fjell-merke"
        style={{
          left: `${Math.min(Math.max(p[0], done ? 65 : 30), width - (done ? 65 : 30))}px`,
          top: `${Math.max(0, p[1] - 28 * scale - 26)}px`,
        }}
      >
        {label}
      </span>
    </div>
  );
}
