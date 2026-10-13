#!/usr/bin/env bash
# Proves the secret-scan rejects a planted secret. The synthetic key is generated at run time
# (never committed) from the pinned gitleaks `aws-access-token` rule: "AKIA" + 16 chars of
# [A-Z2-7] (base32 alphabet; the rule also requires entropy >= 3).
set -uo pipefail
source "$(dirname "$0")/lib.sh"

dir="$REPO_ROOT/varde/.selfcheck"
leak="$dir/leak.txt"
report="$dir/report.json"
cleanup() { rm -f "$leak" "$report"; rmdir "$dir" 2>/dev/null || true; }
trap cleanup EXIT

mkdir -p "$dir"
key="AKIA$(LC_ALL=C tr -dc 'A-Z2-7' </dev/urandom | head -c 16)"
printf 'aws_access_key_id = %s\n' "$key" >"$leak"

EXTRA_MOUNTS=(-v "$dir:/out")
gitleaks_run dir /repo/varde --config /repo/varde/.gitleaks.toml --redact --no-banner \
  --gitleaks-ignore-path /repo/varde/.gitleaksignore \
  --report-format json --report-path /out/report.json >/dev/null 2>&1
code=$?

if [[ $code -eq 0 ]]; then
  echo "selfcheck: FAILED (gitleaks exit 0 on planted secret)" >&2
  exit 1
fi
if ! node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.exit(r.some((f) => f.RuleID === "aws-access-token" && f.File.endsWith(".selfcheck/leak.txt")) ? 0 : 1);
' "$report"; then
  echo "selfcheck: FAILED (no aws-access-token finding for .selfcheck/leak.txt; gitleaks exit $code)" >&2
  exit 1
fi
echo "selfcheck: planted secret rejected"
