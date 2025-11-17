# 13｜CLI 与开发流程

`@wcex/cli` 为 WCEX 项目提供从初始化、开发调试到构建发布的完整工具链。本章聚焦命令说明、热更新机制、自动依赖安装以及测试流程细节。

## 13.1 安装与版本
```bash
pnpm i -g @wcex/cli typescript
wcex -V               # 查看版本与描述
```
CLI 采用 `commander` 构建，可通过 `wcex --help` 查看全局选项。

## 13.2 `wcex init`
在当前目录创建新的 Web Component 项目：
```bash
wcex init --dir . --template basic
```
- 默认生成 `package.json`、`src/` 示例、`tsconfig.json` 等文件。
- 可自定义目标目录 `--dir`，`--template` 接受布尔值或模板名称（内置 `basic`、`ts` 等模板）。

## 13.3 `wcex dev`
启动开发服务器并提供热更新：
```bash
wcex dev --dir . --port 8101 --host 127.0.0.1 --proxy /api=http://localhost:5000 --npm pnpm
```
### 功能要点
- **静态服务**：基于 Express，将以下目录挂载：
  - `/` → `build/src`（生成的 JS）、`src`、项目根。
  - `/node_modules/<pkg-name>` / `/npm/<pkg-name>` → 对应包资源。
  - `/_dist` → `dist` 目录，便于调试构建产物。
- **热更新**：Watchpack 监听项目目录，变更后通过 WebSocket (`/_hotws`) 推送 `{project,path}` 消息。浏览器端收到后可触发局部刷新或加载新脚本。
- **TypeScript watch**：若存在 `tsconfig.json`，自动运行 `tsc -w`，输出至 `build/`。
- **自动依赖安装**：调用 `parseHtmlModules` 扫描 HTML 中的 `<meta name="module">`，缺失时根据锁文件选择 `pnpm`/`yarn`/`npm` 安装，并根据包元信息补充 `@types/*`。
- **代理**：`--proxy "/api=http://localhost:5000"` 使用 `http-proxy` 转发请求，适合后端联调。支持自定义 Host 与 HTTPS 放行。
- **全局变量**：将 `process.env.NODE_TLS_REJECT_UNAUTHORIZED` 设为 `0`，确保在开发阶段可访问自签 HTTPS 服务。

### 热更新流程示意
```text
文件变更 -> Watchpack -> 通知 CLI -> WebSocket 广播 -> 浏览器触发 wc-hotload -> 组件刷新/重载
```
示例组件（Playground）会在收到 `wc-hotload` 时刷新 iframe。

## 13.4 `wcex build`
```bash
wcex build --dir . --pack-dir ./pkg
```
- **版本递增**：将 `package.json` 的补丁版本（第三位）自动 +1，写回源文件并复制到 `dist/package.json`。
- **TypeScript 构建**：若存在 `tsconfig.json`，先运行 `tsc` 单次编译，输出至 `build/`。
- **文件遍历**：递归 `src/`，根据后缀处理：
  - `.html` → `html-minifier-terser` 压缩，移除 `<meta name="hot">` / `<meta name="debug">`。
  - `.ts` → 读取 `build/src` 中对应 `.js`，使用 `terser` 压缩。
  - `.js` → 直接压缩。
  - 其他文件 → 原样复制。
- **依赖清单**：在未来版本将支持自动汇总 `<meta name="module">` 依赖写入 `package.json`（目前主要在 CLI 扩展中处理）。

## 13.5 `wcex pack`
```bash
wcex pack --dir . --pack-dir ./package --deep
```
- 在执行 `wcex build` 后，将项目与所有依赖（含 `node_modules`、`dist`）复制到目标目录，便于离线部署。
- `--deep` 表示递归打包依赖树，适用于组件库或需要携带二次依赖的场景。

