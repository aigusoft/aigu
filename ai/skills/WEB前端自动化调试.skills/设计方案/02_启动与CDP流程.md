# 启动与 CDP 流程

## 启动流程
1. **环境探测**：脚本读取 `/proc/version` 判断是否为 WSL，并寻找 Chrome 可执行文件。
2. **WSL 专用逻辑**：
   - 探测默认网关并 PING 校验；查询 Windows 用户目录并定位 `test_chrome_user`。
   - 调用 `reset_wsl_profile_state` 清理 `Singleton*` 文件、同步 `Preferences` 的 `exit_type=Normal`。
   - 停止所有 `chrome.exe` 进程，删除旧端口映射，重新创建端口代理与防火墙规则。
3. **Linux 逻辑**：在 `/tmp` 创建临时 profile 并确保 9222 端口空闲。
4. **启动 Chrome**：带上统一参数（禁用扩展、插件、更新、提示等）并导航到 `about:blank`。
5. **等待 DevTools 可用**：轮询 `http://<host>:<port>/json/version`，最长 30 次。

## 操作指南
1. **打开浏览器并准备端口**
   ```bash
   ./WEB前端自动化调试.skills/tools/cdp_eval.sh --bootstrap-only
   ```
   - Linux：Chrome 在 headless 模式监听 `127.0.0.1:9222`。
   - WSL：脚本自动处理 Windows 防火墙与 `netsh interface portproxy`，对外仍使用 `<默认路由>:9222`。
   - 再次执行脚本时会先探测是否已有带远程调试端口的 Chrome 打开，若存在则直接复用当前窗口并选择第一个 tab 作为 target。
   - 若必须重新初始化（例如需要干净 profile 或磁盘缓存），可附加 `--new-chrome`，脚本会关闭现有调试进程后再启动新实例。执行成功后会输出 `devtools_host/devtools_port/chrome_pid/chrome_log` 供后续脚本复用。

2. **复用会话与清理**
   - 重新运行 `--bootstrap-only` 时，脚本会优先复用现有远程调试会话，不会自动终止旧的 Chrome 实例。
   - 需要全新环境时，执行 `./tools/cdp_eval.sh --new-chrome --bootstrap-only`。脚本会先停止当前调试进程，再输出新的 `devtools_host/devtools_port/chrome_pid/chrome_log`。
   - Linux 原生环境可直接 `kill <chrome_pid>`；WSL 用户需在 Windows 侧运行 `Stop-Process -Id <chrome_pid>` 或 `taskkill /PID <chrome_pid> /F`，否则无法结束该进程。
   - 如需长时间保留 Linux profile，可在首次运行时附加 `--keep-profile`，按需手动删除 `/tmp/web-cdp-profile.*`。
   - WSL 模式下，脚本会自动清理 `Singleton*` 文件并将 `Preferences` 中的 `exit_type` 设为 `Normal`，避免 “Chrome 未正确关闭” 提示。

## 命令行参数
| 参数 | 作用 |
| --- | --- |
| `--bootstrap-only` | 仅启动浏览器与端口，输出 `devtools_host/devtools_port/chrome_pid/chrome_log`，不执行任何 JS。|
| `-e/--expression` | 以 `Runtime.evaluate` 执行 JS，默认打印 “Hello world from CDP”。|
| `--log-dir` | 指定日志保存目录，便于 CI 或长时间调试。|
| `--keep-profile` | Linux 下保留临时 profile，避免重复冷启动。|

## CDP 会话设计
1. 通过 `/json` 读取已存在的 `page` target，若没有则 `PUT /json/new?about:blank`。
2. 使用 websocat 打开 `webSocketDebuggerUrl`，先执行 `Runtime.enable`，再发送 `Runtime.evaluate`。
3. 在 10 秒窗口内收集 `Runtime.consoleAPICalled`、`id:2` 的返回值，若超时则提示失败。
4. 所有 WebSocket 交互打印到终端并写入 `websocat.log`，用于排障。

## 安全与提示抑制
- 禁用扩展、插件、组件更新、Translate UI、信息条、崩溃提示，保证自动化执行稳定。
- 通过 `--allow-insecure-localhost` 与 `--allow-running-insecure-content` 支持自签名证书。
- `--disable-popup-blocking` 确保 JS `window.open` 等行为不受限制（如后续扩展需要）。

## 资源回收
- 默认在脚本结束时终止 Chrome 并清理临时目录，若添加 `--bootstrap-only` 则由调用者负责回收。
- WSL 用户可在 Windows PowerShell 运行：
  ```powershell
  netsh interface portproxy delete v4tov4 listenaddress=<默认路由> listenport=9222
  netsh advfirewall firewall delete rule name="WSL-Chrome-Debug"
  ```
  以移除自动创建的网络规则。
