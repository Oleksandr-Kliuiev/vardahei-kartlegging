// Køyr: T=<kode for K> K=kviknes PW1=<passord> [PW2=<nytt>] node tools/test/ki.test.js  (krev playwright og ein lokal testserver på BASE)
// KI-skjemaet med initialar (K0): introteksten seier kven som ser svara, K0 er første spørsmål og kan ikkje hoppast over,
// serveren lagrar initialane med store bokstavar og kuttar dei til 8 teikn, og dashbordet viser «Svar per tilsett».
// NB: legg testsvar i svar.jsonl. Berre mot localhost med eigen DATA_DIR.
const { chromium } = require("playwright");
const { svarAlle, loggInn, lagSjekk } = require("./stotte.js");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const T = process.env.T;
const K = process.env.K || "kviknes";
const SC = process.env.UT || __dirname;

if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(BASE).hostname)) { console.error("Berre mot ein lokal testserver."); process.exit(1); }
if (!T) { console.error("Manglar T (lenkjekoden til kunden K)."); process.exit(1); }
const sjekk = lagSjekk();

(async () => {
  const browser = await chromium.launch();
  const personar = [
    { init: "kinor", leiar: true, vel: 0 },
    { init: "KIAND", leiar: false, vel: 1, svar: { K19: "privat", K21: "lim" } }
  ];
  for (const [n, p] of personar.entries()) {
    for (const lang of n === 0 ? ["nn", "en"] : ["nn"]) {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
      const page = await ctx.newPage();
      const feil = [];
      page.on("pageerror", (e) => feil.push(String(e)));
      await page.goto(`${BASE}/?s=ki&k=${K}&t=${T}`);
      await page.waitForSelector(".fakta");
      if (lang === "en") { await page.click("#sprak-en"); await page.waitForTimeout(200); }
      const intro = await page.evaluate(() => document.querySelector(".fakta").textContent);
      const erEn = /initials/.test(intro);
      if (lang === "nn" || erEn) {
        sjekk(`intro (${erEn ? "en" : "nn"}) nemner initialar og kven som ser svara`, erEn ? /initials/.test(intro) && /Only Vardahei IT/.test(intro) : /initialane/.test(intro) && /berre Vardahei IT/.test(intro), intro);
        sjekk(`intro (${erEn ? "en" : "nn"}) lovar ikkje anonymitet`, !/anonym|ikkje om namn|don't ask for your name/i.test(intro), intro);
      }
      if (n === 0) await page.screenshot({ path: `${SC}/ki-intro-${erEn ? "en" : "nn"}.png`, fullPage: true });
      if (lang === "en") { await ctx.close(); continue; }
      await page.click("#vidare");
      await page.waitForSelector("h2.sp");
      const forste = await page.evaluate(() => ({ id: document.querySelector("h2.sp").id, sperra: document.getElementById("vidare").disabled, hopp: !document.getElementById("hopp").hidden }));
      sjekk("første spørsmål er K0", forste.id === "sp-K0", forste);
      sjekk("K0 kan ikkje hoppast over før utfylling", forste.sperra && !forste.hopp, forste);
      await page.fill("#tekst-K0", "a");
      sjekk("eitt teikn er for lite", await page.evaluate(() => document.getElementById("vidare").disabled));
      if (n === 0) { await page.fill("#tekst-K0", "kin"); await page.screenshot({ path: `${SC}/ki-k0.png`, fullPage: true }); }
      const sett = await svarAlle(page, p);
      await page.waitForSelector(".slutt", { timeout: 5000 });
      sjekk(`${p.init}: skjemaet gjekk gjennom (${Object.keys(sett).length} svar)`, sett.K0 && !feil.length, feil);
      await ctx.close();
    }
  }

  // Direkte mot API-et: lang og små bokstavar skal bli kutta og gjort store, som F1
  const r = await fetch(BASE + "/api/svar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skjema: "ki", k: K, t: T, lang: "nn", svar: { K0: "  abcdefghijk ", K1: "kontor", K7: "dag", K15: "=1+1 fritekst" } }) });
  sjekk("API tek imot KI-svar med K0", r.status === 201, r.status);

  // Dashbordet: les svara og sjå KI-tabellen per tilsett
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const feil = [];
  page.on("pageerror", (e) => feil.push(String(e)));
  sjekk("innlogging", await loggInn(page, BASE));
  const alle = await page.evaluate(() => fetch("api/svar").then((x) => x.json()));
  const ki = alle.filter((x) => x.skjema === "ki" && x.k === K);
  const init = ki.map((x) => x.svar.K0);
  sjekk("initialane er lagra med store bokstavar", init.includes("KINOR") && init.includes("KIAND"), init);
  sjekk("serveren kuttar K0 til 8 teikn", init.includes("ABCDEFGH"), init);
  await page.goto(BASE + "/dashboard");
  await page.waitForSelector("section.del");
  await page.click('.fanar button:has-text("KI")');
  await page.click(`.chip:has-text("${K.charAt(0).toUpperCase() + K.slice(1)}")`);
  await page.waitForSelector("#ki-tilsette");
  const tab = await page.evaluate(() => ({
    hov: Array.from(document.querySelectorAll("#ki-tilsette thead th")).map((t) => t.textContent),
    rader: Array.from(document.querySelectorAll("#ki-tilsette tbody tr")).map((t) => Array.from(t.children).map((c) => c.textContent)),
    merk: Array.from(document.querySelectorAll("#ki-tilsette td.merk")).map((t) => t.textContent),
    k0iBlokk: !!document.querySelector('[id="sp-K0"], [data-id="K0"]')
  }));
  sjekk("KI-tabellen har éi rad per svar", tab.rader.length === ki.length, { rader: tab.rader.length, ki: ki.length });
  sjekk("KI-tabellen viser initialar og rolle", tab.rader.some((x) => x[0] === "KIAND") && tab.hov[0] === "Initialar" && tab.hov[1] === "Rolle", tab.hov);
  sjekk("ingen kolonne «Førre runde» utan data", !tab.hov.includes("Førre runde"), tab.hov);
  sjekk("privat konto og innliming er merkte", tab.merk.includes("Privat konto") && tab.merk.includes("Limer inn"), tab.merk);
  await page.locator("#ki-tilsette").screenshot({ path: `${SC}/dash-ki-tilsette.png` });
  await page.screenshot({ path: `${SC}/dash-ki-full.png`, fullPage: true });
  sjekk("ingen JS-feil i dashbordet", !feil.length, feil);
  await browser.close();
  console.log(`${sjekk.tal() - sjekk.feil()} av ${sjekk.tal()} ok`);
  process.exit(sjekk.feil() ? 1 : 0);
})().catch((e) => { console.error("FEIL", e); process.exit(1); });
