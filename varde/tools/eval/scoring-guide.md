# Rettleiing for vurdering av utkast (eval 0.14)

Du vurderer kvart utkast opp mot briefen det er laga frå. Forenkla versjon (avgjerd 13.10): fem briefar, éin modell, eitt utkast per brief, og Oleksandr vurderer åleine.

1. Opne lesepakka `varde/tools/eval/runs/<briefar>/<prompt>/lesepakke.md`. Der står briefen, utkastet og funna frå dei automatiske kontrollane.
2. Opne `varde/tools/eval/scores/oleksandr.csv`. Fila har éi rad per utkast; `brief`, `variant` og `output_sha` er fylte ut på førehand.
3. Fyll ut dei fire tomme kolonnane for kvar rad, lagre som CSV og køyr `pnpm --filter @varde/tools-eval eval:score` i mappa `varde/`.

## Kolonnane

| Kolonne                          | Kva du skriv                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `brief`, `variant`, `output_sha` | Fylt ut på førehand. Endre dei ikkje: `output_sha` knyter vurderinga til akkurat dette utkastet.                                                                               |
| `meaning_1_5`                    | Kor godt utkastet treffer målet i briefen, 1–5 (skala under).                                                                                                                  |
| `naturalness_1_5`                | Kor naturleg nynorsken er, 1–5 (skala under).                                                                                                                                  |
| `edit_minutes`                   | Kor mange minutt du ville brukt på å gjere utkastet klart til publisering: rette språket, skrive om, leggje til eller ta bort spørsmål. Skriv 0 om det kan brukast som det er. |
| `critical_errors`                | Kodane for kritiske feil, skilde med mellomrom. Tomt når det ikkje er nokon.                                                                                                   |

## Meining (`meaning_1_5`)

- **5** — Treffer målet og held alle avgrensingane; svara vil gje Vardahei det briefen spør etter.
- **4** — Treffer målet; små manglar, eller eitt spørsmål bør skrivast om.
- **3** — Delvis: ein viktig del av målet manglar, eller fleire spørsmål bommar.
- **2** — For det meste ved sida av målet.
- **1** — Bommar heilt, eller det finst ikkje noko utkast.

## Naturleg nynorsk (`naturalness_1_5`)

- **5** — Naturleg og korrekt nynorsk, som om ein dyktig nynorskbrukar skreiv det.
- **4** — Naturleg, men med nokre små feil eller stive formuleringar.
- **3** — Forståeleg, men tydeleg omsett eller stivt; fleire feil.
- **2** — Mange feil eller unaturlege formuleringar.
- **1** — Ikkje brukande nynorsk, eller det finst ikkje noko utkast.

## Kritiske feil (`critical_errors`)

| Kode               | Når                                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| `wrong_language`   | Teksten er ikkje på nynorsk, til dømes på bokmål eller engelsk.                |
| `mixed_nn_nb`      | Nynorsk og bokmål er blanda.                                                   |
| `invented_fact`    | Utkastet finn på eit faktum, eit tal eller ein regel som ikkje står i briefen. |
| `product_name`     | Utkastet nemner eit produkt, ei teneste eller ein leverandør ved namn.         |
| `schema_violation` | Utkastet manglar delar eller er øydelagt.                                      |
| `refusal`          | Modellen nekta å svare.                                                        |

Dei automatiske kontrollane fyller ut `refusal`, `schema_violation`, `mixed_nn_nb` og `product_name` på førehand når dei finn noko. Desse kodane tel same kva som står i arket. Legg til dei du finn sjølv; ein feil som berre du ser, tel like mykje.

Spørsmål over 25 ord og spørsmål utan «Veit ikkje» eller hopp er ikkje kritiske feil. Dei står i lesepakka for at du skal ta dei med i meining og minutt.

## Når det ikkje finst noko utkast

Ved `refusal`, eller når utkastet er så øydelagt at det ikkje kan lesast: set 1 og 1, og skriv kor mange minutt det ville teke å lage undersøkinga sjølv.

## Kva som blir rekna ut

- Median for meining og median for naturleg nynorsk over alle utkasta: begge må vere minst 4.
- Minst 4 av 5 briefar utan nokon kritisk feil.
- Minutt til retting står i rapporten, men er ikkje eit krav i den forenkla versjonen.

Resultatet kjem i `docs/varde/evidence/stage-0/0.14-report.md`.
