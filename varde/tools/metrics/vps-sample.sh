#!/usr/bin/env bash
# One CSV line per run (task 0.12): host cron root, every minute, for 7 days.
#   * * * * * root /opt/varde/metrics/vps-sample.sh >> /var/lib/varde/metrics/vps-$(date -u +\%F).csv 2>/dev/null
# Columns (header with --header):
#   ts, mem_total_kb, mem_available_kb, mem_used_kb, swap_used_kb, cpu_busy_pct, disk_ms_per_io,
#   disk_ios, pg_conns (role:count;… — counts only), containers (name:cpu%:mem;…)
# Postgres: superuser via the unix socket inside atlas-db-1 (no password, nothing but counts).
# VARDE_PROC (default /proc) and DOCKER (default docker) exist for the test.
set -uo pipefail
proc=${VARDE_PROC:-/proc}
docker=${DOCKER:-docker}
interval=${VARDE_SAMPLE_SECONDS:-1}

if [[ "${1:-}" == --header ]]; then
  echo 'ts,mem_total_kb,mem_available_kb,mem_used_kb,swap_used_kb,cpu_busy_pct,disk_ms_per_io,disk_ios,pg_conns,containers'
  exit 0
fi

mem() { awk -v k="$1:" '$1 == k { print $2 }' "$proc/meminfo"; }
cpu() { awk '$1 == "cpu" { idle = $5 + $6; t = 0; for (i = 2; i <= NF; i++) t += $i; print t, idle }' "$proc/stat"; }
# Whole disks only (sdX, vdX, nvmeXnY, xvdX): reads+writes completed, ms reading+writing.
disk() {
  awk '$3 ~ /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+)$/ { ios += $4 + $8; ms += $7 + $11 } END { print ios + 0, ms + 0 }' "$proc/diskstats"
}

read -r t1 i1 < <(cpu)
read -r io1 ms1 < <(disk)
sleep "$interval"
read -r t2 i2 < <(cpu)
read -r io2 ms2 < <(disk)

total=$(mem MemTotal)
avail=$(mem MemAvailable)
swap_total=$(mem SwapTotal)
swap_free=$(mem SwapFree)
busy=$(awk -v a="$t1" -v b="$t2" -v x="$i1" -v y="$i2" 'BEGIN { d = b - a; printf "%.1f", (d > 0 ? 100 * (d - (y - x)) / d : 0) }')
dios=$((io2 - io1))
latency=$(awk -v n="$dios" -v m="$((ms2 - ms1))" 'BEGIN { printf "%.2f", (n > 0 ? m / n : 0) }')

pg=$($docker exec atlas-db-1 sh -c 'psql -X -U "$POSTGRES_USER" -d postgres -tA -F: -c "select coalesce(usename, backend_type), count(*) from pg_stat_activity group by 1 order by 1"' 2>/dev/null |
  tr '\n' ';' | sed 's/;$//')
ct=$($docker stats --no-stream --format '{{.Name}}:{{.CPUPerc}}:{{.MemUsage}}' 2>/dev/null |
  sed 's/ \/ .*//; s/ //g' | tr '\n' ';' | sed 's/;$//')

printf '%s,%s,%s,%s,%s,%s,%s,%s,"%s","%s"\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$total" "$avail" "$((total - avail))" "$((swap_total - swap_free))" \
  "$busy" "$latency" "$dios" "$pg" "$ct"
