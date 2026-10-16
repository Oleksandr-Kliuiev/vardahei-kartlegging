# Checkpoint 2a — задача 2.5: редактор FindingRule с предпросмотром и версиями (16.10.2026)

Ветка `varde/2a` от `main` a67d244. Критерий STAGES 2.5: «Правка создаёт новую версию; старые Finding не меняются». Задачи 2.1–2.4 закрыты в 1d. Кодер — Claude Opus 5.5.

## Коммиты

| Коммит | Что |
| --- | --- |
| `4ae7275` | API версий FindingRule и предпросмотра; закрытый раунд читает сохранённые Finding своего release; миграция `finding_rule_versions`; unit и integration |
| `1fd4100` | Страница «Funn» (группа «Innhald» после «Skjema»): список, редактор, живой предпросмотр, версии; подсказка в дашборде; unit и e2e |
| `6b09f5d` | `invariants:2a`, строки REVIEW-CHECKLIST и AI_CONTEXT_MAP, этот evidence |
| `705eafe` | «Funn» помнит раунд и клиента предпросмотра при переходе между правилами (по шаблону) |
| `bf38d89` | Правки после независимого ревью (ниже, п. 7–10) |
| `ef9c2cc` | Merge `main` (этап 5, 0d) |
| следующий за ним | Интеграция с этапом 5 (раздел ниже) |

## Что сделано

- API под админ-сессией (`/api/admin/finding-rules`): список по шаблону и каналу (последняя версия, число версий), история ключа, новая версия, предпросмотр.
- Новая версия: сервер ставит `max + 1` под `pg_advisory_xact_lock` по ключу, unique `(key, version)` — запасной барьер (P2002 → 409). AuditLog `findings.rule_version` (номер, из какой версии, имена изменённых полей) в той же транзакции. `base_version` от UI: если кто-то сохранил раньше — 409 с текстом. Без изменений — 400.
- Проверки: zod-схема с инвариантами (`0 ≤ medium ≤ high ≤ 1`, тексты nn/en не пустые, плейсхолдеры только `{n}`, `{task}`, `{persons}` там, где их подставляет `evaluate`, варианты без повторов) — для seed и для редактора одна. Не меняются `key`, `channel`, `metric_key`, `basis`, `computed`, `question`, `raw_options` (иначе 400). Варианты — только корзины метрики (или варианты B13 для F12×B13), хотя бы один.
- Предпросмотр: текущая версия и черновик на тех же ячейках, что видит дашборд. Aggregate — `PrivacyService.viewCells` (k = 3; подавленная ячейка — «Skjult», без чисел). Leader: по клиенту — `privacy.leaderAnswers` (AuditLog `leader.read`), «alle» — `leaders_all`, F12×B13 при «alle» — одно чтение leader на клиента, как в LeaderView. Логика leader-правил вынесена в `findings/leader-rules.ts` и общая у дашборда и предпросмотра. Предпросмотр ничего не пишет, кроме журнала чтений leader.
- Старые Finding (решение оркестратора 16.10, согласовано с 5.1): закрытый или архивный раунд показывает сохранённые строки Finding своего текущего release с их `rule_version`; по новой версии не пересчитывается и строк не дописывает. Новый release (повторный release, удаление данных) считается версиями на момент расчёта и сохраняется один раз: одна строка на `rule_key` в release и scope; при нескольких исторических строках читается наименьшая версия. Открытый раунд — живой расчёт по последней версии.
- Чтобы «сохранено один раз» работало и когда ни одно правило не сработало, рядом со строками пишется `finding_set (release_id, scope, rule_keys)`: набор версий, с которыми посчитан release. По нему же считаются вид по роли и leader-выводы закрытого раунда. Миграция заполняет его для текущих release уже закрытых раундов (версия из сохранённых строк, иначе 1).
- База: у `finding_rule` появился `created_at`; триггеры запрещают UPDATE/DELETE версий правил, UPDATE строк Finding и `finding_set`.
- `seed()` не изменился по смыслу: версии из файлов проверяются как раньше, более новые версии в базе не трогаются (тест).
- Админка «Funn»: Tryggleik/KI × Felles del/Leiar; у правила — текст, пороги, версия; ссылка `?rule=<key>` открывает правило. Редактор: «Funnet» и «Kva vi gjer» на nn и en, пороги в процентах и `min_count`, варианты чекбоксами с текстами из последней опубликованной версии шаблона (K7 × K8 — группами по K7), тип (risiko/moglegheit), история версий с «Hent inn i redigeringa». Предпросмотр с debounce 350 мс: раунд, клиент, «Versjon N: 4 av 12 (33 %), Høg» против «Med endringa: …», шкала порогов. Кнопка «Lagre som versjon N+1» с тостом. Стиль Vardestien (карточки, сегменты с бегунком, токены светлой и тёмной темы); 360 px без горизонтальной прокрутки; всё доступно с клавиатуры; движение через токены и `@varde/ui/motion`, при reduced motion — без анимации.
- Опционально по решению 16.10: в дашборде закрытого раунда под выводом — «Regelen har ein nyare versjon» со ссылкой в редактор (внутри SPA).