## 13.6 `wcex test`
```bash
wcex test --dir test --browser chrome --show --concurrent 3
```
- 利用 `puppeteer-core` 启动浏览器，遍历 `test` 目录下包含 `testEntry.html` 的子目录。
- 对于每个用例：
  1. 在 Express 中挂载测试目录为静态资源根。
  2. 自动注入 `meta name="npm"` 与 `<script src=".../wcex/index.js">`，也可通过 `--index-url` 指定自定义入口。
  3. 打开浏览器页面，监听 `console` 与 `pageerror`，出现 `assert`/`error` 即视为失败。
  4. 页面需在完成后输出 `WCEX_TEST_END` 到控制台，以通知 CLI 结束测试。
- 支持配置窗口尺寸（`page.json`）、并发数、浏览器可执行路径等。

## 13.7 服务模块构建 (`module.json`)
若项目包含 `module.json`，`wcex build` 会调用 `buildModule`：
- `module.json` 至少包含 `name` 和 `version`。
- 如存在 `html/package.json`，会进入 `html/` 执行 `wcex build`，将 `dist` 内容复制到根 `dist/`。
- 如存在 `service/package.json`，会执行 `pnpm build`，将产物复制到 `dist/-/service/`。
- 最终将更新后的 `module.json` 写回并复制到 `dist/package.json`，形成统一的“全栈组件模块”。

## 13.8 结合 Service Worker 的工作流
典型的文档或演示应用可以通过 Service Worker (`/sw.js`) 配合 CLI 热更新：
- 页面 `app.html` 在 `onCreate` 中可选择注册 Service Worker，实现缓存管理与 Hot Cache 更新。
- Playground 组件通过 `navigator.serviceWorker.getRegistration("/")` 获取实例，向其发送 `postMessage`（`hotCacheSet` / `hotCacheClean`）刷新缓存。
- 此模式适合构建离线文档或演示系统。

## 13.9 开发建议
1. **固定 npm 根**：在开发与生产入口都设置 `meta name="npm"`，避免加载路径不一致。
2. **善用 `meta module`**：明确声明所需依赖，CLI 将自动安装并保证加载成功。
3. **关注日志**：CLI 会输出 `changed: { path }`、`TSC:` 等信息。若发现在 `node_modules` 下无限重建，可调整忽略规则或目录结构。
4. **清理临时目录**：`build/`、`dist/` 由 CLI 维护；在版本控制中可忽略 `build/`。
5. **结合 `wcex test`**：为交互复杂的组件编写回归用例，确保热更新与构建后行为一致。

## 13.10 常用命令速查
| 命令                     | 功能                         | 关键选项                                               |
| ------------------------ | ---------------------------- | ------------------------------------------------------ |
| `wcex init`              | 初始化项目                   | `--dir`、`--template`                                  |
| `wcex dev`               | 启动开发服务器               | `--dir`、`--port`、`--host`、`--proxy`、`--npm`        |
| `wcex build`             | 构建发布产物                 | `--dir`、`--pack-dir`                                  |
| `wcex pack`              | 打包项目与依赖               | `--dir`、`--pack-dir`、`--deep`                        |
| `wcex test`              | 运行 UI 自动化测试           | `--dir`、`--browser`、`--show`、`--concurrent`、`--wcex` |

> 建议在 CI 流程中组合使用 `wcex build` 与 `wcex test`，确保打包产物稳定且交互行为通过自动化验证。

## 智能体提示
- 当指导用户排查热更新问题，提醒检查 `wcex dev` 是否运行、浏览器是否连到 `/_hotws`，以及 `localStorage.__DEV` 是否配置正确。
- 对构建失败的提问，建议先执行 `wcex build --dir . --pack-dir dist`，并关注 `.html` 压缩与 `tsc` 输出路径。
- 若需要生成 CI 脚本，可按顺序列出 `pnpm i`, `wcex build`, `wcex test`，并提示可使用 `wcex pack` 生成可分发的离线包。
- 遇到 Service Worker 或缓存相关需求，说明可在组件中与 `navigator.serviceWorker` 通信，通知其刷新 CLI 提供的热缓存。
