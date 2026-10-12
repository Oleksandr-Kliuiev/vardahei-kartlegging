// Køyr: PW1=<passord> PW2=<nytt passord ved første innlogging> node tools/test/dashboard.test.js
// Loggar inn, byter passord, opnar dashbordet med ekte testsvar, så i demomodus. Tek skjermbilete.
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const SC = process.env.UT || __dirname; // mappe for skjermbilete

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const feil = [];
  page.on("pageerror", (e) => feil.push("pageerror: " + e));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|net::ERR/.test(m.text())) feil.push("console: " + m.text()); });

  await page.goto(BASE + "/logg-inn");
  await page.fill("#epost", "oleksandr@vardahei.no");
  await page.fill("#passord", process.env.PW1);
  await page.click("button[type=submit]");
  await page.waitForLoadState("load"); await page.waitForTimeout(400);
  if (page.url().includes("byt-passord")) {
    await page.fill("#no", process.env.PW1);
    await page.fill("#ny", process.env.PW2);
    await page.fill("#ny2", process.env.PW2);
    await page.click("button[type=submit]");
    await page.waitForLoadState("load"); await page.waitForTimeout(400);
  }
  await page.goto(BASE + "/dashboard");
  await page.waitForSelector("section.del");
  await page.waitForTimeout(500);
  const sjekk = async (namn) => {
    const r = await page.evaluate(() => ({
      h2: Array.from(document.querySelectorAll("section.del > h2")).map((h) => h.textContent),
      meta: document.getElementById("meta").textContent,
      demo: !document.getElementById("demo").hidden,
      hero: Array.from(document.querySelectorAll(".hero .stor")).map((x) => x.textContent),
      soner: Array.from(document.querySelectorAll(".hero .sone")).map((x) => x.textContent.trim()),
      ruter: document.querySelectorAll("table.rute td .c").length,
      kaker: document.querySelectorAll(".kake svg").length,
      kakeMidt: Array.from(document.querySelectorAll(".kake .midt")).map((x) => x.textContent),
      tilsette: document.querySelectorAll("table.tilsette tbody tr").length,
      forsteTilsett: (document.querySelector("table.tilsette tbody tr") || {}).textContent,
      funn: Array.from(document.querySelectorAll(".funn li")).map((l) => l.textContent.replace(/\s+/g, " ").slice(0, 110)),
      saman: Array.from(document.querySelectorAll("section.del table:not(.rute):not(.tilsette) tbody tr")).slice(0, 8).map((t) => t.textContent.replace(/\s+/g, " ")),
      chips: Array.from(document.querySelectorAll(".chip")).map((c) => c.textContent)
    }));
    console.log("=== " + namn); console.log(JSON.stringify(r, null, 1));
    await page.screenshot({ path: SC + "/dash-" + namn + ".png", fullPage: true });
  };
  await sjekk("ekte");
  // vel Daco
  await page.click('.chip:has-text("Daco")');
  await page.waitForTimeout(300);
  await sjekk("daco");
  // KI-fana
  await page.click('.fanar button:has-text("KI")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SC + "/dash-ki.png", fullPage: true });
  console.log("KI h2:", await page.evaluate(() => Array.from(document.querySelectorAll("section.del > h2")).map((h) => h.textContent)));

  // Demomodus: api/svar feilar
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => feil.push("demo pageerror: " + e));
  await p2.route("**/api/svar", (route) => route.fulfill({ status: 500, body: "nei" }));
  await p2.route("**/api/meg", (route) => route.fulfill({ status: 500, body: "nei" }));
  // dashboard krev innlogging: bruk same cookie
  const cookies = await ctx.cookies();
  await ctx2.addCookies(cookies);
  await p2.goto(BASE + "/dashboard");
  await p2.waitForSelector("section.del");
  await p2.waitForTimeout(600);
  const d = await p2.evaluate(() => ({
    demo: !document.getElementById("demo").hidden, meta: document.getElementById("meta").textContent,
    hero: Array.from(document.querySelectorAll(".hero .stor")).map((x) => x.textContent),
    ruteRader: document.querySelectorAll("table.rute tbody tr").length, kaker: document.querySelectorAll(".kake svg").length,
    tilsette: document.querySelectorAll("table.tilsette tbody tr").length, funn: document.querySelectorAll(".funn li").length,
    saman: Array.from(document.querySelectorAll("section.del table:not(.rute):not(.tilsette) tbody tr")).slice(0, 3).map((t) => t.textContent.replace(/\s+/g, " "))
  }));
  console.log("=== demo"); console.log(JSON.stringify(d, null, 1));
  await p2.screenshot({ path: SC + "/dash-demo.png", fullPage: true });
  await p2.click('.chip:has-text("Kviknes")');
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: SC + "/dash-demo-kviknes.png", fullPage: true });
  console.log("demo kviknes rows:", await p2.evaluate(() => Array.from(document.querySelectorAll("table.rute tbody tr th")).map((t) => t.textContent)));
  console.log("FEIL:", feil);
  await browser.close();
})().catch((e) => { console.error("FEIL", e); process.exit(1); });
