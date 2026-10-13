// Felles hjelp for Playwright-testane: gå gjennom eit skjema og logge inn.
const EPOST = "oleksandr@vardahei.no";

// Svarar på alle steg i skjemaet. opts: { init, leiar, vel, svar: { id: svar-id } }. Returnerer svara som vart sette.
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
      const val = id === "F1" || id === "K0" ? (opts.init || "olnor") : "Testsvar " + id;
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
      if (sp === "F2" || sp === "K1") vel = opts.leiar ? "leiar" : "kontor";
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

// Loggar inn med PW1 eller PW2; byter til PW2 om serveren krev nytt passord.
async function loggInn(page, base) {
  for (const pw of [process.env.PW1, process.env.PW2].filter(Boolean)) {
    await page.goto(base + "/logg-inn");
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

function lagSjekk() {
  const liste = [];
  const sjekk = (namn, ok, detalj) => {
    liste.push(!!ok);
    console.log((ok ? "ok   " : "FEIL ") + namn + (ok || detalj === undefined ? "" : "  " + JSON.stringify(detalj)));
  };
  sjekk.feil = () => liste.filter((x) => !x).length;
  sjekk.tal = () => liste.length;
  return sjekk;
}

module.exports = { svarAlle, loggInn, lagSjekk, EPOST };
