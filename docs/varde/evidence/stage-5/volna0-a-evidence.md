# Волна 0, часть A: fastify, Caddy, выпавший funn (19.10.2026)

Ветка `varde/volna0-a` от main `ce96191`, worktree `~/vardahei-kartlegging-volna0`. Пункты 0.4 и 0.5 плана улучшений (`IMPROVEMENT-PLAN.md`) и ограничение 2.17 «funn, выпавший из результата, остаётся «I seminar» без редактора» (`stage-2/2c-evidence.md`). Миграций нет. Выкачено 19.10 как `25e407dae1d6` (ниже «Выкатка»).

## 0.4 — fastify и @fastify/static

- `fastify` 5.11.3 → 5.12.7. `@nestjs/platform-fastify` 11.2.7 жёстко держит 5.11.3, поэтому стоит `overrides: fastify: 5.12.7` в `pnpm-workspace.yaml`. Убрать после перехода на Nest 12: в 12.x адаптер уже на 5.12.7.
- `@fastify/static` 9.0.0 → 10.1.6. Единственное ломающее изменение v10: `setHeaders` получает `FastifyReply`, и его заголовки теперь перекрывают заголовки, выставленные раньше.
- Находка при обновлении: `setHeaders` раннера срабатывает на каждый `sendFile` общего декоратора, то есть и на HTML-входы `/s`, `/p` и `/admin`. С v10 эти страницы получили бы `public, max-age=31536000, immutable` вместо `no-store`. Это поймали `test/runner/static.test.ts` и `test/admin/static.test.ts`. Теперь `immutable` ставится только файлам внутри `assets/`, всем остальным — `no-store` (`apps/api/src/runner/static.ts`).
- `pnpm audit --prod`: было 12 (6 high, 6 moderate), стало 1 high. Осталась `deepmerge-ts` < 8 через `@prisma/config` CLI Prisma 6; это время сборки и миграции, не запрос. Уйдёт с Prisma 7.

## 0.5 — сжатие и HSTS в Caddy

- `infra/caddy/varde.caddy`: `encode zstd gzip`, `minimum_length 512`, и только для html, css, plain, csv, js, json и svg. `text/event-stream` в этот список не входит, поэтому SSE (`/api/admin/events`, `/api/presenter/stream`) компрессор не буферизует. HSTS: `max-age=31536000` без `includeSubDomains`, потому что остальные `*.vardahei.tech` не наши.
- Тест `infra/caddy/test/caddy-edge.test.sh` (добавлен в image-job `varde.yml`) берёт настоящий блок сайта перед заглушкой upstream и проверяет: html и js → zstd, js с `Accept-Encoding: gzip` → gzip, SSE и маленький ответ не сжаты, HSTS ровно `max-age=31536000`. Мутации проверены: если добавить `text/event-stream` в список — FAIL «event-stream compressed»; если добавить `includeSubDomains` — FAIL «hsts».
- `deploy.sh` Caddy не трогает. На VPS блок меняется руками по `infra/README.md` §5.1 (резервная копия, `validate`, `reload`, проверки, откат).

## 2.17 — выпавший funn сохраняет свой статус

- `FindingsService.ofClient`: правило, которого больше нет в текущем выпуске раунда, по-прежнему отдаётся, пока его самый новый статус не `open`. Такая строка помечена `dropped: { text }`, где text — `text.nn` версии правила, по которой стоял статус; у вычисляемого правила (без чисел) — `null`. Новый статус по-прежнему пишется в строку с самым новым статусом. Чисел в ответе нет.
- Страница клиента: под funn раунда идёт блок «Ikkje lenger med i resultatet» со своим «Endre status». После «Open» строка из списка уходит. На странице семинара текст выпавшего funn теперь говорит, где менять статус: «Funnet er ikkje lenger med i resultatet for runden. Statusen endrar du på sida til kunden.»
- Тесты: integration `test/seminars/client-page.test.ts` (новый сценарий: два funn в семинаре выпали, «Ferdig» остаётся в списке, «Open» уходит, текст правила, без чисел). Мутации — убрать включение выпавших и убрать удаление после `open` — обе дают FAIL. Admin unit `test/kunde.test.tsx` (блок, его редактор, `PUT` в строку со статусом, чужой раунд не показан).
- Вид: временная Playwright-сцена (не в репозитории) на 1440, 768 и 390 px в светлой и тёмной теме. Нашла одно переполнение: на 390 px открытый выбор статуса уходил за край карточки, потому что у `li` в grid не было `minmax(0, 1fr)`. Исправлено (`4c21411`), после исправления потомков за краем карточки 0.

## Прогон

Полный локальный прогон шагов `varde.yml` на `302bf67` (Actions заблокирован; Node 22.22.2; свежие базы `varde_v0_*` в `varde-dev-postgres-1`; `VARDE_RESTORE_DOCKER=1` в integration): **44 из 44**. Integration — 470 тестов (8 skipped), e2e admin 53/53, runner 66/66, invariants 0a–3c, golden, secrets, образ со всеми проверками image-job, caddy-log и caddy-edge. Шаг `image-health` в первый раз упал: порт 3999 на Mac занят посторонним процессом. Повтор на порту 3998 — `{"status":"ok","version":"ci","db":"ok"}`. После прогона изменился только CSS (`4c21411`), и e2e admin прогнан заново: 53/53. Секреты после этого — 0 (dir-скан находил скриншоты в игнорируемых `test-results/` локальных e2e; в чистом checkout CI их нет).

## Выкатка (19.10, OK Oleksandr на локальный прогон 44 из 44)

- main fast-forward до `varde/volna0-a`, push: origin/main = `25e407d`. `ship-image.sh` и `deploy.sh 25e407dae1d6`: миграций нет, `{"status":"ok","version":"25e407dae1d6","db":"ok"}`. Копия данных: `/root/deploy-20261019-1830` (57 ответов, 5429 снимков). Откат приложения: `bash infra/ops/rollback.sh 1d5d5effefbe`, без down.sql.
- Прод после деплоя: `/r/`, `/s`, `/p` — `cache-control: no-store`; `/admin` → 302 с `no-store`; `/r/assets/*.js` — `public, max-age=31536000, immutable`. Ошибок в логе `varde-app` нет.
- Caddy по §5.1: копия `/etc/atlas-edge/Caddyfile.bak-20261019T183058Z`. В diff убран только старый трёхстрочный блок, новый добавлен в конец. Сначала `validate` нового файла в контейнере, затем запись, `validate`, `reload`. Предупреждение «not formatted» про строку 2 было и раньше.
- Проверки: `strict-transport-security: max-age=31536000`; `/r/` → `content-encoding: zstd`; `main-*.js` 158 533 → 51 745 байт; маленький `/health` не сжат. Остальные хосты atlas-edge отвечают (atera 200, ai 200, muligheter 401, kartlegging 404, admin 302). Сжатие SSE на проде не проверено, потому что потоки под входом; проверено тестом caddy-edge.
- Откат Caddy: `cat /etc/atlas-edge/Caddyfile.bak-20261019T183058Z > /etc/atlas-edge/Caddyfile` и `caddy reload`.

## Не сделано и риски

- Под входом на проде блок не проверен: «Ikkje lenger med i resultatet» появляется только у funn, который выпал после нового выпуска закрытого раунда.
- Тексты на нюношке для проверки Oleksandr: «Ikkje lenger med i resultatet», «Ei ny utgåve av resultatet har ikkje desse funna lenger, men dei har framleis ein status.», «Funn rekna ut frå tala i runden», «Funnet er ikkje lenger med i resultatet for runden. Statusen endrar du på sida til kunden.»
