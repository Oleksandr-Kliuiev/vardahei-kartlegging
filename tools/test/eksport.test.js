// Køyr: PW1=<passord> [PW2=<nytt>] node tools/test/eksport.test.js  (krev playwright og ein lokal testserver på BASE med testsvar,
// til dømes etter skjema.test.js og ki.test.js). Sjekkar eksporten til Master_Analyse: krev innlogging, BOM og semikolon,
// same seks første kolonner som PQ_Detalj_Risiko, farge og rang for tryggleik, KI med initialar, vern mot formlar, og at
// nedlastinga blir loggført med e-post.
const { chromium } = require("playwright");
const { loggInn, lagSjekk, EPOST } = require("./stotte.js");
const BASE = process.env.BASE || "http://127.0.0.1:3099";
const SC = process.env.UT || __dirname;

if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(BASE).hostname)) { console.error("Berre mot ein lokal testserver."); process.exit(1); }
const sjekk = lagSjekk();

// Enkel CSV-lesar for semikolon og hermeteikn
function les(tekst) {
  const rader = []; let rad = [], celle = "", i = 0, q = false;
  for (; i < tekst.length; i++) {
    const c = tekst[i];
    if (q) { if (c === '"' && tekst[i + 1] === '"') { celle += '"'; i++; } else if (c === '"') q = false; else celle += c; continue; }
    if (c === '"') q = true; else if (c === ";") { rad.push(celle); celle = ""; }
    else if (c === "\r") continue; else if (c === "\n") { rad.push(celle); rader.push(rad); rad = []; celle = ""; } else celle += c;
  }
  if (celle || rad.length) { rad.push(celle); rader.push(rad); }
  return rader;
}

(async () => {
  const utan = await fetch(BASE + "/api/analyse.csv");
  sjekk("utan innlogging: 401", utan.status === 401, utan.status);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  sjekk("innlogging", await loggInn(page, BASE));
  await page.goto(BASE + "/dashboard");
  await page.waitForSelector("#analyse-eksport");
  const [last] = await Promise.all([page.waitForEvent("download"), page.click("#analyse-eksport")]);
  const fil = SC + "/" + last.suggestedFilename();
  await last.saveAs(fil);
  const buf = require("fs").readFileSync(fil);
  sjekk("knappen i dashbordet lastar ned " + last.suggestedFilename(), /^kartlegging-analyse-\d{4}-\d{2}-\d{2}\.csv$/.test(last.suggestedFilename()));
  sjekk("UTF-8 med BOM", buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
  const tekst = buf.toString("utf8").slice(1);
  sjekk("CRLF", tekst.includes("\r\n"));
  const rader = les(tekst);
  const hov = rader[0];
  sjekk("dei seks første kolonnene som PQ_Detalj_Risiko", hov.slice(0, 6).join("|") === "Initialar|Kunde|Spørsmål|Svar|Risiko|Rang", hov);
  sjekk("kolonnene rolle og skjema finst", hov.includes("Rolle") && hov.includes("Skjema") && hov.includes("Spørsmål-ID"), hov);
  const obj = rader.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(hov.map((h, i) => [h, r[i]])));
  sjekk("alle rader har like mange kolonner", rader.slice(1).filter((r) => r.length > 1).every((r) => r.length === hov.length));
  const trygg = obj.filter((r) => r["Skjema"] === "IT-sikkerheit i kvardagen"), ki = obj.filter((r) => r["Skjema"] === "Arbeidsdagen og KI");
  sjekk("begge skjema er med", trygg.length > 0 && ki.length > 0, { trygg: trygg.length, ki: ki.length });
  sjekk("F1 og K0 er ikkje eigne spørsmålsrader", !obj.some((r) => r["Spørsmål-ID"] === "F1" || r["Spørsmål-ID"] === "K0"));
  const olnorF5 = trygg.find((r) => r.Initialar === "OLNOR" && r["Spørsmål-ID"] === "F5");
  sjekk("OLNOR F5 «Nei» = Oransje, rang 3", olnorF5 && olnorF5.Svar === "Nei" && olnorF5.Risiko === "Oransje" && olnorF5.Rang === "3", olnorF5);
  const olnorF8 = trygg.find((r) => r.Initialar === "OLNOR" && r["Spørsmål-ID"] === "F8");
  sjekk("OLNOR F8 «Ja» = Raud, rang 4", olnorF8 && olnorF8.Risiko === "Raud" && olnorF8.Rang === "4", olnorF8);
  sjekk("rolle og kunde er med", olnorF5 && olnorF5.Rolle === "Leiar" && olnorF5.Kunde === "Daco", olnorF5);
  sjekk("spørsmål utan farge har tom risiko", trygg.filter((r) => r["Spørsmål-ID"] === "F2").every((r) => r.Risiko === "" && r.Rang === ""));
  sjekk("F2 (rolle) er òg ei rad, som i arket", trygg.some((r) => r["Spørsmål-ID"] === "F2" && r.Svar === "Leiar"));
  sjekk("KI-rader har initialar", ki.some((r) => r.Initialar === "KIAND") && ki.every((r) => r.Risiko === ""), ki.slice(0, 2));
  sjekk("fleirval gir éi rad per val", ki.filter((r) => r.Initialar === "KINOR" && r["Spørsmål-ID"] === "K2").length >= 1);
  const formel = ki.find((r) => r["Spørsmål-ID"] === "K15" && /1\+1/.test(r.Svar));
  sjekk("fritekst som startar med = blir ikkje formel", formel && formel.Svar.startsWith("'="), formel && formel.Svar);
  const enKI = await page.evaluate(() => fetch("api/analyse.csv?s=ki").then((r) => r.text()));
  sjekk("s=ki gir berre KI", !/IT-sikkerheit i kvardagen/.test(enKI) && /Arbeidsdagen og KI/.test(enKI));

  const st = await page.evaluate(() => fetch("api/admin/status").then((r) => r.json()));
  const h = st.hendingar.filter((x) => x.type === "eksport_analyse");
  sjekk("nedlastinga er loggført med e-post", h.length >= 2 && h.every((x) => x.epost === EPOST) && h.some((x) => x.skjema === "ki") && h.some((x) => x.skjema === null), h);
  await page.goto(BASE + "/admin");
  await page.waitForTimeout(800);
  const logg = await page.evaluate(() => document.getElementById("logg").textContent);
  sjekk("adminpanelet viser nedlastinga i loggen", /lasta ned svar per person til Master_Analyse/.test(logg));
  await browser.close();
  console.log(`${sjekk.tal() - sjekk.feil()} av ${sjekk.tal()} ok`);
  process.exit(sjekk.feil() ? 1 : 0);
})().catch((e) => { console.error("FEIL", e); process.exit(1); });
