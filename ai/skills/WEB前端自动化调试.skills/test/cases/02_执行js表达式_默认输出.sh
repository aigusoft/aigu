#!/usr/bin/env bash
set -euo pipefail
# DESC: 执行默认表达式并验证日志输出

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

LOG_DIR="$CASE_ARTIFACT_DIR/cdp_logs"
STDOUT_FILE="$CASE_ARTIFACT_DIR/stdout.txt"

"$CDP_SCRIPT" --log-dir "$LOG_DIR" >"$STDOUT_FILE"

test -s "$LOG_DIR/chrome.log"
test -s "$LOG_DIR/websocat.log"
grep -q "Hello world from CDP" "$STDOUT_FILE"
grep -q '"Runtime.executionContextCreated"' "$LOG_DIR/websocat.log"
