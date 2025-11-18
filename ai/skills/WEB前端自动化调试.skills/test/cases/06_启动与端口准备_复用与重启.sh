#!/usr/bin/env bash
set -euo pipefail
# DESC: 复用已存在的调试进程，并验证 --new-chrome 可重启

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

BOOTSTRAP_ENV_INITIAL="$CASE_ARTIFACT_DIR/bootstrap_initial.env"
REUSE_LOG_DIR="$CASE_ARTIFACT_DIR/reuse_logs"
REUSE_STDOUT="$CASE_ARTIFACT_DIR/reuse_stdout.txt"
BOOTSTRAP_ENV_FRESH="$CASE_ARTIFACT_DIR/bootstrap_fresh.env"
CLEANUP_LOG="$CASE_ARTIFACT_DIR/cleanup.log"

cleanup() {
  "$CDP_SCRIPT" --new-chrome >"$CLEANUP_LOG" 2>&1 || true
}
trap cleanup EXIT

"$CDP_SCRIPT" --new-chrome --bootstrap-only >"$BOOTSTRAP_ENV_INITIAL"

declare devtools_host_initial devtools_port_initial chrome_pid_initial
while IFS='=' read -r key value; do
  case "$key" in
    devtools_host) devtools_host_initial="$value" ;;
    devtools_port) devtools_port_initial="$value" ;;
    chrome_pid) chrome_pid_initial="$value" ;;
  esac
done < <(grep -E '^(devtools_host|devtools_port|chrome_pid)=' "$BOOTSTRAP_ENV_INITIAL")

: "${devtools_host_initial:?}"
: "${devtools_port_initial:?}"
: "${chrome_pid_initial:?}"

"$CDP_SCRIPT" --log-dir "$REUSE_LOG_DIR" >"$REUSE_STDOUT"
grep -q "Reusing existing Chrome" "$REUSE_STDOUT"

"$CDP_SCRIPT" --new-chrome --bootstrap-only >"$BOOTSTRAP_ENV_FRESH"

declare chrome_pid_fresh
chrome_pid_fresh="$(grep -E '^chrome_pid=' "$BOOTSTRAP_ENV_FRESH" | head -n1 | cut -d= -f2-)"

: "${chrome_pid_fresh:?}"

if [[ "$chrome_pid_initial" == "$chrome_pid_fresh" ]]; then
  echo "Expected --new-chrome to restart Chrome, but PID did not change (${chrome_pid_initial})." >&2
  exit 1
fi
