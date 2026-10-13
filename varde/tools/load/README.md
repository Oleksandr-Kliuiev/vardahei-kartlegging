# tools/load — стенд нагрузки 0.12 (k6 в Docker)

k6 запускается образом `grafana/k6:1.3.0` (multi-arch; локально k6 не установлен). **Нагрузка — только с внешней машины** (Mac хостинг-оператора с Docker) через публичный хост Varde. Запуск k6 на VPS не принимается: генератор на тех же 2 vCPU искажает все пороги. В отчёт 0.12 записывается, откуда шла нагрузка (машина, сеть).

Пороги ADR-016 (отчёт — `docs/varde/evidence/stage-0/0.12-report.md`): без OOM; `available ≥ 25 %` RAM под пиком; `p95 stub < 1 с` в обеих фазах; `p95 Atlas ≤ 2× baseline`, 5xx = 0; hold-задачи `failed = 0`.

## Порядок

1. **Baseline Atlas в тихий час**, без стенда. Эталонный эндпоинт — публичный GET Atlas без побочных эффектов (выбирает хостинг-оператор, пишет в отчёт):

```bash
cd varde/tools/load
docker run --rm -v "$PWD:/s" grafana/k6:1.3.0 run -e ATLAS_URL=https://<atlas-host>/<path> \
  --summary-export=/s/atlas-baseline.json /s/atlas-baseline.js
```

`p(95)` из `metrics.http_req_duration` → `BASELINE_P95_MS` (мс) в отчёт.

2. **Окно стенда** (тихий час; Atlas — внутренняя платформа Vardahei, отдельного согласования нет). На VPS — включить stub (`infra/README.md` §8): `VARDE_STUB_SUBMIT=1`, `VARDE_STUB_UNTIL` (≤ 4 ч), `VARDE_STUB_TOKEN` (`openssl rand -hex 24`, виден оператору, уничтожается после стенда), `up -d`. Метрики уже идут (`tools/metrics/README.md`).

3. **Одновременно** (три терминала):

```bash
# a) стенд с Mac
docker run --rm -v "$PWD:/s" grafana/k6:1.3.0 run -e BASE_URL=https://varde.vardahei.tech \
  -e STUB_TOKEN=<токен> --summary-export=/s/stub-summary.json /s/stub-submit.js
# b) Atlas под нагрузкой, с порогом
docker run --rm -v "$PWD:/s" grafana/k6:1.3.0 run -e ATLAS_URL=https://<atlas-host>/<path> \
  -e BASELINE_P95_MS=<p95> --summary-export=/s/atlas-under-load.json /s/atlas-baseline.js
# c) задачи, держащие соединения (каждые 5 минут, 3 раза), и бэкап (0.10 отложен 13.10 — пропустить, отметить в отчёте)
for i in 1 2 3; do curl -s -X POST -H "x-varde-stub-token: <токен>" "https://varde.vardahei.tech/stub/enqueue-hold?n=3"; sleep 300; done
```

4. **После стенда** — снять переменные stub, `up -d`, очистка и проверка (`infra/README.md` §8); число `completed`/`failed` задач `demo.hold-connection` — ролью `varde_backup`:

```bash
docker run --rm --network atlas_internal --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X -tAc \
  "select state, count(*) from (select state from pgboss.job where name = 'demo.hold-connection' union all select state from pgboss.archive where name = 'demo.hold-connection') j group by 1"
```

`failed > 0` значит, что стенд недооценил нагрузку на пул.

5. В evidence: `stub-summary.json`, `atlas-*.json` (sha256), CSV часа стенда; в отчёт — числа.

Если k6 не может записать summary в смонтированный каталог — добавить `--user "$(id -u)"` к `docker run`.

Exit code k6 ≠ 0 = порог не выполнен; это результат стенда, не сбой инструмента.

## Проверка скриптов без нагрузки

`bash tools/load/test/k6-inspect.test.sh` — `k6 inspect` обоих скриптов (синтаксис, сценарии, пороги); в CI job `image`.
