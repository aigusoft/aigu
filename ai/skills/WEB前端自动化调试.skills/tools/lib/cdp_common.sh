# shellcheck shell=bash

if [[ -z "${CDP_COMMON_IMPORTED:-}" ]]; then
  CDP_COMMON_IMPORTED=1

  is_wsl() {
    grep -qi microsoft /proc/version 2>/dev/null
  }

  default_gateway() {
    ip route | awk '/default/ {print $3; exit}'
  }

  ensure_local_port_free() {
    local port="$1"
    if ss -tulpn 2>/dev/null | grep -E "[.:]${port} " >/dev/null; then
      echo "Error: local port $port already in use." >&2
      exit 20
    fi
  }

  windows_port_in_use() {
    local port="$1"
    local result
    result="$(powershell.exe -NoLogo -NoProfile -Command "netstat -ano | Select-String ':$port ' | Select-String LISTENING" 2>/dev/null | tr -d '\r')"
    [[ -n "$result" ]]
  }

  ensure_windows_port_free() {
    local port="$1"
    if windows_port_in_use "$port"; then
      echo "Error: Windows port $port already in use." >&2
      exit 20
    fi
  }

  wait_for_windows_port_release() {
    local port="$1"
    for _ in $(seq 1 10); do
      if ! windows_port_in_use "$port"; then
        return
      fi
      sleep 0.3
    done
    echo "Error: Windows port $port still busy." >&2
    exit 21
  }

  windows_home() {
    powershell.exe -NoLogo -NoProfile -Command "[Environment]::GetFolderPath('UserProfile')" 2>/dev/null | tr -d '\r'
  }

  stop_windows_chrome() {
    powershell.exe -NoLogo -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force" >/dev/null 2>&1 || true
  }

  ensure_firewall_rule() {
    echo "[info] Ensuring firewall rule 'WSL-Chrome-Debug' uses port ${PROXY_PORT}..."
    win_cmd netsh advfirewall firewall delete rule name="WSL-Chrome-Debug" >/dev/null 2>&1 || true
    win_cmd netsh advfirewall firewall add rule name="WSL-Chrome-Debug" dir=in action=allow protocol=TCP localport="${PROXY_PORT}" remoteip="${REMOTE_CIDR}" >/dev/null
  }

  cleanup_portproxy_entry() {
    local listen_address="$1"
    local listen_port="$2"
    win_cmd netsh interface portproxy delete v4tov4 listenaddress="${listen_address}" listenport="${listen_port}" >/dev/null 2>&1 || true
  }

  ensure_portproxy() {
    echo "[info] Ensuring portproxy ${WINDOWS_GATEWAY}:${PROXY_PORT} -> 127.0.0.1:${PORT}..."
    cleanup_portproxy_entry "$WINDOWS_GATEWAY" "$PROXY_PORT"
    cleanup_portproxy_entry "$WINDOWS_GATEWAY" "$LEGACY_PROXY_PORT"
    win_cmd netsh interface portproxy add v4tov4 listenaddress="${WINDOWS_GATEWAY}" listenport="${PROXY_PORT}" connectaddress=127.0.0.1 connectport="${PORT}" >/dev/null
  }

  devtools_curl() {
    curl -s "$@"
  }

  devtools_endpoint_ready() {
    local host="$1"
    local port="$2"
    if devtools_curl --max-time 1 -f "http://${host}:${port}/json/version" >/dev/null 2>&1; then
      return 0
    fi
    return 1
  }

  linux_listen_pids() {
    local port="$1"
    if ! command -v ss >/dev/null 2>&1; then
      return
    fi
    ss -tulpn 2>/dev/null | awk -v port="$port" '
      $5 ~ (":" port "$") {
        match($0, /pid=([0-9]+)/, m)
        if (m[1]) print m[1]
      }
    ' | sort -u
  }

  windows_listen_pids() {
    local port="$1"
    local script
    printf -v script '%s' "\$p=$port; \$pattern = ':' + \$p + ' '; \$match = netstat -ano | Select-String \$pattern | Select-Object -First 1; if (\$match) { \$line = \$match.ToString().Trim(); \$parts = \$line -split '\\\\s+'; if (\$parts.Length -gt 0) { Write-Output \$parts[-1] } }"
    powershell.exe -NoLogo -NoProfile -Command "$script" 2>/dev/null | tr -d '\r'
  }

  resolve_existing_chrome_pid() {
    local port="$1"
    local pid=""
    if [[ "${RUNS_IN_WSL:-0}" -eq 1 ]]; then
      pid="$(windows_listen_pids "$port" | head -n1 || true)"
    else
      pid="$(linux_listen_pids "$port" | head -n1 || true)"
    fi
    echo "$pid"
  }

  kill_local_chrome_on_port() {
    local port="$1"
    local pids=()
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && pids+=("$pid")
    done < <(linux_listen_pids "$port")
    if [[ "${#pids[@]}" -eq 0 ]]; then
      return
    fi
    for pid in "${pids[@]}"; do
      echo "[info] Terminating process $pid listening on port $port"
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    done
  }

  reset_wsl_profile_state() {
    local pref_path="$WSL_TEST_DIR/Default/Preferences"
    mkdir -p "$(dirname "$pref_path")"
    local tmp_file="${pref_path}.tmp"
    if [[ -s "$pref_path" ]] && jq '(.profile //= {}) | (.profile.exit_type = "Normal") | (.exit_type = "Normal")' "$pref_path" >"$tmp_file" 2>/dev/null; then
      mv "$tmp_file" "$pref_path"
    else
      cat >"$pref_path" <<'JSON'
{"profile":{"exit_type":"Normal"},"exit_type":"Normal"}
JSON
    fi
    rm -f "$tmp_file" 2>/dev/null || true
    rm -f "$WSL_TEST_DIR"/Singleton{Lock,Cookie,Socket} 2>/dev/null || true
  }

  win_cmd() {
    (cd /mnt/c/Windows/System32 >/dev/null 2>&1 && cmd.exe /c "$@")
  }
fi
