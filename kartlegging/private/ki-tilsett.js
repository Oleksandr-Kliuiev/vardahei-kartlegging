/* «Svar per tilsett» for KI-skjemaet. Berre bak innlogginga (dashbordet).
   Dashbordet kallar KiTilsett.seksjon(rader, { el, kundeNamn, visKunde, forrige }).
   forrige: svar frå ein tidlegare KI-runde ({ k, svar }) med same initialspørsmål. Finst det ingen, blir kolonna ikkje vist. */
(function () {
  "use strict";
  var K = window.KARTLEGGING;
  var F = K.skjema.ki;
  var INIT = F.initialar;

  // Nøkkelspørsmåla i tabellen. kort: korte svartekstar. merk: svar som er verdt å ta opp (vist i raudt).
  var KOL = [
    { id: "K7", namn: "KI i jobben", kort: { aldri: "Aldri", provd: "Prøvd", avogtil: "Av og til", veke: "Kvar veke", dag: "Kvar dag" } },
    { id: "K8", namn: "KI privat", kort: { aldri: "Aldri", provd: "Prøvd", avogtil: "Av og til", veke: "Kvar veke", dag: "Kvar dag" } },
    { id: "K9", namn: "Nivå", kort: { n0: "Ikkje brukt", n1: "Prøvd, usikker", n2: "Enkle ting", n3: "Fast bruk", n4: "Eigne oppsett" } },
    { id: "K4", namn: "Rutinetid i veka", kort: { u1: "Under 1 t", "1-3": "1–3 t", "3-5": "3–5 t", "5-10": "5–10 t", o10: "Over 10 t", vk: "Veit ikkje" } },
    { id: "K19", namn: "Jobbdata i KI", kort: { jobb: "Jobbkonto", privat: "Privat konto", begge: "Begge", nei: "Nei", vk: "Hugsar ikkje" }, merk: ["privat", "begge"] },
    { id: "K21", namn: "Kontrakten", kort: { lim: "Limer inn", fjern: "Fjernar namn", jobb: "Godkjent verktøy", utan: "Utan KI", vk: "Veit ikkje" }, merk: ["lim", "vk"] },
    { id: "K14", namn: "Kjensle", kort: { gler: "Gler seg", nysgjerrig: "Nysgjerrig", noytral: "Nøytral", skeptisk: "Skeptisk", uroa: "Uroa" } }
  ];
  // Samanlikning med førre runde: KI-nivået (K9) som rekkjefølgje n0 < n1 < … < n4
  var NIVA = ["n0", "n1", "n2", "n3", "n4"];

  function sp(id) { return F.sporsmal.filter(function (s) { return s.id === id; })[0]; }
  function valNamn(s, id) { var v = (s && s.val || []).filter(function (x) { return x.id === id; })[0]; return v ? v.nn : id; }
  function init(r) { return r.svar && r.svar[INIT] ? String(r.svar[INIT]).toUpperCase() : ""; }
  function rolle(r) {
    var rs = F.sporsmal.filter(function (s) { return s.rolle; })[0];
    var v = rs && r.svar[rs.id];
    return v ? valNamn(rs, v).split("/")[0].trim() : "–";
  }

  var stilLagt = false;
  function stil() {
    if (stilLagt) return; stilLagt = true;
    var s = document.createElement("style");
    s.textContent = "table.ki-tilsette td.merk { color: var(--kritisk); font-weight: 700; } table.ki-tilsette td.tom { color: var(--faint); } table.ki-tilsette td { white-space: nowrap; }";
    document.head.appendChild(s);
  }

  function seksjon(rr, o) {
    stil();
    var el = o.el;
    var sek = el("section", { class: "del", id: "ki-tilsette" });
    sek.appendChild(el("h2", { text: "Svar per tilsett" }));
    var forrige = {};
    (o.forrige || []).forEach(function (r) { var i = init(r); if (i) forrige[r.k + "|" + i] = r; });
    var harForrige = Object.keys(forrige).length > 0;
    sek.appendChild(el("p", { class: "under", text: "Éi rad per person, med initialane frå skjemaet. Denne tabellen er berre for Vardahei IT; bedrifta får eit samla bilete utan initialar. Raudt: svar som er verdt å ta opp." +
      (harForrige ? " «Førre runde» er KI-nivået med same initialar i same bedrift." : " Samanlikning med førre runde kjem når det finst ein tidlegare KI-runde.") }));
    if (!rr.length) { sek.appendChild(el("p", { class: "tomt", text: "Ingen svar i dette utvalet enno." })); return sek; }

    var liste = rr.slice().sort(function (a, b) {
      return o.kundeNamn(a.k).localeCompare(o.kundeNamn(b.k)) || init(a).localeCompare(init(b));
    });
    var t = el("table", { class: "tilsette ki-tilsette" });
    var hr = el("tr", null, [el("th", { text: "Initialar" }), el("th", { text: "Rolle" })]);
    if (o.visKunde) hr.appendChild(el("th", { text: "Kunde" }));
    KOL.forEach(function (c) { var s = sp(c.id); hr.appendChild(el("th", { text: c.namn, title: s ? s.tekst.nn : c.id })); });
    if (harForrige) hr.appendChild(el("th", { text: "Førre runde" }));
    t.appendChild(el("thead", null, [hr]));
    var tb = el("tbody");
    liste.forEach(function (r) {
      var tr = el("tr", null, [el("td", { class: "init", text: init(r) || "–" }), el("td", { text: rolle(r) })]);
      if (o.visKunde) tr.appendChild(el("td", { text: o.kundeNamn(r.k) }));
      KOL.forEach(function (c) {
        var v = r.svar[c.id];
        if (v == null) { tr.appendChild(el("td", { class: "tom", text: "–" })); return; }
        tr.appendChild(el("td", { class: c.merk && c.merk.indexOf(v) > -1 ? "merk" : null, text: c.kort[v] || valNamn(sp(c.id), v), title: valNamn(sp(c.id), v) }));
      });
      if (harForrige) {
        var f = init(r) ? forrige[r.k + "|" + init(r)] : null;
        var a = f ? NIVA.indexOf(f.svar.K9) : -1, b = NIVA.indexOf(r.svar.K9);
        if (a < 0) tr.appendChild(el("td", { class: "tom", text: "–" }));
        else tr.appendChild(el("td", { text: KOL[2].kort[f.svar.K9] + (b < 0 ? "" : b > a ? " → opp" : b < a ? " → ned" : " → likt") }));
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    sek.appendChild(el("div", { class: "tabell-wrap" }, [t]));
    return sek;
  }

  window.KiTilsett = { seksjon: seksjon, kolonner: KOL };
})();
