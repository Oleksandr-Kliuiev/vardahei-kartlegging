# tools/metrics — неделя метрик VPS (0.12)

`vps-sample.sh` раз в минуту дописывает строку CSV: RAM (total, available, used), swap used, CPU busy % (за 1 с), задержка диска (мс на операцию за 1 с, `/proc/diskstats`, только целые диски), число операций, соединения Postgres по ролям (только count, superuser через unix-socket `atlas-db-1`, пароль не нужен), `docker stats --no-stream` по контейнерам. Отдельного скрипта отчёта нет — сводка командами ниже.

## Установка (хостинг-оператор, на VPS)

```bash
rsync -a varde/tools/metrics/ vardahei-vps:/opt/varde/metrics/     # с Mac, вместе с деплоем (infra/README.md §2)
ssh -T vardahei-vps
install -d -m 0750 /var/lib/varde/metrics
bash /opt/varde/metrics/vps-sample.sh --header > /var/lib/varde/metrics/header.csv
bash /opt/varde/metrics/vps-sample.sh          # одна строка — проверка
cat > /etc/cron.d/varde-metrics <<'CRON'
* * * * * root /opt/varde/metrics/vps-sample.sh >> /var/lib/varde/metrics/vps-$(date -u +\%F).csv 2>/dev/null
CRON
```

7 календарных дней (вход «Неделя метрик VPS» в `STAGES.md`), затем `rm /etc/cron.d/varde-metrics`. Откат — тот же `rm`.

## Сводка

```bash
cd /var/lib/varde/metrics
cat header.csv vps-*.csv > week.csv
F='-F,'   # колонки: 1 ts, 2 total, 3 available, 4 used, 5 swap, 6 cpu, 7 disk ms/io, 8 ios, 9 pg, 10 containers
# минимум available и его доля от total (порог ADR-016: ≥ 25 % под пиком)
awk $F 'NR > 1 { p = 100 * $3 / $2; if (min == "" || p < min) { min = p; at = $1 } } END { printf "min available %.1f%% at %s\n", min, at }' week.csv
# пик used RAM, swap, CPU, задержки диска
for c in 4 5 6 7; do sort -t, -k$c,$c -g week.csv | tail -1 | cut -d, -f1,$c; done
# средняя загрузка CPU и задержка диска
awk $F 'NR > 1 { c += $6; d += $7; n++ } END { printf "cpu avg %.1f%%, disk avg %.2f ms/io\n", c / n, d / n }' week.csv
# пик соединений varde_app и всего
awk $F 'NR > 1 { split($9, r, ";"); t = 0; for (i in r) { split(r[i], kv, ":"); gsub(/"/, "", kv[1]); gsub(/"/, "", kv[2]); t += kv[2]; if (kv[1] == "varde_app" && kv[2] > va) va = kv[2] } if (t > tot) { tot = t; at = $1 } } END { print "pg total max", tot, "at", at, "; varde_app max", va }' week.csv
# час стенда (подставить начало и конец UTC)
awk $F -v a=2026-10-20T03:00 -v b=2026-10-20T04:00 'NR == 1 || ($1 >= a && $1 < b)' week.csv > stand-hour.csv
sha256sum week.csv stand-hour.csv
```

CSV недели и часа стенда — в evidence (sha256), числа — в `docs/varde/evidence/stage-0/0.12-report.md`.

Тест без VPS: `bash tools/metrics/test/vps-sample.test.sh` (fixtures `/proc` и заглушка `docker`).
