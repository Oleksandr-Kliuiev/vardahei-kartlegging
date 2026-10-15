/* Varde motion: små hjelparar over Web Animations API og View Transitions.
   Alt går gjennom éin skala (--motion-scale), så «sakte film» og redusert rørsle verkar overalt. */
(function () {
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };

  function mode() {
    const m = root.getAttribute('data-motion');
    if (m === 'slow') return 'slow';
    if (m === 'reduced') return 'reduced';
    if (m === 'full') return 'full';
    return mq.matches ? 'reduced' : 'full';
  }
  const reduced = () => mode() === 'reduced';
  const scale = () => (mode() === 'slow' ? 4 : reduced() ? 0 : 1);
  const ms = (n) => n * scale();

  const linearOk = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');
  const ease = {
    sti: 'cubic-bezier(0.2, 0, 0, 1)',
    inn: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    ut: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
    gang: 'cubic-bezier(0.45, 0.05, 0.25, 1)',
    fjor: linearOk ? 'linear(0, 0.004 1.3%, 0.017 2.5%, 0.036 3.8%, 0.089 6.3%, 0.195 10%, 0.437 17.5%, 0.55 21.3%, 0.652 25%, 0.711 27.5%, 0.764 30%, 0.831 33.8%, 0.885 37.5%, 0.926 41.3%, 0.957 45%, 0.986 50%, 1.002 55%, 1.011 60%, 1.014 72.5%, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1.02)',
    sprett: linearOk ? 'linear(0, 0.01 1.3%, 0.037 2.5%, 0.078 3.8%, 0.132 5%, 0.263 7.5%, 0.565 12.5%, 0.708 15%, 0.835 17.5%, 0.891 18.8%, 0.986 21.3%, 1.024 22.5%, 1.084 25%, 1.123 27.5%, 1.135 28.7%, 1.147 31.3%, 1.141 35%, 1.116 38.8%, 1.051 46.3%, 1.014 51.2%, 0.995 55%, 0.981 60%, 0.979 67.5%, 1.002 88.8%, 1)' : 'cubic-bezier(0.3, 1.5, 0.5, 1)',
  };

  /* JS-kurver for rAF-tweens (same form som CSS-tokena) */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 6; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; }
      return sy(Math.min(1, Math.max(0, t)));
    };
  }
  function springFn(zeta) {
    const wd = Math.sqrt(1 - zeta * zeta);
    const x = (t) => 1 - Math.exp(-zeta * t) * (Math.cos(wd * t) + (zeta / wd) * Math.sin(wd * t));
    let T = 0; for (let t = 0; t < 120; t += 0.01) if (Math.abs(1 - x(t)) > 0.003) T = t;
    return (p) => (p >= 1 ? 1 : x(p * T));
  }
  const fn = { sti: bezier(0.2, 0, 0, 1), inn: bezier(0.05, 0.7, 0.1, 1), ut: bezier(0.3, 0, 0.8, 0.15), gang: bezier(0.45, 0.05, 0.25, 1), fjor: springFn(0.8), sprett: springFn(0.52), linear: (p) => p };

  function animate(el, keyframes, opts = {}) {
    if (!el || !el.animate) return Promise.resolve();
    const o = { duration: 240, easing: ease.sti, fill: 'both', ...opts };
    o.duration = ms(o.duration); o.delay = ms(o.delay || 0);
    if (reduced()) { o.duration = 0; o.delay = 0; }
    const a = el.animate(keyframes, o);
    return a.finished.catch(() => {});
  }
  function stagger(els, keyframes, opts = {}) {
    const step = opts.step ?? 36, max = opts.max ?? 10, base = opts.delay ?? 0;
    return Promise.all([...els].map((el, i) => animate(el, keyframes, { ...opts, delay: base + Math.min(i, max) * step })));
  }
  /* FLIP: mål, endre, animer frå gamal plass til ny med fjør */
  function flip(els, mutate, opts = {}) {
    const list = [...els];
    const first = new Map(list.map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    list.forEach((el) => {
      if (!el.isConnected) return;
      const a = first.get(el), b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      animate(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: opts.duration ?? 620, easing: opts.easing ?? ease.fjor, fill: 'none' });
    });
  }
  function tween(from, to, duration, easing, onUpdate) {
    const f = typeof easing === 'function' ? easing : fn[easing] || fn.sti;
    const d = ms(duration);
    return new Promise((resolve) => {
      if (d <= 0) { onUpdate(to, 1); resolve(); return; }
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / d), e = f(p);
        onUpdate(Array.isArray(from) ? from.map((v, i) => v + (to[i] - v) * e) : from + (to - from) * e, p);
        if (p < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  /* Tal som rullar til ny verdi. Skjermlesarar får berre sluttverdien. */
  function countTo(el, to, opts = {}) {
    const from = Number(el.dataset.value ?? el.textContent.replace(/[^\d.-]/g, '')) || 0;
    const fmt = opts.format || ((v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'));
    el.dataset.value = to;
    if (from === to) { el.textContent = fmt(to); return Promise.resolve(); }
    return tween(from, to, opts.duration ?? 700, opts.easing ?? 'inn', (v) => { el.textContent = fmt(v); });
  }
  /* View Transitions når nettlesaren har det, elles ein enkel overtoning */
  function vt(update, cls) {
    if (!document.startViewTransition || reduced()) { update(); return Promise.resolve(); }
    if (cls) root.classList.add(cls);
    const t = document.startViewTransition(update);
    return t.finished.finally(() => cls && root.classList.remove(cls));
  }

  /* Tema og rørsle kan styrast frå konseptsida (postMessage) eller frå URL-en (#mork, #sakte) */
  function setPrefs(p = {}) {
    if (p.theme === 'dark' || p.theme === 'light') root.setAttribute('data-theme', p.theme);
    if (p.theme === 'system') root.removeAttribute('data-theme');
    if (p.motion === 'slow' || p.motion === 'reduced' || p.motion === 'full') root.setAttribute('data-motion', p.motion);
    if (p.motion === 'system') root.removeAttribute('data-motion');
    document.dispatchEvent(new CustomEvent('varde:prefs', { detail: p }));
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'varde:prefs') setPrefs(e.data);
    if (e.data.type === 'varde:go') document.dispatchEvent(new CustomEvent('varde:go', { detail: e.data }));
  });
  const h = location.hash;
  if (h.includes('mork')) setPrefs({ theme: 'dark' });
  if (h.includes('sakte')) setPrefs({ motion: 'slow' });

  /* Segmentkontroll: tommelen glid til det valde */
  function segThumb(seg) {
    let thumb = seg.querySelector('.seg-thumb');
    if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg-thumb'; thumb.setAttribute('aria-hidden', 'true'); seg.prepend(thumb); }
    const on = seg.querySelector('[aria-pressed="true"]');
    if (!on) { thumb.style.width = '0px'; return; }
    thumb.style.width = on.offsetWidth + 'px';
    thumb.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  window.VardeMotion = { mode, reduced, scale, ms, ease, fn, animate, stagger, flip, tween, countTo, vt, setPrefs, segThumb };
})();
