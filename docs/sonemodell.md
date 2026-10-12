# Модель зон

Источник — **Master_Analyse.xlsx** шефа (раунд 1, Forms, январь 2026). Реализация — `farge` у вопросов и `SONER` в `kartlegging/public/sporsmal.js`, расчёт — `private/dashboard.html`, блок «Soner».

## Как считает таблица шефа

- В листах `Regler` / `PQ_Detalj_Risiko` каждому ответу присвоен цвет и ранг: Grøn 1, Gul 2, Oransje 3, Raud 4.
- Power Query (`Spørring2`): `Total_Score` = сумма (ранг − 1) по ответам человека, `Snitt_Score` = Total_Score / число оценённых ответов (шкала 0–3). Проверено: так получаются Snitt_Score всех 57 человек.
- Цвет ответа задают две таблицы в листе `Mapping`: `T_SpmType` (вопрос «God» — хорошо ответить «Ja», или «Daarleg» — «Ja» плохо) и `T_SvarMap` (ранг ответа для каждого типа: Ja 1/4, Delvis 2/3, Usikker 2/2, Nei 3/1, Oftast и Av og til 2/3, Sjeldan и Sjelden 3/2). Отдельные правила из `Regler` идут поверх. Тип «Daarleg» у F4, F8, F13, F17.
- `Risikonivå` человека (M-код запроса `Spørring2_v2`): Snitt < 1 → Grøn, ≥ 1 → Gul, ≥ 2 → Oransje, ≥ 3 → Raud. В раунде 1 выше 1,63 никого нет.
- Уровень фирмы и выборки (формула в листе `Tilsett_visning`): средний ранг ≤ 1,5 Grøn, ≤ 2,5 Gul, ≤ 3,5 Oransje, иначе Raud. В баллах 0–3: ≤ 0,5 / ≤ 1,5 / ≤ 2,5.
- «Kritisk andel» = доля ответов Oransje + Raud.
- Взвешенная формула в листе `PowerQuery_M` (веса MFA 20, пароли 10 …) и пороги 80/65/50 в `_Parametre` — шаблон; на результаты в `Spørring2` они не влияют.

## Цвета ответов (0 Grøn, 1 Gul, 2 Oransje, 3 Raud)

| Вопрос | Ja | Delvis | Nei | Usikker | Другое |
| --- | --- | --- | --- | --- | --- |
| F3 Fokus på sikkerheit | 0 | 1 | 2 | 1 | |
| F4 Opplevd svindelforsøk | 3 | | 0 | 1 | |
| F5 Rutine: stoppe hending | 0 | 1 | 2 | 1 | |
| F6 Rutine: starte opp att | 0 | 1 | 2 | 1 | |
| F7 Passordvanar | 0 | 1 | 2 | 1 | |
| F8 Same passord | 3 | 2 | 0 | 1 | |
| F9 Passordhandterar | 0 | | 2 | 1 | |
| F10 Låser PC-en | 0 | | 2 | | Oftast 1, Sjeldan 2 |
| F11 Phishing-opplæring | 0 | | 2 | 1 | |
| F12 Veit kor dei skal melde frå | 0 | 1 | 2 | 1 | |
| F13 Mistenkt klikk | 3 | | 0 | 1 | |
| F14 Brukar MFA | 0 | | 2 | 1 | |
| F16 Veit kvar filer skal lagrast | 0 | 1 | 2 | 1 | |
| F17 Lagrar lokalt | 3 | | 0 | 1 | Av og til 2, Sjeldan 1 |
| F18 PC oppdatert | 0 | 1 | 2 | 1 | |
| F19 Antivirus/EDR aktiv | 0 | 1 | 2 | 1 | |

F1, F2, F15, F20–F22 в баллах не участвуют.

## Пороги (`SONER` в sporsmal.js)

```js
person: [1, 2, 3]       // сотрудник: Grøn < 1 ≤ Gul < 2 ≤ Oransje < 3 ≤ Raud
samla:  [0.5, 1.5, 2.5] // вопрос, роль, фирма: Grøn ≤ 0,5 < Gul ≤ 1,5 < Oransje ≤ 2,5 < Raud
```

Пороги для сотрудника взяты из M-кода `Spørring2_v2` (12.10.2026). У вопросов типа «God» худший ответ («Nei») — Oransje, Raud бывает только у четырёх вопросов «Daarleg». Поэтому максимум snittscore — 2,25 (12 × 2 + 4 × 3) / 16, и **сотрудник в Raud попасть не может**. Так и в таблице шефа. Raud остаётся у отдельных ответов, вопросов и фирм (по `samla`).

## Отличия от таблицы (сознательные)

1. «Skjelden» на F10 в таблице не оценивался (правило было записано как «Sjeldan») — у нас Oransje.
2. Свободные ответы «nei»/«usikker» в F20–F22 и «Usikker» в F15 таблица засчитывала (Oransje/Gul) — у нас не считаются.
3. Из-за этого в раунде 1 сдвигаются три человека: SIKVI и THADO из Grøn в Gul, SB из Gul в Grøn. Средние по фирмам отличаются от таблицы не больше чем на 0,03; все шесть фирм Gul, как в таблице.

## Что показывает дашборд

- **Soner:** snittscore выборки, зона, kritisk andel, сколько сотрудников в каждой зоне, цифры раунда 1. Сетка клиенты (или роли) × вопросы с snittscore и цветом.
- **Nøkkelspørsmåla:** круговые по F12, F5, F14, F9, F8, F11, F16, F19, цвета секторов — цвета ответов, в центре kritisk andel.
- **Samanlikning med runde 1:** по фирмам и по вопросам: snittscore, зона, kritisk andel, изменение. Раунд 1 берётся только по фирмам, которые уже ответили в раунде 2.
- **Svar per tilsett:** инициалы, роль, snittscore, зона, зона в раунде 1 (по инициалам в той же фирме), вопросы в оранжевом и красном.

## Решено по таблице (12.10.2026)

- Пороги для сотрудника: 1 / 2 / 3, как в `Spørring2_v2`.
- F4 остаётся в баллах: в `T_SpmType` шеф сам отнёс его к «Daarleg», то есть «Ja» = Raud.

Открытым осталось одно: сказать шефу, что Raud у сотрудника недостижим, — вдруг он ожидает другого.
