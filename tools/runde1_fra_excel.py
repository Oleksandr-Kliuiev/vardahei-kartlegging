#!/usr/bin/env python3
"""Lagar kartlegging/private/runde1.js frå Master_Analyse.xlsx (arket PQ_Detalj_Risiko).

Bruk:
  python3 tools/runde1_fra_excel.py kjelder/Master_Analyse.xlsx            # med initialar (til serveren)
  python3 tools/runde1_fra_excel.py kjelder/Master_Analyse.xlsx --utan-init > runde1_utan_init.js

Fritekstsvar (F20–F22) blir ikkje tekne med. Krev openpyxl (pip install openpyxl).
"""
import sys, json, collections, os
import openpyxl

SP = {  # starten på spørsmålsteksten i Forms -> id i sporsmal.js
    "Kva rolle": "F2", "Opplever du at verksemda": "F3", "Har du via e-post": "F4", "Finnst det etablerte": "F5",
    "Finnst det rutinar for korleis": "F6", "Opplever du at du har gode": "F7", "Bruker du same passord": "F8",
    "Bruker du ein passordhandterar": "F9", "Låser du PC-en": "F10", "Har du fått opplæring": "F11",
    "Veit du korleis og til kven": "F12", "Har du nokon gong": "F13", "Bruker du tofaktor": "F14",
    "Kvar av desse brukar du MFA": "F15", "Veit du kor arbeidsdata": "F16", "Lagrar du ofte": "F17",
    "Opplever du at PC-en": "F18", "Veit du om PC-en": "F19", "Ei verksemd med": "F20", "Kva meiner du": "F21",
    "Andre kommentarar": "F22"}
SVAR = {"Ja": "ja", "Nei": "nei", "Delvis": "delvis", "Usikker": "usikker", "Oftast": "oftast", "Skjelden": "sjeldan",
        "Sjeldan": "sjeldan", "Av og til": "avogtil", "Leiar": "leiar", "Administrasjon/kontor": "kontor",
        "Produksjon/drift": "prod", "Sal / Kundeservice": "sal", "IT / superbrukar": "it", "Anna": "anna",
        "Microsoft 365/e-post": "m365", "VPN": "vpn", "Økonomi/ERP": "erp", "CRM": "crm", "Andre system": "andre"}


def qid(t):
    for k, v in SP.items():
        if t.startswith(k):
            return v
    raise ValueError("Ukjent spørsmål: " + t)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    utan = "--utan-init" in sys.argv
    wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
    folk = collections.OrderedDict()
    for ini, kunde, q, sv, _r, _rank in list(wb["PQ_Detalj_Risiko"].iter_rows(values_only=True))[1:]:
        k = kunde.strip().lower(); i = qid(q)
        f = folk.setdefault((k, ini), {"k": k, "init": ini, "svar": {}})
        if i in ("F20", "F21", "F22"):
            continue
        v = SVAR[str(sv).strip()]
        if i == "F15":
            f["svar"].setdefault("F15", []).append(v)
        else:
            f["svar"][i] = v
    rader = []
    for f in folk.values():
        d = {"k": f["k"]}
        if not utan:
            d["init"] = f["init"]
        d["svar"] = f["svar"]
        rader.append("    " + json.dumps(d, ensure_ascii=False, separators=(", ", ": ")))
    ut = ("/* Runde 1: Microsoft Forms, januar 2026. Laga av tools/runde1_fra_excel.py frå Master_Analyse.xlsx, %d svar.\n"
          "   Spørsmåla er dei same som i runde 2, så dashbordet reknar soner for runde 1 med same modell (farge i sporsmal.js).\n"
          "   %s */\n" % (len(rader), "Initialane er tekne ut." if utan else "Med initialar: fila ligg bak innlogginga.")
          + 'window.RUNDE1 = {\n  namn: "Runde 1 (Forms)",\n  dato: "2026-01",\n  svar: [\n' + ",\n".join(rader) + "\n  ]\n};\n")
    if utan:
        sys.stdout.write(ut)
    else:
        mal = os.path.join(os.path.dirname(__file__), "..", "kartlegging", "private", "runde1.js")
        open(mal, "w").write(ut)
        print("Skreiv", os.path.normpath(mal), "med", len(rader), "svar")


main()
