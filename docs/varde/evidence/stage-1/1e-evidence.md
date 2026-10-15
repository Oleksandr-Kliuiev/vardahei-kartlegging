# Checkpoint 1e — Vardestien, промежуточный evidence (15.10.2026)

Статус: задачи 1.37–1.47 сделаны на ветке `varde/1e`; 1.48 (доводка вёрстки по списку Oleksandr, финальные скриншоты, `invariants:1e`) — после его проверки. Кодер и оркестратор — Claude Opus 5.5 в одной сессии.

## Коммиты

| Задача | Коммит | Что |
| --- | --- | --- |
| docs | `f0d43ac` | Эталон в `docs/varde/design/`, PRINCIPLES «Визуальный стиль», BESLUTNINGER 15.10, строки 1e в STAGES |
| 1.37 | `3790117` | `@varde/ui`: токены, база, шрифты Atkinson Hyperlegible Next/Mono локально, модуль движения |
| 1.38–1.40 | `e6b0099` | Runner: ландшафт с камерой, варды, турист, новые экраны |
| 1.39, 1.41 | `9623479` | Тесты геометрии, покадровый e2e движения |
| 1.42 | `23542fb` | Оболочка админки: боковое меню, ⌘K, тема, тосты |
| 1.43 | `da72333` | Oversikt: ключевые числа, «стигая» по клиенту |
| 1.44 | `b028bd0` | Клиенты и раунды карточками с кольцом, закрытие раунда удержанием |
| 1.45 | `4e5fa2e` | Дашборд в палитре зон Vardestien |
| 1.47 | `24ac336` | Удаление удержанием |
| 1.46 | `8199c60` | Живой предпросмотр в рамке телефона в редакторе |
| 1.41 | `922f340`, `2a5c922` | Защита от двойного нажатия «Vidare» → «Send svara» |

## Проверки (локально, Node 25, Chromium)

- `pnpm check` — exit 0: runner 81, admin 18, api 126, ui 18, rules 81, schema 50 и остальные пакеты зелёные.
- e2e runner 58/58 (в том числе покадровый тест движения при ответах каждые 700 и 120 мс), e2e admin 31/31.
- `pnpm budget` — 0 файлов больше 700 строк; бандл runner 58 КБ gzip из 100.
- `pnpm secrets` — утечек нет.
- CI на `9623479`: check, integration, image, secrets зелёные; e2e упал на двух порогах теста движения (дрожь кадров на машине CI) и на гонке в тесте «Endre». Исправлено в `922f340`/`2a5c922`; CI на последнем коммите ещё идёт.

## Отклонения от эталона (решения оркестратора, нужен взгляд Oleksandr)

1. **Камера следует за туристом на длинных опросах.** В прототипе 14 вопросов; в настоящих шаблонах 22 (tryggleik), у руководителей до 40. Вся тропа на экране давала шаг ~12 px и подъём 2–5 px — та же проблема «турист не идёт вверх». Теперь, если шаг меньше 19 px, полоса приближается к туристу и плавно едет за ним; фигурки, варды и точки сохраняют свой размер. Для коротких опросов вид как в эталоне.
2. **Названия разделов админки оставлены прежними** («Kundar og rundar», «Dashbord», «Eksport», «Sletting»), сгруппированы как в эталоне. Переименование в «Rundar», «Kundar», «Innsikt» — по решению Oleksandr.
3. **Экраны ошибок без блока контактов.** При недействительной или закрытой ссылке шаблон недоступен, а контакты живут в шаблоне. Нужно решение: брать контакты Vardahei из конфигурации runner или оставить как есть.
4. **«Hopp over og send» отправляет сразу**, как и до 1e. В прототипе вело на обзор; текущее поведение совпадает с текстом кнопки.
5. **«Ny kode»** оставлен с двумя нажатиями (как в эталоне), удержание — для «Avslutt heile runden» и удаления.

## Новые строки на нюношке (на проверку Oleksandr)

Runner: «Kven ser svara dine?», «Les heile personvernteksten», «Vis mindre», «For leiarar», «{n} spørsmål til», «Du går rett til toppen», «Spørsmål {i} av {n}», «Valt: {n}», «Valt: {n} av {m}», «{n} teikn att», «{a} av {n}», «Endre», «Sjå over svara», «Kva skjer no?», «Svara dine er komne fram.», «Vi samlar svara frå alle hos {k}.», «Vi kjem tilbake til bedrifta med det vi fann, og kva vi føreslår å gjere.», «Kopier», «Kopiert», «Lenkja er bytt ut», «Spør den som sende deg ho om den nye.», «Fekk ikkje kontakt», «Sjekk nettet og prøv igjen.», «Navigasjon», «Språk».

Admin: «Kartlegging · seminar · oppfølging», «Søk eller hopp til …», «Arbeid», «Innhald», «Personvern», «Som systemet», «Lys», «Mørk», «Opne menyen», «Lukk menyen», «Skriv ein kunde eller ei side», «Ingen treff»; приветствия «God morgon / God dag / God ettermiddag / God kveld», «{runde} er open hos {n} kundar.»; «Svar i runden», «Felles del, alle kundar», «Oppslutning», «Av tilsette i runden», «Svarar no», «Aktive økter siste 15 min. Under 3 blir ikkje viste», «Siste svar», «Siste dag med innsendt svar», «Stigen per kunde», «Éin prikk per tilsett. Turgåaren står der svara har kome til.», «Tal tilsette manglar», «Om {n} dagar», «Frist gått ut», «Inga frist»; «Hald inne knappen i over eitt sekund for å avslutte runden. Lenkjene sluttar då å verke.», «Hald inne knappen i over eitt sekund for å slette. Slettinga kan ikkje gjerast om.»; «Endringar blir viste med ein gong, også før du lagrar. Ingen svar blir lagra.»

## Безопасность и приватность

- CSP не ослаблен, кроме одного места: `/r?preview=` (только с сессией админа) можно встроить только в сам Varde (`frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`). Все остальные пути runner — `'none'`/`DENY` (тест API). Предпросмотр принимает несохранённое содержимое только от родительского окна того же origin и только после проверки схемой (unit-тест).
- Oversikt и карточки раундов берут только агрегаты из API прогресса; активные сессии меньше 3 показываются «–».
- Шрифты отдаются со своего домена; внешних запросов нет (e2e оболочки).

## Открыто

- 1.48: список недочётов вёрстки от Oleksandr, финальные скриншоты light/dark на 360/390/1280, `pnpm invariants:1e`, это evidence в финальном виде.
- Проверка в Safari/WebKit — Oleksandr на iPhone.
- Merge в `main` и выкатка на https://varde.vardahei.tech — только после его проверки и OK.
