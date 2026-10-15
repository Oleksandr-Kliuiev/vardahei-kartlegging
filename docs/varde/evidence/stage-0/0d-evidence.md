# Evidence 0d — 2026-10-16

- Ветка `varde/0d` от `main` = `a67d244`. Коммиты задач: 0.13 `2cfd456`, 0.14 `b652464`; этот файл и строки карты контекста — следующим коммитом.
- `git diff a67d244 --stat -- docs/varde/ARCHITECTURE.md docs/varde/PRINCIPLES.md docs/varde/STAGES.md docs/varde/adr docs/varde/stages` → пусто; `kartlegging/`, корневые `package.json`/`package-lock.json` и `.github/workflows/varde.yml` не изменены.
- Модель и усилие кодера: `claude-opus-5-5` (Claude Code), effort max; fallback и несоответствие: нет.
- Живых вызовов модели не было: ключа у кодера нет, прогон запускает Oleksandr. CI — после push оркестратора.
- Упрощённая 0.14 по решению Oleksandr 13.10 (`docs/BESLUTNINGER.md`, `stages/stage-0/0d.md` §0.14): 5 брифов × `claude-opus-5-5` × 1 прогон, оценивает Oleksandr; слепого пакета и второго оценщика нет.

## Статус входов

| Вход | Статус |
| --- | --- |
| Организация Anthropic, Console, DPA, место обработки | **pending (Oleksandr)**: чек-лист 0.13, все 11 строк `pending` |
| Брифы `varde/tools/eval/briefs/v1/` (5) | черновики кодера, **pending** — утверждение Oleksandr |
| Промпт `varde/tools/eval/prompt/v1.md` | черновик кодера, **pending** — утверждение Oleksandr |
| Ключ Anthropic API, живой прогон | **pending (Oleksandr)**: прогона нет, `runs/` нет |
| Оценка | Oleksandr один (решение 13.10); носители не нужны |
| `varde/config/model.json` | нет — появляется только после pass (`eval:score -- --select`) |

## Команды проверки и фактический выход

Локально: macOS arm64, Node 25.8.1, pnpm 11.11.0, Docker (для gitleaks). Фильтр `pnpm --filter … test -- <имя>` в pnpm 11 не фильтрует (как в 0a–0c): идут все файлы пакета.

| Команда (из `varde/`) | Ожидалось | Получено |
| --- | --- | --- |
| `pnpm check` | exit 0 | exit 0; `@varde/schema` 59 passed, `@varde/tools-eval` 50 passed + 2 skipped, `@varde/tools-docs` 23 passed + 1 skipped, остальные пакеты зелёные |
| `pnpm --filter @varde/tools-docs test -- anthropic-checklist` | зелёный при `pending` | 23 passed, 1 skipped (строгий режим) |
| то же с `--require-complete` | красный, пока есть `pending` | 1 failed: `org: expected 'pending' to be 'ok'`. На временной копии чек-листа со статусами `ok` и файлами скриншотов — 24 passed; без одного скриншота — failed с именем файла (копия откатена) |
| `pnpm --filter @varde/tools-eval test` | зелёный, со `skipped` | 50 passed, 2 skipped: `skipped: no recorded runs`, `skipped: no model.json (…)` |
| `pnpm budget` | 0 файлов > 700 | `476 files scanned, 0 files over 700`; самый длинный новый файл — `score.ts`, 336 строк |
| `pnpm secrets`, `pnpm secrets:selfcheck` | no leaks | dir и git (110 коммитов): `no leaks found`; selfcheck `planted secret rejected` |
| `pnpm install --frozen-lockfile` на снимке каждого коммита (`git archive` индекса) | exit 0 | exit 0 для 0.13 и 0.14; lint, test, build `@varde/schema`, `@varde/tools-eval`, `@varde/tools-docs`, `@varde/runner` зелёные |
| `eval:run` без ключа | exit 2 и понятное сообщение | `ANTHROPIC_API_KEY is not set…`, exit 2; `eval:score` без прогонов — список недостающих файлов, exit 2 |
| Офлайн-репетиция всего цикла | цикл проходит, тесты без `skipped` | 5 синтетических ответов через настоящий `callModel` с подменённым `fetch` (без сети) → `eval:run -- --recheck` (lesepakke, пустой лист) → заполненный лист → `eval:score` (pass и fail) → `--select` → `model.json` → `@varde/tools-eval test` 52 passed без skipped. Лист от другого ответа (`output_sha`) и смена effort после прогона отклоняются. Все артефакты удалены, в коммиты не попали |

