## 默认表达式调试
```bash
./WEB前端自动化调试.skills/tools/cdp_eval.sh
```
- 自动创建 page target、执行 “Hello world from CDP” 表达式。
- 标准输出可看到 `Runtime.consoleAPICalled`，日志位于命令结尾提示的目录（默认 `/tmp/web-cdp-logs.*`）。

## 自定义表达式
```bash
./WEB前端自动化调试.skills/tools/cdp_eval.sh \
  --log-dir ./logs/dev-session \
  --expression '(() => { const msg = "Custom"; console.log(msg); return msg; })()'
```
- `--expression/-e` 接收任意可序列化 JavaScript。
- `--log-dir` 指向固定目录，便于在 CI 中持久化 `chrome.log` 与 `websocat.log`。

## 提示
- 脚本会在启动前探测是否已有开启远程调试端口的 Chrome，若检测到会直接复用该窗口的第一个 tab。通常先执行一次 `--bootstrap-only`，随后即可在同一窗口内串行执行多个测试。
- 若需要彻底重置浏览器状态，请附加 `--new-chrome`，脚本会终止当前调试进程后再启动新的实例。
- 诊断失败时使用 `tail -f <log-dir>/websocat.log` 查看 CDP 交互。