## Проверки (локально, из `varde/`)

- `pnpm check` — exit 0 (api 137, admin 20, runner 81, rules 81, eslint-rules 61, schema 50, ui 18, parity 17, invariants 16, docs 16, convert 13, context-budget 6). `tools/secrets/run.sh dir` — утечек нет.
- `pnpm budget` — 0 файлов больше 700 строк; новые файлы до 390 строк.
- `pnpm invariants:2a` — 5/5 ok.
- Integration (Postgres `varde_2a`): 48 файлов, 324 теста зелёные; 2 файла пропущены по окружению (rehearsal и restore в Docker, их гоняет `invariants:1c`). Новый `test/findings/rule-editor.test.ts` работает на своей временной базе, чтобы новые версии не попали в тесты паритета.
- e2e admin (`varde_e2e_admin_2a`, под `lockf`): 34/34 (в том числе 3 новых теста `funn.spec.ts`); e2e runner (`varde_e2e_2a`): 58/58.
- Скриншоты (Playwright, синтетические данные e2e): `2a/funn-1280-light.png`, `2a/funn-360-dark.png`, `2a/funn-ki-1280-light.png` (K7 × K8), `2a/funn-leader-1280-light.png`; при каждом прогоне e2e они пишутся заново в `varde/apps/admin/test-results/` (360 и 1280, обе темы).

## Отклонения и решения

1. **Leader-правила: варианты не редактируются.** Поле `raw_options` неизменяемо по заданию, а по клиенту правило считает именно его; правка `options` развела бы «alle» и клиента. Редактируются тексты, тип и уровень (`level`). Пороги и `min_count` у простых leader-правил в расчёте не участвуют и в UI не показаны.
2. **Вычисляемые правила:** `routine` — только тексты и тип; `heaviest` — плюс «Minst timar i veka» (`minimum_hours`); F12×B13 — доля «ja» на F12, минимум ответов и варианты B13.
3. **В предпросмотр уходят только поля, от которых зависит результат** (`options`, `threshold`, `min_count`, `level`, `minimum_hours`): правка текста не читает данные и не пишет лишних `leader.read`.
4. **Закрытые раунды — по сохранённым строкам release, а не по закреплению на раунд** (первый вариант 2.5 заменён решением оркестратора 16.10). `finding_set` — минимальная добавка, без неё «ничего не сработало» нельзя отличить от «ещё не считали».
5. **Доля из JSONB:** сохранённая `share` может отличаться в последнем знаке, поэтому у простых правил при чтении берётся `count / n` из той же строки.
6. Текст дашборда «Funn rekna ut frå svara: minst to personar, middels frå 15 %, høg frå 30 %.» не менялся — после правки порогов он может не совпадать с правилом (вопрос ниже).
7. **`privacy.release()` теперь возвращает `release_id`** (только метаданные, без значений). Нужен для раунда, где все ячейки скрыты (k): скрытая ячейка не несёт `release_id`, и без него версии такого release не закреплялись бы, а leader-выводы закрытого раунда шли бы за новой версией. `releaseRound` передаёт id в `released()`; тест с двумя ответами и одним руководителем.
8. Плейсхолдеры разрешены только в тексте вывода (`{n}`, `{task}`, `{persons}` подставляются везде, `replaceAll`); в «Kva vi gjer» — нет, он показывается как есть.
9. UI: предпросмотр уходит только для «устоявшегося» черновика (после паузы), без запроса с полузаполненным значением; после сохранения перечитываются только правило и список — предпросмотр один раз под новой версией (лишних `leader.read` нет). Несохранённый черновик не заменяется молча новой версией другого админа: показывается «Nokon har lagra versjon N medan du skreiv…», сохранение даст 409, «Hent nyaste versjon» берёт новую.
10. Бэкфилл миграции читает из `aggregate_snapshot` только метаданные (`release_id`, `client_id`, `status`, `population`); миграции — в allow-list `apps/api/prisma/**`.

