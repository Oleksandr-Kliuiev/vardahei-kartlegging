// Køyr: T=<kode frå node server.js --lenkjer> K=gasta node tools/test/grenser.test.js  (krev ein nystarta testserver på BASE)
// Sjekkar grensene i server.js: eit heilt kontor bak éi IP-adresse skal kome gjennom, men gjetting av kodar skal stoppast.
// NB: legg 30 testsvar i svar.jsonl og fyller grensene i 10 minutt. Berre mot localhost med eigen DATA_DIR.
const crypto = require("crypto");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const T = process.env.T;
const K = process.env.K || "gasta";
const TILSETTE = 30, STEG = 45; // stega per person: litt meir enn eit skjema med leiardel og nokre tilbake-trykk

if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(BASE).hostname)) { console.error("Berre mot ein lokal testserver."); process.exit(1); }
if (!T) { console.error("Manglar T (lenkjekoden til kunden K)."); process.exit(1); }

const sjekkar = [];
function sjekk(namn, ok, detalj) {
  sjekkar.push(!!ok);
  console.log((ok ? "ok   " : "FEIL ") + namn + (ok || detalj === undefined ? "" : "  " + JSON.stringify(detalj)));
}
// Caddy legg klientadressa sist i X-Forwarded-For; det som står før, kan klienten ha skrive sjølv
const fraa = (ip, falsk) => ({ "X-Forwarded-For": (falsk ? falsk + ", " : "") + ip });
const sjekkKode = (ip, t, falsk) => fetch(`${BASE}/api/sjekk?k=${K}&t=${encodeURIComponent(t)}`, { headers: fraa(ip, falsk) }).then((r) => r.status);
const post = (ip, sti, body) => fetch(BASE + sti, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, fraa(ip)), body: JSON.stringify(body) }).then((r) => r.status);

async function tilsett(ip, i) {
  const okt = crypto.randomBytes(8).toString("hex");
  const s = { sjekk: await sjekkKode(ip, T), framdrift: [], svar: null };
  for (let n = 0; n < STEG; n++) s.framdrift.push(await post(ip, "/api/framdrift", { skjema: "tryggleik", k: K, t: T, okt, sp: n ? "F3" : "intro", nr: n, totalt: 22 }));
  s.svar = await post(ip, "/api/svar", { skjema: "tryggleik", k: K, t: T, lang: "nn", svar: { F1: "GRTEST" + i, F2: "kontor", F3: "ja" } });
  return s;
}

(async () => {
  /* Heile kontoret svarar samtidig frå same IP */
  const kontor = await Promise.all(Array.from({ length: TILSETTE }, (_, i) => tilsett("10.0.0.5", i)));
  const st = (f) => [...new Set(kontor.flatMap(f))];
  sjekk(`${TILSETTE} tilsette bak éi IP: lenkja verkar for alle`, st((s) => [s.sjekk]).join() === "200", st((s) => [s.sjekk]));
  sjekk(`${TILSETTE * STEG} framdriftsmeldingar kjem fram`, st((s) => s.framdrift).join() === "204", st((s) => s.framdrift));
  sjekk(`${TILSETTE} svar blir lagra`, st((s) => [s.svar]).join() === "201", st((s) => [s.svar]));

  /* Gjetting av kodar, med falsk adresse først i X-Forwarded-For */
  const feil = [];
  for (let i = 0; i < 20; i++) feil.push(await sjekkKode("10.0.0.9", "gjett" + i, `203.0.113.${i}`));
  sjekk("20 feil kodar gir 403", feil.every((s) => s === 403), [...new Set(feil)]);
  sjekk("21. forsøk blir stoppa (429) trass falsk X-Forwarded-For", (await sjekkKode("10.0.0.9", "gjett20", "198.51.100.1")) === 429);
  sjekk("rett kode frå same IP er òg sperra ei stund", (await sjekkKode("10.0.0.9", T)) === 429);
  sjekk("svar frå same IP er sperra", (await post("10.0.0.9", "/api/svar", { skjema: "tryggleik", k: K, t: T, svar: { F3: "ja" } })) === 429);
  sjekk("andre IP-adresser merkar ingenting", (await sjekkKode("10.0.0.10", T)) === 200);

  /* Éi økt som sender framdrift i løkke */
  const okt = crypto.randomBytes(8).toString("hex");
  const rundt = [];
  for (let n = 0; n < 301; n++) rundt.push(await post("10.0.0.11", "/api/framdrift", { skjema: "tryggleik", k: K, t: T, okt, sp: "F3", nr: 1, totalt: 22 }));
  sjekk("300 meldingar frå éi økt går gjennom", rundt.slice(0, 300).every((s) => s === 204), [...new Set(rundt.slice(0, 300))]);
  sjekk("den 301. blir stoppa", rundt[300] === 429, rundt[300]);
  sjekk("ei ny økt frå same IP går gjennom", (await post("10.0.0.11", "/api/framdrift", { skjema: "tryggleik", k: K, t: T, okt: crypto.randomBytes(8).toString("hex"), sp: "intro", nr: 0, totalt: 22 })) === 204);

  const feila = sjekkar.filter((x) => !x).length;
  console.log(`\n${sjekkar.length - feila} av ${sjekkar.length} sjekkar ok`);
  process.exit(feila ? 1 : 0);
})().catch((e) => { console.error("FEIL", e); process.exit(1); });
