#!/usr/bin/env bash
# vps-sample.sh on fixture /proc files and a stub `docker`: one CSV line with the header's
# column count, RAM and swap from meminfo, counts per role, container stats.
set -euo pipefail
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { echo "metrics test FAILED: $*" >&2; exit 1; }
cat > "$tmp/docker" <<'SH'
#!/usr/bin/env bash
case "$1" in
  exec) printf 'atlas:7\nvarde_app:5\nvarde_backup:1\n' ;;
  stats) printf 'varde-app:1.50%%:120MiB / 512MiB\natlas-db-1:3.20%%:800MiB / 7.6GiB\n' ;;
esac
SH
chmod +x "$tmp/docker"
header=$(bash "$dir/../vps-sample.sh" --header)
line=$(VARDE_PROC="$dir/fixtures/proc" DOCKER="$tmp/docker" VARDE_SAMPLE_SECONDS=0 bash "$dir/../vps-sample.sh")
cols() { node -e 'const l = process.argv[1]; let n = 1, q = false; for (const c of l) { if (c === "\"") q = !q; else if (c === "," && !q) n++; } console.log(n);' "$1"; }
[[ $(cols "$header") == 10 && $(cols "$line") == 10 ]] || fail "column count: $line"
[[ "$line" == *",8000000,2500000,5500000,0,0.0,0.00,0,"* ]] || fail "memory, cpu, disk columns: $line"
[[ "$line" == *'"atlas:7;varde_app:5;varde_backup:1"'* ]] || fail "pg counts: $line"
[[ "$line" == *'"varde-app:1.50%:120MiB;atlas-db-1:3.20%:800MiB"'* ]] || fail "containers: $line"
[[ "$line" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]] || fail "timestamp: $line"
echo "metrics ok"
