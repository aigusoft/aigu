#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDP_EVAL="$SCRIPT_DIR/cdp_eval.sh"

usage() {
  cat <<'USAGE'
Usage: cdp_dom.sh [options] <command> [command-options]

Commands:
  create        创建元素（支持 id/class/style/attr）并返回 JSON 信息。
  set-text      设置匹配元素的 textContent。
  set-attr      设置指定属性值。
  set-style     通过 cssText 批量设置样式。
  query         查询元素文本、outerHTML、样式、属性等。

Options:
      --log-dir DIR         Chrome 日志目录（默认临时目录）。
      --keep-profile        Linux 下保留临时 profile。
      --new-chrome          如已有调试进程，先关闭并重新启动新的实例。
  -h, --help                查看帮助。

脚本会根据 command 生成 DOM 操作 JS 表达式，并调用 `cdp_eval.sh --expression` 执行。
USAGE
}

json_escape() {
  jq -Rn --arg v "$1" '$v'
}

string_or_null() {
  local value="${1-}"
  if [[ -z "$value" ]]; then
    echo "null"
  else
    json_escape "$value"
  fi
}

comma_list_or_default() {
  local values="$1"
  local default_value="$2"
  if [[ -z "$values" ]]; then
    echo "$default_value"
    return
  fi
  jq -Rn --arg v "$values" '($v | split(",") | map(select(length>0) | ltrimstr(" ") | rtrimstr(" ")))' 
}

build_attrs_array() {
  local entries=("$@")
  if [[ ${#entries[@]} -eq 0 ]]; then
    echo "[]"
    return
  fi
  local json="["
  local first=1
  local attr name value
  for attr in "${entries[@]}"; do
    name="${attr%%=*}"
    value="${attr#*=}"
    if [[ $first -eq 0 ]]; then
      json+=", "
    else
      first=0
    fi
    json+="[ $(json_escape "$name"), $(json_escape "$value") ]"
  done
  json+="]"
  printf '%s' "$json"
}

build_create_expression() {
  local tag="" text="" parent_selector="" element_id="" class_name="" style_value=""
  local attributes=()
  while (($#)); do
    case "$1" in
      --tag) shift; tag="$1" ;;
      --text) shift; text="$1" ;;
      --parent-selector) shift; parent_selector="$1" ;;
      --id) shift; element_id="$1" ;;
      --class) shift; class_name="$1" ;;
      --style) shift; style_value="$1" ;;
      --attr) shift; attributes+=("$1") ;;
      *) echo "Unknown create option: $1" >&2; exit 22 ;;
    esac
    shift || true
  done
  if [[ -z "$tag" ]]; then
    echo "create 命令需要 --tag" >&2
    exit 22
  fi
  local tag_js text_js parent_js id_js class_js style_js attrs_js
  tag_js="$(json_escape "$tag")"
  text_js="$(string_or_null "$text")"
  parent_js="$(string_or_null "$parent_selector")"
  id_js="$(string_or_null "$element_id")"
  class_js="$(string_or_null "$class_name")"
  style_js="$(string_or_null "$style_value")"
  attrs_js="$(build_attrs_array "${attributes[@]}")"
  cat <<EOF
(() => {
  const parentSelector = ${parent_js};
  const parent = parentSelector ? document.querySelector(parentSelector) : document.body;
  const targetParent = parent || document.body;
  const el = document.createElement(${tag_js});
  const initialId = ${id_js};
  if (initialId) {
    el.id = initialId;
  }
  const className = ${class_js};
  if (className) {
    el.className = className;
  }
  const initialText = ${text_js};
  if (initialText !== null) {
    el.textContent = initialText;
  }
  const cssText = ${style_js};
  if (cssText) {
    el.style.cssText = cssText;
  }
  const attrList = ${attrs_js};
  attrList.forEach(([name, value]) => {
    el.setAttribute(name, value);
  });
  targetParent.appendChild(el);
  const result = {
    action: "create",
    selector: el.id ? ('#' + el.id) : null,
    text: el.textContent,
    html: el.outerHTML,
    attributes: Array.from(el.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {})
  };
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
})()
EOF
}

build_set_text_expression() {
  local selector="" text=""
  while (($#)); do
    case "$1" in
      --selector) shift; selector="$1" ;;
      --text) shift; text="$1" ;;
      *) echo "Unknown set-text option: $1" >&2; exit 22 ;;
    esac
    shift || true
  done
  if [[ -z "$selector" || -z "$text" ]]; then
    echo "set-text 需要 --selector 与 --text" >&2
    exit 22
  fi
  local selector_js text_js
  selector_js="$(json_escape "$selector")"
  text_js="$(json_escape "$text")"
  cat <<EOF
(() => {
  const el = document.querySelector(${selector_js});
  if (!el) {
    return JSON.stringify({ action: "set-text", selector: ${selector_js}, updated: false });
  }
  el.textContent = ${text_js};
  const result = { action: "set-text", selector: ${selector_js}, updated: true, text: el.textContent };
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
})()
EOF
}

