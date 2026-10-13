// Eksport til Master_Analyse.xlsx (Power Query). Éi rad per person og spørsmål, som arket PQ_Detalj_Risiko:
//   Initialar;Kunde;Spørsmål;Svar;Risiko;Rang   (dei seks første kolonnene i same rekkjefølgje som arket)
//   Rolle;Skjema;Del;Spørsmål-ID;Svar-ID;Dato;Svar-nr   (ekstra, til filtrering og for å skilje folk utan initialar)
// Risiko og Rang kjem frå farge i sporsmal.js (Grøn 1, Gul 2, Oransje 3, Raud 4), berre der spørsmålet har farge.
// Fleirval gir éi rad per val (som F15 i arket), skala éi rad per påstand, fritekst ei eiga rad med «(fritekst)».
// Fila er UTF-8 med BOM, semikolon og CRLF, så Excel med norsk oppsett opnar ho rett.
"use strict";

const KOLONNER = ["Initialar", "Kunde", "Spørsmål", "Svar", "Risiko", "Rang", "Rolle", "Skjema", "Del", "Spørsmål-ID", "Svar-ID", "Dato", "Svar-nr"];

// Celler som startar med = + - @ kan Excel lese som formel. Fritekst kjem frå respondentane, så vi nøytraliserer dei.
function celle(v) {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function analyseRader(svar, K, skjemaIds) {
  const nivaa = K.soner.nivaa;
  const ut = [];
  const valgt = svar.filter((r) => skjemaIds.includes(r.skjema) && K.skjema[r.skjema])
    .sort((a, b) => skjemaIds.indexOf(a.skjema) - skjemaIds.indexOf(b.skjema) || String(K.kundar[a.k] || a.k).localeCompare(String(K.kundar[b.k] || b.k)) || String(a.tid).localeCompare(String(b.tid)));
  for (const r of valgt) {
    const F = K.skjema[r.skjema];
    const initId = F.initialar;
    const rs = F.sporsmal.find((s) => s.rolle);
    const valNamn = (s, id) => { const v = (s.val || []).find((x) => x.id === id); return v ? v.nn : id; };
    const felles = {
      init: r.svar[initId] ? String(r.svar[initId]).toUpperCase() : "",
      kunde: K.kundar[r.k] || r.k,
      rolle: rs && r.svar[rs.id] ? valNamn(rs, r.svar[rs.id]) : "",
      skjema: F.namn.nn, dato: String(r.tid || "").slice(0, 10), nr: r.id
    };
    const rad = (s, sporsmal, svarTekst, svarId, farge, spId) => {
      const p = farge != null && nivaa[farge] ? farge : null;
      ut.push([felles.init, felles.kunde, sporsmal, svarTekst, p == null ? "" : nivaa[p].namn, p == null ? "" : p + 1,
        felles.rolle, felles.skjema, s.del, spId || s.id, svarId, felles.dato, felles.nr]);
    };
    for (const s of F.sporsmal) {
      if (s.id === initId) continue;
      const v = r.svar[s.id];
      const farge = (id) => (s.farge && s.farge[id] != null ? s.farge[id] : null);
      if (v != null) {
        if (s.type === "single") rad(s, s.tekst.nn, valNamn(s, v), v, farge(v));
        else if (s.type === "multi" && Array.isArray(v)) v.forEach((x) => rad(s, s.tekst.nn, valNamn(s, x), x, farge(x)));
        else if (s.type === "scale" && typeof v === "object") (s.rader || []).forEach((rd) => { if (v[rd.id] != null) rad(s, s.tekst.nn + " – " + rd.nn, v[rd.id], rd.id, null, s.id + "." + rd.id); });
        else rad(s, s.tekst.nn, v, "", null);
      }
      if (r.fri && r.fri[s.id]) rad(s, s.tekst.nn + " (fritekst)", r.fri[s.id], "", null, s.id + ".fri");
    }
  }
  return ut;
}

function analyseCsv(svar, K, skjemaIds) {
  const rader = analyseRader(svar, K, skjemaIds);
  const linjer = [KOLONNER.join(";")].concat(rader.map((r) => r.map(celle).join(";")));
  return { tekst: "﻿" + linjer.join("\r\n") + "\r\n", rader: rader.length };
}

module.exports = { analyseCsv, analyseRader, KOLONNER };