## Интеграция с этапом 5 (merge `main` c9dd3b3, 16.10)

- Merge: меню «Innhald» — Skjema, Funn, Rapportar (тесты порядка unit и e2e), обе иконки, `invariants:2a` и `invariants:5`, строки REVIEW-CHECKLIST и AI_CONTEXT_MAP.
- Триггер `finding_rule_immutable` запрещает DELETE. Проверки отказа restore с правилом в базе (v99, ключ `zz_other`) идут в отдельных временных базах (`round-archive.test.ts`). Тест «новая версия правила не заменяет версию на момент release» перенесён из `client-report.test.ts` в `test/reports/client-report-versions.test.ts` на своей временной базе; версия создаётся через API редактора. Других DELETE/UPDATE `finding_rule` и UPDATE `finding`/`finding_set` в коде и тестах нет (grep).
- Архив 5.2 переносит `finding_set`. Выгрузка кладёт строки раунда. Restore проверяет каждую строку и вставляет в той же транзакции: release этого раунда из снимков архива; scope — `all` для all_clients или клиент архива для его round_client; каждый `key@version` есть среди правил архива, по одной версии на правило; версия совпадает с наименьшей версией сохранённых Finding этого release. Формат v1 изменён на месте. Чужой `release_id` (и другие нарушения) → отказ всего архива, база остаётся пустой.
- Порядок restore (пустая мигрированная база до seed, от нового архива к старому, `--sha256`, что делать при отказе) — `docs/varde/runbooks/archive-restore.md`.
- Архив без `finding_sets` (выгружен этапом 5 до 2.5) принимается: для текущих release без строки restore создаёт её как backfill миграции — наименьшая версия из Finding этого release, для правил без строк — наименьшая версия правила в архиве. Тест подкладывает в такой архив v2 «тихого» правила, которая сработала бы на всех ответах: после restore дашборд и отчёт те же, строк Finding не прибавилось, повторный restore — `unchanged`.
- `finding_set` и бэкфилл миграции теперь держат только правила семейства шаблона раунда (как архив); иначе ключи другого семейства не прошли бы проверку restore.
- Стык с 5.1: Finding сохраняются при release (`MetricsService.releaseRound` → `FindingsService.released()`), не при просмотре. Тест: отчёт раунда, закрытого только что, показывает выводы до любого просмотра дашборда. Восстановленный раунд показывает те же дашборд и отчёт, что исходный.
- Плейсхолдеры в тексте отчёта 5.1 подставляются везде (`replaceAll`), как в дашборде.
- CI: `pnpm invariants:2a` после `pnpm invariants:5` в job integration.
- Проверки после merge (из `varde/`): `pnpm check` exit 0 (596 тестов: api 146, admin 25, runner 81, rules 81, eslint-rules 61, schema 59, eval 50, docs 23 и остальные); `pnpm budget` — 0 файлов >700; integration 51 файл / 336 тестов (2 файла пропускаются по окружению); `pnpm invariants:2a` 5/5 и `pnpm invariants:5` 5/5 на свежей базе; e2e admin 37/37, runner 58/58; gitleaks — чисто. На давно живущей локальной тестовой базе (288 release одного раунда от повторных прогонов) обход маршрутов в `invariants:5` упирается в 60 с на close/release — свойство накопленной базы, на свежей и в CI этого нет.

## Новые строки на нюношке (на проверку Oleksandr)

Меню и страница: «Funn», «Reglane bak funna i dashbordet. Ei endring blir lagra som ein ny versjon, og du ser med ein gong kva ho gjer med tala i ein runde.», «Tryggleik», «KI», «Felles del», «Leiar», «Reglar», «{n} i alt», «Hentar …», «Hentar reglane …», «Vel ein regel i lista.», «Middels frå 15 %, høg frå 30 %, minst 2», «Leiarsvar, nivå middels», «Rekna ut frå timar i veka», «Rekna ut frå timar, minst 1 t i veka», «Frå 60 % som veit, minst 3 svar», «Du har endringar som ikkje er lagra. Vil du gå vidare utan å lagre?».

