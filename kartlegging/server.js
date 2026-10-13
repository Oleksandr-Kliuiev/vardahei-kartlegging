// Kartlegging-server for Vardahei IT. Ingen avhengnader, berre Node 18+.
//
//   PORT=3070 BASE_URL=https://kartlegging.vardahei.tech node server.js
//
// Kommandoar:
//   node server.js --lenkjer                 skriv ut lenkjene til kvar kunde
//   node server.js --brukar <e-post>         legg til eller nullstill ein brukar (spør etter passord)
//
// Data (i DATA_DIR, standard ./data):
//   svar.jsonl       eitt svar per linje. Ingen IP-adresser. Begge skjema har initialar (F1 i tryggleik, K0 i KI).
//   framdrift.json   kor langt kvar økt har kome (anonymt), for adminpanelet
//   tilgang.json     koden i lenkja for kvar kunde
//   kundar.json      tal tilsette, open/stengd og frist per kunde
//   brukarar.json    kontoar til dashbordet (passord lagra som scrypt-hash)
//   hendingar.jsonl  innloggingar og endringar i adminpanelet
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const PORT = Number(process.env.PORT || 3070);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const BASE_URL = (process.env.BASE_URL || "https://kartlegging.vardahei.tech").replace(/\/+$/, "");
const F = (namn) => path.join(DATA_DIR, namn);
fs.mkdirSync(DATA_DIR, { recursive: true });

function lesJson(fil, std) { try { return JSON.parse(fs.readFileSync(F(fil), "utf8")); } catch { return std; } }
function skrivJson(fil, data) { const tmp = F(fil + ".tmp"); fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(tmp, F(fil)); }

// Spørsmålsbanken, så vi kan sjekke innsende svar
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "public", "sporsmal.js"), "utf8"), sandbox);
const K = sandbox.window.KARTLEGGING;
const SPS = Object.fromEntries(Object.entries(K.skjema).map(([id, f]) => [id, Object.fromEntries(f.sporsmal.map((s) => [s.id, s]))]));

/* ---------------- Passord ---------------- */
function hashPassord(passord, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(passord, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash };
}
function sjekkPassord(passord, b) {
  if (!b) { hashPassord(passord); return false; } // brukar like lang tid sjølv om kontoen ikkje finst
  const { hash } = hashPassord(passord, b.salt);
  const x = Buffer.from(hash, "hex"), y = Buffer.from(b.hash, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------------- Kommandoar ---------------- */
if (process.argv.includes("--brukar")) {
  const epost = (process.argv[process.argv.indexOf("--brukar") + 1] || "").toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(epost)) { console.error("Bruk: node server.js --brukar namn@vardahei.no"); process.exit(1); }
  const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`Passord for ${epost} (minst 12 teikn, må bytast ved første innlogging): `, (pw) => {
    rl.close();
    if ((pw || "").length < 12) { console.error("For kort."); process.exit(1); }
    const brukarar = lesJson("brukarar.json", {});
    brukarar[epost] = Object.assign(hashPassord(pw), { maaByte: true, oppretta: new Date().toISOString() });
    skrivJson("brukarar.json", brukarar);
    console.log(`Lagra ${epost}.`);
    process.exit(0);
  });
  return;
}

/* ---------------- Tilgangskodar per kunde ---------------- */
// Éin kode per kunde. Koden ligg i lenkja, så ingen treng å skrive passord.
// Koden seier berre kva bedrift svaret høyrer til, ikkje kven som svarte.
function lagKode() { return crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 10); }
let TILGANG = lesJson("tilgang.json", {});
let KUNDEOPPSETT = lesJson("kundar.json", {});
let endra = false;
for (const slug of Object.keys(K.kundar)) {
  if (!TILGANG[slug]) { TILGANG[slug] = lagKode(); endra = true; }
  if (!KUNDEOPPSETT[slug]) KUNDEOPPSETT[slug] = { tilsette: null, open: true, frist: null };
}
if (endra) skrivJson("tilgang.json", TILGANG);
skrivJson("kundar.json", KUNDEOPPSETT);

