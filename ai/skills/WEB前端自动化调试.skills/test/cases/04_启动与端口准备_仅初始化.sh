#!/usr/bin/env bash
set -euo pipefail
# DESC: --bootstrap-only 输出应包含关键字段且 Chrome 可回收

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

OUTPUT="$CASE_ARTIFACT_DIR/bootstrap.txt"

"$CDP_SCRIPT" --bootstrap-only >"$OUTPUT"

grep -q "^devtools_host=" "$OUTPUT"
grep -q "^devtools_port=" "$OUTPUT"
grep -q "^chrome_pid=" "$OUTPUT"
grep -q "^chrome_log=" "$OUTPUT"

declare devtools_host devtools_port chrome_pid chrome_log
while IFS='=' read -r key value; do
  case "$key" in
    devtools_host) devtools_host="$value" ;;
    devtools_port) devtools_port="$value" ;;
    chrome_pid) chrome_pid="$value" ;;
    chrome_log) chrome_log="$value" ;;
  esac
done < <(grep -E '^(devtools_host|devtools_port|chrome_pid|chrome_log)=' "$OUTPUT")

: "${devtools_host:?}"
: "${devtools_port:?}"
: "${chrome_pid:?}"
: "${chrome_log:?}"

test -f "$chrome_log"

if kill -0 "$chrome_pid" 2>/dev/null; then
  kill "$chrome_pid" >/dev/null 2>&1 || true
  wait "$chrome_pid" >/dev/null 2>&1 || true
fi
