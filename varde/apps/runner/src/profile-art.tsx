export function Tree({ x, y, h }: { x: number; y: number; h: number }) {
  const w = h * 0.62;
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
      <rect x={-h * 0.05} y={-h * 0.16} width={h * 0.1} height={h * 0.18} fill="var(--stamme)" />
      {[
        [0.14, 1, 'var(--gran)'],
        [0.42, 0.78, 'var(--gran-lys)'],
        [0.66, 0.55, 'var(--gran)'],
      ].map(([a, b, color]) => {
        const by = -h * Number(a),
          bw = (w * Number(b)) / 2,
          ty = by - h * 0.44;
        return <polygon points={`${-bw},${by} 0,${ty} ${bw},${by}`} fill={String(color)} />;
      })}
    </g>
  );
}
export function Hiker() {
  const leg = (name: string, opacity = 1) => (
    <g transform="translate(0,-8.5)">
      <g class={`bein ${name}`}>
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="8.5"
          stroke="var(--ink)"
          stroke-width="2.2"
          stroke-linecap="round"
          opacity={opacity}
        />
      </g>
    </g>
  );
  return (
    <g class="kropp">
      {leg('b', 0.75)}
      <rect x="-4.6" y="-16.6" width="3.6" height="6.4" rx="1.4" fill="var(--sekk)" />
      <line
        x1="0"
        y1="-8.5"
        x2=".8"
        y2="-15.5"
        stroke="var(--accent)"
        stroke-width="3.6"
        stroke-linecap="round"
      />
      {leg('a')}
      <line
        x1="4.6"
        y1="-13.5"
        x2="5.6"
        y2="0"
        stroke="var(--stein)"
        stroke-width="1.2"
        stroke-linecap="round"
      />
      <line
        x1=".8"
        y1="-14.2"
        x2="4.4"
        y2="-11.2"
        stroke="var(--accent)"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="1.4" cy="-19" r="2.6" fill="var(--hud)" />
      <path d="M-1.3,-19.4 A2.75,2.75 0 0 1 4.1,-19.4 Z" fill="var(--lue)" />
      <circle cx="1.4" cy="-22.4" r="1" fill="var(--lue)" />
    </g>
  );
}
export function Tent() {
  return (
    <g class="telt">
      <polygon points="-12,0 0,-15 12,0" fill="var(--telt)" />
      <polygon points="0,-15 12,0 6,0" fill="var(--telt-skugge)" />
      <polygon points="-4,0 0,-9.5 4,0" fill="var(--telt-dor)" />
      <line
        x1="0"
        y1="-15"
        x2="0"
        y2="-18"
        stroke="var(--stein)"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </g>
  );
}
export function Campfire() {
  return (
    <g class="baal">
      <ellipse cx="0" cy="-1" rx="8" ry="3" fill="var(--glod)" opacity=".35" />
      <line
        x1="-5"
        y1="0"
        x2="5"
        y2="-2.4"
        stroke="var(--stamme)"
        stroke-width="2.2"
        stroke-linecap="round"
      />
      <line
        x1="-5"
        y1="-2.4"
        x2="5"
        y2="0"
        stroke="var(--stamme)"
        stroke-width="2.2"
        stroke-linecap="round"
      />
      <g transform="translate(0,-2)">
        <path
          class="flamme f1"
          d="M-4,0 C-5,-4 -2,-6 -1.5,-10 C0.5,-7 4.5,-5 3.6,0 Z"
          fill="var(--eld-1)"
        />
        <path
          class="flamme f2"
          d="M-2.6,0 C-3,-3 -0.5,-4.5 0,-7.5 C1.4,-5 3,-3 2.4,0 Z"
          fill="var(--eld-2)"
        />
        <path
          class="flamme f3"
          d="M-1.2,0 C-1.4,-1.8 0,-2.6 0.2,-4.4 C1,-3 1.6,-1.8 1.2,0 Z"
          fill="var(--eld-3)"
        />
      </g>
      {[
        [0, -10, 0.8, 'var(--eld-2)'],
        [-1.5, -9, 0.7, 'var(--eld-1)'],
        [1.5, -9, 0.7, 'var(--eld-2)'],
      ].map(([x, y, r, fill], i) => (
        <circle
          class={`gnist g${i + 1}`}
          cx={Number(x)}
          cy={Number(y)}
          r={Number(r)}
          fill={String(fill)}
        />
      ))}
    </g>
  );
}
