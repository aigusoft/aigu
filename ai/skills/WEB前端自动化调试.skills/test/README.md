# WEB前端自动化调试.skills 测试套件

该目录收录 `tools/cdp_eval.sh` 的端到端功能测试。所有测试由 `run_all.sh` 统一驱动，执行流程如下：

1. 运行 `bash skills/WEB前端自动化调试.skills/test/run_all.sh`。
2. 脚本会在 `test/sessions/<yyyymmdd_hhmmss>/` 下创建独立会话目录，仅输出会话元信息与 `logs/` 日志。
3. 各测试脚本始终从 `test/cases/` 运行，所有 stdout/stderr 及额外产物（CDP 日志、WebSocket dump 等）都归档至 `logs/<case>/`。
4. 执行完成后自动生成 `report.md` 与 `meta.json` 描述结果及环境。

## 预置条件

- 具备可执行的 Chrome/Chromium（Linux）或 Windows Chrome（WSL），且允许远程调试端口 9222（脚本会在 WSL 内部自动占用 9221 供 Chrome 使用，并在 9222 暴露代理）。
- 系统需安装 `curl`, `websocat`, `python3`, `jq`。
- 在 WSL 中运行前需确认拥有权限创建/删除防火墙规则及 `netsh interface portproxy`。

## 用例覆盖

| 用例脚本 | 功能点 |
| --- | --- |
| `00_工具入口_帮助信息.sh` | `--help` 输出完整性 |
| `01_工具入口_参数校验.sh` | 参数校验与错误码 |
| `02_执行js表达式_默认输出.sh` | 默认表达式执行、日志采集 |
| `03_执行js表达式_自定义输出.sh` | 自定义表达式透传 |
| `04_启动与端口准备_仅初始化.sh` | `--bootstrap-only` 输出与资源清理 |
| `05_手动会话_手动交互.sh` | bootstrap 后手动调用 CDP API |
| `06_启动与端口准备_复用与重启.sh` | 复用现有调试实例并验证 `--new-chrome` |
| `07_执行js表达式_DOM复用验证.sh` | 多次执行脚本复用同一浏览器并修改 DOM |
| `08_执行js表达式_dom工具.sh` | 使用 DOM 工具脚本创建/查询节点 |

> 注：脚本命名沿用了最初的 stub 设计，为避免破坏已有引用，暂未更名。用例内容均已改为真实浏览器验证并将所有产物写入 `logs/`。