function lik(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function gyldigKode(k, t) { return !!TILGANG[k] && typeof t === "string" && lik(TILGANG[k], t); }
function erOpen(k) {
  const o = KUNDEOPPSETT[k];
  if (!o || !o.open) return false;
  if (o.frist && new Date().toISOString().slice(0, 10) > o.frist) return false;
  return true;
}
function lenkje(k, sid) { return `${BASE_URL}/?s=${sid}&k=${k}&t=${TILGANG[k]}`; }
function lenkjer() {
  return Object.keys(K.kundar).map((k) => ({ k, namn: K.kundar[k], skjema: Object.keys(K.skjema).map((sid) => ({ id: sid, namn: K.skjema[sid].namn.nn, url: lenkje(k, sid) })) }));
}
if (process.argv.includes("--lenkjer")) {
  for (const l of lenkjer()) { console.log(`\n${l.namn}`); for (const s of l.skjema) console.log(`  ${s.namn}: ${s.url}`); }
  process.exit(0);
}

/* ---------------- Brukarar og økter ---------------- */
// Første oppstart i container: startkontoar kan kome frå miljøvariabelen INIT_BRUKARAR (JSON med hash, aldri klartekst)
if (!fs.existsSync(F("brukarar.json")) && process.env.INIT_BRUKARAR) {
  try { skrivJson("brukarar.json", JSON.parse(process.env.INIT_BRUKARAR)); console.log("Oppretta startkontoar frå INIT_BRUKARAR."); }
  catch (e) { console.error("INIT_BRUKARAR er ikkje gyldig JSON."); }
}
let BRUKARAR = lesJson("brukarar.json", {});
if (!Object.keys(BRUKARAR).length) console.warn("Ingen brukarar enno. Legg til med: node server.js --brukar namn@vardahei.no");
const OKTER = new Map(); // token -> { epost, utlop }
const OKT_TID = 8 * 3600 * 1000;
function cookies(req) {
  const ut = {};
  (req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) ut[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return ut;
}
function innlogga(req) {
  const t = cookies(req).kl_okt;
  const o = t && OKTER.get(t);
  if (!o || o.utlop < Date.now()) { if (t) OKTER.delete(t); return null; }
  o.utlop = Date.now() + OKT_TID;
  return { token: t, epost: o.epost, maaByte: !!(BRUKARAR[o.epost] && BRUKARAR[o.epost].maaByte) };
}
function sikker(req) { return req.headers["x-forwarded-proto"] === "https" || process.env.COOKIE_SECURE === "1"; }
function oktCookie(req, token, maxAlder) {
  return `kl_okt=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAlder}` + (sikker(req) ? "; Secure" : "");
}
// Grenser for feil passord: per IP og per konto
const feilIp = new Map(), feilKonto = new Map();
function tellFeil(map, nokkel, vindauge) {
  const no = Date.now();
  const l = (map.get(nokkel) || []).filter((t) => no - t < vindauge);
  return l;
}
function sperra(ip, epost) {
  return tellFeil(feilIp, ip, 15 * 60e3).length >= 10 || tellFeil(feilKonto, epost, 15 * 60e3).length >= 5;
}
function registrerFeil(ip, epost) {
  const no = Date.now();
  feilIp.set(ip, tellFeil(feilIp, ip, 15 * 60e3).concat(no));
  feilKonto.set(epost, tellFeil(feilKonto, epost, 15 * 60e3).concat(no));
}

/* ---------------- Hendingar og framdrift ---------------- */
let HENDINGAR = [];
try { HENDINGAR = fs.readFileSync(F("hendingar.jsonl"), "utf8").split("\n").filter(Boolean).slice(-300).map((l) => JSON.parse(l)); } catch {}
function hending(type, data) {
  const h = Object.assign({ tid: new Date().toISOString(), type }, data || {});
  HENDINGAR.push(h); if (HENDINGAR.length > 300) HENDINGAR.shift();
  fs.appendFileSync(F("hendingar.jsonl"), JSON.stringify(h) + "\n");
  varsle();
}

let FRAMDRIFT = lesJson("framdrift.json", {}); // okt -> { skjema, k, start, sist, sp, nr, totalt, ferdig, sekund }
let lagreTimer = null;
function lagreFramdrift() { clearTimeout(lagreTimer); lagreTimer = setTimeout(() => skrivJson("framdrift.json", FRAMDRIFT), 800); }

// Sanntid til adminpanelet (Server-Sent Events)
const LYTTARAR = new Set();
let varselTimer = null;
function varsle() {
  clearTimeout(varselTimer);
  varselTimer = setTimeout(() => { for (const res of LYTTARAR) res.write(`event: oppdatert\ndata: ${Date.now()}\n\n`); }, 300);
}
setInterval(() => { for (const res of LYTTARAR) res.write(`: ping\n\n`); }, 25000);

/* ---------------- Svar ---------------- */
function valider(d) {
  if (!d || typeof d !== "object" || !d.svar || typeof d.svar !== "object") return null;
  const SP = SPS[d.skjema];
  if (!SP) return null;
  const k = String(d.k || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (!gyldigKode(k, d.t)) return "ugyldig";
  if (!erOpen(k)) return "stengd";
  const ut = {};
  for (const [id, v] of Object.entries(d.svar)) {
    const s = SP[id];
    if (!s) continue;
    const ids = (s.val || []).map((x) => x.id);
    if (s.type === "single" && typeof v === "string" && ids.includes(v)) ut[id] = v;
    else if (s.type === "multi" && Array.isArray(v)) {
      const ok = [...new Set(v.filter((x) => ids.includes(x)))];
      if (ok.length && (!s.maks || ok.length <= s.maks)) ut[id] = ok;
    } else if (s.type === "text" && typeof v === "string" && v.trim()) { let t = v.trim().slice(0, s.maksLengd || 1500); if (s.stor) t = t.toUpperCase(); ut[id] = t; }
    else if (s.type === "scale" && v && typeof v === "object") {
      const r = {};
      for (const rad of s.rader) { const x = v[rad.id]; if (Number.isInteger(x) && x >= s.skala.min && x <= s.skala.max) r[rad.id] = x; }
      if (Object.keys(r).length) ut[id] = r;
    } else if (s.type === "nps" && Number.isInteger(v) && v >= 0 && v <= 10) ut[id] = v;
  }
  const fri = {};
  if (d.fri && typeof d.fri === "object") for (const [id, t] of Object.entries(d.fri)) if (SP[id] && typeof t === "string" && t.trim()) fri[id] = t.trim().slice(0, 800);
  if (!Object.keys(ut).length) return null;
  return {
    id: crypto.randomUUID(), tid: new Date().toISOString(), skjema: d.skjema, k,
    lang: d.lang === "en" ? "en" : "nn", versjon: String(d.versjon || "").slice(0, 20), leiardel: !!d.leiardel,
    sekund: Number.isInteger(d.sekund) && d.sekund > 0 && d.sekund < 86400 ? d.sekund : null,
    svar: ut, fri
  };
}
function lesAlle() {
  if (!fs.existsSync(F("svar.jsonl"))) return [];
  return fs.readFileSync(F("svar.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function csv(rader, skjemaId) {
  const SP = SPS[skjemaId];
  rader = rader.filter((r) => r.skjema === skjemaId);
  const kol = ["id", "tid", "skjema", "k", "lang", "leiardel", "sekund"];
  for (const s of K.skjema[skjemaId].sporsmal) {
    if (s.type === "scale") s.rader.forEach((r) => kol.push(`${s.id}.${r.id}`)); else kol.push(s.id);
    if (s.fritekst) kol.push(`${s.id}.fri`);
  }
  const esc = (v) => { const t = v == null ? "" : String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const linjer = [kol.join(";")];
  for (const r of rader) {
    linjer.push(kol.map((c) => {
      if (c.includes(".")) { const [id, del] = c.split("."); if (del === "fri") return esc(r.fri && r.fri[id]); return esc(r.svar[id] && r.svar[id][del]); }
      if (SP[c]) { const v = r.svar[c]; return esc(Array.isArray(v) ? v.join("|") : v); }
      return esc(r[c]);
    }).join(";"));
  }
  return "﻿" + linjer.join("\n");
}

/* ---------------- Status til adminpanelet ---------------- */
function status() {
  const no = Date.now();
  const idag = new Date().toISOString().slice(0, 10);
  const svar = lesAlle();
  const IGANG = 15 * 60e3, AVBROTE = 30 * 60e3;
  const okter = Object.values(FRAMDRIFT);
  const kundar = Object.keys(K.kundar).map((k) => {
    const o = KUNDEOPPSETT[k] || {};
    const per = {};
    for (const sid of Object.keys(K.skjema)) {
      const mine = okter.filter((x) => x.k === k && x.skjema === sid);
      const sv = svar.filter((r) => r.k === k && r.skjema === sid);
      per[sid] = {
        svar: sv.length,
        starta: mine.length,
        igang: mine.filter((x) => !x.ferdig && no - x.sist < IGANG).length,
        avbrote: mine.filter((x) => !x.ferdig && no - x.sist >= AVBROTE).length,
        leiarar: sv.filter((r) => r.leiardel).length,
        sist: [mine.reduce((a, x) => Math.max(a, x.sist), 0), sv.reduce((a, r) => Math.max(a, Date.parse(r.tid)), 0)].reduce((a, b) => Math.max(a, b), 0) || null,
        url: lenkje(k, sid)
      };
    }
    return { k, namn: K.kundar[k], tilsette: o.tilsette, open: !!o.open, frist: o.frist || null, aktiv: erOpen(k), skjema: per };
  });
  const skjema = {};
  for (const [sid, f] of Object.entries(K.skjema)) {
    const mine = okter.filter((x) => x.skjema === sid);
    const tider = svar.filter((r) => r.skjema === sid && r.sekund).map((r) => r.sekund).sort((a, b) => a - b);
    const stopp = {};
    mine.filter((x) => !x.ferdig && no - x.sist >= AVBROTE && x.sp).forEach((x) => { stopp[x.sp] = (stopp[x.sp] || 0) + 1; });
    skjema[sid] = {
      namn: f.namn.nn,
      starta: mine.length,
      svar: svar.filter((r) => r.skjema === sid).length,
      median: tider.length ? tider[Math.floor(tider.length / 2)] : null,
      stopp: f.sporsmal.filter((s) => stopp[s.id]).map((s) => ({ id: s.id, tekst: s.tekst.nn, n: stopp[s.id] })).concat(stopp.intro ? [{ id: "intro", tekst: "Opna skjemaet, men starta ikkje", n: stopp.intro }] : [])
    };
  }
  return {
    no: new Date(no).toISOString(),
    idag: {
      svar: svar.filter((r) => r.tid.slice(0, 10) === idag).length,
      igang: okter.filter((x) => !x.ferdig && no - x.sist < IGANG).length,
      ugyldige: HENDINGAR.filter((h) => h.type === "ugyldig_lenkje" && h.tid.slice(0, 10) === idag).length
    },
    kundar, skjema,
    hendingar: HENDINGAR.slice(-40).reverse()
  };
}

/* ---------------- Plakat med QR-kode ---------------- */
const qrcode = require("./lib/qrcode.js");
function qrSvg(tekst) {
  const qr = qrcode(0, "M"); qr.addData(tekst); qr.make();
  const n = qr.getModuleCount(), m = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m},${r + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR-kode til skjemaet"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
const PLAKAT = {
  tryggleik: { nn: ["Kor trygg er IT-kvardagen din?", "Vardahei IT vil vite korleis du har det med e-post, passord og alt det andre. Det tek om lag 5 minutt."], en: "How safe is your everyday IT? A five-minute survey from Vardahei IT." },
  ki: { nn: ["Kva tek tid i arbeidsdagen din?", "Vardahei IT vil finne ut kva som tek tid, og om KI kan gjere noko av det enklare. Har du aldri brukt KI, er svaret ditt like nyttig. Om lag 7 minutt."], en: "What takes time in your working day? A seven-minute survey from Vardahei IT." }
};
function plakat(k, sid) {
  const u = lenkje(k, sid), t = PLAKAT[sid] || PLAKAT.tryggleik;
  const logo = fs.readFileSync(path.join(__dirname, "private/logo.b64"), "utf8").trim();
  const frist = KUNDEOPPSETT[k] && KUNDEOPPSETT[k].frist;
  const fristTekst = frist ? new Date(frist + "T12:00:00").toLocaleDateString("nn-NO", { day: "numeric", month: "long" }) : null;
  return skal(`<title>Plakat ${esc(K.kundar[k])}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>
@page { size: A4 portrait; margin: 0; }
html, body { background: #fff; color: #1e2a31; font-family: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif; }
.ark { width: 210mm; height: 297mm; box-sizing: border-box; padding: 18mm 20mm 0; margin: 0 auto; position: relative; overflow: hidden; }
.logo { height: 11mm; }
h1 { font-size: 34pt; line-height: 1.08; margin: 16mm 0 6mm; letter-spacing: -.01em; max-width: 160mm; }
p.ingress { font-size: 15pt; line-height: 1.4; margin: 0 0 9mm; max-width: 150mm; color: #33434b; }
.qr { display: flex; gap: 10mm; align-items: center; }
.qr svg { width: 78mm; height: 78mm; display: block; }
.steg { font-size: 13pt; line-height: 1.5; margin: 0; padding: 0; list-style: none; }
.steg li { margin-bottom: 4mm; }
.steg b { color: #176e91; }
.lenkje { font-size: 9.5pt; color: #5d6a71; word-break: break-all; margin-top: 6mm; max-width: 170mm; }
.en { font-size: 11pt; color: #5d6a71; margin-top: 4mm; font-style: italic; }
.fjell { position: absolute; left: 0; right: 0; bottom: 0; height: 52mm; }
.botn { position: absolute; left: 20mm; right: 20mm; bottom: 9mm; display: flex; justify-content: space-between; font-size: 10pt; color: #fff; }
.skriv { position: fixed; top: 10px; right: 10px; font: 600 14px system-ui; background: #176e91; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
@media print { .skriv { display: none; } }
</style>
<button class="skriv" onclick="window.print()">Skriv ut</button>
<div class="ark">
  <img class="logo" alt="Vardahei IT" src="data:image/png;base64,${logo}">
  <h1>${esc(t.nn[0])}</h1>
  <p class="ingress">${esc(t.nn[1])}</p>
  <div class="qr">${qrSvg(u)}
    <ol class="steg">
      <li><b>1.</b> Opne kameraet på mobilen</li>
      <li><b>2.</b> Sikt på ruta</li>
      <li><b>3.</b> Trykk på lenkja som dukkar opp</li>
      <li style="margin-top:7mm">${sid === "tryggleik" ? "Same spørsmål som sist. Ingen feil svar." : "Ingen feil svar."}${fristTekst ? `<br>Svar innan <b>${esc(fristTekst)}</b>.` : ""}</li>
    </ol>
  </div>
  <p class="en">${esc(t.en)} Scan the code with your phone camera.</p>
  <p class="lenkje">${esc(u)}</p>
  <svg class="fjell" viewBox="0 0 210 52" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="0,52 0,30 18,24 28,28 48,16 60,22 82,10 96,18 118,6 130,13 150,2 164,9 184,14 210,8 210,52" fill="#dcebf2"/>
    <polygon points="0,52 0,40 22,34 34,38 56,27 70,32 92,22 108,28 130,18 146,24 168,15 186,22 210,18 210,52" fill="#176e91"/>
  </svg>
  <div class="botn"><span>Kartlegging for ${esc(K.kundar[k])}</span><span>Spørsmål? Vardahei IT, ${esc(K.kontakt.telefon)}</span></div>
</div>`);
}

/* ---------------- HTTP ---------------- */
function skal(innhald, lang) {
  return `<!doctype html><html lang="${lang || "nn"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${innhald}</body></html>`;
}
function send(res, status, body, type, ekstra) {
  res.writeHead(status, Object.assign({
    "Content-Type": type || "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "Cache-Control": "no-store"
  }, ekstra || {}));
  res.end(body);
}
function json(res, status, data) { send(res, status, JSON.stringify(data), "application/json; charset=utf-8"); }
function vidaresend(res, til, ekstra) { res.writeHead(303, Object.assign({ Location: til, "Cache-Control": "no-store" }, ekstra || {})); res.end(); }
function side(fil) { return skal(fs.readFileSync(path.join(__dirname, fil), "utf8")); }

// Grenser per 10 minutt. Små bedrifter sit ofte bak éi felles IP-adresse, så grensene per IP
// må tole at heile kontoret svarar samtidig. Feil koder blir tekne strengare.
const GRENSE = { sjekk: 300, kodefeil: 20, svar: 100, framdriftIp: 3000, framdriftOkt: 300 };
const VINDAUGE = 10 * 60e3;
const treff = new Map();
function ferske(nokkel) {
  const no = Date.now();
  const l = (treff.get(nokkel) || []).filter((t) => no - t < VINDAUGE);
  treff.set(nokkel, l);
  return l;
}
function forMange(nokkel, maks) { const l = ferske(nokkel); l.push(Date.now()); return l.length > maks; }
function kodeSperra(ip) { return ferske("kodefeil:" + ip).length >= GRENSE.kodefeil; }
function kodeFeil(ip) { ferske("kodefeil:" + ip).push(Date.now()); }
setInterval(() => { for (const n of treff.keys()) if (!ferske(n).length) treff.delete(n); }, VINDAUGE).unref();
function lesBody(req, maks) {
  return new Promise((ok, feil) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > (maks || 30000)) { req.destroy(); feil(new Error("for stor")); } });
    req.on("end", () => ok(b));
    req.on("error", feil);
  });
}
// Vern mot at andre nettstader sender skjema hit på vegner av ein innlogga brukar
function sameOrigin(req) {
  const sf = req.headers["sec-fetch-site"];
  if (sf) return sf === "same-origin" || sf === "none";
  const o = req.headers.origin;
  if (!o || o === "null") return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

// Innloggingssider (enkle, server-teikna)
function innloggingsside(tittel, innhald) {
  const logo = fs.readFileSync(path.join(__dirname, "private/logo.b64"), "utf8").trim();
  return skal(`<title>${tittel} | Kartlegging</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>
:root{--bg:#eef2f4;--sheet:#f9fbfc;--ink:#1e2a31;--muted:#5d6a71;--line:#c6d1d7;--accent:#176e91;--accent-ink:#fff;--feil:#b3402f;--logo-filter:none;--font:"Atkinson Hyperlegible","Segoe UI",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#10191e;--sheet:#17242b;--ink:#e3eaee;--muted:#9aabb3;--line:#2c3d46;--accent:#5fb0d3;--accent-ink:#08161d;--feil:#ec7b66;--logo-filter:brightness(1.45) saturate(.9);color-scheme:dark}}
body{background:var(--bg);color:var(--ink);font-family:var(--font);font-size:16px;line-height:1.5}
.boks{max-width:380px;margin:12vh auto 40px;padding-inline:20px}
img{height:28px;width:auto;filter:var(--logo-filter)}
h1{font-size:1.5rem;margin:28px 0 6px}
p{color:var(--muted);margin:0 0 20px}
label{display:block;font-weight:700;font-size:14px;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;font:inherit;color:var(--ink);background:var(--sheet);border:1.5px solid var(--line);border-radius:8px;padding:11px 12px}
input:focus{outline:3px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
button{margin-top:22px;width:100%;font:inherit;font-weight:700;background:var(--accent);color:var(--accent-ink);border:0;border-radius:8px;padding:12px;cursor:pointer}
.feil{color:var(--feil);font-weight:700;margin:16px 0 0}
.ok{color:var(--accent);font-weight:700;margin:16px 0 0}
</style>
<div class="boks"><img alt="Vardahei IT" src="data:image/png;base64,${logo}">${innhald}</div>`);
}
function esc(t) { return String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function trygTil(til) { return /^\/(dashboard|admin)$/.test(til || "") ? til : "/admin"; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    // Siste ledd i X-Forwarded-For er det Caddy la til. Det første kan klienten skrive sjølv.
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",").pop().trim();

    /* ----- Offentleg: skjemaet ----- */
    if (req.method === "GET" && p === "/") return send(res, 200, side("public/index.html"), "text/html; charset=utf-8");
    if (req.method === "GET" && p === "/healthz") return send(res, 200, "ok");
    if (req.method === "GET" && p === "/logo.png") return send(res, 200, Buffer.from(fs.readFileSync(path.join(__dirname, "private/logo.b64"), "utf8").trim(), "base64"), "image/png", { "Cache-Control": "public, max-age=86400" });
    if (req.method === "GET" && p === "/sporsmal.js") return send(res, 200, fs.readFileSync(path.join(__dirname, "public/sporsmal.js")), "text/javascript; charset=utf-8");

    if (req.method === "GET" && p === "/api/sjekk") {
      if (kodeSperra(ip) || forMange("sjekk:" + ip, GRENSE.sjekk)) return send(res, 429, "For mange forsøk.");
      const k = (url.searchParams.get("k") || "").toLowerCase();
      if (!gyldigKode(k, url.searchParams.get("t") || "")) { kodeFeil(ip); hending("ugyldig_lenkje", { k: K.kundar[k] ? k : null }); return send(res, 403, "Lenkja er ikkje gyldig."); }
      if (!erOpen(k)) return send(res, 410, "Kartlegginga er avslutta.");
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && p === "/api/svar") {
      if (kodeSperra(ip) || forMange("svar:" + ip, GRENSE.svar)) return send(res, 429, "For mange innsendingar. Prøv igjen om litt.");
      let d; try { d = JSON.parse(await lesBody(req)); } catch { return send(res, 400, "Ugyldig innhald."); }
      const rad = valider(d);
      if (rad === "ugyldig") { kodeFeil(ip); hending("ugyldig_lenkje", {}); return send(res, 403, "Lenkja er ikkje gyldig."); }
      if (rad === "stengd") return send(res, 410, "Kartlegginga er avslutta.");
      if (!rad) return send(res, 400, "Fann ingen gyldige svar.");
      fs.appendFileSync(F("svar.jsonl"), JSON.stringify(rad) + "\n");
      hending("svar", { k: rad.k, skjema: rad.skjema, sekund: rad.sekund, leiar: rad.leiardel });
      return json(res, 201, { ok: true });
    }

    if (req.method === "POST" && p === "/api/framdrift") {
      if (forMange("fd:" + ip, GRENSE.framdriftIp)) return send(res, 429, "");
      let d; try { d = JSON.parse(await lesBody(req, 2000)); } catch { return send(res, 400, ""); }
      const k = String(d.k || "").toLowerCase();
      if (!SPS[d.skjema] || !gyldigKode(k, d.t) || !erOpen(k) || !/^[a-f0-9]{16,32}$/.test(d.okt || "")) return send(res, 204, "");
      if (forMange("fdokt:" + d.okt, GRENSE.framdriftOkt)) return send(res, 429, "");
      const sp = d.sp === "intro" || d.sp === "B-intro" || SPS[d.skjema][d.sp] ? d.sp : null;
      const no = Date.now();
      const o = FRAMDRIFT[d.okt] || { skjema: d.skjema, k, start: no };
      const ny = !FRAMDRIFT[d.okt];
      Object.assign(o, { sist: no, sp: sp || o.sp, nr: Number.isInteger(d.nr) ? d.nr : o.nr, totalt: Number.isInteger(d.totalt) ? d.totalt : o.totalt });
      if (d.ferdig) o.ferdig = true;
      FRAMDRIFT[d.okt] = o;
      lagreFramdrift();
      if (ny) hending("start", { k, skjema: d.skjema }); else varsle();
      return send(res, 204, "");
    }

    /* ----- Innlogging ----- */
    if (p === "/logg-inn") {
      if (req.method === "GET") {
        const feil = url.searchParams.get("feil");
        const til = trygTil(url.searchParams.get("til"));
        return send(res, 200, innloggingsside("Logg inn", `<h1>Kartlegging hos kundane</h1><p>Logg inn med kontoen din i Vardahei.</p>
<form method="post" action="/logg-inn"><input type="hidden" name="til" value="${esc(til)}">
<label for="epost">E-post</label><input id="epost" name="epost" type="email" autocomplete="username" required autofocus>
<label for="passord">Passord</label><input id="passord" name="passord" type="password" autocomplete="current-password" required>
${feil === "1" ? '<p class="feil">Feil e-post eller passord.</p>' : feil === "2" ? '<p class="feil">For mange forsøk. Vent eit kvarter og prøv igjen.</p>' : url.searchParams.get("ut") ? '<p class="ok">Du er logga ut.</p>' : ""}
<button type="submit">Logg inn</button></form>`), "text/html; charset=utf-8");
      }
      if (req.method === "POST") {
        if (!sameOrigin(req)) return send(res, 403, "Ugyldig førespurnad.");
        const f = new URLSearchParams(await lesBody(req, 2000));
        const epost = (f.get("epost") || "").toLowerCase().trim(), pw = f.get("passord") || "", til = trygTil(f.get("til"));
        if (sperra(ip, epost)) { hending("innlogging_sperra", { epost }); return vidaresend(res, "/logg-inn?feil=2"); }
        if (!sjekkPassord(pw, BRUKARAR[epost])) { registrerFeil(ip, epost); hending("innlogging_feil", { epost }); return vidaresend(res, "/logg-inn?feil=1&til=" + encodeURIComponent(til)); }
        const token = crypto.randomBytes(32).toString("hex");
        OKTER.set(token, { epost, utlop: Date.now() + OKT_TID });
        hending("innlogging", { epost });
        return vidaresend(res, BRUKARAR[epost].maaByte ? "/byt-passord" : til, { "Set-Cookie": oktCookie(req, token, OKT_TID / 1000) });
      }
    }
    if (p === "/logg-ut" && req.method === "POST") {
      const b = innlogga(req);
      if (b) { OKTER.delete(b.token); hending("utlogging", { epost: b.epost }); }
      return vidaresend(res, "/logg-inn?ut=1", { "Set-Cookie": oktCookie(req, "", 0) });
    }

    /* ----- Alt under krev innlogging ----- */
    const brukar = innlogga(req);
    const erApi = p.startsWith("/api/");
    if (!brukar) {
      if (erApi || p === "/runde1.js" || p === "/ki-tilsett.js") return json(res, 401, { feil: "Ikkje innlogga" });
      if (p === "/dashboard" || p === "/admin" || p === "/byt-passord") return vidaresend(res, "/logg-inn?til=" + encodeURIComponent(p === "/byt-passord" ? "/admin" : p));
      return send(res, 404, "Fann ikkje sida.");
    }

    if (p === "/byt-passord") {
      if (req.method === "GET") {
        const m = url.searchParams.get("feil");
        const tekst = { "1": "Noverande passord er feil.", "2": "Det nye passordet må ha minst 12 teikn.", "3": "Dei to nye passorda er ikkje like.", "4": "Vel eit anna passord enn det du hadde." }[m];
        return send(res, 200, innloggingsside("Byt passord", `<h1>Vel ditt eige passord</h1><p>${brukar.maaByte ? "Du logga inn med eit felles startpassord. Vel eit nytt som berre du kjenner." : "Byt passordet ditt."} Minst 12 teikn.</p>
<form method="post" action="/byt-passord">
<label for="no">Noverande passord</label><input id="no" name="no" type="password" autocomplete="current-password" required>
<label for="ny">Nytt passord</label><input id="ny" name="ny" type="password" autocomplete="new-password" minlength="12" required>
<label for="ny2">Nytt passord ein gong til</label><input id="ny2" name="ny2" type="password" autocomplete="new-password" minlength="12" required>
${tekst ? `<p class="feil">${tekst}</p>` : ""}<button type="submit">Lagre passordet</button></form>`), "text/html; charset=utf-8");
      }
      if (req.method === "POST") {
        if (!sameOrigin(req)) return send(res, 403, "Ugyldig førespurnad.");
        const f = new URLSearchParams(await lesBody(req, 2000));
        const no = f.get("no") || "", ny = f.get("ny") || "", ny2 = f.get("ny2") || "";
        if (!sjekkPassord(no, BRUKARAR[brukar.epost])) return vidaresend(res, "/byt-passord?feil=1");
        if (ny.length < 12) return vidaresend(res, "/byt-passord?feil=2");
        if (ny !== ny2) return vidaresend(res, "/byt-passord?feil=3");
        if (ny === no) return vidaresend(res, "/byt-passord?feil=4");
        BRUKARAR[brukar.epost] = Object.assign(BRUKARAR[brukar.epost], hashPassord(ny), { maaByte: false, bytt: new Date().toISOString() });
        skrivJson("brukarar.json", BRUKARAR);
        hending("passord_bytt", { epost: brukar.epost });
        return vidaresend(res, "/admin");
      }
    }
    if (brukar.maaByte) {
      if (erApi) return json(res, 403, { feil: "Byt passord først" });
      return vidaresend(res, "/byt-passord");
    }

    if (req.method === "GET" && p === "/dashboard") return send(res, 200, side("private/dashboard.html"), "text/html; charset=utf-8");
    if (req.method === "GET" && p === "/admin") return send(res, 200, side("private/admin.html"), "text/html; charset=utf-8");
    if (req.method === "GET" && p === "/runde1.js") return send(res, 200, fs.readFileSync(path.join(__dirname, "private/runde1.js")), "text/javascript; charset=utf-8");
    if (req.method === "GET" && p === "/api/meg") return json(res, 200, { epost: brukar.epost });
    if (req.method === "GET" && p === "/ki-tilsett.js") return send(res, 200, fs.readFileSync(path.join(__dirname, "private/ki-tilsett.js")), "text/javascript; charset=utf-8");
    if (req.method === "GET" && p === "/api/svar") return json(res, 200, lesAlle());
    if (req.method === "GET" && p === "/api/svar.csv") {
      const sid = K.skjema[url.searchParams.get("s")] ? url.searchParams.get("s") : "tryggleik";
      hending("eksport", { epost: brukar.epost, skjema: sid });
      return send(res, 200, csv(lesAlle(), sid), "text/csv; charset=utf-8", { "Content-Disposition": `attachment; filename="kartlegging-${sid}.csv"` });
    }
    if (req.method === "GET" && p === "/api/lenkjer") return json(res, 200, lenkjer());
    if (req.method === "GET" && p === "/plakat") {
      const k = url.searchParams.get("k"), sid = url.searchParams.get("s");
      if (!K.kundar[k] || !K.skjema[sid]) return send(res, 404, "Ukjend kunde eller skjema.");
      return send(res, 200, plakat(k, sid), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && p === "/api/admin/status") return json(res, 200, status());
    if (req.method === "GET" && p === "/api/admin/straum") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write(`event: oppdatert\ndata: ${Date.now()}\n\n`);
      LYTTARAR.add(res);
      req.on("close", () => LYTTARAR.delete(res));
      return;
    }
    if (req.method === "POST" && p === "/api/admin/kunde") {
      if (!sameOrigin(req)) return send(res, 403, "Ugyldig førespurnad.");
      let d; try { d = JSON.parse(await lesBody(req, 2000)); } catch { return send(res, 400, ""); }
      const o = KUNDEOPPSETT[d.k];
      if (!o) return json(res, 404, { feil: "Ukjend kunde" });
      const for_ = JSON.stringify(o);
      if ("tilsette" in d) o.tilsette = Number.isInteger(d.tilsette) && d.tilsette > 0 && d.tilsette < 10000 ? d.tilsette : null;
      if ("open" in d) o.open = !!d.open;
      if ("frist" in d) o.frist = /^\d{4}-\d{2}-\d{2}$/.test(d.frist || "") ? d.frist : null;
      skrivJson("kundar.json", KUNDEOPPSETT);
      if (for_ !== JSON.stringify(o)) hending("kunde_endra", { epost: brukar.epost, k: d.k, open: o.open, tilsette: o.tilsette, frist: o.frist });
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && p === "/api/admin/nykode") {
      if (!sameOrigin(req)) return send(res, 403, "Ugyldig førespurnad.");
      let d; try { d = JSON.parse(await lesBody(req, 500)); } catch { return send(res, 400, ""); }
      if (!TILGANG[d.k]) return json(res, 404, { feil: "Ukjend kunde" });
      TILGANG[d.k] = lagKode();
      skrivJson("tilgang.json", TILGANG);
      hending("ny_kode", { epost: brukar.epost, k: d.k });
      return json(res, 200, { ok: true });
    }
    send(res, 404, "Fann ikkje sida.");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, "Noko gjekk gale.");
  }
});

const HOST = process.env.HOST || "127.0.0.1";
server.listen(PORT, HOST, () => console.log(`Kartlegging køyrer på http://${HOST}:${PORT}`));
