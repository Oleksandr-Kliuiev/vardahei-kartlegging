# Кампания «Haust 2026»: черновики опросников

Статус 06.11.2026: план для `nokkelpersonar-intervju` изменён решением Oleksandr — это не анкета по ссылке, а интервью, которое Vardahei ведёт и заполняет у клиента в новом разделе «Samtalar» (`docs/BESLUTNINGER.md` 06.11, `docs/varde/STAGES.md` 2d). Шаг 3 загрузки ниже (`POST /api/admin/surveys` с `audience: "client_survey"`) не выполнять и раунд для него не создавать: вопросы N2–N28 станут guide'ом типа `interview` в задаче 2.20. `tryggleik` и `it-kartlegging` это не меняет.

Статус: 04.11.2026 — планы поменялись, блок R1–R23 (вопросы для руководителя, перенесённые из интервью «Kartlegging nøkkelpersoner») убран из `tryggleik-haust-2026.json`: блок руководителя снова ровно как в seed (B1–B19, без изменений). Вместо него — отдельный шаблон `nokkelpersonar-intervju.json`: те же 27 вопросов интервью, но как свободный текст (без вариантов ответа), для одного ключевого человека (owner/leiar) в своих словах. Текущее состояние пересобрано и провалидировано; закоммичено 09.11, в Varde пока не загружено.

Исходный статус 02.11.2026: загружено в Varde как черновики (tryggleik v3 «Haust 2026», it-kartlegging v1), не опубликовано. Кампания для клиентов IT Vardahei и участников BIO «IT-beredskap og robuste bedrifter» (решение Oleksandr 02.11). После правки 04.11 загрузку tryggleik в Varde нужно повторить, и добавить новую загрузку для nokkelpersonar-intervju (шаги ниже). Ревью и открытые решения: https://claude.ai/artifact/DvLKtdMW9zAfNB9QvWznBd (приватная страница; список клиентов — только там и в `~/vardahei-prosjekt/kampanje-haust-2026/`, не в этом публичном репо).

## Файлы

- `tryggleik-haust-2026.json` — content новой версии шаблона `tryggleik` («Haust 2026»). Сотрудники: F1–F22 дословно (у F1 только новая подсказка, публиковать как «Rettskriving»), новые T1–T5. Блок руководителя (`leader_roles` прежние: leiar, it) — ровно seed'овские B1–B19, без изменений (04.11: блок R1–R23 убран).
- `it-kartlegging.json` — content нового шаблона `it-kartlegging` («Teknisk kartlegging»), 49 вопросов, без паролей, ключей и IP.
- `nokkelpersonar-intervju.json` — content нового шаблона `nokkelpersonar-intervju` («Samtale med nøkkelpersonar»), 28 вопросов: N1 — стандартный вопрос про роль (единственный с вариантами ответа; обязателен для любого опроса Varde, decision 5 17.10), N2–N28 — все 27 вопросов интервью «Kartlegging nøkkelpersoner» (16.02.2025) как `type: "text"`, без вариантов. Одна анкета на компанию (`identification: "none"`), адресат — ключевой человек (dagleg leiar/eigar), отвечает своими словами.
- `review-meta.json` — куда ушли 27 вопросов интервью «Kartlegging nøkkelpersoner» (на N2–N28 в `nokkelpersonar-intervju`).
- `kampanje.mjs` — генератор всех трёх файлов из seed; `validate.mjs`, `paths.mjs` — проверки кодом Varde.

## Пересобрать и проверить (из корня репо, Node 22+)

```bash
node docs/varde/kampanjar/haust-2026/kampanje.mjs varde/config/seed/templates/tryggleik.2026-10-13.json docs/varde/kampanjar/haust-2026
node docs/varde/kampanjar/haust-2026/validate.mjs varde docs/varde/kampanjar/haust-2026
node docs/varde/kampanjar/haust-2026/paths.mjs varde docs/varde/kampanjar/haust-2026
```

`validate.mjs` и `paths.mjs` берут собранные `dist` пакетов `@varde/schema`, `@varde/rules` и `apps/api`.

Результат 04.11: все три шаблона на уровне публикации (nn и en полные), стоп-лист букмола без находок во всех трёх, пути респондентов верные. С возвратом блока руководителя к seed держатся все 41/41 определения метрик и 25/25 правил Funn (были 21/25 с блоком R1–R23, см. git-историю этого файла). У `nokkelpersonar-intervju` своих зон и Funn нет.

## Загрузка в Varde (шаги для (пере)загрузки после правки 04.11)

С 09.11 содержимое версии заливается из UI, curl для этого больше не нужен: в верстаке
**«Om skjemaet» → «Teknisk: heile skjemaet som JSON» → «Hent innhald frå fil …»**. Varde сам скажет,
сколько в файле вопросов, что он меняет в открытом черновике и что в нём не так; черновик меняется
только по кнопке «Bruk innhaldet frå fila», и ⌘Z возвращает всё назад. Ключ (`key`) и målgruppe
(`audience`) в файле должны совпадать с теми, что у скьемы, иначе файл не примут. Там же
«Lagre innhaldet til fil» — выгрузить то, что сейчас в Varde, чтобы сравнить с файлом в репо.

1. `tryggleik`: сверить F1–F22 опубликованной версии в проде с seed; в библиотеке открыть скьему,
   в панели «Versjonar» нажать «Byggj utkast på v<N>» на нужной опубликованной версии, затем
   загрузить `tryggleik-haust-2026.json` через «Hent innhald frå fil …». Если черновик с блоком
   R1–R23 уже был загружен 02.11 — он перезапишется этим файлом (блок руководителя теперь = seed).
2. `it-kartlegging`: «Nytt skjema» → «Undersøking hos kundar», с инициалами, nn + en; затем загрузить
   `it-kartlegging.json`. (Содержимое без изменений с 02.11.)
3. `nokkelpersonar-intervju`: «Nytt skjema» → «Undersøking hos kundar», без имени (`identification:
   none`), nn + en; затем загрузить `nokkelpersonar-intervju.json`. (См. статус 06.11 выше: этот шаг
   сейчас не выполнять.)
4. Принять en, опубликовать; для `tryggleik` — `frozen_changes: { "F1": "orthographic" }`.
5. Клиенты: `POST /api/admin/clients` с `{ "name", "employee_count": null }` по списку из `~/vardahei-prosjekt/kampanje-haust-2026/kundar-til-varde.mjs`.
6. Раунды: предложение — отдельно для клиентов IT и для BIO (одни и те же версии шаблонов), чтобы «alle» в отчёте был своей когортой; `nokkelpersonar-intervju` — отдельный раунд, адресованный конкретному ключевому человеку, а не всем сотрудникам.

## Известные ограничения

- У `nokkelpersonar-intervju` нет зон и Funn: ответы смотреть экспортом «Svar» (`rows.csv`).
- N1 (роль) — технически обязательный вопрос платформы Varde (ровно один вопрос с `role: true` на любой опрос); содержательно в этом опроснике не используется (`leader_roles: []`), но остаётся единственным вопросом с вариантами ответа.
