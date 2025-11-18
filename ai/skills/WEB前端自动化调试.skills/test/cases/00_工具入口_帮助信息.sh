#!/usr/bin/env bash
set -euo pipefail
# DESC: 验证 --help 输出覆盖关键说明

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

output="$CASE_ARTIFACT_DIR/help.txt"
"$CDP_SCRIPT" --help >"$output"

grep -q "Usage: cdp_eval.sh" "$output"
grep -q -- "--bootstrap-only" "$output"
grep -q -- "--new-chrome" "$output"
