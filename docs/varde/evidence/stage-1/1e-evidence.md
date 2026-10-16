# Checkpoint 1e — Vardestien, evidence (15–16.10.2026)

Статус: задачи 1.37–1.48 сделаны, merge в `main` (`a67d244`), выкачено на https://varde.vardahei.tech 16.10 (00:46 по Норвегии). Открыто: список недочётов вёрстки от Oleksandr и Safari на iPhone (по его решению 15.10 — правки вёрстки в конце). Кодер и оркестратор — Claude Opus 5.5 в одной сессии.

## Коммиты

| Задача | Коммит | Что |
| --- | --- | --- |
| docs | `f0d43ac` | Эталон в `docs/varde/design/`, PRINCIPLES «Визуальный стиль», BESLUTNINGER 15.10, строки 1e в STAGES |
| 1.37 | `3790117` | `@varde/ui`: токены, база, шрифты Atkinson Hyperlegible Next/Mono локально, модуль движения |
| 1.38–1.40 | `e6b0099` | Runner: ландшафт с камерой, варды, турист, новые экраны |
| 1.39, 1.41 | `9623479` | Тесты геометрии, покадровый e2e движения |
| 1.42 | `23542fb` | Оболочка админки: боковое меню, ⌘K, тема, тосты |
| 1.43 | `da72333` | Oversikt: ключевые числа, «Stigen per kunde» (тропа по каждому клиенту) |
| 1.44 | `b028bd0` | Клиенты и раунды карточками с кольцом, закрытие раунда удержанием |
| 1.45 | `4e5fa2e` | Дашборд в палитре зон Vardestien |
| 1.47 | `24ac336` | Удаление удержанием |
| 1.46 | `8199c60` | Живой предпросмотр в рамке телефона в редакторе |
| 1.41 | `922f340`, `2a5c922` | Защита от двойного нажатия «Vidare» → «Send svara» |
| 1e | `e42414f` | Админка берёт пакеты workspace из исходников (как runner); сборка без `dist` |
| 1.48 | `42639f9` | `pnpm invariants:1e` в CI, строки 1e в REVIEW-CHECKLIST |
| тесты | `4f17485`, `dbd5c64` | Стабильный порядок снимков в инварианте 1a (сравнивал порядок строк, а не содержимое; 5175 ячеек совпадали); e2e путей runner — 90 с (путь руководителя ≈ 40 шагов, на CI 30 с не хватало) |
| merge | `f316645`, `16ff395`, `a67d244` | Merge `varde/1e` в `main` (три merge: исходный и два с правками после CI) |

## Проверки (локально, Node 25, Chromium)

- `pnpm check` — exit 0: runner 81, admin 18, api 126, ui 18, rules 81, schema 50 и остальные пакеты зелёные.
- e2e runner 58/58 (в том числе покадровый тест движения при ответах каждые 700 и 120 мс), e2e admin 31/31.
- `pnpm budget` — 0 файлов больше 700 строк; бандл runner 58 КБ gzip из 100.
- `pnpm secrets` — утечек нет.
- CI на `9623479`: check, integration, image, secrets зелёные; e2e упал на двух порогах теста движения (дрожь кадров на машине CI) и на гонке в тесте «Endre». Исправлено в `922f340`/`2a5c922`.
- CI на `42639f9`: integration упал на инварианте 1a (порядок строк, см. `4f17485`), e2e — по таймауту пути руководителя (см. `dbd5c64`); оба — тесты, не код продукта.
- **CI run 38816891893 на `dbd5c64` — все пять job зелёные** (check с `invariants:1e`, integration, e2e admin и runner, image, secrets). Дерево `main` `a67d244` совпадает с `dbd5c64` (diff 0 строк).
- `pnpm invariants:1e` локально — 3/3.

## Отклонения от эталона (решения оркестратора, нужен взгляд Oleksandr)

1. **Камера следует за туристом на длинных опросах.** В прототипе 14 вопросов; в настоящих шаблонах 22 (tryggleik), у руководителей до 40. Вся тропа на экране давала шаг ~12 px и подъём 2–5 px — та же проблема «турист не идёт вверх». Теперь, если шаг меньше 19 px, полоса приближается к туристу и плавно едет за ним; фигурки, варды и точки сохраняют свой размер. Для коротких опросов вид как в эталоне.
2. **Названия разделов админки оставлены прежними** («Kundar og rundar», «Dashbord», «Eksport», «Sletting»), сгруппированы как в эталоне. Переименование в «Rundar», «Kundar», «Innsikt» — по решению Oleksandr.
3. **Экраны ошибок без блока контактов.** При недействительной или закрытой ссылке шаблон недоступен, а контакты живут в шаблоне. Нужно решение: брать контакты Vardahei из конфигурации runner или оставить как есть.
4. **«Hopp over og send» отправляет сразу**, как и до 1e. В прототипе вело на обзор; текущее поведение совпадает с текстом кнопки.
5. **«Ny kode»** оставлен с двумя нажатиями (как в эталоне), удержание — для «Avslutt heile runden» и удаления.

