#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cdp_common.sh"

usage() {
  cat <<'EOF'
Usage: cdp_eval.sh [options]

Options:
  -e, --expression "<js>"   JavaScript expression executed via Runtime.evaluate.
                            默认 console.log("Hello world from CDP").
      --bootstrap-only      仅启动 Chrome 并输出 DevTools host/port，不执行 JS。
      --new-chrome          如已有调试进程，先关闭并重新启动一个全新实例。
      --log-dir DIR         Chrome 日志目录（默认临时目录）。
      --keep-profile        不删除临时 Linux profile（WSL 使用 Windows 目录，无需该参数）。
      --leave-browser       执行表达式后保留 Chrome 进程，供后续命令复用。
  -h, --help                查看帮助。

脚本会自动判断运行环境（Linux / WSL），在 WSL 内自动创建/复用
Windows 防火墙与端口代理规则，并始终在 C:\Users\<user>\test_chrome_user
下运行 Chrome。
EOF
}

EXPRESSION='(() => { const msg = "Hello world from CDP"; console.log(msg); return msg; })()'
BASE_PORT=9222
PORT=$BASE_PORT
PROXY_PORT=$BASE_PORT
LEGACY_PROXY_PORT=$((BASE_PORT + 1))
LOG_DIR="${CDP_LOG_DIR:-$(mktemp -d /tmp/web-cdp-logs.XXXXXX)}"
KEEP_PROFILE=0
BOOTSTRAP_ONLY=0
LEAVE_CHROME_RUNNING=0
FORCE_NEW_CHROME=0
REUSE_EXISTING_CHROME=0
EXISTING_CHROME_PID=""

while (($#)); do
  case "$1" in
    -e|--expression)
      shift
      EXPRESSION="$1"
      ;;
    --log-dir)
      shift
      LOG_DIR="$1"
      mkdir -p "$LOG_DIR"
      ;;
    --keep-profile)
      KEEP_PROFILE=1
      ;;
    --bootstrap-only)
      BOOTSTRAP_ONLY=1
      LEAVE_CHROME_RUNNING=1
      ;;
    --new-chrome)
      FORCE_NEW_CHROME=1
      ;;
    --leave-browser)
      LEAVE_CHROME_RUNNING=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 22
      ;;
  esac
  shift
done

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/chrome.log"
WS_LOG="$LOG_DIR/websocat.log"
TEMP_PROFILE_DIR=""

cleanup() {
  if [[ $LEAVE_CHROME_RUNNING -eq 0 && -n "${CHROME_PID:-}" && -e "/proc/${CHROME_PID}" ]]; then
    kill "${CHROME_PID}" >/dev/null 2>&1 || true
    wait "${CHROME_PID}" >/dev/null 2>&1 || true
  fi
  if [[ $KEEP_PROFILE -eq 0 && -n "$TEMP_PROFILE_DIR" ]]; then
    rm -rf "$TEMP_PROFILE_DIR"
  fi
  rm -rf "$LOG_DIR"/tmp.$$ 2>/dev/null || true
}
trap cleanup EXIT

RUNS_IN_WSL=0
if is_wsl; then
  RUNS_IN_WSL=1
fi

if [[ "$RUNS_IN_WSL" -eq 1 ]]; then
  PORT=$((BASE_PORT - 1))
  PROXY_PORT=$BASE_PORT
fi

if [[ -n "${CHROME_BIN:-}" ]]; then
  SELECTED_CHROME="$CHROME_BIN"
elif [[ "$RUNS_IN_WSL" -eq 1 ]]; then
  for candidate in \
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  do
    if [[ -f "$candidate" ]]; then
      SELECTED_CHROME="$candidate"
      break
    fi
  done
else
  for candidate in google-chrome chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      SELECTED_CHROME="$candidate"
      break
    fi
  done
fi

if [[ -z "${SELECTED_CHROME:-}" ]]; then
  echo "Error: Chrome binary not found. Set CHROME_BIN." >&2
  exit 2
fi

