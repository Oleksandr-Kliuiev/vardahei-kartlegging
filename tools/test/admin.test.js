// Køyr: PW1=<passord> [PW2=<nytt passord ved første innlogging>] K=gasta node tools/test/admin.test.js  (krev playwright og ein testserver på BASE)
// Går gjennom adminpanelet: tal tilsette, «Send ut»-tekstane, kopiering, plakat, frist, stengje/opne, «Ny kode» og sanntid.
// NB: testen lagar ny lenkjekode for kunden K. Difor berre mot localhost, helst med eigen DATA_DIR.
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const K = process.env.K || "gasta";
const SC = process.env.UT || __dirname; // mappe for skjermbilete
const EPOST = "oleksandr@vardahei.no";

if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(BASE).hostname)) {
  console.error("Admintesten endrar lenkjekodar. Køyr han berre mot ein lokal testserver, ikkje " + BASE);
  process.exit(1);
}

const dato = (dagar) => new Date(Date.now() + dagar * 864e5).toLocaleDateString("sv-SE"); // YYYY-MM-DD, lokal tid
const sjekkar = [];
function sjekk(namn, ok, detalj) {
  sjekkar.push({ namn, ok: !!ok });
  console.log((ok ? "ok   " : "FEIL ") + namn + (ok || detalj === undefined ? "" : "  " + JSON.stringify(detalj)));
}

