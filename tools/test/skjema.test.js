// Køyr: T=<kode frå node server.js --lenkjer> K=daco node tools/test/skjema.test.js  (krev playwright og ein server på BASE)
// Går gjennom tryggleiksskjemaet som ein tilsett og som ein leiar, og sjekkar at svara kjem fram.
const { chromium } = require("playwright");
const { svarAlle } = require("./stotte.js");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const T = process.env.T;
const K = process.env.K || "daco";

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