Редактор: «Versjon {n}», «Ikkje lagra», «Nokon har lagra versjon {n} medan du skreiv. Endringane dine er ikkje lagra.», ««Minst timar i veka» må vere eit tal frå 0.», «Funnet», «Slik står det i dashbordet: «4 av 12 …».» (для leader — «Leiaren …», для вычисляемых — «≈ 12 timar/veke …», «67 % …»), «Plasshaldarar: …», «Kva vi gjer», «Står som «Forslag» under funnet.», «Nynorsk», «Engelsk», «Middels frå», «Høg frå», «Minst», «personar», «Minst timar i veka», «Nivå når leiaren svarar slik», «Minst del som veit kor dei skal melde frå (F12)», «Minst svar på F12», «Funnet kjem når nokon har svart på kor mykje tid rutinane tek. Det har ingen tersklar.», «Svar som tel», «Leiarsvar som tel (B13)», «Svara i ein leiarregel ligg fast: dei gjeld både kvar leiar og samla tal for alle kundar.», «Type funn», «Risiko», «Moglegheit», «Versjonar», «Første versjon», «Endra: funnet, kva vi gjer, tersklar, minst personar, svar som tel, type, nivå, minst timar», «{d}. oktober, kl. 01.14», «Hent inn i redigeringa».

Предпросмотр и сохранение: «Førehandsvising», «Reknar …», «Runde», «Kunde», «Alle», «Ingen rundar med dette skjemaet enno.», «Rett felta for å sjå kva endringa gjer.», «Med endringa», «Utan endringar», «Ikkje funn», «Skjult: færre enn 3 svar», «Ingen svar å rekne på», «Ingen tal», «Leiaren har ikkje valt desse svara», «{n} av {m} leiarar», «{n} kunde/kundar», «Publiserte tal frå den avslutta runden.», «Levande tal frå den opne runden.», «Dashbordet for denne runden viser versjon {n} og endrar seg ikkje når du lagrar.», «Leiarsvar blir lesne og logga på same måte som i dashbordet.», «Grupper med færre enn 3 svar blir ikkje viste.», «Lagre som versjon {n}», «Forkast endringane», «Hent nyaste versjon», «Opne rundar får den nye versjonen med ein gong. Avslutta rundar held fram med funna dei fekk då dei vart avslutta.», «Lagra som versjon {n}.», в дашборде — «Regelen har ein nyare versjon».

Ошибки API: «Regelen finst ikkje.», «Regelen må måle det same som før. Desse felta kan ikkje endrast: …», «Tersklane må vere mellom 0 og 100 %, og «høg» kan ikkje vere lågare enn «middels».», «Skriv teksten både på nynorsk og engelsk.», «Teksten har ein ukjend plasshaldar: {x}.», «Kvart svar kan berre veljast éin gong.», ««Minst personar» må vere eit heilt tal frå 1.», «Vel minst eitt svar som skal telje.», «Vel berre svar som finst i spørsmålet.», «Svara i ein leiarregel ligg fast og kan ikkje endrast her.», «Denne regelen tel timar, ikkje svar. Svara kan ikkje endrast.», «Ingen endringar å lagre.», «Nokon har lagra versjon {n} i mellomtida. Hent regelen på nytt før du lagrar.», «Ein annan lagra same versjonen. Prøv igjen.», «Runden brukar eit anna skjema enn regelen.».

## Риски и вопросы к Oleksandr

- Если в seed-файл позже добавят `key@N`, а в базе уже есть `key@N` из редактора с другим содержимым, `seed()` остановится с ошибкой неизменяемости. Новые версии в seed нужно нумеровать выше максимума в базе (или не добавлять).
- Чтение leader в предпросмотре пишет `leader.read` на каждый пересчёт (по клиенту; для F12×B13 при «alle» — по числу клиентов раунда), как и дашборд. Пересчёт идёт только при смене порогов, вариантов, уровня, раунда или клиента.
- Вопрос: оставить фиксированный текст «middels frå 15 %, høg frå 30 %» в дашборде или писать общий («etter reglane under «Funn»»)?
- Вопрос: иконка «Funn» — лампочка; при желании заменить.
- Редактор правил работает только для правил шаблонов из seed (`tryggleik`, `ki`): для версий, опубликованных в редакторе 1d, метрики автоматические и правил FUNN нет (ограничение 1d).
