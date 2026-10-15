/* Varde spørjeskjema, prototype. Landskapet er framdrifta; kvar overgang fortel kvar du er på stien. */
(() => {
  'use strict';
  const M = window.VardeMotion, D = window.VARDE_SURVEY;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const EMBED = /innebygd/.test(location.hash) || window.self !== window.top;
  if (EMBED) document.documentElement.classList.add('innebygd');
  if (/forhand/.test(location.hash)) document.documentElement.classList.add('forhand');

  const UI = {
    nn: {
      start: 'Start', vidare: 'Vidare', tilbake: 'Tilbake', hopp: 'Hopp over', send: 'Send svara', sender: 'Sender …', av: 'av',
      toppen: 'Du er på toppen', takk: 'Takk!', sendt: 'Svara dine er sende. Vi samlar alt og kjem tilbake til bedrifta med det vi fann.',
      for: 'Skjemaet er for deg som jobbar i', f1: 'Tek om lag {n} minutt', helsing: 'Helsing',
      kvenSer: 'Kven ser svara dine?', kvenSerTekst: 'Svara per person ser berre Vardahei IT. Bedrifta får eit samla bilete utan initialar.',
      lesMeir: 'Les heile personvernteksten', lesMindre: 'Vis mindre',
      maks: 'Vel inntil {n}.', valfritt: 'valfritt', valt: 'Valt: {n}', valtMaks: 'Valt: {n} av {m}', teikn: '{n} teikn att', sporsmal: 'Spørsmål {i} av {n}',
      tilOversyn: 'Sjå over svara', review: 'Sjå over svara dine', ready: 'Svara er lagra i nettlesaren til du sender dei.', endre: 'Endre', svart: '{a} av {n}', hoppa: 'Hoppa over',
      sendFeil: 'Svara kom ikkje fram. Sjekk nettet og prøv igjen.', provIgjen: 'Prøv igjen',
      leiarEyebrow: 'For leiarar', taDei: 'Ta dei med', taDeiSub: '{n} spørsmål til', hoppSend: 'Hopp over og send', hoppSendSub: 'Du går rett til toppen',
      kvaSkjer: 'Kva skjer no?', steg1: 'Svara dine er komne fram.', steg2: 'Vi samlar svara frå alle hos {k}.', steg3: 'Vi kjem tilbake til bedrifta med det vi fann, og kva vi føreslår å gjere.',
      kontakt: 'Ta kontakt', lukk: 'Du kan lukke sida no.', kopier: 'Kopier', kopiert: 'Kopiert',
      velkomen: 'Velkomen tilbake', utkast: 'Du har svar som ikkje er sende enno. Dei er lagra i nettlesaren.', haldFram: 'Hald fram på spørsmål {i}', startNytt: 'Start på nytt',
      lastar: 'Lastar …', ugyldigTittel: 'Denne lenkja verkar ikkje',
      ugyldigTekst: 'Skjemaet krev lenkja du fekk frå leiaren din eller frå oss, med alle teikna på slutten. Prøv å opne ho på nytt frå e-posten, eller ta kontakt så sender vi ei ny.',
      stengdTittel: 'Kartlegginga er avslutta', stengdTekst: 'Takk for at du ville svare. Denne runden er ferdig, og vi tek ikkje imot fleire svar. Lurer du på noko, ta gjerne kontakt.',
      byttTittel: 'Lenkja er bytt ut', byttTekst: 'Spør den som sende deg ho om den nye.', lagra: 'Lagra i nettlesaren',
    },
    en: {
      start: 'Start', vidare: 'Next', tilbake: 'Back', hopp: 'Skip', send: 'Send answers', sender: 'Sending …', av: 'of',
      toppen: 'You made it to the top', takk: 'Thank you!', sendt: "Your answers have been sent. We'll put everything together and get back to your company with what we found.",
      for: 'This form is for people working at', f1: 'Takes about {n} minutes', helsing: 'Best regards,',
      kvenSer: 'Who sees your answers?', kvenSerTekst: 'Only Vardahei IT sees answers per person. Your company gets an overall picture without initials.',
      lesMeir: 'Read the full privacy notice', lesMindre: 'Show less',
      maks: 'Choose up to {n}.', valfritt: 'optional', valt: 'Selected: {n}', valtMaks: 'Selected: {n} of {m}', teikn: '{n} characters left', sporsmal: 'Question {i} of {n}',
      tilOversyn: 'Review answers', review: 'Review your answers', ready: 'Your answers stay in this browser until you send them.', endre: 'Change', svart: '{a} of {n}', hoppa: 'Skipped',
      sendFeil: "Your answers didn't get through. Check your connection and try again.", provIgjen: 'Try again',
      leiarEyebrow: 'For managers', taDei: 'Go ahead', taDeiSub: '{n} more questions', hoppSend: 'Skip and send', hoppSendSub: 'You go straight to the top',
      kvaSkjer: 'What happens now?', steg1: 'Your answers have arrived.', steg2: 'We gather the answers from everyone at {k}.', steg3: "We'll get back to your company with what we found and what we suggest doing.",
      kontakt: 'Get in touch', lukk: 'You can close this page now.', kopier: 'Copy', kopiert: 'Copied',
      velkomen: 'Welcome back', utkast: "You have answers that haven't been sent yet. They're saved in this browser.", haldFram: 'Continue at question {i}', startNytt: 'Start over',
      lastar: 'Loading …', ugyldigTittel: "This link doesn't work",
      ugyldigTekst: "The survey needs the link you got from your manager or from us, including all the characters at the end. Try opening it again from the email, or get in touch and we'll send a new one.",
      stengdTittel: 'The survey is closed', stengdTekst: "Thanks for wanting to take part. This round is finished, and we're no longer accepting answers. Get in touch if you have any questions.",
      byttTittel: 'This link has been replaced', byttTekst: 'Ask the sender for the new one.', lagra: 'Saved in this browser',
    },
  };

  const S = { lang: 'nn', screen: null, fraOversyn: false, i: 0, answers: {}, free: {}, skipped: new Set(), leader: false, leaderDecided: false, client: 'Daco', failSend: false, sending: false, sendError: false, draft: false };
  const tx = (o) => (o ? (o[S.lang] ?? o.nn ?? '') : '');
  const ui = (k, v = {}) => (UI[S.lang][k] ?? UI.nn[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? ''));
  const common = D.questions.filter((q) => q.part === 'common');
  const leaderQs = D.questions.filter((q) => q.part === 'leader');
  const isLeader = () => D.leaderRoles.includes(S.answers.F2);
  const path = () => (S.leader ? [...common, ...leaderQs] : common);
  // Stien viser leiarstega med ein gong rolla er vald (som valfrie), så han treng ikkje teiknast om seinare
  const visPath = () => (isLeader() || S.leader ? [...common, ...leaderQs] : common);
  const cur = () => path()[S.i];

  const ICON = {
    klokke: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    hake: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    skjold: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
    ned: '<svg class="icon sm" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    pil: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    auge: '<svg class="icon" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    varsel: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>',
    lenke: '<svg class="icon" viewBox="0 0 24 24"><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>',
    mane: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
    lagre: '<svg class="icon sm" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    varde: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 15h10.8l-.5-3.1H3.2zM3.6 11.4h8.6l-.5-2.6H4.1zM4.6 8.3h6.7l-.4-2.4H5zM5.6 5.4h4.6l-.4-2H6z" fill="currentColor" opacity=".55"/><path d="M6.5 2.9h3l-.4-1.6H6.9z" fill="currentColor"/></svg>',
  };

  /* ---------- Landskapet ---------- */
  const L = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const box = $('#landskap'), svg = $('#scene'), boble = $('#boble');
    const mk = (tag, a = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; };
    const X0 = 18, X1 = 296, XS = 326, YS = 72, YB = 186, YT = 80, XMIN = -1180, XMAX = 1580;
    // Åsane er periodiske (920 einingar), så landskapet held til kanten på breie skjermar
    const tile = (a) => [...a.map(([x, yy]) => [x - 920, yy]), ...a.slice(1), ...a.slice(1).map(([x, yy]) => [x + 920, yy])];
    function y(x) {
      if (x <= X0) return YB + (X0 - x) * 0.05 + Math.sin(x * 0.05) * 1.2;
      // Kvart steg går oppover: litt slakt i dalen, brattare mot toppen. Den vesle bølgja er for svak til å gi søkk.
      if (x <= X1) { const f = (x - X0) / (X1 - X0); return YB - (YB - YT) * (0.55 * f + 0.45 * Math.pow(f, 1.7)) - 1.4 * Math.sin(f * Math.PI * 5) * f * (1 - f); }
      if (x <= XS) { const f = (x - X1) / (XS - X1), e = f * f * (3 - 2 * f); return y(X1) + (YS - y(X1)) * e; }
      if (x <= 398) return YS + Math.sin((x - XS) * 0.2) * 0.5;
      return YS + (x - 398) * 0.34;
    }
    const pts = (a, b, step = 3) => { const out = []; for (let x = a; x < b; x += step) out.push([x, y(x)]); out.push([b, y(b)]); return out; };
    const d = (p) => 'M' + p.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join('L');

    const defs = mk('defs', {}, svg);
    const lg = mk('linearGradient', { id: 'himmel', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 6, x2: 0, y2: 150 }, defs);
    // Himmelen glir over i sidebakgrunnen øvst, så landskapet ikkje får ei hard kant under toppen
    mk('stop', { offset: '0', 'stop-color': 'var(--bg)' }, lg); mk('stop', { offset: '.3', 'stop-color': 'var(--sky-1)' }, lg); mk('stop', { offset: '1', 'stop-color': 'var(--sky-2)' }, lg);
    const rg = mk('radialGradient', { id: 'glodgrad' }, defs);
    mk('stop', { offset: '0', 'stop-color': 'var(--glod)', 'stop-opacity': '.8' }, rg); mk('stop', { offset: '1', 'stop-color': 'var(--glod)', 'stop-opacity': '0' }, rg);
    const tg = mk('linearGradient', { id: 'takegrad', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [['0', 0], ['.3', .92], ['.7', .92], ['1', 0]].forEach(([o, a]) => mk('stop', { offset: o, 'stop-color': 'var(--bg)', 'stop-opacity': a }, tg));

    mk('rect', { class: 'kveld', x: XMIN, y: -80, width: XMAX - XMIN, height: 330, fill: 'url(#himmel)' }, svg);
    // Sola står over dalsøkket til venstre for toppen (ikkje bak bobla) og går ned mot åsen om kvelden
    mk('circle', { class: 'sol', cx: 228, cy: 42, r: 11 }, svg);
    const stj = mk('g', { class: 'stjerner' }, svg);
    const sr = (() => { let v = 7; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; })();
    for (let i = 0; i < 70; i++) { const c = mk('circle', { cx: (-1100 + sr() * 2600).toFixed(1), cy: (4 + sr() * 58).toFixed(1), r: i % 3 ? 0.7 : 1.05 }, stj); c.style.animationDelay = `${(i % 7) * -0.45}s`; }
    const far = [[-260, 120], [-210, 98], [-176, 108], [-130, 86], [-92, 100], [-52, 84], [-20, 104], [6, 110], [34, 96], [58, 106], [92, 80], [122, 94], [150, 76], [176, 90], [212, 62], [236, 76], [262, 58], [298, 82], [330, 70], [360, 86], [392, 66], [420, 84], [452, 72], [490, 92], [530, 78], [570, 98], [610, 84], [660, 120]];
    mk('polygon', { class: 'as-bak', points: [...tile(far), [XMAX, 260], [XMIN, 260]].map((p) => p.join(',')).join(' ') }, svg);
    [[212, 62], [262, 58], [392, 66], [92, 80], [-130, 86]].flatMap(([px, py]) => [[px - 920, py], [px, py], [px + 920, py]]).forEach(([px, py]) => mk('polygon', { class: 'sno', points: `${px - 7},${py + 6} ${px},${py} ${px + 7},${py + 5} ${px + 3},${py + 7} ${px},${py + 4} ${px - 3},${py + 8}` }, svg));
    const mid = [[-260, 150], [-220, 136], [-180, 146], [-140, 128], [-100, 140], [-60, 126], [-24, 142], [0, 146], [40, 132], [72, 140], [112, 118], [146, 128], [182, 108], [222, 122], [262, 102], [300, 116], [338, 96], [372, 104], [404, 92], [440, 108], [480, 100], [520, 118], [570, 108], [620, 124], [660, 150]];
    mk('polygon', { class: 'as-midt', points: [...tile(mid), [XMAX, 260], [XMIN, 260]].map((p) => p.join(',')).join(' ') }, svg);
    const take = mk('g', { class: 'take' }, svg);
    mk('rect', { class: 't1', x: -120, y: 112, width: 420, height: 34, rx: 17, fill: 'url(#takegrad)' }, take);
    mk('rect', { class: 't2', x: 80, y: 140, width: 460, height: 30, rx: 15, fill: 'url(#takegrad)' }, take);
    const gVarder = mk('g', { class: 'varder' }, svg);
    mk('path', { class: 'as-fram', d: d(pts(XMIN, XMAX, 4)) + `L${XMAX},260L${XMIN},260Z` }, svg);
    mk('path', { class: 'sti-att', d: d(pts(4, XS, 2)) }, svg);
    const fram = mk('path', { class: 'sti-fram', d: '' }, svg);
    const gjort = mk('path', { class: 'sti-gjort', d: '' }, svg);
    const gPrikkar = mk('g', {}, svg);

    // Vegvisar for «lenkja verkar ikkje»
    const skilt = mk('g', { class: 'skilt', transform: `translate(30,${y(30).toFixed(1)})` }, svg);
    mk('rect', { x: -0.8, y: -20, width: 1.6, height: 20, fill: 'var(--stamme)' }, skilt);
    mk('path', { d: 'M-1,-19 h12 l3,2.5 -3,2.5 h-12z', fill: 'var(--stein-lys)' }, skilt);
    mk('path', { d: 'M1,-12 h-12 l-3,2.5 3,2.5 h12z', fill: 'var(--stein)' }, skilt);

    // Toppen: stor varde, granene, telt og bål
    const topp = mk('g', {}, svg);
    function tre(x, h) {
      const g = mk('g', { transform: `translate(${x},${y(x) + 0.6})` }, topp), w = h * 0.62;
      mk('rect', { class: 'stamme', x: -h * 0.05, y: -h * 0.16, width: h * 0.1, height: h * 0.18 }, g);
      [[0.14, 1, 'gran-a'], [0.42, 0.78, 'gran-b'], [0.66, 0.55, 'gran-a']].forEach(([a, b, c]) => {
        const by = -h * a, bw = (w * b) / 2, ty = by - h * 0.44;
        mk('polygon', { class: c, points: `${-bw},${by} 0,${ty} ${bw},${by}` }, g);
      });
    }
    tre(388, 25); tre(380, 19); tre(398, 16);
    const teltPos = mk('g', { transform: `translate(354,${YS + 0.4})` }, topp);
    const telt = mk('g', { class: 'telt' }, teltPos);
    mk('polygon', { points: '-12,0 0,-15 12,0', fill: 'var(--telt)' }, telt);
    mk('polygon', { points: '0,-15 12,0 6,0', fill: 'var(--telt-skugge)' }, telt);
    mk('polygon', { points: '-4,0 0,-9.5 4,0', fill: 'var(--telt-dor)' }, telt);
    mk('line', { x1: 0, y1: -15, x2: 0, y2: -18, stroke: 'var(--stein)', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, telt);
    const baalPos = mk('g', { transform: `translate(371,${YS + 0.3})` }, topp);
    mk('circle', { class: 'glod', cx: 0, cy: -3, r: 13, fill: 'url(#glodgrad)' }, baalPos);
    const baal = mk('g', { class: 'baal' }, baalPos);
    mk('line', { x1: -5, y1: 0, x2: 5, y2: -2.4, stroke: 'var(--stamme)', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, baal);
    mk('line', { x1: -5, y1: -2.4, x2: 5, y2: 0, stroke: 'var(--stamme)', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, baal);
    const fl = mk('g', { transform: 'translate(0,-2)' }, baal);
    mk('path', { class: 'flamme f1', d: 'M-4,0 C-5,-4 -2,-6 -1.5,-10 C0.5,-7 4.5,-5 3.6,0 Z', fill: 'var(--eld-1)' }, fl);
    mk('path', { class: 'flamme f2', d: 'M-2.6,0 C-3,-3 -0.5,-4.5 0,-7.5 C1.4,-5 3,-3 2.4,0 Z', fill: 'var(--eld-2)' }, fl);
    mk('path', { class: 'flamme f3', d: 'M-1.2,0 C-1.4,-1.8 0,-2.6 0.2,-4.4 C1,-3 1.6,-1.8 1.2,0 Z', fill: 'var(--eld-3)' }, fl);
    [[0, -10, 0.8, 'var(--eld-2)'], [-1.5, -9, 0.7, 'var(--eld-1)'], [1.5, -9, 0.7, 'var(--eld-2)']].forEach(([cx, cy, r, f], i) => mk('circle', { class: `gnist g${i + 1}`, cx, cy, r, fill: f }, baal));

    // Varde: flate heller lagde i eit tårn som smalnar oppover, slik varder ser ut på fjellet.
    // Den øvste, blå hella er steinen turgåaren legg på når han går forbi.
    const HELLER = [
      [[-6.9, 5], [6.6, 5], [6.4, 0.2], [6, -2.4], [2, -2.9], [-6.3, -2.6], [-6.7, 0]],
      [[-5.9, -2.8], [5.5, -3], [5.3, -5.6], [-0.5, -6], [-5.4, -5.5]],
      [[-4.6, -5.8], [5, -5.9], [4.4, -8.3], [-4.9, -8]],
      [[-4.5, -8.3], [3.6, -8.4], [3.9, -10.4], [-3.8, -10.8]],
      [[-3, -10.9], [3.4, -10.7], [2.9, -12.9], [-2.7, -12.7]],
      [[-2.4, -13], [2, -12.9], [1.6, -14.4], [-1.9, -14.6]],
    ];
    const MIN_STEIN = [[-1.6, -14.6], [1.7, -14.6], [1.2, -16], [-1.3, -16.1]];
    const TOPP_Y = -16.1;
    // Vardane er litt smalare enn høge (kx), så turgåaren kan stå ved sida av utan å dekkje dei
    const poly = (pts, k, kx = k) => pts.map(([px, py]) => `${(px * kx).toFixed(2)},${(py * k).toFixed(2)}`).join(' ');
    function varde(parent, k) {
      const g = mk('g', { class: 'varde' }, parent);
      HELLER.forEach((h, i) => mk('polygon', { class: `helle h${i % 3}`, points: poly(h, k, k * 0.85) }, g));
      const min = mk('polygon', { class: 'min-stein', points: poly(MIN_STEIN, k) }, g);
      return { g, min, k };
    }
    // Toppvarden står òg bak bakken, så foten blir gøymd i fjellet
    const toppVardePos = mk('g', { transform: `translate(${XS},${YS + 0.4})` }, gVarder);
    const toppVarde = { ...varde(toppVardePos, 1.12), x: XS, stein: false };
    const gFlyg = mk('g', {}, svg);

    // Turgåaren
    const gaar = mk('g', { class: 'gaar' }, svg);
    const kropp = mk('g', { class: 'kropp' }, gaar);
    const bein = (n, op) => { const o = mk('g', { transform: 'translate(0,-8.5)' }, kropp), b = mk('g', { class: `bein ${n}` }, o); mk('line', { x1: 0, y1: 0, x2: 0, y2: 8.5, stroke: 'var(--ink-strong)', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: op }, b); };
    bein('b', 0.75);
    mk('rect', { x: -4.6, y: -16.6, width: 3.6, height: 6.4, rx: 1.4, fill: 'var(--sekk)' }, kropp);
    // Den andre armen ligg bak kroppen og blir berre synleg når han vinkar på toppen
    const vinkearm = mk('g', { class: 'vinkearm' }, mk('g', { transform: 'translate(0.3,-14.4)' }, kropp));
    mk('line', { x1: 0, y1: 0, x2: 0, y2: -6.6, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round' }, vinkearm);
    mk('circle', { cx: 0, cy: -7.2, r: 1.1, fill: 'var(--hud)' }, vinkearm);
    mk('line', { x1: 0, y1: -8.5, x2: 0.8, y2: -15.5, stroke: 'var(--accent)', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, kropp);
    bein('a', 1);
    mk('line', { x1: 4.6, y1: -13.5, x2: 5.6, y2: 0, stroke: 'var(--stein)', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, kropp);
    const skulder = mk('g', { transform: 'translate(0.8,-14.2)' }, kropp), arm = mk('g', { class: 'arm' }, skulder);
    mk('line', { x1: 0, y1: 0, x2: 3.6, y2: 3, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round' }, arm);
    mk('circle', { cx: 1.4, cy: -19, r: 2.6, fill: 'var(--hud)' }, kropp);
    mk('path', { d: 'M-1.3,-19.4 A2.75,2.75 0 0 1 4.1,-19.4 Z', fill: 'var(--lue)' }, kropp);
    mk('circle', { cx: 1.4, cy: -22.4, r: 1, fill: 'var(--lue)' }, kropp);

    let n = 14, xs = [], varder = [], prikkar = [], hx = 6, doneX = 6, facing = 1, lean = 0, vb = [0, 0, 400, 200], mode = 'hero', walkToken = 0, walkTarget = null, walking = false;
    const checkX = (i, cnt = n) => X0 + ((X1 - X0) * i) / Math.max(1, cnt - 1);
    const SUB = { hero: { x: -6, y: 0, w: 412, h: 196 }, sti: { x: -6, y: 40, w: 412, h: 150 }, topp: { x: 120, y: 0, w: 292, h: 160 }, tilstand: { x: -6, y: 20, w: 412, h: 176 } };
    const HEIGHT = { hero: (w) => Math.min(300, Math.max(178, w * 0.46)), sti: (w) => Math.min(176, Math.max(136, w * 0.37)), topp: (w) => Math.min(280, Math.max(210, w * 0.56)), tilstand: (w) => Math.min(240, Math.max(148, w * 0.4)) };
    function fit(m) {
      const W = box.clientWidth || 360, H = HEIGHT[m](W), s = SUB[m], a = W / H, sa = s.w / s.h;
      if (a > sa) { const w = s.h * a; return { vb: [s.x - (w - s.w) / 2, s.y, w, s.h], H }; }
      const h = s.w / a; return { vb: [s.x, s.y - (h - s.h), s.w, h], H };
    }
    function apply(v, H) { vb = v; svg.setAttribute('viewBox', v.map((k) => k.toFixed(2)).join(' ')); box.style.height = H.toFixed(1) + 'px'; place(); }
    let lastW = 0, camToken = 0;
    function camera(m, instant) {
      mode = m; box.dataset.kamera = m; lastW = box.clientWidth;
      const t = fit(m), from = [...vb, box.clientHeight || t.H], token = ++camToken;
      if (instant || M.reduced()) return apply(t.vb, t.H);
      return M.tween(from, [...t.vb, t.H], 700, 'sti', (v) => { if (token === camToken) apply(v.slice(0, 4), v[4]); });
    }
    function place() {
      const W = box.clientWidth, s = W / vb[2];
      const px = (hx - vb[0]) * s, head = (y(hx) - 27 - vb[1]) * s;
      const bw = boble.offsetWidth || 60, bh = boble.offsetHeight || 24;
      const ideal = head - bh - 8, manglar = Math.max(0, -4 - ideal);
      const top = ideal + manglar, skyv = Math.min(bw / 2 + 12, manglar * 3);
      const left = Math.min(W - bw - 4, Math.max(4, px - bw / 2 - skyv));
      boble.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
      boble.style.setProperty('--pil', `${Math.min(bw - 12, Math.max(12, px - left)).toFixed(1)}px`);
      gaar.setAttribute('transform', `translate(${hx.toFixed(2)},${y(hx).toFixed(2)}) scale(${(1.12 * facing).toFixed(2)},1.12) rotate(${lean.toFixed(2)})`);
      gjort.setAttribute('d', doneX > 5 ? d(pts(4, Math.min(doneX, XS), 2)) : '');
    }
    let layoutBusy = null;
    function layout(cnt, sections, instant) {
      const oldXs = xs.slice(), oldN = n; n = cnt;
      xs = Array.from({ length: n }, (_, i) => checkX(i));
      const nyePrikkar = [];
      while (prikkar.length < n) { const i = prikkar.length, c = mk('circle', { class: 'prikk', r: 2.4, cx: xs[i].toFixed(2), cy: (y(xs[i]) - 0.2).toFixed(2) }, gPrikkar); prikkar.push(c); nyePrikkar.push(c); }
      const snoegg = instant || !oldN || M.reduced();
      const fjern = (el) => (snoegg ? el.remove() : M.animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: M.ease.ut }).then(() => el.remove()));
      while (prikkar.length > n) fjern(prikkar.pop());
      // Varden står litt nærare neste spørsmål, så det er plass til å stoppe før han
      const bounds = [];
      for (let i = 1; i < n; i++) if (sections[i] !== sections[i - 1]) bounds.push({ i, x: xs[i - 1] + (xs[i] - xs[i - 1]) * 0.62 });
      const nyeVarder = [];
      while (varder.length < bounds.length) { const k = varder.length, pos = mk('g', { transform: `translate(${bounds[k].x.toFixed(2)},${y(bounds[k].x).toFixed(2)})` }, gVarder), v = { pos, ...varde(pos, 1), stein: false, x: bounds[k].x, xMal: bounds[k].x, i: 0 }; varder.push(v); nyeVarder.push(v); }
      while (varder.length > bounds.length) fjern(varder.pop().pos);
      const fromP = prikkar.map((c, i) => (i < oldXs.length ? oldXs[i] : xs[i]));
      const fromV = varder.map((v) => v.x);
      varder.forEach((v, k) => { v.i = bounds[k].i; v.xMal = bounds[k].x; });
      const run = (p) => {
        prikkar.forEach((c, i) => { const x = fromP[i] + (xs[i] - fromP[i]) * p; c.setAttribute('cx', x.toFixed(2)); c.setAttribute('cy', (y(x) - 0.2).toFixed(2)); });
        varder.forEach((v, k) => { const x = fromV[k] + (bounds[k].x - fromV[k]) * p; v.x = x; v.pos.setAttribute('transform', `translate(${x.toFixed(2)},${y(x).toFixed(2)})`); });
      };
      if (snoegg) { run(1); return Promise.resolve(); }
      nyePrikkar.forEach((c, j) => M.animate(c, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 120 + j * 60, easing: M.ease.inn, fill: 'backwards' }));
      nyeVarder.forEach((v) => M.animate(v.pos, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 200, easing: M.ease.inn, fill: 'backwards' }));
      // Roleg omfordeling (inn og ut av fart), så vardane framfor glir på plass utan rykk
      layoutBusy = M.tween(0, 1, 950, 'gang', run).then(() => { layoutBusy = null; });
      return layoutBusy;
    }
    function marks(states) { prikkar.forEach((c, i) => { c.classList.toggle('svart', states[i] === 'svart'); c.classList.toggle('hoppa', states[i] === 'hoppa'); c.classList.toggle('valfri', states[i] === 'valfri'); }); }
    // Steinlegging slik det skjer på fjellet: han stoppar ved varden, løftar steinen og legg han øvst.
    // Armvinkelen og steinen blir rekna ut kvar frame, så steinen ligg vassrett i handa heile vegen.
    const vardeX = (v) => v.xMal ?? v.x;
    const vardeY = (v) => (v === toppVarde ? YS + 0.4 : y(vardeX(v)));
    // Han stoppar like før varden, så både han og varden er synlege, og rekk fram med armen
    const STOPP = 9, LOFT = -45;
    const SKULDER = [0.8, -14.2], HAND = [3.6, 3];
    const handPos = (a) => {
      const r = (a * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      const lx = SKULDER[0] + HAND[0] * c - HAND[1] * sn, ly = SKULDER[1] + HAND[0] * sn + HAND[1] * c;
      return [hx + 1.12 * facing * lx, y(hx) + 1.12 * ly];
    };
    let steinToken = 0, paagaar = null;
    // Blir han avbroten midt i steinlegginga (nytt svar), blir steinen liggjande og armen går ned med ein gong
    function fullfoerStein() { if (!paagaar) return; steinToken++; paagaar.v.min.classList.add('lagt'); paagaar.stein.remove(); arm.removeAttribute('transform'); paagaar = null; }
    function leggStein(v, instant) {
      if (v.stein) return Promise.resolve(); v.stein = true;
      if (instant || M.reduced()) { v.min.classList.add('lagt'); return Promise.resolve(); }
      const stein = mk('polygon', { class: 'flyg-stein', points: poly([[-1.6, 0.7], [1.7, 0.7], [1.2, -0.7], [-1.3, -0.8]], v.k) }, gFlyg);
      let pa = (a, dy = -1.1) => { const [x, yy] = handPos(a); stein.setAttribute('transform', `translate(${x.toFixed(2)},${(yy + dy).toFixed(2)})`); };
      const mal = () => [v.x, (v === toppVarde ? YS + 0.4 : y(v.x)) - 15.3 * v.k], t = ++steinToken;
      paagaar = { v, stein };
      const armTil = (a) => { if (t === steinToken) arm.setAttribute('transform', `rotate(${a.toFixed(1)})`); };
      const pa0 = pa; pa = (a, dy) => { if (t === steinToken) pa0(a, dy); };
      pa(0);
      return M.tween(0, LOFT, 320, 'sti', (a) => { armTil(a); pa(a); })
        .then(() => {
          if (t !== steinToken) return; const [x0, y0] = handPos(LOFT);
          return M.tween(0, 1, 220, 'inn', (q) => { if (t !== steinToken) return; const [mx, my] = mal(); stein.setAttribute('transform', `translate(${(x0 + (mx - x0) * q).toFixed(2)},${(y0 - 1.1 + (my - y0 + 1.1) * q).toFixed(2)})`); });
        })
        .then(() => {
          if (t !== steinToken) return;
          paagaar = null; stein.remove(); v.min.classList.add('lagt');
          M.tween(LOFT, 0, 320, 'sti', armTil);
          return new Promise((r) => setTimeout(r, M.ms(140)));
        });
    }
    function fjernSteinar() { steinToken++; gFlyg.replaceChildren(); arm.removeAttribute('transform'); [...varder, toppVarde].forEach((v) => { v.stein = false; v.min.classList.remove('lagt'); }); }
    // Gonge med jamn fart: kort oppstart og nedbremsing, ingen treg start
    const VA = 0.18, VD = 0.24, VMAX = 1 / (1 - VA / 2 - VD / 2);
    const gange = (p) => (p < VA ? 0.5 * VMAX * p * p / VA : p < 1 - VD ? 0.5 * VMAX * VA + VMAX * (p - VA) : 1 - 0.5 * VMAX * (1 - p) * (1 - p) / VD);
    const fart = (p) => Math.min(1, p / VA, (1 - p) / VD);
    let walkPromise = Promise.resolve();
    function steg(a, b, token, keepDone) {
      const dist = Math.abs(b - a); if (dist < 0.3 || token !== walkToken) return Promise.resolve();
      svg.classList.add('gaar-no'); svg.classList.remove('kvile');
      return M.tween(0, 1, Math.min(1400, Math.max(260, dist * 22)), 'linear', (p) => {
        if (token !== walkToken) return;
        const x = a + (b - a) * gange(p);
        hx = x; if (!keepDone) doneX = Math.max(doneX, x);
        const sl = (y(x + 2) - y(x - 2)) / 4;
        lean = facing > 0 ? Math.min(11, Math.max(2, -sl * 34 + 2)) * fart(p) : 3 * fart(p);
        place();
      }).then(() => { if (token === walkToken) { svg.classList.remove('gaar-no'); lean = 0; place(); } });
    }
    function walkTo(tx, opts = {}) {
      // Går han alt dit, held han berre fram (ingen ny oppstart midt i steget)
      if (walking && walkTarget !== null && Math.abs(tx - walkTarget) < 0.5 && !opts.instant) return walkPromise;
      fullfoerStein();
      const token = ++walkToken, from = hx, dist = Math.abs(tx - from);
      const kandidatar = [...varder, ...(opts.topp ? [toppVarde] : [])];
      facing = tx < from - 0.5 ? -1 : 1;
      if (dist < 0.5 || opts.instant || M.reduced()) {
        hx = tx; lean = 0; walking = false; walkTarget = null; doneX = opts.keepDone ? doneX : Math.max(doneX, tx);
        if (!opts.keepDone) kandidatar.forEach((v) => vardeX(v) - STOPP <= hx + 0.01 && leggStein(v, true));
        arm.removeAttribute('transform'); svg.classList.remove('gaar-no'); place(); return Promise.resolve();
      }
      walking = true; walkTarget = tx;
      // Varder med midten framfor han og innanfor steget: stopp før kvar (eller der han står, om han alt er nær)
      const stopp = facing > 0 ? kandidatar.filter((v) => !v.stein && vardeX(v) > from + 1 && vardeX(v) - STOPP <= tx + 0.01).sort((a, b) => vardeX(a) - vardeX(b)) : [];
      walkPromise = (async () => {
        let x0 = from;
        for (const v of stopp) {
          const ved = Math.max(x0, vardeX(v) - STOPP);
          await steg(x0, ved, token, opts.keepDone);
          if (token !== walkToken) return;
          await leggStein(v);
          if (token !== walkToken) return;
          x0 = ved;
        }
        await steg(x0, tx, token, opts.keepDone);
      })().then(() => { if (token === walkToken) { walking = false; walkTarget = null; lean = 0; svg.classList.add('kvile'); facing = 1; place(); } });
      return walkPromise;
    }
    let bobleT = 0;
    function bubble(show, i, total, text) {
      const synleg = boble.dataset.skjult === 'false';
      boble.dataset.skjult = show ? 'false' : 'true';
      if (!show) return;
      const bi = $('#boble-i'), bn = $('#boble-n'), bav = $('#boble-av'), tekst = $('#boble-tekst');
      const w0 = boble.offsetWidth, foer = tekst.textContent, varTal = !!bn.textContent;
      if (text) { bi.textContent = ''; bav.textContent = text; bn.textContent = ''; }
      else {
        bav.textContent = ui('av'); bn.textContent = total;
        const prev = Number(bi.textContent) || 0;
        if (prev && prev !== i) M.animate(bi, [{ transform: `translateY(${i > prev ? 8 : -8}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: M.ease.inn });
        bi.textContent = i;
      }
      // Ny tekst med anna breidd: bobla veks eller krympar mjukt rundt pila, i staden for å hoppe til sides
      const t = ++bobleT; boble.style.width = '';
      const w1 = boble.offsetWidth;
      if (!synleg || M.reduced() || Math.abs(w1 - w0) < 1) { place(); return; }
      const annanTekst = text ? tekst.textContent !== foer : !varTal;
      if (annanTekst) M.animate(tekst, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 40, easing: M.ease.inn, fill: 'backwards' });
      boble.style.width = `${w0}px`;
      M.tween(w0, w1, 300, 'sti', (w) => { if (t === bobleT) { boble.style.width = `${w.toFixed(1)}px`; place(); } }).then(() => { if (t === bobleT) { boble.style.width = ''; place(); } });
    }
    function finish(on) { svg.classList.toggle('ferdig', on); box.classList.toggle('ferdig', on); if (!on) svg.classList.remove('vinkar'); }
    function vink() { svg.classList.add('vinkar'); }
    function mood(m) { box.dataset.stemning = m || ''; }
    function preview(on) { box.dataset.forslag = on ? 'true' : 'false'; fram.setAttribute('d', on ? d(pts(Math.min(hx + 4, XS - 4), XS, 2)) : ''); }
    function reset() { fullfoerStein(); walkToken++; walking = false; walkTarget = null; lean = 0; doneX = 6; hx = 6; fjernSteinar(); finish(false); svg.classList.remove('gaar-no'); place(); }
    // Berre breiddeendringar teiknar om. Høgda endrar vi sjølve under kamerarørsla, og den skal ikkje avbrytast.
    new ResizeObserver(() => { const w = box.clientWidth; if (Math.abs(w - lastW) < 1) return; lastW = w; camToken++; const t = fit(mode); apply(t.vb, t.H); }).observe(box);
    svg.classList.add('kvile');
    return { camera, layout, walkTo, bubble, marks, finish, vink, mood, preview, reset, checkX: (i) => xs[i] ?? checkX(i), trailhead: () => 6, endX: () => X1 + 12, summitX: () => XS + 10.5, toppStopp: () => XS - STOPP, get n() { return n; } };
  })();

  /* ---------- Hjelparar ---------- */
  const stage = $('#stage'), bar = $('#handling'), bBack = $('#b-tilbake'), bSkip = $('#b-hopp'), bNext = $('#b-neste');
  const sectionsOf = () => visPath().map((q) => q.sec);
  function stateList() {
    const p = path(), ferdig = (i) => i < S.i || ['review', 'summit', 'leader'].includes(S.screen);
    return visPath().map((q, i) => {
      if (i >= p.length) return S.leaderDecided ? 'hoppa' : 'valfri';
      if (!ferdig(i)) return 'att';
      return S.skipped.has(q.id) || S.answers[q.id] === undefined ? 'hoppa' : 'svart';
    });
  }
  function valid(q, v) {
    switch (q.type) {
      case 'single': return typeof v === 'string';
      case 'multi': return Array.isArray(v) && v.length > 0;
      case 'text': return typeof v === 'string' && v.trim().length >= 2;
      case 'scale': return Number.isInteger(v);
      case 'nps': return Number.isInteger(v);
      default: return false;
    }
  }
  function answerText(q) {
    const v = S.answers[q.id];
    if (S.skipped.has(q.id) || v === undefined) return ui('hoppa');
    if (q.type === 'single') return tx(q.opts.find((o) => o.id === v)?.t);
    if (q.type === 'multi') return v.map((id) => tx(q.opts.find((o) => o.id === id)?.t)).join(', ');
    if (q.type === 'scale') return `${v} (${tx(q.scale.low)} 1 – 5 ${tx(q.scale.high)})`;
    if (q.type === 'nps') return `${v} / 10`;
    return v;
  }
  function toast(msg, ms = 3200) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `${ICON.lagre}<span>${esc(msg)}</span>`;
    $('#toasts').append(t);
    M.animate(t, [{ transform: 'translateY(16px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: M.ease.fjor });
    setTimeout(() => M.animate(t, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 180, easing: M.ease.ut }).then(() => t.remove()), ms);
  }
  function announce(s) { $('#framdrift-sr').textContent = s; }
  function post() { try { if (window.parent !== window) window.parent.postMessage({ type: 'varde:state', screen: S.screen, q: cur()?.id ?? null }, location.origin === 'null' ? '*' : location.origin); } catch { /* utan forelder */ } }

  /* ---------- Skjermar ---------- */
  function vIntro() {
    const notice = D.notice[S.lang] || D.notice.nn;
    return `<section class="skjerm intro">
      ${S.draft ? `<div class="utkast anim" role="status"><h2>${ui('velkomen')}</h2><p>${ui('utkast')}</p><div class="knappar"><button type="button" class="btn primary sm" data-act="resume">${ui('haldFram', { i: 6 })}</button><button type="button" class="btn sm" data-act="fresh">${ui('startNytt')}</button></div></div>` : ''}
      <div class="eyebrow anim">${esc(tx(D.short))}</div>
      <h1 class="anim">${esc(tx(D.title))}</h1>
      <div class="brev">${D.letter.map((p) => `<p class="anim">${esc(tx(p))}</p>`).join('')}<p class="anim">${ui('for')} <span class="kunde">${esc(S.client)}</span>.</p></div>
      <ul class="fakta">
        <li class="anim">${ICON.klokke}<span>${ui('f1', { n: D.minutes })}</span></li>
        ${D.facts.map((f) => `<li class="anim">${ICON.hake}<span>${esc(tx(f))}</span></li>`).join('')}
      </ul>
      <div class="personvern anim">
        <div class="personvern-topp"><span class="merke">${ICON.skjold}</span><div><h2>${ui('kvenSer')}</h2><p>${ui('kvenSerTekst')}</p></div></div>
        <button type="button" class="linkbtn" data-act="notice" aria-expanded="false" aria-controls="meir">${ui('lesMeir')} ${ICON.ned}</button>
        <div class="meir" id="meir" data-open="false"><div><ul>${notice.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>
      </div>
      <p class="helsing anim">${ui('helsing')} ${esc(tx(D.sender))}</p>
    </section>`;
  }
  function vQuestion(q) {
    const v = S.answers[q.id], sec = D.sections[q.sec], p = path();
    let body = '';
    if (q.type === 'single' || q.type === 'multi') {
      const role = q.type === 'single' ? 'radio' : 'checkbox';
      body = `<div class="val" role="${q.type === 'single' ? 'radiogroup' : 'group'}" aria-labelledby="sp-${q.id}">${q.opts.map((o) => {
        const on = q.type === 'single' ? v === o.id : Array.isArray(v) && v.includes(o.id);
        return `<button type="button" class="opt anim" role="${role}" aria-checked="${on}" data-opt="${o.id}"><span class="ind" aria-hidden="true">${role === 'checkbox' ? '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>' : ''}</span><span>${esc(tx(o.t))}</span></button>`;
      }).join('')}</div>${q.type === 'multi' ? `<div class="teljar anim" aria-live="polite">${Array.isArray(v) && v.length ? ui(q.max ? 'valtMaks' : 'valt', { n: v.length, m: q.max }) : ''}</div>` : ''}`;
    } else if (q.type === 'text' && q.line) {
      const val = typeof v === 'string' ? v : '', slots = Math.max(5, Math.min(q.maxlen ?? 8, val.length));
      body = `<div class="ruter anim" data-ruter><input id="tekst-${q.id}" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="${q.maxlen ?? 8}" aria-labelledby="sp-${q.id}" value="${esc(val)}">${Array.from({ length: slots }, (_, k) => `<span class="rute" aria-hidden="true"></span>`).join('')}</div>`;
    } else if (q.type === 'text') {
      const val = typeof v === 'string' ? v : '';
      body = `<textarea class="fritekst anim" id="tekst-${q.id}" maxlength="1500" aria-labelledby="sp-${q.id}" rows="4">${esc(val)}</textarea><div class="fri-merk anim"><span>${ui('valfritt')}</span><span class="att" aria-live="polite"></span></div>`;
    } else if (q.type === 'scale' || q.type === 'nps') {
      const lo = q.scale.min, hi = q.scale.max, cnt = hi - lo + 1;
      body = `<div class="skala anim ${q.type === 'nps' ? 'nps' : ''}"><div class="skala-spor" role="radiogroup" aria-labelledby="sp-${q.id}" style="--n:${cnt}"><span class="skala-tommel" aria-hidden="true"></span>${Array.from({ length: cnt }, (_, k) => `<button type="button" role="radio" aria-checked="${v === lo + k}" data-n="${lo + k}">${lo + k}</button>`).join('')}</div><div class="skala-endar"><span>${esc(tx(q.scale.low))}</span><span>${esc(tx(q.scale.high))}</span></div></div>
      ${q.free ? `<div class="fri" data-open="${v !== undefined}"><div><label for="fri-${q.id}">${esc(tx(q.free.t))}</label><textarea class="fritekst" id="fri-${q.id}" maxlength="800" rows="3">${esc(S.free[q.id] ?? '')}</textarea></div></div>` : ''}`;
    }
    return `<section class="skjerm sporsmal" data-q="${q.id}">
      <div class="sp-hovud anim"><span class="eyebrow seksjon">${ICON.varde}${esc(tx(sec.t))}</span><span class="sp-nr">${ui('sporsmal', { i: S.i + 1, n: p.length })}</span></div>
      <h1 class="sp anim" id="sp-${q.id}" tabindex="-1">${esc(tx(q.t))}</h1>
      ${q.help ? `<p class="hjelp anim">${esc(tx(q.help))}</p>` : ''}
      ${q.max ? `<p class="hjelp anim">${ui('maks', { n: q.max })}</p>` : ''}
      ${body}
    </section>`;
  }
  function vLeader() {
    return `<section class="skjerm mellom">
      <div class="eyebrow anim">${ui('leiarEyebrow')}</div>
      <h1 class="anim" tabindex="-1">${esc(tx(D.leaderIntro.title))}</h1>
      <p class="anim">${esc(tx(D.leaderIntro.text))}</p>
      <div class="aerleg anim">${ICON.auge}<p>${esc(tx(D.leaderNotice))}</p></div>
      <div class="vegval">
        <button type="button" class="veg hoved anim" data-act="leader-yes"><b>${ui('taDei')}</b><span>${ui('taDeiSub', { n: leaderQs.length })}</span>${ICON.pil}</button>
        <button type="button" class="veg anim" data-act="leader-no"><b>${ui('hoppSend')}</b><span>${ui('hoppSendSub')}</span>${ICON.pil}</button>
      </div>
    </section>`;
  }
  function vReview() {
    const p = path(), groups = [];
    p.forEach((q) => { let g = groups.find((x) => x.sec === q.sec); if (!g) groups.push((g = { sec: q.sec, qs: [] })); g.qs.push(q); });
    return `<section class="skjerm oversyn">
      <div class="eyebrow anim">${esc(tx(D.short))}</div>
      <h1 class="anim" tabindex="-1">${ui('review')}</h1>
      <p class="lagra anim">${ICON.lagre}${ui('ready')}</p>
      ${S.sendError ? `<div class="feilmelding anim" role="alert">${ICON.varsel}<span>${ui('sendFeil')}</span></div>` : ''}
      <ol class="seksjonar">${groups.map((g, k) => {
        const answered = g.qs.filter((q) => S.answers[q.id] !== undefined && !S.skipped.has(q.id)).length;
        return `<li class="anim"><button type="button" class="seksjon-knapp" data-act="sec" aria-expanded="false" aria-controls="ss-${k}">${ICON.varde}<span>${esc(tx(D.sections[g.sec].t))}</span><span class="tal">${ui('svart', { a: answered, n: g.qs.length })}</span><span class="pil">${ICON.ned}</span></button>
        <div class="seksjon-svar" id="ss-${k}" data-open="false"><div><dl>${g.qs.map((q) => `<div><dt>${esc(tx(q.t))}</dt><dd><span>${esc(answerText(q))}</span><button type="button" class="linkbtn" data-act="edit" data-q="${q.id}">${ui('endre')}</button></dd></div>`).join('')}</dl></div></div></li>`;
      }).join('')}</ol>
    </section>`;
  }
  function vSummit() {
    const c = D.contact;
    return `<section class="skjerm slutt">
      <div class="eyebrow anim">${ui('toppen')}</div>
      <h1 class="anim" tabindex="-1">${ui('takk')}</h1>
      <p class="ingress anim">${ui('sendt')}</p>
      <h2 class="anim kva-skjer">${ui('kvaSkjer')}</h2>
      <ol class="steg">
        <li class="gjort anim"><span class="nr" aria-hidden="true">✓</span><p>${ui('steg1')}</p></li>
        <li class="no anim"><span class="nr" aria-hidden="true">2</span><p>${ui('steg2', { k: esc(S.client) })}</p></li>
        <li class="anim"><span class="nr" aria-hidden="true">3</span><p>${ui('steg3')}</p></li>
      </ol>
      <div class="kontakt anim"><h2>${ui('kontakt')}</h2>
        <div class="kontakt-rad"><b>${esc(c.name)}</b></div>
        <div class="kontakt-rad"><b class="tnum">${esc(c.phone)}</b><button type="button" class="btn sm" data-copy="${esc(c.phone)}">${ui('kopier')}</button></div>
        <div class="kontakt-rad"><b>${esc(c.email)}</b><button type="button" class="btn sm" data-copy="${esc(c.email)}">${ui('kopier')}</button></div>
        <small class="muted">${esc(tx(c.hours))}</small>
      </div>
      <p class="lukk anim">${ui('lukk')}</p>
    </section>`;
  }
  function vState(kind) {
    const map = { invalid: ['lenke', 'ugyldigTittel', 'ugyldigTekst'], closed: ['mane', 'stengdTittel', 'stengdTekst'], revoked: ['lenke', 'byttTittel', 'byttTekst'], loading: ['klokke', 'lastar', ''] };
    const [ic, t, p] = map[kind];
    if (kind === 'loading') return `<section class="skjerm tilstand" aria-busy="true"><div class="skel" style="height:14px;width:30%;margin-top:18px"></div><div class="skel" style="height:40px;width:85%;margin-top:14px"></div><div class="skel" style="height:16px;width:96%;margin-top:18px"></div><div class="skel" style="height:16px;width:88%;margin-top:10px"></div><p class="sr-only">${ui('lastar')}</p></section>`;
    const c = D.contact;
    return `<section class="skjerm tilstand"><div class="ikon anim">${ICON[ic]}</div><h1 class="anim" tabindex="-1">${ui(t)}</h1><p class="anim">${ui(p)}</p>
      <div class="kontakt anim"><h2>${ui('kontakt')}</h2><div class="kontakt-rad"><b class="tnum">${esc(c.phone)}</b><button type="button" class="btn sm" data-copy="${esc(c.phone)}">${ui('kopier')}</button></div><div class="kontakt-rad"><b>${esc(c.email)}</b><button type="button" class="btn sm" data-copy="${esc(c.email)}">${ui('kopier')}</button></div><small class="muted">${esc(tx(c.hours))}</small></div></section>`;
  }

  /* ---------- Overgangar ---------- */
  let showing = Promise.resolve(), advanceTimer = 0;
  function render() {
    switch (S.screen) {
      case 'intro': return vIntro();
      case 'q': return vQuestion(cur());
      case 'leader': return vLeader();
      case 'review': return vReview();
      case 'summit': return vSummit();
      default: return vState(S.screen);
    }
  }
  function show(screen, dir = 1, opts = {}) {
    clearTimeout(advanceTimer);
    showing = showing.then(async () => {
      const old = stage.firstElementChild, prev = S.screen;
      S.screen = screen;
      scene(prev, dir, opts.instant);
      if (old && !opts.instant) await M.animate(old, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 20}px)` }], { duration: 150, easing: M.ease.ut });
      stage.innerHTML = render();
      const fresh = stage.firstElementChild;
      hydrate(fresh);
      if (!opts.instant) M.stagger($$('.anim', fresh), [{ opacity: 0, transform: `translateX(${dir * 26}px)` }, { opacity: 1, transform: 'none' }], { duration: 440, easing: M.ease.inn, step: 34, max: 8, fill: 'backwards' });
      if (window.scrollY > 40) window.scrollTo({ top: 0, behavior: M.reduced() ? 'auto' : 'smooth' });
      actions(opts.instant);
      const h = fresh.querySelector('h1[tabindex]');
      if (h && prev && !opts.instant && !EMBED) h.focus({ preventScroll: true });
      post();
    }).catch((err) => console.error(err));
    return showing;
  }
  function scene(prev, dir, instant) {
    L.finish(S.screen === 'summit'); L.mood(S.screen === 'invalid' || S.screen === 'revoked' ? 'take' : S.screen === 'closed' ? 'kveld' : '');
    L.preview(false);
    const p = path();
    if (S.screen === 'intro' || S.screen === 'loading') { L.camera('hero', instant); L.walkTo(L.trailhead(), { instant, keepDone: true }); L.bubble(false); return; }
    if (S.screen === 'q') {
      L.camera('sti', instant); L.marks(stateList());
      L.walkTo(L.checkX(S.i), { instant }); L.bubble(true, S.i + 1, p.length);
      announce(ui('sporsmal', { i: S.i + 1, n: p.length })); return;
    }
    if (S.screen === 'leader') { L.camera('sti', instant); L.marks(stateList()); L.walkTo(L.checkX(S.i) + 6, { instant }).then(() => S.screen === 'leader' && L.preview(true)); L.bubble(true, 0, 0, '+' + leaderQs.length); return; }
    if (S.screen === 'review') { L.camera('sti', instant); L.marks(stateList()); L.walkTo(L.endX(), { instant }); L.bubble(true, p.length, p.length); return; }
    if (S.screen === 'summit') { L.camera('topp', instant); L.marks(stateList()); L.walkTo(L.summitX(), { instant, topp: true }).then(() => S.screen === 'summit' && L.vink()); L.bubble(true, 0, 0, ui('toppen')); announce(ui('toppen')); return; }
    L.marks([]); L.camera('tilstand', instant); L.bubble(false);
    if (S.screen === 'closed') L.walkTo(L.summitX(), { instant: true, keepDone: true });
    else { L.reset(); L.walkTo(22, { instant: true, keepDone: true }); }
  }
  function actions(instant) {
    const scr = S.screen, q = cur();
    const want = new Map([[bBack, ['q', 'leader', 'review'].includes(scr)], [bSkip, scr === 'q' && !q?.req], [bNext, ['intro', 'q', 'review'].includes(scr)]]);
    const stay = [...want].filter(([b, on]) => !b.hidden && on).map(([b]) => b);
    const enter = [...want].filter(([b, on]) => b.hidden && on).map(([b]) => b);
    const mutate = () => {
      bar.dataset.skjult = ['summit', 'invalid', 'closed', 'revoked', 'loading'].includes(scr) ? 'true' : 'false';
      bNext.classList.toggle('full', scr === 'intro');
      want.forEach((on, b) => { b.hidden = !on; });
      $('.lbl', bBack).textContent = ui('tilbake'); bBack.setAttribute('aria-label', ui('tilbake')); bSkip.textContent = ui('hopp');
      $('.lbl', bNext).textContent = scr === 'intro' ? ui('start') : scr === 'review' ? (S.sending ? ui('sender') : S.sendError ? ui('provIgjen') : ui('send')) : S.fraOversyn ? ui('tilOversyn') : ui('vidare');
      $('svg', bNext).style.display = S.sending ? 'none' : '';
      $('.spinn', bNext)?.remove();
      if (S.sending) bNext.prepend(Object.assign(document.createElement('span'), { className: 'spinn' }));
      refreshNext(true);
    };
    if (instant) return mutate();
    M.flip(stay, mutate, { duration: 560 });
    enter.forEach((b, k) => M.animate(b, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 80 + k * 50, easing: M.ease.inn, fill: 'backwards' }));
  }
  function refreshNext(quiet) {
    const was = bNext.disabled;
    bNext.disabled = S.screen === 'q' ? !valid(cur(), S.answers[cur().id]) : S.sending;
    if (was && !bNext.disabled && !quiet) { bNext.classList.remove('vakna'); void bNext.offsetWidth; bNext.classList.add('vakna'); }
  }

  /* ---------- Interaksjon i skjermen ---------- */
  function hydrate(root) {
    const q = S.screen === 'q' ? cur() : null;
    if (q && q.type === 'text' && q.line) {
      const wrap = $('[data-ruter]', root), input = $('input', wrap);
      const paint = (pop) => {
        const val = input.value.toUpperCase(); let rs = $$('.rute', wrap);
        const want = Math.max(5, Math.min(q.maxlen ?? 8, val.length));
        while (rs.length < want) { const r = document.createElement('span'); r.className = 'rute'; r.setAttribute('aria-hidden', 'true'); wrap.append(r); M.animate(r, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: M.ease.sprett }); rs = $$('.rute', wrap); }
        while (rs.length > want) { rs.pop().remove(); }
        rs.forEach((r, k) => {
          const ch = val[k] ?? '', placeholder = !val.length ? (tx(q.ph) || '')[k] ?? '' : '';
          const had = r.textContent;
          r.textContent = ch || placeholder; r.classList.toggle('fylt', !!ch); r.classList.toggle('plass', !ch && !!placeholder); r.classList.toggle('no', k === val.length);
          if (pop && ch && had !== ch) M.animate(r, [{ transform: 'scale(1.16)' }, { transform: 'none' }], { duration: 380, easing: M.ease.sprett });
        });
      };
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-ZÆØÅ]/g, ''); S.answers[q.id] = input.value || undefined; S.skipped.delete(q.id); paint(true); refreshNext(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !bNext.disabled) next(); });
      paint(false);
      if (!EMBED && window.matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus({ preventScroll: true }), M.ms(450) + 20);
    }
    if (q && q.type === 'text' && !q.line) {
      const ta = $('textarea', root), att = $('.att', root);
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(128, ta.scrollHeight + 2) + 'px'; const left = 1500 - ta.value.length; att.textContent = left < 200 ? ui('teikn', { n: left }) : ''; };
      ta.addEventListener('input', () => { S.answers[q.id] = ta.value.trim() ? ta.value : undefined; S.skipped.delete(q.id); grow(); refreshNext(); });
      grow();
    }
    if (q && (q.type === 'scale' || q.type === 'nps')) { requestAnimationFrame(() => thumb(root, false)); const fri = $('.fri textarea', root); if (fri) fri.addEventListener('input', () => { S.free[q.id] = fri.value; }); }
  }
  function thumb(root, animate = true) {
    const spor = $('.skala-spor', root); if (!spor) return;
    const t = $('.skala-tommel', spor), on = $('[aria-checked="true"]', spor);
    if (!on) { t.style.opacity = '0'; return; }
    if (!animate) t.style.transition = 'none';
    t.style.width = on.offsetWidth + 'px'; t.style.transform = `translateX(${on.offsetLeft}px) scale(1)`; t.style.opacity = '1';
    if (!animate) { void t.offsetWidth; t.style.transition = ''; }
  }

  stage.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const q = S.screen === 'q' ? cur() : null;
    if (b.dataset.copy !== undefined) return copy(b);
    if (b.classList.contains('opt') && q) {
      if (b.getAttribute('aria-disabled') === 'true') return;
      if (q.type === 'single') {
        S.answers[q.id] = b.dataset.opt; S.skipped.delete(q.id);
        $$('.opt', stage).forEach((o) => o.setAttribute('aria-checked', String(o === b)));
        if (q.id === 'F2') roleChanged();
        refreshNext();
        clearTimeout(advanceTimer);
        stegFram();
        advanceTimer = setTimeout(() => { if (S.screen === 'q' && cur() === q) next(); }, Math.max(120, M.ms(300)));
      } else {
        const id = b.dataset.opt, picked = Array.isArray(S.answers[q.id]) ? S.answers[q.id].slice() : [];
        let nextPicked;
        if (picked.includes(id)) nextPicked = picked.filter((x) => x !== id);
        else if (q.excl?.includes(id)) nextPicked = [id];
        else { const rest = picked.filter((x) => !q.excl?.includes(x)); nextPicked = q.max && rest.length >= q.max ? rest : [...rest, id]; }
        S.answers[q.id] = nextPicked.length ? nextPicked : undefined; S.skipped.delete(q.id);
        const full = q.max && nextPicked.filter((x) => !q.excl?.includes(x)).length >= q.max;
        $$('.opt', stage).forEach((o) => {
          const on = nextPicked.includes(o.dataset.opt); o.setAttribute('aria-checked', String(on));
          o.setAttribute('aria-disabled', String(!!full && !on && !q.excl?.includes(o.dataset.opt)));
        });
        const tl = $('.teljar', stage); tl.textContent = nextPicked.length ? ui(q.max ? 'valtMaks' : 'valt', { n: nextPicked.length, m: q.max }) : '';
        if (nextPicked.length) M.animate(tl, [{ transform: 'translateY(4px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: M.ease.inn });
        refreshNext();
      }
      return;
    }
    if (b.closest('.skala-spor') && q) {
      const v = Number(b.dataset.n); S.answers[q.id] = v; S.skipped.delete(q.id);
      $$('.skala-spor button', stage).forEach((o) => o.setAttribute('aria-checked', String(o === b)));
      thumb(stage, true);
      if (window.matchMedia('(max-width: 480px)').matches && q.type === 'nps') M.animate(b, [{ transform: 'scale(.86)' }, { transform: 'none' }], { duration: 420, easing: M.ease.sprett });
      const fri = $('.fri', stage); if (fri) fri.dataset.open = 'true';
      refreshNext(); return;
    }
    const act = b.dataset.act;
    if (act === 'notice') {
      const meir = $('#meir'), open = meir.dataset.open !== 'true';
      meir.dataset.open = String(open); b.setAttribute('aria-expanded', String(open)); b.firstChild.textContent = (open ? ui('lesMindre') : ui('lesMeir')) + ' ';
      if (open) M.stagger($$('#meir li'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, step: 40, easing: M.ease.inn, fill: 'backwards' });
    }
    if (act === 'sec') { const p = $('#' + b.getAttribute('aria-controls')), open = p.dataset.open !== 'true'; p.dataset.open = String(open); b.setAttribute('aria-expanded', String(open)); }
    if (act === 'edit') { S.i = path().findIndex((x) => x.id === b.dataset.q); S.sendError = false; S.fraOversyn = true; show('q', -1); }
    if (act === 'leader-yes') { S.leader = true; S.leaderDecided = true; S.i = common.length; show('q', 1); }
    if (act === 'leader-no') { S.leaderDecided = true; show('review', 1); }
    if (act === 'resume') { S.draft = false; demoFill(5); S.i = 5; show('q', 1); toast(ui('lagra')); }
    if (act === 'fresh') { S.draft = false; const sec = b.closest('.utkast'); M.animate(sec, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 180, easing: M.ease.ut }).then(() => { M.flip($$('.anim', stage), () => sec.remove()); }); }
  });

  function roleChanged() {
    if (!isLeader()) { S.leader = false; S.leaderDecided = false; }
    if (visPath().length !== L.n) L.layout(visPath().length, sectionsOf());
  }
  async function copy(b) {
    const v = b.dataset.copy;
    try { await navigator.clipboard.writeText(v); } catch { const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    const old = b.textContent; b.textContent = ui('kopiert'); M.animate(b, [{ transform: 'scale(.92)' }, { transform: 'none' }], { duration: 420, easing: M.ease.sprett });
    setTimeout(() => (b.textContent = old), 1600);
  }

  /* ---------- Navigasjon ---------- */
  // Kvar turgåaren skal når svaret er gitt (same reglar som next())
  function nesteMal() {
    const p = path();
    if (S.fraOversyn) return L.endX();
    if (S.i < p.length - 1) return L.checkX(S.i + 1);
    if (!S.leader && isLeader() && !S.leaderDecided) return L.checkX(S.i) + 6;
    return L.endX();
  }
  function stegFram() {
    const p = path();
    L.walkTo(nesteMal());
    if (S.i < p.length - 1 && !S.fraOversyn) L.bubble(true, S.i + 2, p.length);
  }
  function next() {
    clearTimeout(advanceTimer);
    if (S.screen === 'q') stegFram();
    if (S.screen === 'intro') { S.i = 0; return show('q', 1); }
    if (S.screen === 'review') return send();
    if (S.screen !== 'q') return;
    // Etter «Endre» i oversynet går hovudknappen rett tilbake dit
    if (S.fraOversyn) { S.fraOversyn = false; return show('review', 1); }
    const p = path();
    if (S.i < p.length - 1) { S.i++; return show('q', 1); }
    if (!S.leader && isLeader() && !S.leaderDecided) return show('leader', 1);
    return show('review', 1);
  }
  function back() {
    clearTimeout(advanceTimer);
    if (S.screen === 'q') { if (S.i === 0) return show('intro', -1); S.i--; return show('q', -1); }
    if (S.screen === 'leader') { S.i = common.length - 1; return show('q', -1); }
    if (S.screen === 'review') { S.i = path().length - 1; S.sendError = false; return show('q', -1); }
  }
  function skip() { const q = cur(); delete S.answers[q.id]; S.skipped.add(q.id); next(); }
  async function send() {
    if (S.sending) return;
    S.sending = true; S.sendError = false; actions(true);
    L.walkTo(L.toppStopp());
    await new Promise((r) => setTimeout(r, Math.max(400, M.ms(800))));
    S.sending = false;
    if (S.failSend) {
      S.sendError = true; actions(true);
      const old = $('.feilmelding', stage);
      if (!old) { const div = document.createElement('div'); div.className = 'feilmelding'; div.setAttribute('role', 'alert'); div.innerHTML = `${ICON.varsel}<span>${ui('sendFeil')}</span>`; $('.lagra', stage).after(div); M.animate(div, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: M.ease.inn }); }
      return;
    }
    show('summit', 1);
  }
  bNext.addEventListener('click', next);
  bBack.addEventListener('click', back);
  bSkip.addEventListener('click', skip);

  /* ---------- Språk ---------- */
  const sprak = $('#sprak');
  sprak.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]'); if (!b || b.dataset.lang === S.lang) return;
    S.lang = b.dataset.lang; document.documentElement.lang = S.lang === 'nn' ? 'nn' : 'en';
    $$('button', sprak).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); M.segThumb(sprak);
    M.animate(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: M.ease.ut }).then(() => {
      stage.innerHTML = render(); hydrate(stage.firstElementChild); actions(true);
      if (S.screen === 'q') L.bubble(true, S.i + 1, path().length); else if (S.screen === 'summit') L.bubble(true, 0, 0, ui('toppen'));
      M.animate(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: M.ease.inn });
    });
  });

  /* ---------- Demo-svar, så ein kan hoppe rett inn i ein skjerm ---------- */
  const DEMO = { F1: 'OLNOR', F2: 'kontor', F4: 'ja', F5: 'delvis', F8: 'nei', F9: 'nei', F10: 'oftast', F11: 'ja', F12: 'delvis', F14: 'ja', F15: ['m365', 'vpn'], F16: 'ja', F18: 'ja', F21: 'Fleire kurs i å kjenne att svindel-e-post.', B2: 'dag', B4: ['stans', 'svindel'], B14: 3, B16: 8 };
  function demoFill(upto, leader) {
    S.answers = {}; S.skipped.clear(); S.free = {};
    const all = leader ? [...common, ...leaderQs] : common;
    all.slice(0, upto).forEach((q) => { S.answers[q.id] = Array.isArray(DEMO[q.id]) ? DEMO[q.id].slice() : DEMO[q.id]; });
    if (leader) S.answers.F2 = 'leiar';
  }
  function go(to) {
    clearTimeout(advanceTimer);
    S.sending = false; S.sendError = false; S.draft = false; S.fraOversyn = false;
    const wantLeader = /^B|leader/.test(to) || to === 'summit-leiar';
    S.leader = /^B/.test(to); S.leaderDecided = S.leader;
    if (to === 'intro' || to === 'draft') { demoFill(0); S.draft = to === 'draft'; L.layout(visPath().length, sectionsOf(), true); L.reset(); return show('intro', -1); }
    if (['invalid', 'closed', 'revoked', 'loading'].includes(to)) { demoFill(0); L.layout(visPath().length, sectionsOf(), true); L.reset(); return show(to, 1); }
    if (to === 'leader') { demoFill(common.length, true); S.leader = false; S.leaderDecided = false; L.layout(visPath().length, sectionsOf(), true); L.reset(); S.i = common.length - 1; L.walkTo(L.checkX(S.i), { instant: true }); return show('leader', 1); }
    if (to === 'review' || to === 'summit') { demoFill(99, false); L.layout(visPath().length, sectionsOf(), true); L.reset(); S.i = path().length - 1; L.walkTo(L.checkX(S.i), { instant: true }); return show(to, 1); }
    const idx = [...common, ...leaderQs].findIndex((q) => q.id === to);
    if (idx < 0) return;
    demoFill(idx, wantLeader);
    L.layout(visPath().length, sectionsOf(), true); L.reset();
    S.i = path().findIndex((q) => q.id === to);
    L.walkTo(L.checkX(Math.max(0, S.i - 1)), { instant: true });
    show('q', 1);
  }
  document.addEventListener('varde:go', (e) => go(e.detail.to));

  /* ---------- Prototype-dokka ---------- */
  const STOPS = [['intro', 'Intro'], ['draft', 'Utkast att'], ['F1', 'Initialar'], ['F2', 'Rolle'], ['F4', 'Eitt val'], ['F15', 'Fleire val'], ['F21', 'Fritekst'], ['leader', 'Leiarval'], ['B4', 'Maks 2'], ['B14', 'Skala'], ['B16', 'NPS'], ['review', 'Sjå over'], ['summit', 'Toppen'], ['invalid', 'Ugyldig lenkje'], ['closed', 'Avslutta'], ['revoked', 'Bytt lenkje'], ['loading', 'Lastar']];
  $('#proto-hopp').innerHTML = STOPS.map(([k, l]) => `<button type="button" data-go="${k}">${l}</button>`).join('');
  const ark = $('#proto-ark'), pk = $('#proto-knapp');
  pk.addEventListener('click', () => {
    const open = ark.hidden; ark.hidden = !open; pk.setAttribute('aria-expanded', String(open));
    if (open) { $$('.seg', ark).forEach(M.segThumb); M.animate(ark, [{ opacity: 0, transform: 'scale(.94) translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: M.ease.fjor }); }
  });
  ark.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const b = e.target.closest('.seg button'); if (!b) return;
    const seg = b.closest('.seg'), kind = seg.dataset.pref;
    $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); M.segThumb(seg);
    if (kind === 'theme') M.setPrefs({ theme: b.dataset.v });
    if (kind === 'motion') M.setPrefs({ motion: b.dataset.v === 'system' ? 'system' : b.dataset.v });
    if (kind === 'send') S.failSend = b.dataset.v === 'feil';
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin && location.origin !== 'null') return;
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'varde:send') S.failSend = !!m.fail;
    if (m.type === 'varde:preview') {
      // Levande førehandsvising frå skjemaredigeringa i admin
      const q = D.questions.find((x) => x.id === m.id); if (!q) return;
      if (m.t) q.t = { ...q.t, ...m.t };
      if (m.opts && q.opts) m.opts.forEach((o, i) => { if (q.opts[i]) q.opts[i].t = { ...q.opts[i].t, ...o.t }; });
      if (m.lang && m.lang !== S.lang) { S.lang = m.lang; $$('button', sprak).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.lang === S.lang))); M.segThumb(sprak); }
      if (S.screen === 'q' && cur()?.id === q.id) { stage.innerHTML = render(); hydrate(stage.firstElementChild); actions(true); }
      else go(q.id);
    }
  });

  /* ---------- Start ---------- */
  M.segThumb(sprak);
  document.fonts?.ready.then(() => M.segThumb(sprak));
  L.layout(visPath().length, sectionsOf(), true);
  L.camera('hero', true);
  S.screen = null;
  show('intro', 1);
})();