## 0.13

- `docs/varde/evidence/stage-0/0.13-anthropic-checklist.md`: 10 обязательных строк (`org`, `terms`, `dpa`, `retention`, `zdr`, `location`, `models`, `access`, `key`, `spend`) и `security` справочно; все `pending`; правило для скриншотов в шапке; для строк с Console — какой скриншот нужен.
- 17 ссылок на документы Anthropic проверены 16.10.2026 (HTTP 200). Формулировки DPA и Commercial Terms сверены с текстом страниц: DPA §B.1 (Anthropic — processor), §I.1 (SCC модули 2 и 3), 48 ч, 15 дней; Terms §B (без обучения на Customer Content), §C (DPA по ссылке), Anthropic Ireland, Limited для ЕЭЗ.
- Находки для Oleksandr:
  1. Варианта обработки в ЕС нет: `inference_geo` — только `global` и `us`, хранение at rest — в США. Это передача в третью страну по SCC из DPA; EU–US DPF в DPA не упоминается. Нужна правка `docs/personvern.md` («Overføring til tredjeland»), по 0d.md её делает Oleksandr. Уведомление v2 (`ai_processing`) передачу в США не называет.
  2. Хранение по умолчанию — 30 дней (Privacy Center); на docs-странице retention есть расходящаяся фраза «not retained by default» — подтвердить скриншотом Console.
  3. ZDR — только по запросу в Sales; для `claude-opus-5-5` и `claude-sonnet-5-5` возможна (не Covered Models); по ADR-011 не обязательна — решение Oleksandr.
  4. Лимит расходов и оповещение по e-mail задаются на workspace, у Default — нельзя: нужен отдельный workspace Varde.
- `docs/varde/personvern/behandlingsregister-varde.md`: черновик записи на нюношке («Overføring til tredjeland: Ja», SCC, 30 dagar), пометки для Oleksandr по-русски.
- Тест: режим по умолчанию — все обязательные строки, статус `pending`/`ok`/`fail`, у подтверждённой строки есть ссылка или скриншот, кто и дата; ссылки только на домены Anthropic и с датой проверки; нет ключей, e-mail и UUID; запись реестра на нюношке без букмола. Строгий режим — `--require-complete` после `--` (vitest отвергает неизвестные опции, а аргументы после `--` видит только `vitest.config.ts`, передаёт их через `inject`) или `VARDE_REQUIRE_COMPLETE=1`.

## 0.14

Тройка на `b652464` (ADR-018):

| Поле | Значение |
| --- | --- |
| `prompt_hash` | `2f6120adece41120d97217624c05dfb1966b7ae212d7e010b70fa33b4babda97` |
| `briefs_version` | `1e071783b5fbc68a31a118541529d5c19db652a4675b47ab171441db81a54632` |
| `model`, effort | `claude-opus-5-5`, `high` |
| `schema_hash` (JSON-схема выхода) | `7d3f3889bbbc6ede7b638d532767a58fa3770da118f7c08512fbb846eb7fe092` |

