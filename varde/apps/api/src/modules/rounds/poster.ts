import qrcode from 'qrcode-generator';
import { LOGO_PNG_BASE64 } from '../../home/logo.js';

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function qrSvg(link: string) {
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const n = qr.getModuleCount(),
    margin = 2;
  let path = '';
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++)
      if (qr.isDark(row, col)) path += `M${col + margin},${row + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + margin * 2} ${n + margin * 2}" shape-rendering="crispEdges" role="img" aria-label="QR-kode"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
export interface PosterData {
  lang: string;
  client: string;
  link: string;
  title: string;
  text: string;
  footer: string;
  deadline: string;
  phone: string;
}
export function posterHtml(data: PosterData) {
  const d = Object.fromEntries(
    Object.entries(data).map(([k, v]: [string, string]) => [k, escapeHtml(v)]),
  ) as unknown as PosterData;
  const en = d.lang === 'en';
  return `<!doctype html><html lang="${d.lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${d.title} — ${d.client}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; background: #fff; color: #1e2a31; font-family: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif; }
.ark { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 18mm 20mm 60mm; margin: 0 auto; position: relative; }
.logo { height: 11mm; } h1 { font-size: 34pt; line-height: 1.08; margin: 16mm 0 6mm; letter-spacing: -.01em; max-width: 160mm; }
p.ingress { font-size: 15pt; line-height: 1.4; margin: 0 0 9mm; max-width: 150mm; color: #33434b; }
.qr { display: flex; gap: 10mm; align-items: center; } .qr svg { width: 78mm; height: 78mm; flex-shrink: 0; }
.steg { font-size: 13pt; line-height: 1.5; padding: 0; list-style: none; } .steg li { margin-bottom: 4mm; } .steg b { color: #176e91; }
.lenkje { font-size: 9.5pt; color: #5d6a71; word-break: break-all; margin-top: 6mm; }
.notice { font-size: 10pt; line-height: 1.4; } .fjell { position: absolute; left: 0; bottom: 0; width: 100%; height: 52mm; }
.botn { position: absolute; left: 20mm; right: 20mm; bottom: 9mm; display: flex; justify-content: space-between; gap: 8mm; font-size: 10pt; color: #fff; }
@media screen { body { background: #eef2f4; } .ark { background: #fff; } }
</style><body><main class="ark"><img class="logo" alt="Vardahei IT" src="data:image/png;base64,${LOGO_PNG_BASE64}">
<h1>${d.title}</h1><p class="ingress">${d.text}</p><div class="qr">${qrSvg(data.link)}<ol class="steg">
<li><b>1.</b> ${en ? 'Open your phone camera' : 'Opne kameraet på mobilen'}</li><li><b>2.</b> ${en ? 'Point it at the code' : 'Sikt på ruta'}</li><li><b>3.</b> ${en ? 'Tap the link' : 'Trykk på lenkja som dukkar opp'}</li>
<li>${d.deadline}</li></ol></div><p class="lenkje">${d.link}</p><p class="notice">${d.footer}</p>
<svg class="fjell" viewBox="0 0 210 52" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,52 0,30 18,24 28,28 48,16 60,22 82,10 96,18 118,6 130,13 150,2 164,9 184,14 210,8 210,52" fill="#dcebf2"/><polygon points="0,52 0,40 22,34 34,38 56,27 70,32 92,22 108,28 130,18 146,24 168,15 186,22 210,18 210,52" fill="#176e91"/></svg>
<div class="botn"><span>${en ? 'Survey for' : 'Kartlegging for'} ${d.client}</span><span>${en ? 'Questions?' : 'Spørsmål?'} Vardahei IT, ${d.phone}</span></div></main></body></html>`;
}