## Новые строки на нюношке (на проверку Oleksandr)

Runner: «Kven ser svara dine?», «Les heile personvernteksten», «Vis mindre», «For leiarar», «{n} spørsmål til», «Du går rett til toppen», «Spørsmål {i} av {n}», «Valt: {n}», «Valt: {n} av {m}», «{n} teikn att», «{a} av {n}», «Endre», «Sjå over svara», «Kva skjer no?», «Svara dine er komne fram.», «Vi samlar svara frå alle hos {k}.», «Vi kjem tilbake til bedrifta med det vi fann, og kva vi føreslår å gjere.», «Kopier», «Kopiert», «Lenkja er bytt ut», «Spør den som sende deg ho om den nye.», «Fekk ikkje kontakt», «Sjekk nettet og prøv igjen.», «Navigasjon», «Språk».

Admin: «Kartlegging · seminar · oppfølging», «Søk eller hopp til …», «Arbeid», «Innhald», «Personvern», «Som systemet», «Lys», «Mørk», «Opne menyen», «Lukk menyen», «Skriv ein kunde eller ei side», «Ingen treff»; приветствия «God morgon / God dag / God ettermiddag / God kveld», «{runde} er open hos {n} kundar.»; «Svar i runden», «Felles del, alle kundar», «Oppslutning», «Av tilsette i runden», «Svarar no», «Aktive økter siste 15 min. Under 3 blir ikkje viste», «Siste svar», «Siste dag med innsendt svar», «Stigen per kunde», «Éin prikk per tilsett. Turgåaren står der svara har kome til.», «Tal tilsette manglar», «Om {n} dagar», «Frist gått ut», «Inga frist»; «Hald inne knappen i over eitt sekund for å avslutte runden. Lenkjene sluttar då å verke.», «Hald inne knappen i over eitt sekund for å slette. Slettinga kan ikkje gjerast om.»; «Endringar blir viste med ein gong, også før du lagrar. Ingen svar blir lagra.»

## Выкатка 16.10.2026 (оркестратор, runbook `varde/infra/README.md` §2–§3)

- Образ `varde-api:a67d2445748b` собран на Mac (`buildx`, linux/amd64) из чистого checkout `main`, перенесён и загружен на VPS.
- Копия базы до выкатки: `pg_dump -Fc` через unix socket `atlas-db-1` → `/root/deploy-20261015-2246/varde-pre.dump` (343 194 байта, `0600`, каталог `0700`, sha256 `36df688a6b39cd22…`; `pg_restore --list` читает архив, 30 таблиц с данными).
- Миграций нет (`No pending migrations to apply`); infra, config и metrics между `4804cf98618d` и `a67d244` не менялись; `up -d` → `varde-app` healthy через 7 с.
- Проверка после (`prod-check`, без входа и без кодов): `/health` → `{"status":"ok","version":"a67d2445748b","db":"ok"}`; `/r?c=…` — CSP без `unsafe-*` и внешних хостов, `frame-ancestors 'none'`, `X-Frame-Options: DENY`; `/r?preview=…` — `frame-ancestors 'self'`, `SAMEORIGIN`; `/admin` → 302 на вход; экран «Denne lenkja verkar ikkje» с ландшафтом и туристом в light/dark на 390 и light на 1280, шрифт Atkinson Hyperlegible Next загружен, внешних запросов и JS-ошибок нет — 21/21 OK. В журнале приложения за 10 минут после старта ошибок нет.
- Откат (не понадобился): `VARDE_SHA=4804cf98618d` в `/opt/varde/.env` и `VERSION`, `up -d`; образ `4804cf98618d` остаётся на VPS.

## Безопасность и приватность

- CSP не ослаблен, кроме одного места: `/r?preview=` (только с сессией админа) можно встроить только в сам Varde (`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`). Все остальные пути runner — `'none'`/`DENY` (тест API). Предпросмотр принимает несохранённое содержимое только от родительского окна того же origin и только после проверки схемой (unit-тест).
- Oversikt и карточки раундов берут только агрегаты из API прогресса; активные сессии меньше 3 показываются «–».
- Шрифты отдаются со своего домена; внешних запросов нет (e2e оболочки).

## Открыто

- Список недочётов вёрстки от Oleksandr (решение 15.10: правки вёрстки — в конце); финальные скриншоты light/dark на 360/390/1280 снимаются вместе с этими правками.
- Проверка в Safari/WebKit — Oleksandr на iPhone.