Брифы (sha256): `backup-hotell.md` `52c90dd1…4495`, `ki-kvardag.md` `fe74a3d7…aa21`, `mobil-anlegg.md` `85dd87fe…e506`, `passord-verkstad.md` `3c758ef5…2913`, `svindel-epost.md` `4d7fc422…8f81`. Темы: backup на отеле, пароли и вход в мастерской, мошеннические письма и счета в бухгалтерском бюро, рабочий телефон на объектах, KI в турфирме; без названий продуктов.

Решения в рамках задачи и отступления:

1. Структура готова к полной версии без переделки: `models.json` (модели, effort, `runs_per_brief`, профиль порогов), путь `runs/<briefs_version>/<prompt_hash>/<model>/<brief>-<run>.json` (в именах папок — первые 12 hex хэшей, в файлах — полные), `scores/<имя>.csv`. `score.ts` содержит оба профиля (`simplified`, `full`) и уже читает `blind-key.json` (буква → вариант). Полная версия: `claude-sonnet-5-5` в `models.json`, `runs_per_brief: 2`, `thresholds: full`, 10 брифов и `blind.ts`.
2. Пороги упрощённой: медиана смысла ≥ 4, медиана естественности ≥ 4, без критических ошибок ≥ 4 из 5; минуты правки — в отчёте, не порог.
3. В CSV к шести колонкам 0d.md добавлена `output_sha`: оценка привязана к записанному ответу, лист от другого прогона отклоняется.
4. Автопроверки ставят критические коды сами (`refusal`, `schema_violation`, `mixed_nn_nb`, `product_name`); они считаются вместе с кодами оценщика. Лимит 25 слов и «veit ikkje»/skip — предупреждения в lesepakke: ADR-010 их к критическим не относит.
5. Стоп-список нюношка расширен 30 формами букмола (0d.md это разрешает). `fra` не добавлен: утверждённый текст 0.16 называет файл `tools/runde1_fra_excel.py`.
6. Server-side refusal fallbacks не включены намеренно: eval меряет именно `claude-opus-5-5`, отказ — критическая ошибка (ADR-010), подмена ответа другой моделью исказила бы оценку. Для адаптера 2.6 — отдельное решение.
7. Клиент SDK `@anthropic-ai/sdk` 0.133.0: ключ только из `ANTHROPIC_API_KEY`, `authToken: null`, `baseURL` закреплён на `https://api.anthropic.com` — `ANTHROPIC_BASE_URL` в shell (в сессиях Claude Code он задан) ключ не уводит. Запрос: streaming (`messages.stream().finalMessage()`), `max_tokens` 32 000, `thinking: adaptive`, `output_config.effort` и `output_config.format` (`json_schema`); без `tools`, `tool_choice` и prefill — тело запроса зафиксировано тестом `call.test.ts`.
8. Effort `high`: у Opus 5.5 по умолчанию `medium`, ADR-010 требует явный; задача качественная (текст на нюношке), прогонов мало. При pass в `model.json` уходит `high`.
9. `prompt_hash` — sha256 только файла промпта (по 0d.md); схема выхода фиксируется отдельным `schema_hash` в каждом прогоне, `run.test.ts` и `score.ts` требуют её совпадения с HEAD: правка `survey-draft.ts` означает новый прогон.
10. `report-triple.test.ts` (заготовка проверки 2.13) сделан; `skipped`, пока нет `varde/config/model.json`.

## Что ждёт Oleksandr

### 0.13

1. Пройти 11 строк `docs/varde/evidence/stage-0/0.13-anthropic-checklist.md`: открыть ссылку или Console, сверить.
2. Сделать 7 скриншотов в `docs/varde/evidence/stage-0/0.13/`: `org.png`, `workspace.png`, `retention.png`, `models.png`, `members.png`, `api-keys.png`, `limits.png` — без ключей, organization id и e-mail замазаны; каждый файл проверить перед `git add`.
3. Решить: ZDR (нужна или нет), передача в США (правка `docs/personvern.md`, при желании — уведомления v2), разрешение субподрядчика в databehandleravtalar с клиентами.
4. Поставить `ok` и «Oleksandr, дата»; проверка: `cd varde && pnpm --filter @varde/tools-docs test -- anthropic-checklist --require-complete` — зелёный.
5. Утвердить запись `docs/varde/personvern/behandlingsregister-varde.md` и перенести её в протокол Vardahei.

