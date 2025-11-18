#!/usr/bin/env bash
set -euo pipefail
# DESC: 未知参数时脚本应退出并提示

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

STDOUT_FILE="$CASE_ARTIFACT_DIR/stdout.txt"
ERROR_FILE="$CASE_ARTIFACT_DIR/error.txt"

set +e
"$CDP_SCRIPT" --totally-unknown >"$STDOUT_FILE" 2>"$ERROR_FILE"
exit_code=$?
set -e

if [[ $exit_code -ne 22 ]]; then
  echo "Expected exit code 22 for unknown option, got $exit_code" >&2
  exit 1
fi

grep -qi "Unknown option" "$ERROR_FILE"