async function loggInn(page) {
  for (const pw of [process.env.PW1, process.env.PW2].filter(Boolean)) {
    await page.goto(BASE + "/logg-inn");
    await page.fill("#epost", EPOST);
    await page.fill("#passord", pw);
    await page.click("button[type=submit]");
    await page.waitForLoadState("load");
    if (page.url().includes("feil=")) continue;
    if (page.url().includes("byt-passord")) {
      await page.fill("#no", pw);
      await page.fill("#ny", process.env.PW2);
      await page.fill("#ny2", process.env.PW2);
      await page.click("button[type=submit]");
      await page.waitForLoadState("load");
    }
    return true;
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const feil = [];
  page.on("pageerror", (e) => feil.push("pageerror: " + e));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|net::ERR/.test(m.text())) feil.push("console: " + m.text()); });

  const status = async () => (await ctx.request.get(BASE + "/api/admin/status")).json();
  const kunde = async () => (await status()).kundar.find((x) => x.k === K);
  const sjekkKode = async (t) => {
    const s = (await ctx.request.get(`${BASE}/api/sjekk?k=${K}&t=${encodeURIComponent(t)}`)).status();
    // /api/sjekk tillèt 30 kall per IP per 10 min; testen brukar om lag 10
    if (s === 429) throw new Error("/api/sjekk svarte 429 (grensa er 30 kall per 10 min). Vent 10 minutt eller start testserveren på nytt.");
    return s;
  };
  const melding = async (tekst) => page.waitForFunction((t) => { const m = document.getElementById("melding"); return !m.hidden && m.textContent.includes(t); }, tekst, { timeout: 5000 });
  const rad = () => page.locator("#kundar tr", { has: page.locator("#tilsette-" + K) });
  const statusKnapp = () => rad().locator("button.status");
  const tekstfelt = (sid) => page.locator(`#tekst-${K}-${sid}`);

  if (!(await loggInn(page))) { console.error("Klarte ikkje å logge inn med PW1/PW2."); process.exit(1); }
  await page.goto(BASE + "/admin");
  await page.waitForSelector("#tilsette-" + K);

  /* Oversikt */
  const forst = await status();
  const opphav = forst.kundar.find((x) => x.k === K);
  sjekk("kunden finst i status", !!opphav, K);
  const oversikt = await page.evaluate(() => ({
    rader: document.querySelectorAll("#kundar > tr:not(.utsending)").length,
    demo: !document.getElementById("demo").hidden,
    epost: document.getElementById("meg-epost").textContent,
    s1: document.getElementById("th-s1").textContent,
    s2: document.getElementById("th-s2").textContent
  }));
  sjekk("éi rad per kunde", oversikt.rader === forst.kundar.length, oversikt);
  sjekk("ikkje demomodus, rett brukar", !oversikt.demo && oversikt.epost.includes(EPOST), oversikt);
  sjekk("kolonnar for begge skjema", oversikt.s1 && oversikt.s2, oversikt);
  await page.waitForSelector("#puls.live", { timeout: 8000 }).catch(() => {});
  sjekk("sanntidsstraum kopla til", await page.locator("#puls.live").count(), await page.textContent("#puls-tekst"));

  /* Tal tilsette */
  await page.fill("#tilsette-" + K, "7");
  await page.press("#tilsette-" + K, "Tab");
  await melding("Lagra.");
  sjekk("tal tilsette lagra", (await kunde()).tilsette === 7);
  sjekk("prosentkolonna brukar tal tilsette", (await rad().textContent()).includes("/ 7"));

  /* Send ut */
  await rad().getByRole("button", { name: "Send ut" }).click();
  await tekstfelt("tryggleik").waitFor();
  let k = await kunde();
  const nn = await tekstfelt("tryggleik").inputValue();
  sjekk("utsendingstekst nn med rett lenkje", nn.startsWith("Hei alle!") && nn.includes(k.skjema.tryggleik.url) && !/[{}]/.test(nn), nn.slice(0, 80));
  sjekk("KI-teksten seier anonymt", (await tekstfelt("ki").inputValue()).includes("anonymt"));
  await page.getByRole("button", { name: "English" }).click();
  sjekk("engelsk tekst", (await tekstfelt("tryggleik").inputValue()).startsWith("Hi everyone"));
  await page.getByRole("button", { name: "Nynorsk" }).click();
  const kopier = page.locator("tr.utsending").getByRole("button", { name: "Kopier tekst" }).first();
  await kopier.click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("tr.utsending button")).some((b) => b.textContent === "Kopiert"), null, { timeout: 3000 }).catch(() => {});
  const utklipp = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => "FEIL: " + e);
  sjekk("«Kopier tekst» legg teksten på utklippstavla", utklipp === (await tekstfelt("tryggleik").inputValue()), utklipp.slice(0, 60));

  /* Frist fram i tid + plakat */
  const framtid = dato(7);
  await page.fill("#frist-" + K, framtid);
  await melding("Lagra.");
  k = await kunde();
  sjekk("frist lagra", k.frist === framtid, k.frist);
  sjekk("fristen står i utsendingsteksten", (await tekstfelt("tryggleik").inputValue()).includes("Svar gjerne innan"));
  const kode = new URL(k.skjema.tryggleik.url).searchParams.get("t");
  sjekk("lenkja verkar før fristen", (await sjekkKode(kode)) === 200);
  const [plakat] = await Promise.all([ctx.waitForEvent("page"), page.locator("tr.utsending").getByRole("link", { name: "Plakat med QR-kode" }).first().click()]);
  await plakat.waitForLoadState("load");
  const p = await plakat.evaluate(() => ({ qr: !!document.querySelector(".qr svg"), lenkje: (document.querySelector(".lenkje") || {}).textContent, tekst: document.body.textContent }));
  sjekk("plakaten har QR og rett lenkje", p.qr && p.lenkje === k.skjema.tryggleik.url, { qr: p.qr, lenkje: p.lenkje });
  sjekk("plakaten viser fristen og kunden", p.tekst.includes("Svar innan") && p.tekst.includes("Kartlegging for " + k.namn));
  await plakat.screenshot({ path: SC + "/admin-plakat.png", fullPage: true });
  await plakat.close();

  /* Frist passert */
  await page.fill("#frist-" + K, dato(-2));
  await melding("Lagra.");
  await page.waitForFunction((k) => /Frist passert/.test(document.querySelector("#tilsette-" + k).closest("tr").textContent), K, { timeout: 5000 }).catch(() => {});
  sjekk("status «Frist passert»", (await statusKnapp().textContent()).includes("Frist passert"));
  sjekk("lenkja gir 410 etter fristen", (await sjekkKode(kode)) === 410);
  const skjema = await ctx.newPage();
  await skjema.goto(`${BASE}/?s=tryggleik&k=${K}&t=${kode}`);
  await skjema.waitForFunction(() => document.body.textContent.includes("Kartlegginga er avslutta"), null, { timeout: 5000 }).catch(() => {});
  sjekk("skjemaet seier «avslutta»", (await skjema.textContent("body")).includes("Kartlegginga er avslutta"));
  await skjema.close();
  await page.fill("#frist-" + K, "");
  await melding("Lagra.");
  sjekk("frist fjerna, lenkja verkar att", (await kunde()).frist === null && (await sjekkKode(kode)) === 200);

  /* Stengje og opne */
  await statusKnapp().click();
  await page.waitForFunction((k) => document.querySelector("#tilsette-" + k).closest("tr").classList.contains("stengd"), K, { timeout: 5000 }).catch(() => {});
  sjekk("stengd i panelet", (await statusKnapp().textContent()).includes("Stengd"));
  sjekk("stengd kunde gir 410", (await kunde()).open === false && (await sjekkKode(kode)) === 410);
  await statusKnapp().click();
  await page.waitForFunction((k) => !document.querySelector("#tilsette-" + k).closest("tr").classList.contains("stengd"), K, { timeout: 5000 }).catch(() => {});
  sjekk("opna att", (await statusKnapp().textContent()).includes("Open") && (await sjekkKode(kode)) === 200);

  /* Ny kode */
  const ny = rad().getByRole("button", { name: /Ny kode|Stadfest/ });
  await ny.click();
  sjekk("«Ny kode» ber om stadfesting", (await ny.textContent()).includes("Stadfest"));
  await ny.click();
  await melding("Ny kode laga");
  k = await kunde();
  const nyKode = new URL(k.skjema.tryggleik.url).searchParams.get("t");
  sjekk("ny kode er annleis", nyKode && nyKode !== kode);
  sjekk("gamal lenkje gir 403, ny gir 200", (await sjekkKode(kode)) === 403 && (await sjekkKode(nyKode)) === 200);
  sjekk("utsendingsteksten har den nye lenkja", (await tekstfelt("tryggleik").inputValue()).includes(k.skjema.tryggleik.url));

  /* Sanntid: nokon opnar skjemaet i ein annan nettlesar */
  const igang = async () => parseInt(await rad().locator(".igang-tal").textContent(), 10) || 0;
  const igangFor = await igang();
  const framand = await browser.newContext();
  const okt = require("crypto").randomBytes(8).toString("hex");
  await framand.request.post(BASE + "/api/framdrift", { data: { skjema: "tryggleik", k: K, t: nyKode, okt, sp: "intro", nr: 0, totalt: 22 } });
  await framand.close();
  await page.waitForFunction(([k, n]) => parseInt(document.querySelector("#tilsette-" + k).closest("tr").querySelector(".igang-tal").textContent, 10) === n, [K, igangFor + 1], { timeout: 6000 }).catch(() => {});
  sjekk("«I gang no» oppdaterer seg utan omlasting", (await igang()) === igangFor + 1, { for: igangFor, no: await igang() });
  const logg = await page.textContent("#logg");
  sjekk("loggen viser endringar og ny kode", logg.includes("endra " + k.namn) && logg.includes("laga ny lenkjekode for " + k.namn) && logg.includes("Nokon i " + k.namn + " opna"));

  await page.screenshot({ path: SC + "/admin.png", fullPage: true });

  /* Set tilbake oppsettet (koden kan ikkje setjast tilbake) */
  await page.evaluate(async (o) => {
    await fetch("api/admin/kunde", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: o.k, tilsette: o.tilsette, open: o.open, frist: o.frist }) });
  }, opphav);
  const att = await kunde();
  sjekk("oppsettet sett tilbake", att.tilsette === opphav.tilsette && att.open === opphav.open && att.frist === opphav.frist, att);

  sjekk("ingen feil i konsollen", !feil.length, feil);
  await browser.close();
  const feila = sjekkar.filter((s) => !s.ok).length;
  console.log(`\n${sjekkar.length - feila} av ${sjekkar.length} sjekkar ok`);
  process.exit(feila ? 1 : 0);
})().catch((e) => { console.error("FEIL", e); process.exit(1); });
