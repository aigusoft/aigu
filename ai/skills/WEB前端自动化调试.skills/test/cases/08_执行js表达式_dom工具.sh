#!/usr/bin/env bash
set -euo pipefail
# DESC: DOM 工具可创建/查询节点并修改样式

: "${CDP_SCRIPT:?}"  # 占位，run_all 仍会提供该变量
: "${CASE_ARTIFACT_DIR:?}"

DOM_SCRIPT="${CDP_SCRIPT%/*}/cdp_dom.sh"
LOG1="$CASE_ARTIFACT_DIR/create.txt"
LOG2="$CASE_ARTIFACT_DIR/set_style.txt"
LOG3="$CASE_ARTIFACT_DIR/query.txt"

"$DOM_SCRIPT" --new-chrome create --tag h1 --id dom-tool --text "Hello DOM" --attr "data-source=test" >"$LOG1"
"$DOM_SCRIPT" set-style --selector "#dom-tool" --style "color: red; font-size: 24px" >"$LOG2"
"$DOM_SCRIPT" query --selector "#dom-tool" --styles "color,font-size" >"$LOG3"

RESULT_LINE="$(grep -m1 '"id":2' "$LOG3" || true)"
if [[ -z "$RESULT_LINE" ]]; then
  echo "未捕获到 DOM query 输出" >&2
  exit 1
fi

DOM_JSON="$(printf '%s' "$RESULT_LINE" | jq '.result.result.value' 2>/dev/null || true)"
if [[ -z "$DOM_JSON" ]]; then
  echo "DOM query 结果为空" >&2
  exit 1
fi

printf '%s' "$DOM_JSON" | jq -e '
  fromjson
  | select(.exists == true)
  | select(.text == "Hello DOM")
  | select(.attributes["data-source"] == "test")
  | select(.styles.color == "rgb(255, 0, 0)")
' >/dev/null