if [[ "$RUNS_IN_WSL" -eq 1 ]]; then
  WINDOWS_GATEWAY="$(default_gateway)"
  if [[ -z "$WINDOWS_GATEWAY" ]]; then
    echo "Error: Unable to detect Windows gateway from 'ip route'." >&2
    exit 2
  fi
  echo "[info] Detected Windows gateway: $WINDOWS_GATEWAY"
  if ! ping -c 1 -W 1 "$WINDOWS_GATEWAY" >/dev/null 2>&1; then
    echo "Error: Unable to reach $WINDOWS_GATEWAY. Check WSL network." >&2
    exit 2
  fi

  WIN_HOME="$(windows_home)"
  if [[ -z "$WIN_HOME" ]]; then
    echo "Error: Cannot resolve Windows %%USERPROFILE%%." >&2
    exit 3
  fi
  WIN_TEST_DIR="${WIN_HOME}\\test_chrome_user"
  WSL_TEST_DIR="$(wslpath -u "$WIN_TEST_DIR")"
  mkdir -p "$WSL_TEST_DIR"
  USER_DATA_DIR="$WIN_TEST_DIR"
  echo "[info] Using Windows profile dir $USER_DATA_DIR"

  REMOTE_CIDR="$(GATEWAY_IP="$WINDOWS_GATEWAY" python3 - <<'PY'
import ipaddress, os
ip = os.environ["GATEWAY_IP"]
net = ipaddress.ip_network(f"{ip}/20", strict=False)
print(str(net))
PY
)"
  DEVTOOLS_HOST="$WINDOWS_GATEWAY"
  DEVTOOLS_PORT="$PROXY_PORT"
  REMOTE_DEBUG_ADDRESS="127.0.0.1"
else
  DEVTOOLS_HOST="127.0.0.1"
  DEVTOOLS_PORT="$PORT"
  REMOTE_DEBUG_ADDRESS="127.0.0.1"
fi

if [[ $FORCE_NEW_CHROME -eq 1 ]]; then
  echo "[info] --new-chrome specified, skipping existing session detection."
else
  if devtools_endpoint_ready "$DEVTOOLS_HOST" "$DEVTOOLS_PORT"; then
    REUSE_EXISTING_CHROME=1
    EXISTING_CHROME_PID="$(resolve_existing_chrome_pid "$PORT")"
    echo "[info] Detected existing Chrome DevTools at ${DEVTOOLS_HOST}:${DEVTOOLS_PORT}; reusing first page target."
  fi
fi

if [[ "$RUNS_IN_WSL" -eq 1 ]]; then
  if [[ $REUSE_EXISTING_CHROME -eq 0 ]]; then
    stop_windows_chrome
    reset_wsl_profile_state
    cleanup_portproxy_entry "$WINDOWS_GATEWAY" "$PROXY_PORT"
    cleanup_portproxy_entry "$WINDOWS_GATEWAY" "$LEGACY_PROXY_PORT"
    wait_for_windows_port_release "$PORT"
    wait_for_windows_port_release "$PROXY_PORT"
    ensure_windows_port_free "$PORT"
    ensure_windows_port_free "$PROXY_PORT"
    ensure_firewall_rule
    ensure_portproxy
  else
    echo "[info] Windows Chrome is already running on port $PORT, skipping restart."
  fi
else
  if [[ $REUSE_EXISTING_CHROME -eq 0 ]]; then
    if [[ $FORCE_NEW_CHROME -eq 1 ]]; then
      kill_local_chrome_on_port "$PORT"
    fi
    ensure_local_port_free "$PORT"
    TEMP_PROFILE_DIR="$(mktemp -d /tmp/web-cdp-profile.XXXXXX)"
    USER_DATA_DIR="$TEMP_PROFILE_DIR"
  else
    echo "[info] Local Chrome already listening on $DEVTOOLS_HOST:$DEVTOOLS_PORT, skipping restart."
  fi
fi

if [[ $REUSE_EXISTING_CHROME -eq 0 ]]; then
  CHROME_ARGS=(
    "--remote-debugging-port=$PORT"
    "--remote-debugging-address=$REMOTE_DEBUG_ADDRESS"
    "--user-data-dir=$USER_DATA_DIR"
    "--no-first-run"
    "--no-default-browser-check"
    "--disable-extensions"
    "--disable-plugins"
    "--disable-component-update"
    "--disable-session-crashed-bubble"
    "--disable-infobars"
    "--allow-insecure-localhost"
    "--allow-running-insecure-content"
    "--test-type"
    "--disable-popup-blocking"
    "--disable-features=TranslateUI"
    "about:blank"
  )

  if [[ "$RUNS_IN_WSL" -eq 0 ]]; then
    CHROME_ARGS+=("--headless=new" "--disable-gpu")
  fi

  echo "[info] Launching Chrome via $SELECTED_CHROME"
  "$SELECTED_CHROME" "${CHROME_ARGS[@]}" >"$LOG_FILE" 2>&1 &
  CHROME_PID=$!
else
  echo "[info] Reusing existing Chrome session."
  printf "[info] Reusing existing Chrome session.\n" >"$LOG_FILE"
