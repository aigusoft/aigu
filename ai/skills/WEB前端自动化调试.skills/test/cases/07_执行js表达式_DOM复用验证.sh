#!/usr/bin/env bash
set -euo pipefail
# DESC: 复用同一 Chrome，连续操作 DOM 并验证结果

: "${CDP_SCRIPT:?}"
: "${CASE_ARTIFACT_DIR:?}"

mkdir -p "$CASE_ARTIFACT_DIR"
BOOTSTRAP_ENV="$CASE_ARTIFACT_DIR/bootstrap.env"
STEP1_OUT="$CASE_ARTIFACT_DIR/step1.txt"
STEP2_OUT="$CASE_ARTIFACT_DIR/step2.txt"
STEP3_OUT="$CASE_ARTIFACT_DIR/step3.txt"
VERIFY_OUT="$CASE_ARTIFACT_DIR/verify.txt"
CLEANUP_LOG="$CASE_ARTIFACT_DIR/cleanup.log"

cleanup() {
  "$CDP_SCRIPT" --new-chrome >"$CLEANUP_LOG" 2>&1 || true
}
trap cleanup EXIT

"$CDP_SCRIPT" --new-chrome --bootstrap-only >"$BOOTSTRAP_ENV"

JS_CREATE_FIRST="$(cat <<'EOF'
(() => {
  const el = document.createElement("h1");
  el.id = "multi-h1-1";
  el.textContent = "Hello 1";
  document.body.appendChild(el);
  console.log("Created Hello 1");
})()
EOF
)"

JS_CREATE_SECOND="$(cat <<'EOF'
(() => {
  const el = document.createElement("h1");
  el.id = "multi-h1-2";
  el.textContent = "Hello 2";
  document.body.appendChild(el);
  console.log("Created Hello 2");
})()
EOF
)"

JS_UPDATE_COLOR="$(cat <<'EOF'
(() => {
  ["multi-h1-1", "multi-h1-2"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.color = "red";
    }
  });
  console.log("Updated colors");
})()
EOF
)"

JS_VERIFY="$(cat <<'EOF'
(() => {
  const data = ["multi-h1-1", "multi-h1-2"].map((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    return {
      id,
      text: el.textContent,
      color: getComputedStyle(el).color,
    };
  });
  const payload = JSON.stringify(data);
  console.log(payload);
  return payload;
})()
EOF
)"

"$CDP_SCRIPT" --expression "$JS_CREATE_FIRST" >"$STEP1_OUT"
"$CDP_SCRIPT" --expression "$JS_CREATE_SECOND" >"$STEP2_OUT"
"$CDP_SCRIPT" --expression "$JS_UPDATE_COLOR" >"$STEP3_OUT"
"$CDP_SCRIPT" --expression "$JS_VERIFY" >"$VERIFY_OUT"

VERIFY_LINE="$(grep -m1 -E '^\{"id":2,"result"' "$VERIFY_OUT" || true)"
if [[ -z "$VERIFY_LINE" ]]; then
  echo "未捕获到 Runtime.evaluate 返回行" >&2
  exit 1
fi

PAYLOAD="$(printf '%s\n' "$VERIFY_LINE" | jq -r '.result.result.value' 2>/dev/null || true)"
if [[ -z "$PAYLOAD" || "$PAYLOAD" == "null" ]]; then
  echo "返回值缺失或解析失败" >&2
  exit 1
fi

printf '%s\n' "$PAYLOAD" | jq -e '
  (length == 2) and
  .[0].text == "Hello 1" and
  .[1].text == "Hello 2" and
  .[0].color == "rgb(255, 0, 0)" and
  .[1].color == "rgb(255, 0, 0)"
' >/dev/null
