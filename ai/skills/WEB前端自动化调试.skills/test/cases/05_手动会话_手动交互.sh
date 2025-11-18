#!/usr/bin/env bash
set -euo pipefail
# DESC: 通过 --bootstrap-only 建立手动 session 并执行 Runtime.evaluate

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少依赖：$1，请先安装后再运行测试。" >&2
    exit 127
  fi
}

require_cmd jq
require_cmd curl
require_cmd websocat

BOOTSTRAP_OUT="$CASE_ARTIFACT_DIR/bootstrap.txt"
WS_LOG="$CASE_ARTIFACT_DIR/manual_websocket.log"
TARGET_JSON="$CASE_ARTIFACT_DIR/target.json"

"$CDP_SCRIPT" --bootstrap-only >"$BOOTSTRAP_OUT"

declare devtools_host devtools_port chrome_pid
while IFS='=' read -r key value; do
  case "$key" in
    devtools_host) devtools_host="$value" ;;
    devtools_port) devtools_port="$value" ;;
    chrome_pid) chrome_pid="$value" ;;
  esac
done < <(grep -E '^(devtools_host|devtools_port|chrome_pid)=' "$BOOTSTRAP_OUT")

: "${devtools_host:?缺少 devtools_host}"
: "${devtools_port:?缺少 devtools_port}"
: "${chrome_pid:?缺少 chrome_pid}"

cleanup() {
  if [[ -n "${chrome_pid:-}" ]] && kill -0 "$chrome_pid" >/dev/null 2>&1; then
    kill "$chrome_pid" >/dev/null 2>&1 || true
    wait "$chrome_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

TARGET_RESPONSE="$(curl -sf -X PUT "http://${devtools_host}:${devtools_port}/json/new?about:blank")"
echo "$TARGET_RESPONSE" >"$TARGET_JSON"
WS_URL="$(jq -r '.webSocketDebuggerUrl // empty' "$TARGET_JSON")"
if [[ -z "$WS_URL" ]]; then
  echo "未能获取 webSocketDebuggerUrl" >&2
  exit 1
fi

ACCESS_WS="$WS_URL"
if [[ "$WS_URL" == ws://127.0.0.1:* ]]; then
  rest="${WS_URL#ws://127.0.0.1:}"
  path="${rest#*/}"
  ACCESS_WS="ws://${devtools_host}:${devtools_port}/${path}"
fi

ENABLE_MSG='{"id":1,"method":"Runtime.enable"}'
custom_expr='(() => { const msg = "BootstrapEval"; console.log(msg); return msg; })()'
EVAL_MSG="$(jq -cn --arg expr "$custom_expr" '{id:2,"method":"Runtime.evaluate","params":{"expression":$expr,"awaitPromise":true}}')"

{
  sleep 1
  printf '%s\n' "$ENABLE_MSG"
  sleep 0.3
  printf '%s\n' "$EVAL_MSG"
  sleep 1
} | websocat -B 65536 "$ACCESS_WS" >"$WS_LOG"

grep -q "BootstrapEval" "$WS_LOG"