fi

VERSION_URL="http://${DEVTOOLS_HOST}:${DEVTOOLS_PORT}/json/version"
for attempt in $(seq 1 30); do
  if devtools_curl "$VERSION_URL" >/dev/null; then
    READY=1
    break
  fi
  sleep 0.3
done

if [[ -z "${READY:-}" ]]; then
  echo "Error: DevTools endpoint not reachable at ${DEVTOOLS_HOST}:${DEVTOOLS_PORT}." >&2
  exit 4
fi

if [[ $BOOTSTRAP_ONLY -eq 1 ]]; then
  BOOTSTRAP_CHROME_PID="${CHROME_PID:-${EXISTING_CHROME_PID:-}}"
  cat <<EOF
devtools_host=$DEVTOOLS_HOST
devtools_port=$DEVTOOLS_PORT
chrome_pid=$BOOTSTRAP_CHROME_PID
chrome_log=$LOG_FILE
EOF
  exit 0
fi

LIST_URL="http://${DEVTOOLS_HOST}:${DEVTOOLS_PORT}/json"
TARGET_LIST="$(devtools_curl "$LIST_URL" || true)"
TARGET_JSON="$(
  printf '%s' "${TARGET_LIST:-[]}" | jq -cer 'map(select(.type=="page")) | .[0]' 2>/dev/null
)"
if [[ "$TARGET_JSON" == "null" ]]; then
  TARGET_JSON=""
fi

if [[ -z "$TARGET_JSON" ]]; then
  TARGET_URL="http://${DEVTOOLS_HOST}:${DEVTOOLS_PORT}/json/new?about:blank"
  TARGET_JSON="$(devtools_curl -X PUT "$TARGET_URL")"
fi

if [[ -z "$TARGET_JSON" ]]; then
  echo "Error: Failed to acquire CDP target." >&2
  exit 5
fi

WS_URL="$(printf '%s' "$TARGET_JSON" | jq -r '.webSocketDebuggerUrl // empty' 2>/dev/null)"
if [[ -z "$WS_URL" ]]; then
  echo "Error: Target response missing webSocketDebuggerUrl." >&2
  exit 6
fi

ACCESS_WS_URL="$WS_URL"
if [[ "$RUNS_IN_WSL" -eq 1 ]]; then
  ACCESS_WS_URL="${WS_URL/127.0.0.1:${PORT}/${DEVTOOLS_HOST}:${DEVTOOLS_PORT}}"
fi

ENABLE_MSG='{"id":1,"method":"Runtime.enable"}'
EVAL_MSG="$(jq -nc --arg expr "$EXPRESSION" '{id:2,method:"Runtime.evaluate",params:{expression:$expr,awaitPromise:true}}')"

coproc WS_CONN ( websocat -B 65536 "$ACCESS_WS_URL" )
WS_PID=$!
WS_STDIN=${WS_CONN[1]}
WS_STDOUT=${WS_CONN[0]}
exec {WS_IN}>&"$WS_STDIN"
exec {WS_OUT}<&"$WS_STDOUT"

ws_send() {
  printf '%s\n' "$1" >&$WS_IN
}

ws_send "$ENABLE_MSG"

: >"$WS_LOG"
context_ready=0
sent_eval=0
success=0
deadline=$((SECONDS + 10))

while (( SECONDS < deadline )); do
  if ! IFS= read -r -t 1 line <&$WS_OUT; then
    if ! kill -0 "$WS_PID" 2>/dev/null; then
      break
    fi
    continue
  fi
  echo "$line" | tee -a "$WS_LOG"
  if [[ $context_ready -eq 0 && "$line" == *'"Runtime.executionContextCreated"'* ]]; then
    context_ready=1
  fi
  if [[ $context_ready -eq 1 && $sent_eval -eq 0 ]]; then
    ws_send "$EVAL_MSG"
    sent_eval=1
  fi
  if [[ "$line" == *'Hello world from CDP'* ]]; then
    success=1
    break
  fi
  if [[ "$line" == *'"id":2'* && "$line" == *'"result"'* ]]; then
    success=1
    break
  fi
done

exec {WS_IN}>&-
kill "$WS_PID" >/dev/null 2>&1 || true
wait "$WS_PID" >/dev/null 2>&1 || true
exec {WS_OUT}<&-

echo "=== WebSocket log ==="
cat "$WS_LOG"
echo "====================="
echo "Logs stored in $LOG_DIR"

if [[ $success -eq 0 ]]; then
  echo "Warning: Expression executed but console output not observed before timeout." >&2
  exit 7
fi
