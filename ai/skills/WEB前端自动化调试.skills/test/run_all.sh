#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$TEST_ROOT/.." && pwd)"
CDP_SCRIPT="$SKILL_ROOT/tools/cdp_eval.sh"

timestamp="${TEST_SESSION_TIMESTAMP:-$(date +%Y%m%d_%H%M%S)}"
SESSIONS_ROOT="$TEST_ROOT/sessions"
SESSION_DIR="$SESSIONS_ROOT/$timestamp"
CASES_SRC_DIR="$TEST_ROOT/cases"

mkdir -p "$SESSIONS_ROOT" "$SESSION_DIR"
LOGS_DIR="$SESSION_DIR/logs"
mkdir -p "$LOGS_DIR"
chmod +x "$CASES_SRC_DIR"/*.sh
ORIG_PATH="${ORIG_PATH:-$PATH}"

README_PATH="$SESSION_DIR/README.md"
cat >"$README_PATH" <<EOF
# WEB前端自动化调试.skills 测试会话

- 会话时间戳：$timestamp
- 技能路径：$SKILL_ROOT
- 自动生成脚本：$(basename "$0")
- 所有测试输出集中在 logs/ 子目录中。
- 复现方式：在仓库根目录执行 \`bash skills/WEB前端自动化调试.skills/test/run_all.sh\`
EOF

declare -a CASE_NAMES CASE_DESCS CASE_RESULTS CASE_LOGS CASE_DURATIONS

for case_script in "$CASES_SRC_DIR"/*.sh; do
  case_name="$(basename "$case_script" .sh)"
  case_desc="$(grep -m1 '^# DESC:' "$case_script" | sed 's/^# DESC: //')"
  CASE_ARTIFACT_DIR="$LOGS_DIR/$case_name"
  mkdir -p "$CASE_ARTIFACT_DIR"
  case_log="$CASE_ARTIFACT_DIR/case.log"
  start_ts=$(date +%s)
  if SKILL_ROOT="$SKILL_ROOT" \
    SESSION_DIR="$SESSION_DIR" \
    LOGS_DIR="$LOGS_DIR" \
    CASE_ARTIFACT_DIR="$CASE_ARTIFACT_DIR" \
    ORIG_PATH="$ORIG_PATH" \
    CASE_NAME="$case_name" \
    CASE_DESC="$case_desc" \
    CDP_SCRIPT="$CDP_SCRIPT" \
    bash "$case_script" >"$case_log" 2>&1; then
    result="PASS"
  else
    result="FAIL"
  fi
  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))
  CASE_NAMES+=("$case_name")
  CASE_DESCS+=("$case_desc")
  CASE_RESULTS+=("$result")
  CASE_LOGS+=("logs/${case_name}/case.log")
  CASE_DURATIONS+=("$duration")
done

passed=0
for r in "${CASE_RESULTS[@]}"; do
  if [[ "$r" == "PASS" ]]; then
    ((passed+=1))
  fi
done
total="${#CASE_RESULTS[@]}"

UNAME_STR="$(uname -a)"
BASH_VER="$BASH_VERSION"

cat >"$SESSION_DIR/meta.json" <<EOF
{
  "timestamp": "$timestamp",
  "cases_total": $total,
  "cases_passed": $passed,
  "uname": "$UNAME_STR",
  "bash_version": "$BASH_VER"
}
EOF

REPORT_PATH="$SESSION_DIR/report.md"
cat >"$REPORT_PATH" <<EOF
# WEB前端自动化调试.skills 功能测试报告

- **会话时间**：$timestamp
- **执行脚本**：test/run_all.sh
- **环境**：$UNAME_STR
- **Bash**：$BASH_VER
- **结果**：$passed / $total 用例通过

| 用例 | 描述 | 结果 | 时长(s) | 日志 |
| --- | --- | --- | --- | --- |
EOF

for idx in "${!CASE_NAMES[@]}"; do
  printf '| %s | %s | %s | %s | %s |\n' \
    "${CASE_NAMES[$idx]}" \
    "${CASE_DESCS[$idx]}" \
    "${CASE_RESULTS[$idx]}" \
    "${CASE_DURATIONS[$idx]}" \
    "${CASE_LOGS[$idx]}" >>"$REPORT_PATH"
done

cat >>"$REPORT_PATH" <<'EOF'

## 备注

- 所有用例均直接调用 `tools/cdp_eval.sh`，需要确保宿主系统具备 Chrome/Chromium 并允许运行 CDP。
- 若在 WSL 中执行，请确认 Windows Chrome 可正常开启并允许脚本控制远程调试端口。
EOF

cat >>"$README_PATH" <<EOF

- 用例数量：$total
- 通过数量：$passed
- 报告：report.md
- 日志：logs/
EOF

echo "测试完成。会话目录：$SESSION_DIR"
echo "报告：$REPORT_PATH"