build_set_attr_expression() {
  local selector="" name="" value=""
  while (($#)); do
    case "$1" in
      --selector) shift; selector="$1" ;;
      --name) shift; name="$1" ;;
      --value) shift; value="$1" ;;
      *) echo "Unknown set-attr option: $1" >&2; exit 22 ;;
    esac
    shift || true
  done
  if [[ -z "$selector" || -z "$name" ]]; then
    echo "set-attr 需要 --selector 与 --name" >&2
    exit 22
  fi
  local selector_js name_js value_js
  selector_js="$(json_escape "$selector")"
  name_js="$(json_escape "$name")"
  value_js="$(json_escape "$value")"
  cat <<EOF
(() => {
  const el = document.querySelector(${selector_js});
  if (!el) {
    return JSON.stringify({ action: "set-attr", selector: ${selector_js}, updated: false });
  }
  el.setAttribute(${name_js}, ${value_js});
  const attributes = Array.from(el.attributes).reduce((acc, attr) => {
    acc[attr.name] = attr.value;
    return acc;
  }, {});
  const result = { action: "set-attr", selector: ${selector_js}, updated: true, attributes };
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
})()
EOF
}

build_set_style_expression() {
  local selector="" style_value=""
  while (($#)); do
    case "$1" in
      --selector) shift; selector="$1" ;;
      --style) shift; style_value="$1" ;;
      *) echo "Unknown set-style option: $1" >&2; exit 22 ;;
    esac
    shift || true
  done
  if [[ -z "$selector" || -z "$style_value" ]]; then
    echo "set-style 需要 --selector 与 --style" >&2
    exit 22
  fi
  local selector_js style_js
  selector_js="$(json_escape "$selector")"
  style_js="$(json_escape "$style_value")"
  cat <<EOF
(() => {
  const el = document.querySelector(${selector_js});
  if (!el) {
    return JSON.stringify({ action: "set-style", selector: ${selector_js}, updated: false });
  }
  el.style.cssText = ${style_js};
  const result = { action: "set-style", selector: ${selector_js}, updated: true, style: el.style.cssText };
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
})()
EOF
}

build_query_expression() {
  local selector="" styles=""
  while (($#)); do
    case "$1" in
      --selector) shift; selector="$1" ;;
      --styles) shift; styles="$1" ;;
      *) echo "Unknown query option: $1" >&2; exit 22 ;;
    esac
    shift || true
  done
  if [[ -z "$selector" ]]; then
    echo "query 需要 --selector" >&2
    exit 22
  fi
  local selector_js style_array
  selector_js="$(json_escape "$selector")"
  style_array="$(comma_list_or_default "$styles" '["color"]')"
  cat <<EOF
(() => {
  const el = document.querySelector(${selector_js});
  if (!el) {
    return JSON.stringify({ action: "query", selector: ${selector_js}, exists: false });
  }
  const styles = ${style_array};
  const computed = window.getComputedStyle(el);
  const styleValues = {};
  styles.forEach((prop) => {
    styleValues[prop] = computed.getPropertyValue(prop);
  });
  const result = {
    action: "query",
    selector: ${selector_js},
    exists: true,
    text: el.textContent,
    html: el.outerHTML,
    styles: styleValues,
    attributes: Array.from(el.attributes).reduce((acc, attr) => {
      acc[attr.name] = attr.value;
      return acc;
    }, {})
  };
  console.log(JSON.stringify(result));
  return JSON.stringify(result);
})()
EOF
}

GLOBAL_ARGS=()
COMMAND=""
while (($#)); do
  case "$1" in
    --log-dir)
      shift
      [[ $# -gt 0 ]] || { echo "--log-dir 需要参数" >&2; exit 22; }
      GLOBAL_ARGS+=(--log-dir "$1")
      ;;
    --keep-profile)
      GLOBAL_ARGS+=(--keep-profile)
      ;;
    --new-chrome)
      GLOBAL_ARGS+=(--new-chrome)
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    create|set-text|set-attr|set-style|query)
      COMMAND="$1"
      shift
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 22
      ;;
  esac
  shift || true
  if [[ $# -eq 0 ]]; then
    break
  fi
  continue
done

if [[ -z "$COMMAND" ]]; then
  usage
  exit 22
fi

GLOBAL_ARGS+=(--leave-browser)
COMMAND_ARGS=("$@")
case "$COMMAND" in
  create)
    EXPRESSION="$(build_create_expression "${COMMAND_ARGS[@]}")"
    ;;
  set-text)
    EXPRESSION="$(build_set_text_expression "${COMMAND_ARGS[@]}")"
    ;;
  set-attr)
    EXPRESSION="$(build_set_attr_expression "${COMMAND_ARGS[@]}")"
    ;;
  set-style)
    EXPRESSION="$(build_set_style_expression "${COMMAND_ARGS[@]}")"
    ;;
  query)
    EXPRESSION="$(build_query_expression "${COMMAND_ARGS[@]}")"
    ;;
  *)
    echo "Unsupported command: $COMMAND" >&2
    exit 22
    ;;
esac

if [[ -z "${EXPRESSION:-}" ]]; then
  echo "构建 DOM 操作表达式失败" >&2
  exit 1
fi

exec "$CDP_EVAL" "${GLOBAL_ARGS[@]}" --expression "$EXPRESSION"
