/* Varde admin, prototype. Rørsla ber informasjon: live-tal rullar, prikkar fyllast, kort glid inn i lese-rekkjefølgja. */
(() => {
  'use strict';
  const M = window.VardeMotion, A = window.VARDE_ADMIN_DATA, D = window.VARDE_SURVEY;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const EMBED = window.self !== window.top || /innebygd/.test(location.hash);
  if (EMBED) document.documentElement.classList.add('innebygd');

  /* ---------- Format og soner ---------- */
  // Formatert for hand: nettlesarar utan nn-NO fell elles tilbake til systemspråket
  const nn = (n, d = 0) => { const s = Number(n).toFixed(d).replace('.', ','); return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); };
  const VEKEDAG = ['sundag', 'måndag', 'tysdag', 'onsdag', 'torsdag', 'fredag', 'laurdag'];
  const pct = (x) => `${Math.round(x * 100)} %`;
  const MND = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
  const MND_L = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  const dato = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}. ${MND[m - 1]}`; };
  const datoLang = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}. ${MND_L[m - 1]}`; };
  const dagarTil = (iso) => Math.round((Date.parse(iso) - Date.parse(A.idag)) / 864e5);
  const soneAgg = (v) => (v == null ? 'ingen' : v <= 0.5 ? 'gron' : v <= 1.5 ? 'gul' : v <= 2.5 ? 'oransje' : 'raud');
  const sonePerson = (v) => (v < 1 ? 'gron' : v < 2 ? 'gul' : v < 3 ? 'oransje' : 'raud');
  const SONENAMN = { gron: 'Grøn', gul: 'Gul', oransje: 'Oransje', raud: 'Raud', ingen: 'Ikkje vist' };
  const soneChip = (z) => `<span class="sone ${z}"><i></i>${SONENAMN[z]}</span>`;
  const RISK_SONE = ['gron', 'gul', 'oransje', 'raud'];
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* Eksempeltal per kunde og spørsmål (seeda, same kvar gong) */
  const VARME = {};
  A.kundar.forEach((k, ki) => {
    const r = rng(ki * 97 + 13);
    VARME[k.id] = A.sporsmal.map(([, , base]) => Math.max(0, Math.min(3, base + (A.kundeskjeiv[k.id] || 0) + (r() - 0.5) * 0.55)));
  });
  function rekn() {
    A.kundar.forEach((k) => {
      const ok = k.svar >= 3, v = VARME[k.id];
      k.snitt = ok ? v.reduce((a, b) => a + b, 0) / v.length : null;
      k.kritisk = ok ? Math.max(0.04, Math.min(0.6, (k.snitt - 0.35) * 0.3)) : null;
    });
  }
  rekn();
  const synlege = () => A.kundar.filter((k) => k.svar >= 3);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  /* ---------- Ikon (strek, 24-rutenett) ---------- */
  const P = {
    heim: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', flagg: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    bygg: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    graf: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', skjema: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    folk: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.7 5.5 5.8"/>',
    gnist: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    dok: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    las: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', svar: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    nokkel: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>', kalender: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    ned: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>', auge: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    varsel: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>', send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    kopi: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>', pluss: '<path d="M12 5v14M5 12h14"/>',
    lukk: '<path d="M6 6l12 12M18 6L6 18"/>', pil: '<path d="M5 12h14M13 6l6 6-6 6"/>', tilbake: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    hake: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', slett: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', skjerm: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    klokke: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', grep: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    stopp: '<circle cx="12" cy="12" r="9"/><path d="M9 9h6v6H9z"/>', oppdater: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  };
  const I = (n, c = '') => `<svg class="icon ${c}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
  const HIKER = '<svg viewBox="-6 -25 14 26" width="13" height="24" aria-hidden="true"><line x1="0" y1="-8.5" x2="-1.6" y2="0" stroke="var(--ink-strong)" stroke-width="2.2" stroke-linecap="round" opacity=".7"/><rect x="-4.6" y="-16.6" width="3.6" height="6.4" rx="1.4" fill="var(--sekk)"/><line x1="0" y1="-8.5" x2=".8" y2="-15.5" stroke="var(--accent)" stroke-width="3.6" stroke-linecap="round"/><line x1="0" y1="-8.5" x2="1.8" y2="0" stroke="var(--ink-strong)" stroke-width="2.2" stroke-linecap="round"/><line x1="4.6" y1="-13.5" x2="5.6" y2="0" stroke="var(--stein)" stroke-width="1.2" stroke-linecap="round"/><circle cx="1.4" cy="-19" r="2.6" fill="var(--hud)"/><path d="M-1.3,-19.4 A2.75,2.75 0 0 1 4.1,-19.4 Z" fill="var(--lue)"/><circle cx="1.4" cy="-22.4" r="1" fill="var(--lue)"/></svg>';

  /* ---------- Tilstand og navigasjon ---------- */
  const NAV = [
    { g: 'Arbeid' }, { id: 'oversikt', namn: 'Oversikt', ikon: 'heim' }, { id: 'rundar', namn: 'Rundar', ikon: 'flagg', tal: 1 },
    { id: 'kundar', namn: 'Kundar', ikon: 'bygg' }, { id: 'innsikt', namn: 'Innsikt', ikon: 'graf' },
    { g: 'Innhald' }, { id: 'skjema', namn: 'Skjema', ikon: 'skjema' }, { id: 'seminar', namn: 'Seminar', ikon: 'folk', etappe: 'etappe 3' },
    { id: 'assistent', namn: 'Assistent', ikon: 'gnist', etappe: 'etappe 2' }, { id: 'rapportar', namn: 'Rapportar', ikon: 'dok', etappe: 'etappe 5' },
    { g: 'Personvern' }, { id: 'data', namn: 'Eksport og sletting', ikon: 'las' },
  ];
  const ST = {
    page: null, kunde: null, innsikt: { runde: 'r2', kunde: 'alle', rolle: 'alle' }, editQ: 'F10', editLang: 'nn', forslag: 'p1', semTab: 'live',
    poll: { tilstand: 'open', stemmer: A.seminar.start.slice() }, wiz: null, english: false, publisert: false, slettSteg: 0,
  };
  const sideEl = $('#side'), navEl = $('#nav');

  navEl.innerHTML = '<span class="nav-tommel" aria-hidden="true"></span>' + NAV.map((n) => n.g ? `<div class="nav-gruppe">${n.g}</div>` :
    `<a href="#${n.id}" data-page="${n.id}">${I(n.ikon)}<span>${n.namn}</span>${n.etappe ? `<span class="etappe">${n.etappe}</span>` : n.tal ? `<span class="tal">${n.tal}</span>` : ''}</a>`).join('');
  function navThumb(instant) {
    const key = ST.page === 'kunde' ? 'kundar' : ST.page === 'ny-runde' ? 'rundar' : ST.page;
    const a = $(`a[data-page="${key}"]`, navEl), t = $('.nav-tommel', navEl);
    $$('a', navEl).forEach((x) => (x === a ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
    if (!a) { t.style.opacity = '0'; return; }
    if (instant) t.style.transition = 'none';
    t.style.opacity = '1'; t.style.height = a.offsetHeight + 'px'; t.style.transform = `translateY(${a.offsetTop}px)`;
    if (instant) { void t.offsetWidth; t.style.transition = ''; }
  }

  const PAGES = {};
  let navQ = Promise.resolve(), sideCtl = null;
  // Lyttarar som høyrer til éi side, blir fjerna når ein går til neste side (#side lever vidare mellom sidene)
  const lytt = (el, type, fn) => el.addEventListener(type, fn, { signal: sideCtl?.signal });
  function go(page, params = {}, opts = {}) {
    navQ = navQ.then(async () => {
      Object.assign(ST, params);
      const first = !ST.page;
      const vt = opts.vt && document.startViewTransition && !M.reduced();
      if (page === 'ny-runde' && ST.page !== 'ny-runde' && ST.wiz?.ferdig) ST.wiz = null;
      const swap = () => {
        sideCtl?.abort(); sideCtl = new AbortController();
        ST.page = page;
        sideEl.getAnimations().forEach((a) => a.cancel());
        sideEl.innerHTML = PAGES[page].render();
        crumbs(); navThumb(first); document.title = `${PAGES[page].tittel()} · Varde admin`;
        PAGES[page].mount?.(sideEl, { vt });
      };
      if (vt) { await document.startViewTransition(swap).finished.catch(() => {}); }
      else {
        if (!first && !opts.instant) await M.animate(sideEl, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 120, easing: M.ease.ut });
        swap();
        if (!opts.instant) M.stagger($$('.sidetittel, .filter, .kjelde, .rutenett > *, .stagger > *', sideEl).slice(0, 16), [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 520, step: 45, easing: M.ease.inn, fill: 'backwards' });
      }
      if (!first) { sideEl.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'auto' }); }
      closeMenu();
      try { if (location.hash.slice(1) !== page) history.replaceState(null, '', '#' + page); } catch { /* sandbox */ }
      try { if (window.parent !== window) window.parent.postMessage({ type: 'varde:state', app: 'admin', page }, location.origin === 'null' ? '*' : location.origin); } catch { /* utan forelder */ }
    }).catch((e) => console.error(e));
    return navQ;
  }
  function crumbs() {
    const t = PAGES[ST.page].tittel(), parent = PAGES[ST.page].forelder;
    $('#smular').innerHTML = `<a href="#oversikt" data-page="oversikt">Varde</a><span aria-hidden="true">/</span>${parent ? `<a href="#${parent[0]}" data-page="${parent[0]}">${parent[1]}</a><span aria-hidden="true">/</span>` : ''}<b>${esc(t)}</b>`;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-page]');
    if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.dataset.page, a.dataset.kunde ? { kunde: a.dataset.kunde } : {}); }
  });
  window.addEventListener('scroll', () => $('#topplinje').classList.toggle('skuggar', window.scrollY > 8), { passive: true });

  /* ---------- Felles bitar ---------- */
  function toast(msg, ikon = 'hake') {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `${I(ikon, 'sm')}<span>${msg}</span>`;
    $('#toasts').append(t);
    M.animate(t, [{ transform: 'translateY(16px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: M.ease.fjor });
    setTimeout(() => M.animate(t, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 180, easing: M.ease.ut }).then(() => t.remove()), 3200);
  }
  async function kopier(tekst, msg = 'Kopiert') { try { await navigator.clipboard.writeText(tekst); toast(msg); } catch { toast('Kunne ikkje kopiere. Merk teksten og kopier sjølv.', 'info'); } }
  function tittel(eyebrow, h, p, knappar = '') { return `<div class="sidetittel"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${h}</h1>${p ? `<p>${p}</p>` : ''}</div>${knappar ? `<div class="handlingar">${knappar}</div>` : ''}</div>`; }
  const planlagt = (etappe, tekst) => `<div class="kort planlagt" style="padding:14px 16px;display:flex;gap:12px;align-items:center;margin-bottom:16px"><span class="chip">${etappe}</span><p class="muted" style="font-size:13.5px">${tekst}</p></div>`;
  function hald(knapp, onDone) {
    let timer = 0;
    const start = (e) => { if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return; if (e.type === 'keydown') e.preventDefault(); if (knapp.classList.contains('held')) return; knapp.classList.add('held'); timer = setTimeout(() => { knapp.classList.remove('held'); onDone(); }, 1200); };
    const stopp = () => { clearTimeout(timer); knapp.classList.remove('held'); };
    knapp.addEventListener('pointerdown', start); knapp.addEventListener('keydown', start);
    ['pointerup', 'pointerleave', 'keyup', 'blur'].forEach((ev) => knapp.addEventListener(ev, stopp));
  }

  /* ---------- Skuff ---------- */
  const skuff = $('#skuff'), slor = $('#slor');
  let skuffFra = null;
  function openSkuff(html, fra) {
    skuffFra = fra || document.activeElement;
    skuff.innerHTML = html; skuff.hidden = false; slor.hidden = false;
    M.animate(slor, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    M.animate(skuff, [{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: M.ease.fjor });
    M.stagger($$('.skuff-innhald > *', skuff), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, step: 40, delay: 80, easing: M.ease.inn, fill: 'backwards' });
    setTimeout(() => $('[data-lukk]', skuff)?.focus(), 60);
  }
  async function lukkSkuff() {
    if (skuff.hidden) return;
    await Promise.all([M.animate(skuff, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(32px)', opacity: 0 }], { duration: 200, easing: M.ease.ut }), M.animate(slor, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 })]);
    skuff.hidden = true; slor.hidden = true; skuff.innerHTML = '';
    skuffFra?.focus?.();
  }
  slor.addEventListener('click', lukkSkuff);
  skuff.addEventListener('click', (e) => { if (e.target.closest('[data-lukk]')) lukkSkuff(); });

  /* ---------- Send ut ---------- */
  const INVITASJON = {
    nn: 'Hei alle!\n\nVardahei IT, som hjelper oss med IT, vil gjerne vite korleis IT-sikkerheita er i kvardagen vår: kva rutinar vi har, korleis vi held styr på passord og innlogging, og kva vi gjer om noko går gale.\n\nSpørsmåla er dei same som i førre runde, slik at vi kan sjå kva som har endra seg. Du skriv inn initialane dine først, elles er det ingen namn. Svara per person ser berre Vardahei IT, og bedrifta får eit samla bilete. Det tek om lag {minutt} minutt, og «usikker» er eit heilt greitt svar.\n\n{lenkje}\n\nLenkja går til {host}, så du kan trygt opne ho.{frist}\n\nTakk!',
    en: "Hi everyone,\n\nVardahei IT, who help us with IT, would like to know what IT security looks like in our everyday work: which routines we have, how we keep track of passwords and sign-ins, and what we do if something goes wrong.\n\nThe questions are the same as last round, so we can see what has changed. You enter your initials first; apart from that there are no names. Only Vardahei IT sees answers per person, and the company gets an overall picture. It takes about {minutt} minutes, and “not sure” is a perfectly fine answer.\n\n{lenkje}\n\nThe link goes to {host}, so it's safe to open.{frist}\n\nThanks!",
  };
  const LENKJE = 'https://varde.vardahei.tech/r?c=••••••••••••••••••••••';
  function qr(seed) {
    const r = rng(seed), n = 25, cells = [];
    const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#15171a"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#15171a"/>`;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const inF = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!inF && r() > 0.52) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
    return `<svg viewBox="0 0 ${n} ${n}" role="img" aria-label="QR-kode (døme)" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><g fill="#15171a">${cells.join('')}</g>${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
  }
  function sendUt(k, fra) {
    let lang = k.lang === 'en' ? 'en' : 'nn';
    const tekst = () => INVITASJON[lang].replace('{minutt}', D.minutes).replace('{lenkje}', LENKJE).replace('{host}', 'varde.vardahei.tech').replace('{frist}', lang === 'nn' ? ` Svar gjerne innan ${datoLang(k.frist)}.` : ` Please answer by ${new Date(k.frist).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`);
    openSkuff(`<div class="skuff-hovud"><div><div class="eyebrow">Send ut · ${esc(A.runde.namn)}</div><h2 id="skuff-tittel">${esc(k.namn)}</h2></div><button type="button" class="ikonknapp" data-lukk aria-label="Lukk">${I('lukk')}</button></div>
      <div class="skuff-innhald">
        <p class="forklaring" style="margin:0">Teksten er skriven for at leiaren sender han frå si eiga e-post eller i Teams. Fortel gjerne om undersøkinga på eit møte først, så ingen trur det er svindel.</p>
        <div class="seg" id="su-lang" role="group" aria-label="Språk"><button type="button" data-l="nn" aria-pressed="${lang === 'nn'}">Nynorsk</button><button type="button" data-l="en" aria-pressed="${lang === 'en'}">English</button></div>
        <label class="field"><span>Tekst til tilsette</span><textarea id="su-tekst">${esc(tekst())}</textarea></label>
        <div class="lenkjefelt"><code title="Døme. Ekte kodar blir ikkje viste i prototypen.">${LENKJE}</code><button type="button" class="btn sm" id="su-lenkje">${I('kopi', 'sm')}Kopier lenkje</button></div>
        <div class="handlingar"><button type="button" class="btn primary" id="su-kopier">${I('kopi', 'sm')}Kopier tekst</button></div>
        <div class="plakat"><div><div class="eyebrow">Plakat med QR-kode · A4</div><h3>Kor trygg er IT-kvardagen din?</h3><p>Vardahei IT vil vite korleis du har det med e-post, passord og alt det andre. Det tek om lag ${D.minutes} minutt.</p><p><b>Svar gjerne innan ${datoLang(k.frist)}.</b></p></div><div class="qr">${qr(k.namn.length * 31)}</div>
        <svg class="band" viewBox="0 0 400 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0,18 L0,12 L60,6 L110,10 L170,2 L230,9 L290,4 L350,10 L400,6 L400,18Z" fill="var(--accent)" opacity=".85"/></svg></div>
        <p class="muted" style="font-size:12.5px">QR-koden og lenkja er døme. I Varde opnar plakaten i ny fane, klar til utskrift.</p>
      </div>`, fra);
    const seg = $('#su-lang'); M.segThumb(seg);
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; lang = b.dataset.l; $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); M.segThumb(seg); const ta = $('#su-tekst'); M.animate(ta, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: M.ease.ut }).then(() => { ta.value = tekst(); M.animate(ta, [{ opacity: 0 }, { opacity: 1 }], { duration: 220 }); }); });
    $('#su-kopier').addEventListener('click', () => kopier($('#su-tekst').value, 'Teksten er kopiert'));
    $('#su-lenkje').addEventListener('click', () => kopier(LENKJE, 'Lenkja er kopiert'));
  }

  /* ---------- Oversikt ---------- */
  function helsing() { const h = new Date().getHours(); return h < 10 ? 'God morgon' : h < 13 ? 'God dag' : h < 18 ? 'God ettermiddag' : 'God kveld'; }
  function prikkPos(i, n) { const x = n === 1 ? 50 : 2 + (96 * i) / (n - 1); return [x, 25 - 14 * (x / 100) + Math.sin(i * 1.3) * 1.1]; }
  function sporRad(k) {
    const n = k.tilsette, prikkar = Array.from({ length: n }, (_, i) => { const [x, y] = prikkPos(i, n); return `<span class="p${i < k.svar ? ' on' : ''}" style="left:${x.toFixed(2)}%;top:${y.toFixed(1)}px"></span>`; }).join('');
    const [hx, hy] = prikkPos(Math.max(0, k.svar - 1), n), dd = dagarTil(k.frist);
    return `<div class="spor-rad" data-kunde-rad="${k.id}" tabindex="0" role="button" aria-label="${esc(k.namn)}: ${k.svar} av ${n} har svart. Opne runden.">
      <div class="spor-namn">${esc(k.namn)}<small>${n} tilsette</small></div>
      <div class="spor-felt"><svg class="spor-line" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><path d="M2,25 L98,11.6" vector-effect="non-scaling-stroke"/></svg><div class="spor-prikkar" aria-hidden="true">${prikkar}</div><span class="mini-gaar" style="left:${hx.toFixed(2)}%;top:${(hy - 22).toFixed(1)}px">${HIKER}</span></div>
      <div class="spor-tal"><b><span data-svar>${k.svar}</span> av ${n}</b><small><span data-pct>${Math.round((100 * k.svar) / n)}</span> % har svart</small></div>
      <div class="aktive${k.aktive < 3 ? ' skjult' : ''}" data-aktive>${k.aktive >= 3 ? `<span class="live-dot"></span>${k.aktive} no` : '<span title="Færre enn tre blir ikkje viste">–</span>'}</div>
      <div class="frist${dd <= 10 ? ' snart' : ''}">${dd <= 10 ? `Om ${dd} dagar` : dato(k.frist)}</div>
    </div>`;
  }
  function kpi() {
    const tot = sum(A.kundar, (k) => k.svar), pop = sum(A.kundar, (k) => k.tilsette), akt = sum(A.kundar, (k) => k.aktive);
    return { tot, pop, akt, del: tot / pop };
  }
  PAGES.oversikt = {
    tittel: () => 'Oversikt',
    render() {
      const t = kpi(), kv = A.kundar.find((k) => k.id === 'kviknes');
      const vekedag = `${VEKEDAG[new Date(A.idag + 'T12:00:00').getDay()]} ${datoLang(A.idag)}`;
      return tittel(vekedag, `${helsing()}, Oleksandr`, `${esc(A.runde.namn)} er open hos ${A.kundar.length} kundar. Nærast frist: Kviknes, ${datoLang(kv.frist)}.`,
        `<button type="button" class="btn" data-page="ny-runde">${I('pluss', 'sm')}Start ein runde</button><button type="button" class="btn primary" data-page="innsikt">${I('graf', 'sm')}Opne innsikt</button>`) +
      `<div class="rutenett">
        <div class="kort s3 talkort"><span class="etikett">${I('svar', 'sm')}Svar i runden</span><span class="stort"><span data-kpi="tot">${t.tot}</span> <small>av ${t.pop}</small></span><span class="under">Runde 1 hadde 57 svar totalt</span></div>
        <div class="kort s3 talkort"><span class="etikett">${I('graf', 'sm')}Oppslutning</span><span class="stort"><span data-kpi="del">${Math.round(t.del * 100)}</span> <small>%</small></span><span class="under">Av tilsette i runden</span></div>
        <div class="kort s3 talkort"><span class="etikett"><span class="live-dot"></span>Svarar no</span><span class="stort"><span data-kpi="akt">${t.akt}</span></span><span class="under">Aktive økter siste 15 min, alle kundar</span></div>
        <div class="kort s3 talkort"><span class="etikett">${I('klokke', 'sm')}Median svartid</span><span class="stort">6 <small>min</small></span><span class="under">Skjemaet seier «om lag 5 minutt»</span></div>
        <section class="kort s8"><div class="kort-hovud"><h2>Stigen per kunde</h2><p>Éin prikk per tilsett. Turgåaren står der svara har kome til.</p></div>
          <div class="kort-innhald"><div class="fjellbord-hovud" aria-hidden="true"><span>Kunde</span><span>Svar</span><span></span><span>Aktive</span><span>Frist</span></div><div class="fjellbord" id="fjellbord">${A.kundar.map(sporRad).join('')}</div>
          <p class="forklaring">Aktive økter under 3 blir ikkje viste («–»). Svara per person ligg berre i Innsikt og blir logga når nokon opnar dei.</p></div></section>
        <div class="s4 kol stagger" style="display:grid;gap:16px;align-content:start">
          <section class="kort"><div class="kort-hovud"><h2>Treng merksemd</h2></div><div class="kort-innhald"><ul class="liste merksemd">
            <li><span class="ikon warn">${I('kalender')}</span><p><b>Kviknes</b>: fristen er om ${dagarTil(kv.frist)} dagar, og ${Math.round((100 * kv.svar) / kv.tilsette)} % har svart.<small>Leiaren kan sende ei påminning.</small></p><button type="button" class="btn sm" data-act="paaminning">Kopier påminning</button></li>
            <li><span class="ikon warn">${I('varsel')}</span><p><b>Gasta</b>: 3 avbrot ved spørsmål 15.<small>MFA-spørsmålet. Sjå om ordlyden er uklar.</small></p><button type="button" class="btn sm" data-page="rundar">Sjå</button></li>
            <li><span class="ikon info">${I('info')}</span><p><b>Tharaso</b>: 2 svar så langt.<small>Tala blir viste frå 3 svar.</small></p></li>
            <li><span class="ikon ai">${I('gnist')}</span><p><b>2 forslag</b> frå assistenten ventar.<small>Planlagt i etappe 2.</small></p><button type="button" class="btn sm" data-page="assistent">Opne</button></li>
          </ul></div></section>
          <section class="kort"><div class="kort-hovud"><h2>Siste hendingar</h2><span class="chip"><span class="live-dot"></span>Live</span></div><div class="kort-innhald"><ul class="liste hendingar" id="hendingar">${A.hendingar.map(hending).join('')}</ul></div></section>
        </div>
      </div>`;
    },
    mount(root) {
      $$('[data-kpi]', root).forEach((el) => { const v = Number(el.textContent); el.textContent = '0'; M.countTo(el, v, { duration: 900 }); });
      $$('.spor-rad', root).forEach((rad, r) => M.stagger($$('.p.on', rad), [{ transform: 'scale(0)' }, { transform: 'none' }], { duration: 420, step: 14, max: 40, delay: 240 + r * 70, easing: M.ease.sprett, fill: 'backwards' }));
      lytt(root, 'click', (e) => {
        const rad = e.target.closest('[data-kunde-rad]'); if (rad) go('rundar');
        if (e.target.closest('[data-act="paaminning"]')) kopier('Hei alle! Ei lita påminning: kartlegginga frå Vardahei IT er open til 24. oktober. Det tek om lag 5 minutt, og lenkja er den same som sist.', 'Påminninga er kopiert');
      });
      lytt(root, 'keydown', (e) => { if (e.key === 'Enter' && e.target.closest('[data-kunde-rad]')) go('rundar'); });
    },
  };
  function hending([ikon, tekst, kven, tid], fersk) {
    return `<li class="${fersk ? 'fersk' : ''}"><span class="ikon">${I(ikon)}</span><span>${tekst}${kven ? ` <span class="muted">· ${esc(kven)}</span>` : ''}</span><time>${tid}</time></li>`;
  }

  /* ---------- Live: små hendingar kjem inn som frå SSE ---------- */
  function liveTick() {
    if (document.hidden) return;
    const open = A.kundar.filter((k) => k.svar < k.tilsette);
    if (!open.length) return;
    const k = open[Math.floor(Math.random() * open.length)];
    if (Math.random() < 0.72) {
      k.svar++; if (Math.random() < 0.35) k.aktive = Math.max(1, k.aktive - 1);
      rekn(); oppdaterLive(k, true);
    } else { k.aktive = Math.min(6, k.aktive + 1); oppdaterLive(k, false); }
  }
  function oppdaterLive(k, nyttSvar) {
    const t = kpi();
    if (ST.page === 'oversikt') {
      const rad = $(`[data-kunde-rad="${k.id}"]`);
      if (rad) {
        if (nyttSvar) {
          const p = $$('.p', rad)[k.svar - 1]; if (p) { p.classList.add('on', 'ny'); setTimeout(() => p.classList.remove('ny'), 900); }
          const [hx, hy] = prikkPos(k.svar - 1, k.tilsette), g = $('.mini-gaar', rad); g.style.left = hx.toFixed(2) + '%'; g.style.top = (hy - 22).toFixed(1) + 'px';
          M.countTo($('[data-svar]', rad), k.svar); M.countTo($('[data-pct]', rad), Math.round((100 * k.svar) / k.tilsette));
          rad.classList.remove('blink'); void rad.offsetWidth; rad.classList.add('blink');
        }
        const ak = $('[data-aktive]', rad); ak.className = 'aktive' + (k.aktive < 3 ? ' skjult' : '');
        ak.innerHTML = k.aktive >= 3 ? `<span class="live-dot"></span>${k.aktive} no` : '<span title="Færre enn tre blir ikkje viste">–</span>';
      }
      const set = (key, v) => { const el = $(`[data-kpi="${key}"]`); if (el) M.countTo(el, v); };
      set('tot', t.tot); set('del', Math.round(t.del * 100)); set('akt', t.akt);
      if (nyttSvar) {
        A.hendingar.unshift(['svar', `Nytt svar frå <b>${esc(k.namn)}</b>`, null, 'no nettopp']);
        const ul = $('#hendingar');
        if (ul) {
          const items = $$('li', ul);
          M.flip(items, () => { ul.insertAdjacentHTML('afterbegin', hending(A.hendingar[0], true)); if (items.length >= 6) items[items.length - 1].remove(); });
          M.animate(ul.firstElementChild, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: M.ease.inn });
        }
      }
    }
    if (ST.page === 'rundar') {
      const kort = $(`[data-kundekort="${k.id}"]`);
      if (kort) {
        const d = k.svar / k.tilsette, c = 2 * Math.PI * 26;
        $('.ring .fram', kort).style.strokeDashoffset = (c * (1 - d)).toFixed(1);
        M.countTo($('[data-ring]', kort), Math.round(d * 100)); M.countTo($('[data-svar]', kort), k.svar);
      }
    }
  }
  setInterval(liveTick, 4800);

  /* ---------- Rundar ---------- */
  PAGES.rundar = {
    tittel: () => 'Rundar',
    render() {
      const t = kpi();
      return tittel('Rundar', esc(A.runde.namn), `Malen er ${A.runde.mal}. Opna ${datoLang(A.runde.opna)}. ${t.tot} av ${t.pop} har svart.`,
        `<button type="button" class="btn" data-page="ny-runde">${I('pluss', 'sm')}Start ein ny runde</button><button type="button" class="btn danger hald" id="avslutt"><span class="fyll"></span><span>${I('stopp', 'sm')} Hald inne for å avslutte</span></button>`) +
      `<div class="rutenett"><section class="s12"><div class="kundekort-grid">${A.kundar.map((k) => {
        const d = k.svar / k.tilsette, c = 2 * Math.PI * 26;
        return `<article class="kort kundekort" data-kundekort="${k.id}"><div class="kundekort-topp"><h3>${esc(k.namn)}</h3><span class="chip ok"><i></i>Open</span></div>
          <div class="kundekort-midt"><svg class="ring" viewBox="0 0 64 64" role="img" aria-label="${Math.round(d * 100)} % har svart"><circle class="bak" cx="32" cy="32" r="26"/><circle class="fram" cx="32" cy="32" r="26" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-mal="${(c * (1 - d)).toFixed(1)}"/><text x="32" y="37" text-anchor="middle"><tspan data-ring>${Math.round(d * 100)}</tspan>%</text></svg>
          <dl><dt>Svar</dt><dd><span data-svar>${k.svar}</span> av ${k.tilsette}</dd><dt>Aktive no</dt><dd>${k.aktive >= 3 ? k.aktive : '–'}</dd><dt>Avbrot</dt><dd>${k.avbrot >= 3 ? k.avbrot : '–'}</dd><dt>Frist</dt><dd>${dato(k.frist)}</dd></dl></div>
          <div class="knappar"><button type="button" class="btn primary sm" data-sendut="${k.id}">${I('send', 'sm')}Send ut</button><button type="button" class="btn sm" data-frist="${k.id}">${I('kalender', 'sm')}Frist</button><button type="button" class="btn sm ghost" data-kode="${k.id}">${I('nokkel', 'sm')}Ny kode</button></div></article>`;
      }).join('')}</div></section>
      <section class="kort s7"><div class="kort-hovud"><h2>Kvar stoppar folk</h2><p>Siste 24 timar, alle kundar</p></div><div class="kort-innhald"><div class="stoppar">${[['Før første spørsmål', 4], ['Spørsmål 1 (initialar)', 3], ['Spørsmål 9', 2], ['Spørsmål 15', 5], ['Spørsmål 21', 1]].map(([l, v]) => `<div class="stoppar-rad${v < 3 ? ' skjult' : ''}"><span>${l}</span><span class="bar"><span style="transform:scaleX(${v < 3 ? 0 : v / 6})"></span></span><span class="verdi">${v < 3 ? '–' : `${v} avbrot`}</span></div>`).join('')}</div><p class="forklaring">Berre grupper med minst 3 økter er viste. Avbrot: minst 30 minutt utan aktivitet.</p></div></section>
      <section class="kort s5"><div class="kort-hovud"><h2>Rundar før</h2></div><div class="kort-innhald"><ul class="liste hendingar"><li><span class="ikon">${I('flagg')}</span><span><b>Runde 1 · Forms · januar 2026</b><br><span class="muted">57 svar frå 6 kundar. Importert 15. okt. Alle seks var gule.</span></span><time>Avslutta</time></li></ul></div></section></div>`;
    },
    mount(root) {
      requestAnimationFrame(() => $$('.ring .fram', root).forEach((c, i) => setTimeout(() => (c.style.strokeDashoffset = c.dataset.mal), M.ms(120 + i * 70))));
      M.stagger($$('.stoppar .bar span', root), [{ transform: 'scaleX(0)' }, {}], { duration: 700, step: 60, delay: 200, easing: M.ease.inn, fill: 'backwards' });
      hald($('#avslutt', root), () => toast('Prototype: runden blir ikkje avslutta her. I Varde blir tala publiserte og låste.', 'info'));
      lytt(root, 'click', (e) => {
        const su = e.target.closest('[data-sendut]'); if (su) return sendUt(A.kundar.find((k) => k.id === su.dataset.sendut), su);
        const kode = e.target.closest('[data-kode]');
        if (kode) {
          if (kode.dataset.armed === '1') { kode.dataset.armed = ''; kode.classList.remove('danger'); kode.innerHTML = `${I('nokkel', 'sm')}Ny kode`; return toast(`Ny kode for ${esc(A.kundar.find((k) => k.id === kode.dataset.kode).namn)}. Gamle lenkjer verkar ikkje lenger.`, 'nokkel'); }
          kode.dataset.armed = '1'; kode.classList.add('danger'); kode.innerHTML = 'Gamle lenkjer sluttar å verke. Stadfest';
          M.animate(kode, [{ transform: 'scale(.94)' }, { transform: 'none' }], { duration: 420, easing: M.ease.sprett });
          setTimeout(() => { if (kode.dataset.armed === '1') { kode.dataset.armed = ''; kode.classList.remove('danger'); kode.innerHTML = `${I('nokkel', 'sm')}Ny kode`; } }, 5000);
        }
        if (e.target.closest('[data-frist]')) toast('Prototype: her kjem ein datoveljar for fristen.', 'kalender');
      });
    },
  };

  /* ---------- Start ein runde (veiviser) ---------- */
  const STEG = ['Skjema', 'Kundar', 'Fristar', 'Sjå over'];
  function nyWiz() { return { steg: 0, mal: 'tryggleik', namn: 'Runde 3 · IT-sikkerheit · vår 2027', kundar: [], frist: {}, tal: {}, opne: true, ferdig: false }; }
  PAGES['ny-runde'] = {
    tittel: () => 'Start ein runde', forelder: ['rundar', 'Rundar'],
    render() {
      if (!ST.wiz) ST.wiz = nyWiz();
      return tittel('Ny runde', 'Start ein runde', 'Fire steg. Ingenting blir sendt ut av seg sjølv: du får tekstar og plakat til kvar kunde til slutt.') +
        `<section class="kort"><div class="kort-innhald" style="padding:22px"><ol class="steg-sti" id="stegsti" style="padding:0">${STEG.map((s, i) => `<li><span class="stein">${i + 1}</span><span>${s}</span></li>`).join('')}</ol><div class="veiviser-kropp" id="wiz-kropp"></div>
        <div class="veiviser-fot" id="wiz-fot"><button type="button" class="btn ghost" id="wiz-tilbake">${I('tilbake', 'sm')}Tilbake</button><button type="button" class="btn primary neste" id="wiz-neste"><span>Vidare</span>${I('pil', 'sm')}</button></div></div></section>`;
    },
    mount(root) { wizSteg(root, 0, true); bindWiz(root); },
  };
  function wizKropp() {
    const w = ST.wiz;
    if (w.ferdig) {
      return `<div class="stagger" style="display:grid;gap:14px"><div style="display:flex;gap:14px;align-items:center"><span class="avatar" style="width:44px;height:44px">${I('hake')}</span><div><h2 style="font-size:20px">Runden er starta</h2><p class="muted">${esc(w.namn)} · ${w.kundar.length} kundar · ${w.opne ? 'open no' : 'ikkje opna enno'}</p></div></div>
        <h3 style="font-size:15px;margin-top:6px">Invitasjonar til den nye runden</h3>${w.kundar.map((id) => { const k = A.kundar.find((x) => x.id === id); return `<div class="kort" style="padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:none"><b style="color:var(--ink-strong)">${esc(k.namn)}</b><span class="muted">Frist ${dato(w.frist[id] || '2027-03-31')}</span><button type="button" class="btn primary sm" style="margin-left:auto" data-sendut="${id}">${I('send', 'sm')}Send ut</button></div>`; }).join('')}</div>`;
    }
    if (w.steg === 0) {
      return `<div class="stagger" style="display:grid;gap:18px"><label class="field"><span>Namn på den nye runden</span><input class="input" id="wiz-namn" value="${esc(w.namn)}" maxlength="200"></label>
        <div><div class="field"><span>Vel publisert versjon</span></div><div class="malval" style="margin-top:8px">${[['tryggleik', 'IT-sikkerheit i kvardagen', 'tryggleik · 2026-10-13', '22 felles + 18 for leiarar · om lag 5 minutt · initialar'], ['ki', 'Arbeidsdagen og KI', 'ki · 2026-10-13', '21 felles + 11 for leiarar · om lag 7 minutt · initialar']].map(([id, t, v, s]) => `<button type="button" class="mal" data-mal="${id}" aria-pressed="${w.mal === id}"><span class="eyebrow">${v}</span><b>${t}</b><small>${s}</small></button>`).join('')}</div></div></div>`;
    }
    if (w.steg === 1) {
      return `<div class="stagger" style="display:grid;gap:16px"><div class="handlingar"><button type="button" class="btn sm" data-alle="1">Vel alle</button><button type="button" class="btn sm ghost" data-alle="0">Vel ingen</button><span class="muted" id="wiz-tal" style="margin-left:6px">${w.kundar.length} valde</span></div>
        <div class="kundeval">${A.kundar.map((k) => `<button type="button" class="kundebrikke" data-k="${k.id}" aria-pressed="${w.kundar.includes(k.id)}"><span class="hake"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span>${esc(k.namn)} <small>${k.tilsette} tilsette</small></button>`).join('')}</div>
        <p class="forklaring">Talet på tilsette blir brukt i nye rundar. Rundar som alt er oppretta, held på sitt eige tal.</p></div>`;
    }
    if (w.steg === 2) {
      if (!w.kundar.length) return '<p class="tom">Vel minst éin kunde i førre steg.</p>';
      return `<div class="stagger" style="display:grid;gap:6px"><div class="handlingar" style="margin-bottom:6px"><button type="button" class="btn sm" id="same-frist">${I('kalender', 'sm')}Same frist for alle: 31. mars</button></div>${w.kundar.map((id) => { const k = A.kundar.find((x) => x.id === id); return `<div class="frist-rad"><b>${esc(k.namn)}</b><label class="field"><span>Frist</span><input class="input" type="date" data-frist-k="${id}" value="${w.frist[id] || ''}"></label><label class="field"><span>Tilsette i runden</span><input class="input" type="number" min="1" max="9999" data-tal-k="${id}" value="${w.tal[id] ?? k.tilsette}"></label></div>`; }).join('')}</div>`;
    }
    const mal = w.mal === 'tryggleik' ? 'IT-sikkerheit i kvardagen · tryggleik · 2026-10-13' : 'Arbeidsdagen og KI · ki · 2026-10-13';
    return `<div class="stagger" style="display:grid;gap:18px"><dl class="oppsummering"><dt>Namn</dt><dd>${esc(w.namn)}</dd><dt>Skjema</dt><dd>${mal}</dd><dt>Kundar</dt><dd>${w.kundar.map((id) => esc(A.kundar.find((k) => k.id === id).namn)).join(', ') || '–'}</dd><dt>Fristar</dt><dd>${w.kundar.map((id) => dato(w.frist[id] || '2027-03-31')).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '–'}</dd><dt>Tilsette</dt><dd>${sum(w.kundar, (id) => Number(w.tal[id] ?? A.kundar.find((k) => k.id === id).tilsette))}</dd></dl>
      <label class="brytar"><input type="checkbox" id="wiz-opne" ${w.opne ? 'checked' : ''}>Opne med ein gong</label>
      <p class="forklaring">Første «Opne» frys skjemaversjonen og om runden er anonym. Alt blir lagra i éin transaksjon.</p></div>`;
  }
  function wizSteg(root, dir, instant) {
    const w = ST.wiz, kropp = $('#wiz-kropp', root), sti = $('#stegsti', root);
    const paint = () => {
      kropp.innerHTML = wizKropp();
      $$('li', sti).forEach((li, i) => { li.classList.toggle('gjort', w.ferdig || i < w.steg); li.classList.toggle('no', !w.ferdig && i === w.steg); li.style.setProperty('--fyll', w.ferdig || i < w.steg ? '1' : '0'); });
      const neste = $('#wiz-neste', root);
      $('#wiz-tilbake', root).style.visibility = w.steg === 0 || w.ferdig ? 'hidden' : 'visible';
      neste.style.display = w.ferdig ? 'none' : '';
      $('span', neste).textContent = w.steg === 3 ? 'Start runden' : 'Vidare';
      neste.disabled = (w.steg === 1 && !w.kundar.length) || (w.steg === 2 && !w.kundar.length);
      if (!instant) M.stagger($$('.stagger > *', kropp), [{ opacity: 0, transform: `translateX(${dir * 26}px)` }, { opacity: 1, transform: 'none' }], { duration: 440, step: 40, easing: M.ease.inn, fill: 'backwards' });
    };
    if (instant) { paint(); return; }
    M.animate(kropp, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 18}px)` }], { duration: 140, easing: M.ease.ut }).then(() => { kropp.getAnimations().forEach((a) => a.cancel()); paint(); });
  }
  function bindWiz(root) {
    lytt(root, 'click', (e) => {
      const w = ST.wiz; if (!w || ST.page !== 'ny-runde') return;
      if (e.target.closest('#wiz-neste')) {
        if (w.steg < 3) { w.steg++; return wizSteg(root, 1); }
        w.ferdig = true;
        const btn = e.target.closest('#wiz-neste'); M.animate(btn, [{ transform: 'scale(.94)' }, { transform: 'none' }], { duration: 400, easing: M.ease.sprett });
        $$('#stegsti li', root).forEach((li, i) => setTimeout(() => { li.classList.add('gjort'); li.classList.remove('no'); li.style.setProperty('--fyll', '1'); M.animate($('.stein', li), [{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 520, easing: M.ease.sprett }); }, M.ms(i * 120)));
        setTimeout(() => wizSteg(root, 1), M.ms(520));
        toast(`${esc(w.namn)} er starta`);
        return;
      }
      if (e.target.closest('#wiz-tilbake')) { if (w.steg > 0) { w.steg--; wizSteg(root, -1); } return; }
      const mal = e.target.closest('[data-mal]'); if (mal) { w.mal = mal.dataset.mal; w.namn = w.mal === 'ki' ? 'Runde 2 · Arbeidsdagen og KI · vår 2027' : 'Runde 3 · IT-sikkerheit · vår 2027'; $$('[data-mal]', root).forEach((m) => m.setAttribute('aria-pressed', String(m === mal))); const inp = $('#wiz-namn', root); inp.value = w.namn; M.animate(inp, [{ backgroundColor: 'var(--accent-soft)' }, { backgroundColor: 'var(--surface)' }], { duration: 700 }); return; }
      const kb = e.target.closest('[data-k]');
      if (kb) {
        const id = kb.dataset.k, on = !w.kundar.includes(id);
        w.kundar = on ? [...w.kundar, id] : w.kundar.filter((x) => x !== id);
        kb.setAttribute('aria-pressed', String(on)); M.animate(kb, [{ transform: 'scale(.95)' }, { transform: 'none' }], { duration: 460, easing: M.ease.sprett });
        $('#wiz-tal', root).textContent = `${w.kundar.length} valde`; $('#wiz-neste', root).disabled = !w.kundar.length; return;
      }
      const alle = e.target.closest('[data-alle]');
      if (alle) { w.kundar = alle.dataset.alle === '1' ? A.kundar.map((k) => k.id) : []; $$('[data-k]', root).forEach((b, i) => { const on = w.kundar.includes(b.dataset.k); if (b.getAttribute('aria-pressed') !== String(on)) { setTimeout(() => { b.setAttribute('aria-pressed', String(on)); M.animate(b, [{ transform: 'scale(.95)' }, { transform: 'none' }], { duration: 460, easing: M.ease.sprett }); }, M.ms(i * 45)); } }); $('#wiz-tal', root).textContent = `${w.kundar.length} valde`; $('#wiz-neste', root).disabled = !w.kundar.length; return; }
      if (e.target.closest('#same-frist')) { $$('[data-frist-k]', root).forEach((inp, i) => setTimeout(() => { inp.value = '2027-03-31'; w.frist[inp.dataset.fristK] = inp.value; M.animate(inp, [{ backgroundColor: 'var(--accent-soft)', transform: 'scale(1.02)' }, { backgroundColor: 'var(--surface)', transform: 'none' }], { duration: 620, easing: M.ease.fjor }); }, M.ms(i * 70))); return; }
      const su = e.target.closest('[data-sendut]'); if (su) { const k = A.kundar.find((x) => x.id === su.dataset.sendut); sendUt({ ...k, frist: ST.wiz.frist[k.id] || '2027-03-31' }, su); }
    });
    lytt(root, 'input', (e) => {
      const w = ST.wiz; if (!w) return;
      if (e.target.id === 'wiz-namn') w.namn = e.target.value;
      if (e.target.dataset.fristK) w.frist[e.target.dataset.fristK] = e.target.value;
      if (e.target.dataset.talK) w.tal[e.target.dataset.talK] = e.target.value;
      if (e.target.id === 'wiz-opne') w.opne = e.target.checked;
    });
  }

  /* ---------- Kundar ---------- */
  PAGES.kundar = {
    tittel: () => 'Kundar',
    render() {
      return tittel('Kundar', 'Kundar', 'Seks kundar. Kortet viser siste runde og korleis det gjekk i runde 1.', `<button type="button" class="btn">${I('pluss', 'sm')}Legg til kunde</button>`) +
        `<div class="kundekort-grid stagger">${A.kundar.map((k) => `<a href="#kunde" class="kort kundekort lenkjekort" data-kunde-opne="${k.id}" style="view-transition-name:kunde-${k.id}"><div class="kundekort-topp"><h3>${esc(k.namn)}</h3>${soneChip(soneAgg(k.snitt))}</div>
          <dl class="oppsummering" style="font-size:13px"><dt>Tilsette</dt><dd>${k.tilsette}</dd><dt>Runde 2</dt><dd>${k.svar} av ${k.tilsette} har svart</dd><dt>Runde 1</dt><dd>${k.r1.n} svar · gul · ${nn(k.r1.snitt, 2)}</dd><dt>Språk</dt><dd>${k.lang === 'en' ? 'English' : 'Nynorsk'}</dd></dl></a>`).join('')}</div>`;
    },
    mount(root) { lytt(root, 'click', (e) => { const b = e.target.closest('[data-kunde-opne]'); if (b) { e.preventDefault(); go('kunde', { kunde: b.dataset.kundeOpne }, { vt: true }); } }); },
  };
  PAGES.kunde = {
    tittel: () => A.kundar.find((k) => k.id === ST.kunde)?.namn ?? 'Kunde', forelder: ['kundar', 'Kundar'],
    render() {
      const k = A.kundar.find((x) => x.id === ST.kunde) || A.kundar[0];
      return `<div class="kort" style="padding:22px;margin:8px 0 16px;view-transition-name:kunde-${k.id}"><div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between"><div><div class="eyebrow">Kunde</div><h1 style="font-size:30px;letter-spacing:-0.02em">${esc(k.namn)}</h1><p class="muted">${k.tilsette} tilsette · ${k.lang === 'en' ? 'English' : 'Nynorsk'} som standardspråk</p></div><div class="handlingar">${soneChip(soneAgg(k.snitt))}<button type="button" class="btn" data-sendut="${k.id}">${I('send', 'sm')}Send ut</button><button type="button" class="btn primary" data-innsikt="${k.id}">${I('graf', 'sm')}Innsikt for ${esc(k.namn)}</button></div></div></div>
        <div class="rutenett">
          <section class="kort s6"><div class="kort-hovud"><h2>Rundar</h2></div><div class="kort-innhald"><ul class="liste hendingar"><li><span class="ikon">${I('flagg')}</span><span><b>Runde 2 · haust 2026</b><br><span class="muted">${k.svar} av ${k.tilsette} har svart · frist ${dato(k.frist)}</span></span><time>Open</time></li><li><span class="ikon">${I('flagg')}</span><span><b>Runde 1 · Forms · januar 2026</b><br><span class="muted">${k.r1.n} svar · snittscore ${nn(k.r1.snitt, 2)} · gul</span></span><time>Avslutta</time></li></ul></div></section>
          <section class="kort s6"><div class="kort-hovud"><h2>Innstillingar</h2></div><div class="kort-innhald" style="display:grid;gap:14px"><label class="field"><span>Tal tilsette</span><span style="display:flex;gap:8px"><input class="input" type="number" value="${k.tilsette}" style="max-width:140px" id="k-tal"><button type="button" class="btn" id="k-lagre">Lagre kunde</button></span></label><p class="forklaring" style="margin:0">Talet blir brukt i nye rundar. Rundar som alt er oppretta, held på sitt eige tal.</p></div></section>
        </div>`;
    },
    mount(root) {
      lytt(root, 'click', (e) => {
        const su = e.target.closest('[data-sendut]'); if (su) return sendUt(A.kundar.find((k) => k.id === su.dataset.sendut), su);
        const ins = e.target.closest('[data-innsikt]'); if (ins) { ST.innsikt.kunde = ins.dataset.innsikt; return go('innsikt'); }
        if (e.target.closest('#k-lagre')) toast('Kunden er lagra');
      });
    },
  };

  /* ---------- Innsikt ---------- */
  function utval() {
    const f = ST.innsikt, r1 = f.runde === 'r1';
    const ks = (f.kunde === 'alle' ? A.kundar : A.kundar.filter((k) => k.id === f.kunde));
    if (r1) { const n = sum(ks, (k) => k.r1.n), s = sum(ks, (k) => k.r1.snitt * k.r1.n) / n, kr = sum(ks, (k) => k.r1.kritisk * k.r1.n) / n; return { n, snitt: s, kritisk: kr, r1 }; }
    const vis = ks.filter((k) => k.svar >= 3), n = sum(vis, (k) => k.svar);
    if (!n) return { n: sum(ks, (k) => k.svar), snitt: null, kritisk: null, r1 };
    return { n, snitt: sum(vis, (k) => k.snitt * k.svar) / n, kritisk: sum(vis, (k) => k.kritisk * k.svar) / n, r1 };
  }
  function soneFordeling(u) {
    if (u.snitt == null) return null;
    const base = u.snitt; const g = Math.max(0.05, 0.62 - base * 0.32), o = Math.max(0.03, (base - 0.7) * 0.22), raud = 0;
    const gul = Math.max(0, 1 - g - o - raud); const n = u.n;
    return [['gron', Math.round(g * n)], ['gul', Math.round(gul * n)], ['oransje', Math.round(o * n)], ['raud', raud]];
  }
  function kake(nk, i) {
    const r = 40, c = 2 * Math.PI * r; let acc = 0;
    const segs = nk.delar.map(([, d, risk]) => { const len = d * c, s = `<circle class="seg-bue" cx="56" cy="56" r="${r}" stroke="var(--sone-${RISK_SONE[risk]})" stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 56 56)" data-len="${len.toFixed(2)}" data-c="${c.toFixed(2)}"/>`; acc += len; return s; }).join('');
    const kr = nk.delar.filter(([, , risk]) => risk >= 2).reduce((s, [, d]) => s + d, 0);
    return `<figure class="kake" style="margin:0"><svg viewBox="0 0 112 112" role="img" aria-label="${esc(nk.namn)}: kritisk andel ${pct(kr)}. ${nk.delar.map(([l, d]) => `${l} ${pct(d)}`).join(', ')}">${segs}<text class="midt" x="56" y="58" text-anchor="middle">${Math.round(kr * 100)} %</text><text class="midt-under" x="56" y="71" text-anchor="middle">kritisk</text></svg><h3>${esc(nk.namn)}</h3></figure>`;
  }
  function varmekart() {
    const f = ST.innsikt;
    return `<div class="tabell-boks"><table class="varme" aria-label="Soner per kunde og spørsmål"><thead><tr><th scope="col"></th>${A.sporsmal.map(([id, kort]) => `<th scope="col" title="${id}">${esc(kort)}</th>`).join('')}</tr></thead><tbody>${A.kundar.map((k) => {
      const skjult = f.runde === 'r2' && k.svar < 3;
      return `<tr data-rad="${k.id}" class="${f.kunde !== 'alle' && f.kunde !== k.id ? 'dempa' : ''}"><th scope="row">${esc(k.namn)}</th>${VARME[k.id].map((v, qi) => {
        const val = f.runde === 'r1' ? Math.max(0, Math.min(3, v + 0.08 + ((qi * 7 + k.namn.length) % 5 - 2) * 0.06)) : v;
        return skjult ? `<td class="skjult" title="Færre enn 3 svar">–</td>` : `<td class="${soneAgg(val)}" title="${esc(k.namn)} · ${esc(A.sporsmal[qi][1])}: ${nn(val, 2)} · ${SONENAMN[soneAgg(val)]}">${nn(val, 1)}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function slepp(ys, gap) {
    // Skyv etikettar frå kvarandre så dei ikkje overlappar, men held rekkjefølgja
    const o = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < o.length; k++) if (o[k].y - o[k - 1].y < gap) o[k].y = o[k - 1].y + gap;
    const out = []; o.forEach((p) => (out[p.i] = p.y)); return out;
  }
  function helling() {
    const W = 470, H = 300, x1 = 150, x2 = 330, y = (v) => 36 + (1 - (v - 0.8) / 0.6) * (H - 70);
    const ks = A.kundar.filter((k) => k.svar >= 3);
    const ly = slepp(ks.map((k) => y(k.r1.snitt)), 19), ry = slepp(ks.map((k) => y(k.snitt)), 19);
    const farge = (cls) => (cls === 'betre' ? 'var(--sone-gron)' : cls === 'verre' ? 'var(--sone-raud)' : 'var(--line-strong)');
    const lines = ks.map((k, i) => {
      const d = k.snitt - k.r1.snitt, cls = Math.abs(d) < 0.05 ? 'likt' : d < 0 ? 'betre' : 'verre';
      return `<g><path class="lina ${cls}" d="M${x1},${y(k.r1.snitt).toFixed(1)} L${x2},${y(k.snitt).toFixed(1)}" pathLength="1"/><circle cx="${x1}" cy="${y(k.r1.snitt).toFixed(1)}" r="3.5" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/><circle cx="${x2}" cy="${y(k.snitt).toFixed(1)}" r="4" fill="var(--surface)" stroke-width="2.2" stroke="${farge(cls)}"/><text x="${x1 - 10}" y="${(ly[i] + 4).toFixed(1)}" text-anchor="end">${esc(k.namn)} <tspan class="muted-t">${nn(k.r1.snitt, 2)}</tspan></text><text x="${x2 + 10}" y="${(ry[i] + 4).toFixed(1)}">${nn(k.snitt, 2)} <tspan style="fill:${farge(cls)};font-weight:700">${cls}</tspan></text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Snittscore runde 1 mot runde 2 per kunde. Lågare er betre."><line class="akse" x1="${x1}" y1="22" x2="${x1}" y2="${H - 10}"/><line class="akse" x1="${x2}" y1="22" x2="${x2}" y2="${H - 10}"/><text x="${x1}" y="14" text-anchor="middle" style="font-weight:700">Runde 1</text><text x="${x2}" y="14" text-anchor="middle" style="font-weight:700">Runde 2</text>${lines}</svg>`;
  }
  PAGES.innsikt = {
    tittel: () => 'Innsikt',
    render() {
      const f = ST.innsikt, u = utval(), z = soneAgg(u.snitt), fd = soneFordeling(u);
      const ks = f.kunde === 'alle' ? 'alle kundar' : A.kundar.find((k) => k.id === f.kunde).namn;
      return tittel('Innsikt · IT-sikkerheit', f.kunde === 'alle' ? 'Alle kundar' : esc(ks), null, `<button type="button" class="btn" data-page="data">${I('ned', 'sm')}Eksport</button>`) +
      `<div class="filter"><div class="seg" id="f-runde" role="group" aria-label="Runde"><button type="button" data-v="r1" aria-pressed="${f.runde === 'r1'}">Runde 1 · jan.</button><button type="button" data-v="r2" aria-pressed="${f.runde === 'r2'}">Runde 2 · open</button></div>
        <label>Kunde <select class="velg" id="f-kunde"><option value="alle">Alle</option>${A.kundar.map((k) => `<option value="${k.id}" ${f.kunde === k.id ? 'selected' : ''}>${esc(k.namn)}</option>`).join('')}</select></label>
        <label>Rolle <select class="velg" id="f-rolle"><option>Alle</option><option>Leiar</option><option>Administrasjon/kontor</option><option>Produksjon/drift</option></select></label></div>
      <div class="kjelde">${f.runde === 'r1' ? `${I('las', 'sm')}Publiserte tal frå den avslutta runden.` : '<span class="live-dot"></span>Levande tal frå den opne runden.'} Roller med færre enn 3 svar og grupper som kan røpe små grupper, er ikkje viste.</div>
      <div class="rutenett">
        <section class="kort s4 talkort"><span class="etikett">Sone for utvalet</span><span style="display:flex;align-items:center;gap:12px;margin:4px 0">${soneChip(z)}<span class="stort" id="i-snitt">${u.snitt == null ? '–' : nn(u.snitt, 2)}</span><small class="muted">av 3</small></span><span class="under">Snittscore. Lågare er betre.</span></section>
        <section class="kort s4 talkort"><span class="etikett">Kritisk andel</span><span class="stort"><span id="i-kritisk">${u.kritisk == null ? '–' : Math.round(u.kritisk * 100)}</span> <small>%</small></span><span class="under">Svar i oransje eller raud sone</span></section>
        <section class="kort s4 talkort"><span class="etikett">Tilsette per sone · ${u.n} svar</span>${fd ? `<div class="stabel" style="margin:10px 0 8px">${fd.map(([zz, v]) => `<span class="${zz}" style="width:${(100 * v) / Math.max(1, u.n)}%"></span>`).join('')}</div><div class="forklaring-soner" style="margin:0">${fd.map(([zz, v]) => `${soneChip(zz)} ${v < 3 ? '–' : v}`).join('')}</div>` : '<span class="under">For få svar til å vise.</span>'}</section>
        <section class="kort s12"><div class="kort-hovud"><h2>Soner per kunde og spørsmål</h2><p>Snittscore 0–3 per spørsmål. Fargane er sonene frå reknearket.</p></div><div class="kort-innhald">${varmekart()}<div class="forklaring-soner">${['gron', 'gul', 'oransje', 'raud'].map(soneChip).join('')}<span>Grøn ≤ 0,5 · Gul ≤ 1,5 · Oransje ≤ 2,5 · Raud over</span></div></div></section>
        <section class="kort s6"><div class="kort-hovud"><h2>Dette bør vi ta tak i</h2><p>Funn rekna ut frå svara: minst to personar, middels frå 15 %, høg frå 30 %.</p></div><div class="kort-innhald"><ul class="liste funn">${A.funn.map((fu) => `<li><span class="niva ${fu.niva}"><i></i>${fu.niva === 'hog' ? 'Høg' : 'Middels'}</span><span class="tekst"><span class="tal">${pct(fu.del)}</span> ${esc(fu.tekst)}</span><span class="tiltak"><b>Forslag:</b> ${esc(fu.tiltak)}</span></li>`).join('')}</ul></div></section>
        <section class="kort s6"><div class="kort-hovud"><h2>Nøkkelspørsmåla</h2><p>Talet i midten er kritisk andel.</p></div><div class="kort-innhald"><div class="kaker">${A.nokkel.map(kake).join('')}</div></div></section>
        <section class="kort s6 helling"><div class="kort-hovud"><h2>Samanlikning med runde 1</h2><p>Lågare snittscore er betre. Same spørsmål, men ikkje nødvendigvis same personar.</p></div><div class="kort-innhald">${helling()}<p class="forklaring">Endringa er observert, ikkje forklart.${A.kundar.filter((k) => k.svar < 3).map((k) => ` ${esc(k.namn)} er ikkje med enno: under 3 svar.`).join('')}</p></div></section>
        <section class="kort s6"><div class="kort-hovud"><h2>Sitat frå tilsette</h2><span class="chip warn">Eksempel</span></div><div class="kort-innhald"><ul class="liste hendingar">${A.sitat.map(([t, r]) => `<li><span class="ikon">${I('info')}</span><span>«${esc(t)}»${r ? `<br><span class="muted" style="font-size:12.5px">${esc(r)}</span>` : ''}</span><span></span></li>`).join('')}</ul><p class="forklaring">Rolla blir berre vist når rollegruppa har minst 3 personar.</p></div></section>
        <section class="kort s12"><div class="kort-hovud"><h2>${I('las', 'sm')}Svar per tilsett</h2><span class="chip">Berre Vardahei IT ser dette · kvar opning blir logga</span></div><div class="kort-innhald"><div class="tabell-boks"><table class="data"><thead><tr><th>Initialar</th><th>Rolle</th><th>Kunde</th><th>Snittscore</th><th>Sone</th><th>Runde 1</th><th>Oransje og raud</th></tr></thead><tbody>${A.tilsette.map(([ini, rolle, kunde, s, s1, or]) => { const z2 = sonePerson(s), z1 = sonePerson(s1), d = s - s1; return `<tr><td class="initialar">${ini}</td><td>${esc(rolle)}</td><td>${esc(kunde)}</td><td>${nn(s, 2)}</td><td>${soneChip(z2)}</td><td>${soneChip(z1)} <span class="muted">${Math.abs(d) < 0.05 ? 'likt' : d < 0 ? 'betre' : 'verre'}</span></td><td>${or.length ? or.slice(0, 5).map((q) => `<span class="kjeldebrikke">${q}</span>`).join(' ') + (or.length > 5 ? ` +${or.length - 5}` : '') : '–'}</td></tr>`; }).join('')}</tbody></table></div><p class="forklaring">Samanlikninga går på same initialar i same bedrift, så ho er omtrentleg. Ein person kan aldri hamne i raud sone: høgaste moglege snitt er 2,25.</p></div></section>
      </div>`;
    },
    mount(root, { vt } = {}) {
      ['#f-runde'].forEach((s) => M.segThumb($(s, root)));
      const tbody = $('.varme tbody', root);
      if (!vt) $$('tr', tbody).forEach((tr, r) => $$('td', tr).forEach((td, c) => M.animate(td, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 200 + (r + c) * 22, easing: M.ease.fjor, fill: 'backwards' })));
      $$('.kake .seg-bue', root).forEach((s, i) => M.animate(s, [{ strokeDasharray: `0 ${s.dataset.c}` }, { strokeDasharray: `${s.dataset.len} ${s.dataset.c}` }], { duration: 900, delay: 300 + Math.floor(i / 3) * 60, easing: M.ease.inn, fill: 'backwards' }));
      $$('.helling .lina', root).forEach((l, i) => M.animate(l, [{ strokeDasharray: '0 1' }, { strokeDasharray: '1 0' }], { duration: 900, delay: 400 + i * 90, easing: M.ease.inn, fill: 'backwards' }));
      $$('.stabel span', root).forEach((s, i) => M.animate(s, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 700, delay: 250 + i * 90, easing: M.ease.inn, fill: 'backwards' }));
      const snitt = $('#i-snitt', root); if (snitt && snitt.textContent !== '–') { const v = utval().snitt; M.tween(0, v, 900, 'inn', (x) => (snitt.textContent = nn(x, 2))); }
      $('#f-runde', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.v === ST.innsikt.runde) return; ST.innsikt.runde = b.dataset.v; go('innsikt'); });
      $('#f-kunde', root).addEventListener('change', (e) => { ST.innsikt.kunde = e.target.value; go('innsikt'); });
    },
  };

  /* ---------- Skjema (redigering med levande førehandsvising) ---------- */
  const RISIKO = { F4: [3, 0, 1], F5: [0, 1, 2, 1], F8: [3, 2, 0, 1], F9: [0, 2, 1], F10: [0, 1, 2, 2], F11: [0, 2, 1], F12: [0, 1, 2, 1], F14: [0, 2, 1], F16: [0, 1, 2, 1], F18: [0, 1, 2, 1] };
  PAGES.skjema = {
    tittel: () => 'Skjema',
    render() {
      const secs = D.sections;
      const liste = secs.map((s, si) => { const qs = D.questions.filter((q) => q.sec === si); if (!qs.length) return ''; return `<li class="seksjon-namn">${esc(s.t.nn)}</li>${qs.map((q) => `<li><button type="button" class="sp-rad" data-q="${q.id}" aria-current="${q.id === ST.editQ}"><span class="grep">${I('grep', 'sm')}</span><span class="id">${q.id}</span><span class="t">${esc(q.t.nn)}</span>${q.id.startsWith('F') ? `<span class="las" title="Fast spørsmål">${I('las', 'sm')}</span>` : ''}</button></li>`).join('')}`; }).join('');
      return tittel('Skjema · tryggleik', 'IT-sikkerheit i kvardagen', 'Utkast v4, bygd på 2026-10-13. Endringane blir viste i telefonen til høgre medan du skriv.', `<span class="chip ${ST.publisert ? 'ok' : 'warn'}" id="v-status">${ST.publisert ? 'Publisert · v4' : 'Utkast · v4'}</span><button type="button" class="btn">${I('pluss', 'sm')}Nytt utkast</button>`) +
        `<div class="redigering"><section class="kort"><div class="kort-hovud"><h2>Spørsmål</h2><span class="muted">${D.questions.length} i utvalet</span></div><ul class="sp-liste" id="sp-liste">${liste}</ul></section>
        <section class="kort" id="redigerar"></section>
        <aside class="forhand"><div class="kort" style="padding:14px"><div class="kort-hovud" style="padding:0 0 12px"><h2>${I('auge', 'sm')}Førehandsvising</h2><span class="muted" style="font-size:12px">Svar blir ikkje sende</span></div><div class="telefon"><iframe id="forhand" title="Førehandsvising av spørsmålet" src="sporjeskjema.html#innebygd-forhand"></iframe></div></div></aside></div>`;
    },
    mount(root) { redigerar(root, true); bindSkjema(root); },
  };
  function redigerar(root, instant) {
    const q = D.questions.find((x) => x.id === ST.editQ), fast = q.id.startsWith('F'), L = ST.editLang, risk = RISIKO[q.id];
    const el = $('#redigerar', root);
    const html = `<div class="kort-hovud"><h2><span class="kjeldebrikke">${q.id}</span> ${esc(D.sections[q.sec].t.nn)}</h2>${fast ? `<span class="chip">${I('las', 'sm')}Fast spørsmål</span>` : '<span class="chip accent">Leiardel</span>'}</div>
      <div class="kort-innhald felt-grid">
        ${fast ? '<p class="forklaring" style="margin:0">Ordlyden kjem frå Forms-runden og er låst, så samanlikninga med runde 1 held. Rettar du skrivefeil, merkar du endringa som rettskriving.</p>' : ''}
        <div class="field"><span>Type</span><div class="seg" id="q-type" role="group" aria-label="Type">${[['single', 'Eitt val'], ['multi', 'Fleire val'], ['text', 'Tekst'], ['scale', 'Skala'], ['nps', 'NPS']].map(([v, l]) => `<button type="button" aria-pressed="${q.type === v}" ${fast ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>
        <div class="field"><span>Spørsmålstekst</span><div class="seg" id="q-lang" role="group" aria-label="Språk"><button type="button" data-l="nn" aria-pressed="${L === 'nn'}">Nynorsk</button><button type="button" data-l="en" aria-pressed="${L === 'en'}">English</button></div><textarea class="input" id="q-tekst" rows="3">${esc(q.t[L] ?? '')}</textarea></div>
        ${q.opts ? `<div class="field"><span>Alternativ og risikoscore</span><div style="display:grid;gap:8px">${q.opts.map((o, i) => `<div class="alt-rad"><input class="input" data-alt="${i}" value="${esc(o.t[L] ?? '')}"><div class="risiko" role="group" aria-label="Risikoscore for ${esc(o.t.nn)}">${[0, 1, 2, 3].map((r) => `<button type="button" data-r="${r}" aria-pressed="${risk ? risk[i] === r : false}">${r}</button>`).join('')}</div><button type="button" class="ikonknapp" aria-label="Fjern alternativet" ${fast ? 'disabled' : ''}>${I('slett', 'sm')}</button></div>`).join('')}</div></div>` : ''}
        ${!fast ? `<div class="kort ki-kort" style="padding:14px;display:grid;gap:10px;box-shadow:none"><span class="ki-merke">${I('gnist', 'sm')}Forslag frå assistenten · etappe 2</span><p style="font-size:13.5px">Spørsmålet er langt. Ei kortare form med same meining:</p><p style="font-size:14px;color:var(--ink-strong);font-weight:600">«Kor lenge kan de jobbe vidare om e-post, filer og fagsystem stoppar?»</p><div class="handlingar"><button type="button" class="btn ai sm" id="ki-godta">Bruk forslaget</button><button type="button" class="btn sm ghost">Avvis</button></div></div>` : ''}
        <div class="publiser"><b style="color:var(--ink-strong)">Publisering</b>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span class="chip ok">${I('hake', 'sm')}Nynorsk · kjelde</span><button type="button" class="btn sm ${ST.english ? '' : 'primary'}" id="godkjenn-en" ${ST.english ? 'disabled' : ''}>${ST.english ? `${I('hake', 'sm')}English er godkjend` : 'Godkjenn English'}</button></div>
          <label class="brytar" style="font-weight:500"><input type="checkbox" id="stadfest">Eg stadfestar publisering. Versjonen kan ikkje endrast etterpå.</label>
          <button type="button" class="btn primary" id="publiser" ${ST.english && !ST.publisert ? '' : 'disabled'}>${ST.publisert ? `${I('hake', 'sm')}Versjonen er publisert` : 'Publiser versjonen'}</button></div>
      </div>`;
    const paint = () => { el.innerHTML = html; $$('.seg', el).forEach(M.segThumb); };
    if (instant) paint();
    else M.animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: M.ease.ut }).then(() => { el.getAnimations().forEach((a) => a.cancel()); paint(); M.stagger($$('.kort-innhald > *', el), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, step: 35, easing: M.ease.inn, fill: 'backwards' }); });
    forhand('go', q.id);
  }
  function forhand(kind, id) {
    const f = $('#forhand'); if (!f?.contentWindow) return;
    const send = () => {
      if (kind === 'go') f.contentWindow.postMessage({ type: 'varde:go', to: id }, '*');
      else { const q = D.questions.find((x) => x.id === id); f.contentWindow.postMessage({ type: 'varde:preview', id, t: q.t, opts: q.opts?.map((o) => ({ t: o.t })), lang: ST.editLang }, '*'); }
      f.contentWindow.postMessage({ type: 'varde:prefs', theme: document.documentElement.getAttribute('data-theme') || 'system' }, '*');
    };
    if (f.dataset.klar) send(); else f.addEventListener('load', () => { f.dataset.klar = '1'; setTimeout(send, 250); }, { once: true });
  }
  function bindSkjema(root) {
    lytt(root, 'click', (e) => {
      const rad = e.target.closest('.sp-rad');
      if (rad) { ST.editQ = rad.dataset.q; $$('.sp-rad', root).forEach((r) => r.setAttribute('aria-current', String(r === rad))); return redigerar(root); }
      const lb = e.target.closest('#q-lang button');
      if (lb) { ST.editLang = lb.dataset.l; redigerar(root); setTimeout(() => forhand('preview', ST.editQ), 120); return; }
      const rk = e.target.closest('.risiko button');
      if (rk && !rk.disabled) { $$('button', rk.parentElement).forEach((b) => b.setAttribute('aria-pressed', String(b === rk))); M.animate(rk, [{ transform: 'scale(.86)' }, { transform: 'none' }], { duration: 420, easing: M.ease.sprett }); return; }
      if (e.target.closest('#godkjenn-en')) { ST.english = true; const b = $('#godkjenn-en', root); b.disabled = true; b.classList.remove('primary'); b.innerHTML = `${I('hake', 'sm')}English er godkjend`; M.animate(b, [{ transform: 'scale(.94)' }, { transform: 'none' }], { duration: 420, easing: M.ease.sprett }); $('#publiser', root).disabled = !$('#stadfest', root).checked; toast('Teksten på English er godkjend.'); return; }
      if (e.target.closest('#publiser')) {
        const b = $('#publiser', root); ST.publisert = true; b.disabled = true; b.innerHTML = `${I('hake', 'sm')}Versjonen er publisert`;
        const chip = $('#v-status', root); M.animate(chip, [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 520, easing: M.ease.sprett }); chip.className = 'chip ok'; chip.textContent = 'Publisert · v4';
        toast('Versjonen er publisert.'); return;
      }
      if (e.target.closest('#ki-godta')) {
        const q = D.questions.find((x) => x.id === ST.editQ); q.t.nn = 'Kor lenge kan de jobbe vidare om e-post, filer og fagsystem stoppar?';
        const ta = $('#q-tekst', root); ta.value = q.t[ST.editLang] ?? ''; M.animate(ta, [{ backgroundColor: 'var(--ai-bg)' }, { backgroundColor: 'var(--surface)' }], { duration: 900 });
        forhand('preview', q.id); toast('Forslaget er lagt inn i utkastet. Du publiserer sjølv.', 'gnist');
      }
    });
    lytt(root, 'change', (e) => { if (e.target.id === 'stadfest') $('#publiser', root).disabled = !(e.target.checked && ST.english) || ST.publisert; });
    lytt(root, 'input', (e) => {
      const q = D.questions.find((x) => x.id === ST.editQ);
      if (e.target.id === 'q-tekst') { q.t[ST.editLang] = e.target.value; const rad = $(`.sp-rad[data-q="${q.id}"] .t`, root); if (rad && ST.editLang === 'nn') rad.textContent = e.target.value; forhand('preview', q.id); }
      if (e.target.dataset.alt !== undefined) { q.opts[Number(e.target.dataset.alt)].t[ST.editLang] = e.target.value; forhand('preview', q.id); }
    });
  }

  /* ---------- Seminar (planlagt) ---------- */
  let pollTimer = 0;
  PAGES.seminar = {
    tittel: () => 'Seminar',
    render() {
      const s = A.seminar;
      return tittel('Seminar · planlagt', esc(s.tittel), `${s.dato} · ${s.stad} · ${s.kundar.join(' og ')} · ${s.pamelde} påmelde`, `<div class="seg" id="sem-tab" role="group" aria-label="Del"><button type="button" data-v="pamelding" aria-pressed="${ST.semTab === 'pamelding'}">Påmelding</button><button type="button" data-v="live" aria-pressed="${ST.semTab === 'live'}">Live</button><button type="button" data-v="etter" aria-pressed="${ST.semTab === 'etter'}">Etter</button></div>`) +
        planlagt('Etappe 3', 'Seminar kjem etter at første runde er køyrd heilt i Varde. Skjermen viser korleis live-spørsmål og storskjerm kan sjå ut.') + `<div id="sem-kropp">${semKropp()}</div>`;
    },
    mount(root) {
      M.segThumb($('#sem-tab', root)); semBind(root); startPoll(root);
      $('#sem-tab', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ST.semTab = b.dataset.v; $$('#sem-tab button', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); M.segThumb($('#sem-tab', root)); const k = $('#sem-kropp', root); M.animate(k, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: M.ease.ut }).then(() => { k.getAnimations().forEach((a) => a.cancel()); k.innerHTML = semKropp(); M.stagger($$('.rutenett > *', k), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 460, step: 50, easing: M.ease.inn, fill: 'backwards' }); startPoll(root); }); });
    },
  };
  function pollRader(storskjerm) {
    const s = A.seminar, tot = Math.max(1, sum(ST.poll.stemmer, (v) => v));
    return s.alt.map((a, i) => `<div class="poll-rad"><span>${esc(a)}</span><span class="bar"><span style="transform:scaleX(${(ST.poll.stemmer[i] / tot).toFixed(3)})"></span></span><b data-poll="${i}">${storskjerm ? Math.round((100 * ST.poll.stemmer[i]) / tot) + ' %' : ST.poll.stemmer[i]}</b></div>`).join('');
  }
  function semKropp() {
    const s = A.seminar, t = ST.poll.tilstand;
    if (ST.semTab === 'pamelding') return `<div class="rutenett"><section class="kort s6"><div class="kort-hovud"><h2>Påmelde</h2></div><div class="kort-innhald"><div class="talkort" style="padding:0"><span class="stort">${s.pamelde}</span><span class="under">Gasta 11 · Daco 7</span></div><p class="forklaring">Namn ligg berre i påmeldinga, og blir sletta 90 dagar etter seminaret.</p><div class="handlingar" style="margin-top:12px"><button type="button" class="btn">${I('kalender', 'sm')}Last ned invitasjon (ICS)</button><button type="button" class="btn">${I('kopi', 'sm')}Kopier lenkje til påmelding</button></div></div></section><section class="kort s6"><div class="kort-hovud"><h2>Påmeldingssida</h2></div><div class="kort-innhald"><div class="kort" style="padding:16px;box-shadow:none;display:grid;gap:10px"><div class="eyebrow">Seminar · ${esc(s.dato)}</div><b style="font-size:18px;color:var(--ink-strong)">${esc(s.tittel)}</b><label class="field"><span>Namn</span><input class="input" disabled placeholder="Ola Nordman"></label><label class="field"><span>Bedrift</span><input class="input" disabled placeholder="Gasta"></label><button type="button" class="btn primary" disabled>Meld meg på</button></div></div></section></div>`;
    if (ST.semTab === 'etter') return `<div class="rutenett"><section class="kort s7"><div class="kort-hovud"><h2>Før og etter</h2><p>${esc(s.sp)}</p></div><div class="kort-innhald"><div class="poll">${s.alt.map((a, i) => { const f = [0.1, 0.38, 0.4, 0.12][i], e = [0.24, 0.48, 0.22, 0.06][i]; return `<div class="poll-rad"><span>${esc(a)}</span><span class="bar" style="display:grid;gap:3px;height:auto;background:none"><span style="height:10px;background:var(--line-strong);transform:scaleX(${f})"></span><span style="height:10px;transform:scaleX(${e})"></span></span><b>${Math.round(e * 100)} %</b></div>`; }).join('')}</div><p class="forklaring">Grå: før seminaret (14 svar). Blå: etter (12 svar). Endringa er observert, ikkje bevis for at seminaret verka. Dei som svarte etterpå, er ikkje nødvendigvis dei same.</p></div></section><section class="kort s5"><div class="kort-hovud"><h2>Oppfølging</h2></div><div class="kort-innhald"><ul class="liste hendingar"><li><span class="ikon">${I('send')}</span><span>Undersøking etter seminaret<br><span class="muted">Open til 26. nov. · 12 svar</span></span><time>Open</time></li><li><span class="ikon">${I('dok')}</span><span>Lysark og lenkjer til deltakarane<br><span class="muted">Synleg etter seminaret</span></span><time></time></li></ul></div></section></div>`;
    return `<div class="rutenett"><section class="kort s5"><div class="kort-hovud"><h2>Live-spørsmål</h2><span class="tilstand-stig" aria-label="Tilstand">${['open', 'stengd', 'vist'].map((x) => `<span class="${t === x ? 'no' : ''}">${x === 'open' ? 'Ope' : x === 'stengd' ? 'Stengt' : 'Vist'}</span>`).join('')}</span></div>
      <div class="kort-innhald" style="display:grid;gap:14px"><b style="font-size:17px;color:var(--ink-strong)">${esc(s.sp)}</b><div class="poll" id="poll">${pollRader(false)}</div><p class="muted" style="font-size:13px"><span id="poll-tot">${sum(ST.poll.stemmer, (v) => v)}</span> av ${s.pamelde} har svart</p>
      <div class="handlingar">${t === 'open' ? `<button type="button" class="btn" data-poll-act="stengd">${I('stopp', 'sm')}Steng spørsmålet</button>` : t === 'stengd' ? `<button type="button" class="btn primary" data-poll-act="vist">${I('skjerm', 'sm')}Vis på storskjermen</button>` : `<button type="button" class="btn" data-poll-act="open">${I('oppdater', 'sm')}Start på nytt</button>`}</div></div></section>
      <section class="s7"><div class="storskjerm" aria-label="Storskjerm"><div><h3>${t === 'vist' ? esc(s.sp) : 'Svar på mobilen'}</h3><div class="poll" style="margin-top:6%" id="poll-stor">${t === 'vist' ? pollRader(true) : `<p style="font-size:clamp(11px,1.3vw,16px);color:#acaeb1">Resultatet kjem når spørsmålet er stengt og vist.</p>`}</div></div><div class="qr-boks">${qr(77)}<span>Skann for å svare</span></div><svg class="fjell-band" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0,40 L0,30 L50,18 L90,26 L150,8 L210,24 L260,12 L320,26 L370,16 L400,22 L400,40Z" fill="#236e91"/></svg></div><p class="forklaring">Storskjermen opnar med ein eigen nøkkel for seminardagen, ikkje med innlogging. Han viser berre resultat som er viste.</p></section></div>`;
  }
  function semBind(root) {
    lytt(root, 'click', (e) => {
      const b = e.target.closest('[data-poll-act]'); if (!b) return;
      ST.poll.tilstand = b.dataset.pollAct; if (ST.poll.tilstand === 'open') ST.poll.stemmer = A.seminar.start.slice();
      const k = $('#sem-kropp', root); k.innerHTML = semKropp();
      if (ST.poll.tilstand === 'vist') M.stagger($$('#poll-stor .poll-rad', k), [{ opacity: 0, transform: 'translateX(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 520, step: 90, easing: M.ease.fjor, fill: 'backwards' });
      startPoll(root);
    });
  }
  function startPoll(root) {
    clearInterval(pollTimer);
    if (ST.semTab !== 'live' || ST.poll.tilstand !== 'open') return;
    pollTimer = setInterval(() => {
      if (ST.page !== 'seminar' || ST.poll.tilstand !== 'open') return clearInterval(pollTimer);
      const tot = sum(ST.poll.stemmer, (v) => v); if (tot >= A.seminar.pamelde) return clearInterval(pollTimer);
      const w = [0.18, 0.4, 0.3, 0.12], r = Math.random(); let acc = 0, i = 0; for (; i < w.length; i++) { acc += w[i]; if (r < acc) break; }
      ST.poll.stemmer[Math.min(i, 3)]++;
      const ny = sum(ST.poll.stemmer, (v) => v);
      $$('#poll .poll-rad', root).forEach((rad, j) => { $('.bar span', rad).style.transform = `scaleX(${(ST.poll.stemmer[j] / ny).toFixed(3)})`; $('b', rad).textContent = ST.poll.stemmer[j]; });
      const t = $('#poll-tot', root); if (t) M.countTo(t, ny);
    }, 1400);
  }

  /* ---------- Assistent (planlagt) ---------- */
  const FORSLAG_INNHALD = {
    p1: { meta: 'Claude · prompt v1 · 2 380 token', sp: [['Veit du kvar bookingdata og gjestelister blir tekne backup av?', 'Ja · Delvis · Nei · Veit ikkje'], ['Kor lenge kan resepsjonen jobbe om bookingsystemet stoppar?', 'Under ein time · Nokre timar · Ein dag · Veit ikkje'], ['Har de prøvd å hente tilbake ei fil frå backup det siste året?', 'Ja · Nei · Veit ikkje']],
      sjekk: [[1, 'Skjemaet er gyldig'], [1, 'Kvart spørsmål har «Veit ikkje» eller kan hoppast over'], [1, 'Ingen produktnamn'], [1, 'Ingen spørsmål over 25 ord'], [0, 'English manglar. Blir merkt «til omsetjing»']] },
    p2: { meta: 'Claude · omsetjing v2 · ordliste 2026-10', sp: [['How often do you search for information you know exists somewhere at work?', 'Several times a day · About every day · A few times a week · Rarely'], ['Where do you search most often?', 'In email · In folders, OneDrive or Teams · In the business system · I ask a colleague · In binders or on paper']], sjekk: [[1, 'Ordlista er følgd'], [1, 'Same tal alternativ som kjelda'], [0, 'Éin formulering bør ein person sjå på']] },
    p3: { meta: 'Claude · forklar funn v1', sp: [['Gasta: 3 av 11 seier at dei ikkje brukar MFA eller ikkje veit.', 'Kjelde: snapshot r2 · gasta · 14. okt.']], sjekk: [[0, 'Tala er endra etter at forslaget vart laga']] },
    p4: { meta: 'Claude · spørsmålsvask v1', sp: [['Er det periodar der ein IT-stans ville vore ekstra ille?', 'Delt i to: «Når på året …» og «Kva for oppgåver …»']], sjekk: [[1, 'Godteke av Oleksandr 12. okt.']] },
  };
  const STATUS = { ny: ['ai', 'Ny'], godteke: ['ok', 'Godteke'], utdatert: ['warn', 'Utdatert'], avvist: ['', 'Avvist'] };
  PAGES.assistent = {
    tittel: () => 'Assistent',
    render() {
      return tittel('Assistent · planlagt', 'Forslag', 'Assistenten føreslår. Eit menneske godtek, rettar og publiserer.') +
        planlagt('Etappe 2 og 4', 'Modellen ser aldri initialar, svar per person, leiarsvar eller fritekst som ikkje er gått gjennom. Alt han lagar, er eit forslag med status, modell og kostnad.') +
        `<div class="rutenett"><section class="s5"><div class="forslag-liste" id="forslag-liste">${A.forslag.map(forslagKort).join('')}</div></section><section class="kort ki-kort s7" id="forslag-detalj"></section></div>`;
    },
    mount(root) { visForslag(root, true); lytt(root, 'click', (e) => { const f = e.target.closest('[data-forslag]'); if (f) { ST.forslag = f.dataset.forslag; $$('[data-forslag]', root).forEach((x) => x.setAttribute('aria-current', String(x === f))); visForslag(root); } const act = e.target.closest('[data-f-act]'); if (act) forslagHandling(root, act.dataset.fAct); }); },
  };
  function forslagKort(f) { const [c, l] = STATUS[f.status]; return `<button type="button" class="forslag" data-forslag="${f.id}" aria-current="${f.id === ST.forslag}"><b>${esc(f.tittel)}</b><span class="chip ${c}">${l}</span><small>${esc(f.type)} · ${esc(f.tid)}</small></button>`; }
  function visForslag(root, instant) {
    const f = A.forslag.find((x) => x.id === ST.forslag), inn = FORSLAG_INNHALD[f.id], el = $('#forslag-detalj', root);
    const handl = f.status === 'ny' ? `<button type="button" class="btn ai" data-f-act="godta">${I('hake', 'sm')}Godta som nytt utkast</button><button type="button" class="btn" data-f-act="avvis">Avvis</button>` : f.status === 'utdatert' ? `<button type="button" class="btn ai" data-f-act="ny">${I('oppdater', 'sm')}Lag på nytt</button>` : '';
    el.innerHTML = `<div class="kort-hovud"><span class="ki-merke">${I('gnist', 'sm')}Laga av KI</span><span class="muted" style="font-size:12px">${esc(inn.meta)}</span></div><div class="kort-innhald" style="display:grid;gap:14px"><h2 style="font-size:18px">${esc(f.tittel)}</h2><p class="muted" style="font-size:13px">Kjelde: <span class="kjeldebrikke">${esc(f.kjelde)}</span></p>
      ${f.status === 'utdatert' ? `<div class="kort" style="padding:12px 14px;background:var(--warning-bg);border-color:var(--warning-line);color:var(--warning-fg);box-shadow:none">Tala er endra etter at forslaget vart laga. Det kan ikkje godtakast, berre lagast på nytt.</div>` : ''}
      <div class="forslag-tekst" id="f-tekst">${inn.sp.map(([t, s]) => `<div class="forslag-sp"><b>${esc(t)}</b><small>${esc(s)}</small></div>`).join('')}</div>
      <div><div class="eyebrow" style="color:var(--ink-muted);margin-bottom:8px">Automatiske sjekkar</div><ul class="sjekk">${inn.sjekk.map(([ok, t]) => `<li><span class="${ok ? 'ok' : 'mangel'}">${I(ok ? 'hake' : 'varsel', 'sm')}</span><span>${esc(t)}</span></li>`).join('')}</ul></div>
      <div class="handlingar">${handl}</div></div>`;
    if (!instant) {
      M.animate(el, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 260 });
      $$('.forslag-sp', el).forEach((b, i) => { const words = b.querySelector('b').textContent.split(' '); b.querySelector('b').innerHTML = words.map((w) => `<span class="ord">${esc(w)}</span>`).join(' '); M.stagger($$('.ord', b), [{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'none' }], { duration: 300, step: 28, max: 40, delay: 120 + i * 220, easing: M.ease.inn, fill: 'backwards' }); });
      M.stagger($$('.sjekk li', el), [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, step: 70, delay: 500, easing: M.ease.inn, fill: 'backwards' });
    }
  }
  function forslagHandling(root, act) {
    const f = A.forslag.find((x) => x.id === ST.forslag);
    if (act === 'ny') {
      const tekst = $('#f-tekst', root); tekst.innerHTML = '<div class="ki-skimmer" style="width:92%"></div><div class="ki-skimmer" style="width:78%"></div><div class="ki-skimmer" style="width:85%"></div><p class="muted" style="font-size:12.5px">Assistenten skriv eit nytt forslag …</p>';
      setTimeout(() => { f.status = 'ny'; FORSLAG_INNHALD[f.id] = { meta: 'Claude · forklar funn v1 · ny', sp: [['Gasta: 4 av 13 seier at dei ikkje brukar MFA eller ikkje veit.', 'Kjelde: snapshot r2 · gasta · 15. okt.'], ['Forslag til tiltak: sjekk i Entra kven som manglar MFA, og slå det på for alle.', 'Teksten kjem frå funn-regelen for F14']], sjekk: [[1, 'Tala stemmer med publisert snapshot'], [1, 'Ingen initialar eller svar per person']] }; f.tid = 'no nettopp'; refreshListe(root); visForslag(root); }, Math.max(300, M.ms(1600)));
      return;
    }
    f.status = act === 'godta' ? 'godteke' : 'avvist'; refreshListe(root); visForslag(root, true);
    toast(act === 'godta' ? 'Lagra som nytt utkast i Skjema. Publisering gjer du sjølv.' : 'Forslaget er avvist.', act === 'godta' ? 'gnist' : 'info');
  }
  function refreshListe(root) { const ul = $('#forslag-liste', root); M.flip($$('.forslag', ul), () => { ul.innerHTML = A.forslag.map(forslagKort).join(''); }); const cur = $(`[data-forslag="${ST.forslag}"]`, ul); M.animate(cur, [{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: 480, easing: M.ease.sprett }); }

  /* ---------- Rapportar (planlagt) ---------- */
  PAGES.rapportar = {
    tittel: () => 'Rapportar',
    render() {
      const k = A.kundar.find((x) => x.id === 'daco');
      return tittel('Rapportar · planlagt', 'Rapport til kunden', 'Ein PDF frå publiserte tal, på språket til kunden. Eit menneske sjekkar og sender han sjølv.') + planlagt('Etappe 5', 'Aldri med i rapporten: initialar, leiarsvar og grupper under tre personar.') +
        `<div class="rutenett"><section class="kort s5"><div class="kort-hovud"><h2>Innhald</h2></div><div class="kort-innhald" style="display:grid;gap:12px"><label class="field"><span>Kunde</span><select class="velg"><option>Daco</option></select></label><ul class="sjekk">${['Sone for bedrifta og kritisk andel', 'Dei tre viktigaste funna', 'Samanlikning med runde 1, med atterhald', 'Kva Vardahei føreslår'].map((t) => `<li><span class="ok">${I('hake', 'sm')}</span><span>${t}</span></li>`).join('')}</ul><label class="brytar" style="font-weight:500"><input type="checkbox" id="sjekka">Eg har lese gjennom rapporten</label><button type="button" class="btn primary" id="lag-pdf" disabled>${I('ned', 'sm')}Lag PDF</button></div></section>
        <section class="s7"><div class="a4" aria-label="Førehandsvising av rapporten"><div style="display:flex;justify-content:space-between;align-items:center"><img src="vardahei-it-logo.png" alt="Vardahei IT" width="110" height="22"><span style="font-size:10px;color:#6b6e70">Haust 2026</span></div><div><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#236e91">IT-sikkerheit hos</div><h3>${esc(k.namn)}</h3></div><div class="rad"><div class="boks"><span>Sone</span><b>Gul</b></div><div class="boks"><span>Kritisk andel</span><b>${Math.round(k.kritisk * 100)} %</b></div><div class="boks"><span>Svar</span><b>${k.svar}</b></div></div><div><b style="color:#15171a">Dette bør de ta tak i</b><ol>${A.funn.slice(0, 3).map((f) => `<li>${esc(f.tekst[0].toUpperCase() + f.tekst.slice(1))}</li>`).join('')}</ol></div><div><b style="color:#15171a">Samanlikna med januar</b><p style="margin-top:4px">Snittscoren gjekk frå ${nn(k.r1.snitt, 2)} til ${nn(k.snitt, 2)}. Same spørsmål, men ikkje nødvendigvis same personar.</p></div><div><b style="color:#15171a">Dette føreslår vi</b><p style="margin-top:4px">${esc(A.funn[0].tiltak)}</p></div><svg class="fot" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0,40 L0,26 L60,14 L110,24 L170,6 L230,20 L290,10 L350,22 L400,14 L400,40Z" fill="#dceffa"/><path d="M0,40 L0,32 L80,24 L140,30 L200,18 L270,28 L330,20 L400,26 L400,40Z" fill="#236e91" opacity=".8"/></svg></div></section></div>`;
    },
    mount(root) { $('#sjekka', root).addEventListener('change', (e) => { $('#lag-pdf', root).disabled = !e.target.checked; }); $('#lag-pdf', root).addEventListener('click', () => toast('Prototype: PDF-en blir laga i etappe 5.', 'dok')); M.stagger($$('.a4 > *', root), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 460, step: 70, delay: 200, easing: M.ease.inn, fill: 'backwards' }); },
  };

  /* ---------- Eksport og sletting ---------- */
  PAGES.data = {
    tittel: () => 'Eksport og sletting',
    render() {
      return tittel('Personvern', 'Eksport og sletting', 'Samla tal til kunden, svarrader til Vardahei IT. Alt som viser svar per person, blir logga.') +
        `<div class="rutenett"><section class="kort s4 talkort"><span class="etikett">${I('ned', 'sm')}Til kunden</span><b style="font-size:17px;color:var(--ink-strong)">Samla CSV til kunden</b><span class="under">Berre samla tal, ingen initialar. Krev at du vel éin kunde.</span><button type="button" class="btn sm" style="justify-self:start;margin-top:8px" data-last="kunde">Last ned</button></section>
        <section class="kort s4 talkort"><span class="etikett">${I('las', 'sm')}Til Vardahei IT</span><b style="font-size:17px;color:var(--ink-strong)">Svarrader (CSV)</b><span class="under">Éi rad per svar. Nedlastinga blir logga.</span><button type="button" class="btn sm" style="justify-self:start;margin-top:8px" data-last="rader">Last ned</button></section>
        <section class="kort s4 talkort"><span class="etikett">${I('dok', 'sm')}Til Asbjørn</span><b style="font-size:17px;color:var(--ink-strong)">Master_Analyse</b><span class="under">Same kolonnar som reknearket. Utan leiarsvar.</span><button type="button" class="btn sm" style="justify-self:start;margin-top:8px" data-last="master">Last ned</button></section>
        <section class="kort s7"><div class="kort-hovud"><h2>${I('slett', 'sm')}Slett svar</h2><p>Sletting tek bort svar og fritekst. Publiserte samla tal blir verande.</p></div><div class="kort-innhald" style="display:grid;gap:14px">
          <div class="seg" id="slett-omr" role="group" aria-label="Område"><button type="button" aria-pressed="true">Valde innsendingar</button><button type="button" aria-pressed="false">Alle svar frå kunden</button><button type="button" aria-pressed="false">Ein person</button></div>
          <label class="field"><span>Innsendings-ID</span><input class="input mono" value="sub_7Qe2…9xLk" id="slett-id"></label><label class="field"><span>Grunngjeving</span><input class="input" value="Den tilsette bad om det på e-post 14. okt." id="slett-grunn"></label>
          <div id="slett-steg">${slettSteg()}</div></div></section>
        <section class="kort s5"><div class="kort-hovud"><h2>Kor lenge vi tek vare på data</h2></div><div class="kort-innhald"><table class="data"><tbody>${[['Svar', 'Til kunden ber om sletting'], ['Framdrift i runden', '24 timar'], ['Forslag og logg', '12 månader'], ['Publiserte samla tal', 'Minst 3 år'], ['Påmelding til seminar', 'Seminaret + 90 dagar']].map(([a, b]) => `<tr><td>${a}</td><td style="color:var(--ink-strong);font-weight:600">${b}</td></tr>`).join('')}</tbody></table></div></section></div>`;
    },
    mount(root) {
      M.segThumb($('#slett-omr', root));
      $('#slett-omr', root).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('#slett-omr button', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); M.segThumb($('#slett-omr', root)); });
      lytt(root, 'click', (e) => { const l = e.target.closest('[data-last]'); if (l) toast(l.dataset.last === 'kunde' ? 'Prototype: vel éin kunde, så kjem fila. Ingen initialar i ho.' : l.dataset.last === 'rader' ? 'Prototype: i Varde blir denne nedlastinga logga.' : 'Prototype: fila får same kolonnar som Master_Analyse.', 'ned'); if (e.target.closest('#vis-forhand')) { ST.slettSteg = 1; byttSlett(root); } if (e.target.closest('#slett-igjen')) { ST.slettSteg = 0; byttSlett(root); } });
      bindHald(root);
    },
  };
  function slettSteg() {
    if (ST.slettSteg === 0) return `<button type="button" class="btn" id="vis-forhand">${I('auge', 'sm')}Vis førehandsvising</button>`;
    if (ST.slettSteg === 1) return `<div style="display:grid;gap:12px"><div class="kort" style="padding:12px 14px;box-shadow:none;background:var(--surface-2)"><b style="color:var(--ink-strong)">Dette blir sletta</b><p class="muted" style="font-size:13.5px">Fellesdel: 1 innsending med 1 fritekst · Leiardel: 0</p></div><button type="button" class="btn danger hald" id="slett-hald"><span class="fyll"></span><span>${I('slett', 'sm')} Hald inne for å stadfeste sletting</span></button></div>`;
    return `<div style="display:flex;align-items:center;gap:10px;color:var(--success-fg);font-weight:650">${I('hake')}Svara er sletta. <button type="button" class="linkbtn" id="slett-igjen">Prøv igjen i prototypen</button></div>`;
  }
  function byttSlett(root) { const el = $('#slett-steg', root); M.animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: M.ease.ut }).then(() => { el.getAnimations().forEach((a) => a.cancel()); el.innerHTML = slettSteg(); M.animate(el, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: M.ease.inn }); bindHald(root); }); }
  function bindHald(root) { const b = $('#slett-hald', root); if (b && !b.dataset.bunde) { b.dataset.bunde = '1'; hald(b, () => { ST.slettSteg = 2; byttSlett(root); toast('Svara er sletta.', 'slett'); }); } }

  /* ---------- Palett (⌘K) ---------- */
  const palett = $('#palett'), pbg = $('#palett-bg'), pin = $('#palett-input'), pliste = $('#palett-liste');
  const PUNKT = [...NAV.filter((n) => n.id).map((n) => ({ t: n.namn, s: 'Side', run: () => go(n.id) })), { t: 'Start ein runde', s: 'Handling', run: () => { ST.wiz = null; go('ny-runde'); } },
    ...A.kundar.flatMap((k) => [{ t: `Send ut: ${k.namn}`, s: 'Handling', run: () => go('rundar').then(() => sendUt(k)) }, { t: `Innsikt: ${k.namn}`, s: 'Kunde', run: () => { ST.innsikt.kunde = k.id; go('innsikt'); } }, { t: `Kunde: ${k.namn}`, s: 'Kunde', run: () => go('kunde', { kunde: k.id }) }])];
  let pVal = 0, pTreff = PUNKT;
  function teiknPalett() { pliste.innerHTML = pTreff.slice(0, 12).map((p, i) => `<li role="option" aria-selected="${i === pVal}" data-i="${i}">${esc(p.t)}<small>${p.s}</small></li>`).join('') || '<li aria-disabled="true">Ingen treff</li>'; }
  function opnePalett() { palett.hidden = false; pbg.hidden = false; pin.value = ''; pTreff = PUNKT; pVal = 0; teiknPalett(); pin.focus(); M.animate(palett, [{ opacity: 0, transform: 'translateX(-50%) scale(.96) translateY(-6px)' }, { opacity: 1, transform: 'translateX(-50%)' }], { duration: 420, easing: M.ease.fjor }); M.animate(pbg, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); }
  async function lukkPalett() { if (palett.hidden) return; await M.animate(palett, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(-50%) scale(.97)' }], { duration: 140, easing: M.ease.ut }); palett.hidden = true; pbg.hidden = true; palett.getAnimations().forEach((a) => a.cancel()); }
  pin.addEventListener('input', () => { const s = pin.value.toLowerCase().trim(); pTreff = PUNKT.filter((p) => p.t.toLowerCase().includes(s)); pVal = 0; teiknPalett(); });
  pliste.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) { const p = pTreff[Number(li.dataset.i)]; lukkPalett().then(p.run); } });
  pbg.addEventListener('click', lukkPalett);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return palett.hidden ? opnePalett() : lukkPalett(); }
    if (e.key === 'Escape') { if (!palett.hidden) return lukkPalett(); if (!skuff.hidden) return lukkSkuff(); return closeMenu(); }
    if (!palett.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); pVal = (pVal + (e.key === 'ArrowDown' ? 1 : -1) + Math.min(12, pTreff.length)) % Math.max(1, Math.min(12, pTreff.length)); teiknPalett(); }
    if (!palett.hidden && e.key === 'Enter' && pTreff[pVal]) { e.preventDefault(); const p = pTreff[pVal]; lukkPalett().then(p.run); }
  });
  $('#sok-knapp').addEventListener('click', opnePalett);

  /* ---------- Meny på mobil, tema ---------- */
  const meny = $('#sidemeny'), menyknapp = $('#menyknapp');
  function closeMenu() { meny.classList.remove('open'); menyknapp.setAttribute('aria-expanded', 'false'); }
  menyknapp.addEventListener('click', () => { const open = !meny.classList.contains('open'); meny.classList.toggle('open', open); menyknapp.setAttribute('aria-expanded', String(open)); });
  const tema = $('#tema');
  function temaKnappar() { const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); $$('button', tema).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === cur))); M.segThumb(tema); }
  tema.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const set = () => M.setPrefs({ theme: b.dataset.v }); if (document.startViewTransition && !M.reduced()) document.startViewTransition(set); else set(); temaKnappar(); const f = $('#forhand'); f?.contentWindow?.postMessage({ type: 'varde:prefs', theme: b.dataset.v }, '*'); });
  document.addEventListener('varde:prefs', (e) => { temaKnappar(); const f = $('#forhand'); if (f?.contentWindow) f.contentWindow.postMessage({ type: 'varde:prefs', ...e.detail }, '*'); });
  document.addEventListener('varde:go', (e) => { const to = e.detail.to; if (PAGES[to]) go(to); });

  /* ---------- Start ---------- */
  const start = location.hash.slice(1).replace(/^innebygd-?/, '');
  temaKnappar(); document.fonts?.ready.then(() => { temaKnappar(); navThumb(true); });
  go(PAGES[start] ? start : 'oversikt', {}, { instant: false });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PAGES[h] && h !== ST.page) go(h); });
})();