### 0.14

1. Утвердить брифы `varde/tools/eval/briefs/v1/*.md` и промпт `varde/tools/eval/prompt/v1.md`. Правка до прогона безопасна: меняются только хэши.
2. Создать ключ в workspace Varde (Console → API keys) и скопировать.
3. Запустить прогон одной командой из `varde/` — ключ не попадает ни в историю shell, ни в файлы:

   ```
   read -rs "K?Anthropic API key: " && ANTHROPIC_API_KEY=$K pnpm --filter @varde/tools-eval eval:run; unset K
   ```

   5 запросов к `claude-opus-5-5` (effort `high`), каждый 1–3 мин; оценка стоимости печатается в конце (ожидается меньше $1). Повторный запуск дописывает недостающие прогоны; `-- --force` перезаписывает все.
4. Прочитать `varde/tools/eval/runs/1e071783b5fb/2f6120adece4/lesepakke.md` и заполнить `varde/tools/eval/scores/oleksandr.csv` по `varde/tools/eval/scoring-guide.md` (на нюношке).
5. `pnpm --filter @varde/tools-eval eval:score` → `docs/varde/evidence/stage-0/0.14-report.md`: pass/fail, тройка, sha256 листа и прогонов.
6. При pass и согласии: `pnpm --filter @varde/tools-eval eval:score -- --select claude-opus-5-5` → `varde/config/model.json`. При fail — раздел contingency в отчёте (ADR-010), G0 закрыт.
7. `pnpm --filter @varde/tools-eval test` — без `skipped`. Закоммитить `varde/tools/eval/runs/`, `varde/tools/eval/scores/oleksandr.csv`, отчёт и `model.json`. Ключ eval после прогона отозвать или оставить для живого eval (ADR-018).
8. G0 открывается при pass 0.14 и зелёном строгом режиме чек-листа 0.13.

## Строки CI для оркестратора

- Обязательных нет: `@varde/tools-eval` входит в workspace (`tools/*`), его lint, test и build уже идут в job `check` через `pnpm -r lint|test|build`; тест чек-листа в режиме по умолчанию — там же.
- После открытия G0 — шаг в job `check`, чтобы ворота не откатились: `- run: pnpm --filter @varde/tools-docs test -- anthropic-checklist --require-complete`.
- Живых вызовов в CI нет; секрет `ANTHROPIC_API_KEY` в CI не нужен.

## Риски

1. Оценивает один Oleksandr, в том числе естественность нюношка; автопроверка `mixed_nn_nb` ловит только формы стоп-списка. При сомнениях — попросить Asbjørn или Bjarte прочитать 1–2 черновика.
2. 5 брифов × 1 прогон проверяют пригодность, а не стабильность модели: разброс между прогонами не измерен.
3. Передача в США — юридическое решение Oleksandr; уведомление v2 её не называет.
4. Документы Anthropic расходятся по сроку хранения (30 дней и «not retained by default») — подтвердить по Console.
5. Тело запроса проверено офлайн, не на живом API. Если первый прогон получит 400 (например, на схему), `eval:run` остановится с понятной ошибкой и записей не оставит.
6. Стоп-список продуктов эвристический (`Teams`, `Word`, `Fiken` — это и «инжир»): ложное срабатывание даёт автоматическую критическую ошибку, править нужно список, а не лист.
7. pnpm, запущенный из корня репозитория, а не из `varde/`, ставит корневые npm-зависимости kartlegging и создаёт `pnpm-lock.yaml` в корне. У кодера так случилось один раз: файлы удалены, в коммиты не попали. Все команды — из `varde/`.
