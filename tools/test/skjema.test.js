// Køyr: T=<kode frå node server.js --lenkjer> K=daco node tools/test/skjema.test.js  (krev playwright og ein server på BASE)
// Går gjennom tryggleiksskjemaet som ein tilsett og som ein leiar, og sjekkar at svara kjem fram.
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const T = process.env.T;
const K = process.env.K || "daco";

async function svarAlle(page, opts) {
  const sett = {};
  for (let i = 0; i < 80; i++) {
    const skjerm = await page.evaluate(() => {
      const h = document.querySelector("h2.sp, .mellom h2, .slutt h1");
      const inp = Array.from(document.querySelectorAll('main input[type="text"], main textarea')).filter((x) => x.id.indexOf('tekst-') === 0)[0];
      const opts = Array.from(document.querySelectorAll("main .opt")).map((b) => b.getAttribute("data-id"));
      const skala = document.querySelectorAll("main .skala-knappar").length;
      return { h: h ? h.textContent : "", inp: !!inp, inpId: inp ? inp.id : null, opts, skala, slutt: !!document.querySelector(".slutt"), bintro: !!document.querySelector(".mellom"), hopp: !document.getElementById("hopp").hidden, vidare: !document.getElementById("vidare").hidden };
    });
    if (skjerm.slutt) return sett;
    if (skjerm.bintro) { await page.click(opts.leiar ? "#vidare" : "#hopp"); await page.waitForTimeout(150); continue; }
    if (skjerm.inp) {
      const id = skjerm.inpId.replace("tekst-", "");
      const val = id === "F1" ? (opts.init || "olnor") : "Testsvar " + id;
      await page.fill("#" + skjerm.inpId, val);
      sett[id] = val;
      await page.waitForTimeout(120);
      const st = await page.evaluate(() => ({ h: document.querySelector("h2.sp") && document.querySelector("h2.sp").id, vid: document.getElementById("vidare").disabled, val: (document.querySelector("main input, main textarea") || {}).value }));
      if (st.vid) throw new Error("Vidare sperra etter utfylling: " + JSON.stringify(st));
      await page.click("#vidare");
      await page.waitForTimeout(150);
      continue;
    }
    if (skjerm.opts.length) {
      const sp = await page.evaluate(() => document.querySelector("h2.sp").id.replace("sp-", ""));
      let vel = skjerm.opts[0];
      if (sp === "F2") vel = opts.leiar ? "leiar" : "kontor";
      else if (opts.svar && opts.svar[sp]) vel = opts.svar[sp];
      else vel = skjerm.opts[Math.min(skjerm.opts.length - 1, opts.vel || 0)];
      const erMulti = await page.evaluate(() => !!document.querySelector('main .opt[role="checkbox"]'));
      await page.click(`main .opt[data-id="${vel}"]`);
      sett[sp] = vel;
      await page.waitForTimeout(erMulti ? 100 : 400);
      if (erMulti || (await page.evaluate(() => !document.getElementById("vidare").hidden && !document.getElementById("vidare").disabled && document.querySelector("h2.sp")))) {
        const still = await page.evaluate((sp) => { const h = document.querySelector("h2.sp"); return h && h.id === "sp-" + sp; }, sp);
        if (still) await page.click("#vidare");
      }
      await page.waitForTimeout(150);
      continue;
    }
    if (skjerm.skala) {
      await page.evaluate(() => document.querySelectorAll("main .skala-knappar").forEach((k) => k.children[2].click()));
      await page.waitForTimeout(100);
      await page.click("#vidare");
      await page.waitForTimeout(150);
      continue;
    }
    if (skjerm.vidare) { await page.click("#vidare"); await page.waitForTimeout(150); continue; }
    throw new Error("Veit ikkje kva eg skal gjere: " + JSON.stringify(skjerm));
  }
  throw new Error("For mange steg");
}

(async () => {
  const browser = await chromium.launch();
  const resultat = [];
  const personar = [
    { init: "OLNOR", leiar: true, vel: 0, svar: { F5: "nei", F12: "usikker", F8: "ja", F14: "nei" } },
    { init: "kanor", leiar: false, vel: 1, svar: { F12: "nei", F9: "nei" } },
    { init: "peha", leiar: false, vel: 0, svar: {} },
    { init: "LIAND", leiar: false, vel: 2, svar: { F12: "usikker", F14: "usikker", F17: "ja" } }
  ];
  for (const p of personar) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
    const page = await ctx.newPage();
    const feil = [];
    page.on("pageerror", (e) => feil.push(String(e)));
    await page.goto(`${BASE}/?s=tryggleik&k=${K}&t=${T}`);
    await page.waitForSelector("#vidare");
    // intro: fakta-tekst om initialar
    const intro = await page.evaluate(() => document.querySelector(".fakta").textContent);
    await page.click("#vidare");
    await page.waitForSelector("h2.sp");
    // F1 krev minst 2 teikn: knappen skal vere sperra før ein skriv
    const sperra = await page.evaluate(() => document.getElementById("vidare").disabled && document.getElementById("hopp").hidden);
    const sett = await svarAlle(page, p);
    await page.waitForSelector(".slutt", { timeout: 5000 });
    const slutt = await page.evaluate(() => ({ tekst: document.querySelector(".slutt").textContent, raad: !!document.querySelector(".tips"), h2: Array.from(document.querySelectorAll(".slutt h2")).map((h) => h.textContent) }));
    resultat.push({ init: p.init, sperra, intro: intro.slice(0, 90), sett: Object.keys(sett).length, raad: slutt.raad, h2: slutt.h2, feil });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(resultat, null, 1));
})().catch((e) => { console.error("FEIL", e); process.exit(1); });
