#!/usr/bin/env bash
set -euo pipefail
# DESC: 自定义表达式应透传至 CDP evaluate

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

custom_expr='(() => { const msg = "FunctionalCustom"; console.log(msg); return msg; })()'
LOG_DIR="$CASE_ARTIFACT_DIR/cdp_logs"
STDOUT_FILE="$CASE_ARTIFACT_DIR/stdout.txt"

"$CDP_SCRIPT" --new-chrome --log-dir "$LOG_DIR" --expression "$custom_expr" >"$STDOUT_FILE"

grep -q "FunctionalCustom" "$STDOUT_FILE"
grep -q "FunctionalCustom" "$LOG_DIR/websocat.log"
