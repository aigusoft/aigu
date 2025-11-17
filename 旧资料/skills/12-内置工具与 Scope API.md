# 12｜内置工具与 Scope API

所有组件作用域都继承自框架的 `Scope` 类。它提供一组可在模板、脚本和事件中直接使用的工具方法与属性。本章总结关键 API 及典型场景，便于自动化生成器调用。

## 12.1 作用域引用
| 属性             | 说明                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `this.$root`     | 当前 Web Component 的根 `Scope` 对象（与 `this` 一致）。             |
| `this.$rootElem` | 当前组件的 Shadow DOM 根元素（`HTMLElement`）。                     |
| `this.$rootParentElem` | 当前组件在宿主 DOM 中的父元素；即使父节点是 `shadowRoot` 也会解析到宿主组件。 |
| `this.$parent`   | 最近的父级作用域对象（按带作用域的 DOM 层级向上查找）。             |
| `this.$id`       | 收集模板内拥有 `id` 属性的元素，按驼峰式属性暴露。`this.$id.demo`。 |
| `this.$class`    | 以类名查询 Shadow DOM 内的元素集合。                                 |
| `this.$slot`     | 插槽上下文（在动态插槽或 `slot` 组件中使用）。                      |
| `this.$props`    | 父组件传入的属性集合（带 `$` 修饰的属性保留原始类型）。            |
| `this.$elem`     | 当前绑定元素（在局部作用域内可用）。                                 |
| `this.$wc`       | 当前组件的宿主 `Wc` 实例，可访问底层生命周期、模板等内部细节。      |
| `this.$tpl`      | 对应的 `_Tpl` 实例，包含模板源信息、`info.url`、`tid` 映射等。       |
| `this.$loader`   | 指向 `_umdLoader`，可手动请求模块或文件。                            |
| `this.$npm`      | 当前页面的 npm 根路径（解析自 `<meta name="npm">`）。                |
| `this.$waitComponents()` | 返回 Promise，等待所有子组件初始化完成。                     |
| `this.$timer(interval, fn?)` | 启动可自动清理的定时器；`@timer` 即基于此实现。          |

## 12.2 事件与观察
| 方法                      | 说明                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `$emit(nameOrEvent, detail?, toElem?)` | 触发自定义或原生事件。`nameOrEvent` 可为字符串或 `Event` 实例。`detail` 为事件数据，`toElem` 可显式指定目标元素。 |
| `$watch(getter, cb, options?)`         | 观察函数返回值变化，执行回调。常用于计算属性或监听 props。          |
| `$noWatch(target)`                     | 取消对对象的依赖追踪（提高性能或避免 Proxy 包裹第三方实例）。       |
| `$monitSize(element, handler)`         | 观察元素尺寸变化（示例中用于通知编辑器重新布局）。                  |

## 12.3 路由与导航
| 方法 / 属性            | 说明                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `$router`              | 路由对象，包含当前路由状态、解析与跳转方法。                 |
| `$router.route`        | 当前解析后的路由映射，按区域划分（见第 10 章）。             |
| `$router.go(...)` / `$go(...)` | 导航到新路由。支持多种调用方式（区域 + 标签 + 参数 / 完整 hash）。 |
| `$router.parse(href)`  | 解析路由字符串，返回结构化对象。                             |
| `$router.back()`       | 回退到历史记录中上一条路由。                                 |

## 12.4 资源与调试
| 方法            | 说明                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `$path(relative)` | 根据当前组件路径解析资源地址。支持：`"./"`（相对当前组件）、`"@/"`（相对 npm 包根，即 `meta name="module"` 声明的包）。 |
| `$log(...args)` | 彩色调试输出，会附带组件名称与行号。常用别名：`$log.warn`、`$log.error`。 |
| `$json(value, space?)` | `JSON.stringify` 的简化版，提供响应式文本输出。               |

## 12.5 异步工具
| 方法          | 说明                                                     |
| ------------- | -------------------------------------------------------- |
| `$delay(ms)`  | 返回一个 Promise，在指定毫秒后 resolve（基于 `setTimeout`）。 |
| `$next()`     | 返回一个 Promise，在下一帧（`requestAnimationFrame`）执行。 |
| `$step(...args)` | 逐步改变属性值的工具，常用于动画。参数可为值或 `[值,持续时间]`。 |

## 12.6 主题与配色
| 对象 / 方法         | 说明                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `$color`            | 语义色集合（`pri`、`sec`、`bg` 等），支持链式修饰。例如 `$color.pri.l3.a6`。 |
| `$Colors.switchMode(mode?)` | 切换主题模式（如浅色/深色）。                                     |
| `$Colors.set(name, value)`  | 动态调整语义色值。                                                |
| `$Colors.mode`             | 当前模式编号。                                                    |

## 12.7 其他常用工具
| 方法                  | 说明                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `$side(tag, options)` | 打开侧滑面板（来自 `@wcex/ui`，在 UI 组件章节详述）。                |
| `$pop(tag, options)`  | 打开弹层（UI 库扩展）。                                               |
| `$id[ref].$scope`     | 获取子组件的作用域实例（通过 `$as` 或 `id` 记录）。                 |
| `$delay` / `$next`    | 与动画或异步执行配合。                                                |
| `$refs`               | 若组件有 `ref` 属性，框架会收集到 `$refs`（根据运行时版本可能提供）。 |

> 注意：`$side`、`$pop` 等前缀方法属于 `@wcex/ui` 扩展，而非核心框架的一部分。使用它们时需确保 `@wcex/ui` 已通过 `<meta name="module">` 加载。

## 12.8 插件系统
- 通过 `WCEX.usePlugins(plugin)` 可以在模板解析（`tplPre`/`tplParse`/`tplPost`）、组件创建（`wcPre`/`wcPost`）、属性更新（`wcApply`）以及销毁阶段（`wcDestroy`）介入；插件还可以暴露 `scope` 字段，统一注入到所有组件作用域。
- 插件执行顺序受 `priority` 影响，默认按照 `priority` 从小到大排序；内置插件包括 `$color`（注入颜色管理器）与 `$monitSize`（封装 `ResizeObserver`）。
- 在 `wcApply` 回调中可观测到属性名称、执行标志和最新计算值，从而扩展 `$if/$for/$show` 之外的自定义指令。
- 插件可访问 `this` 指向插件定义本身，如需共享状态应显式挂载到 `plugin` 对象或使用闭包变量。
- 需要注意的是，插件运行在核心响应式系统之上，若在 `wcApply` 中修改 Scope 字段，应避免产生无限循环。

## 12.9 综合示例
```html
<template @ready="init()" @destroy="cleanup()">
  <meta name="scope" counter.int="0" />
  <div id="panel" :>计数：${counter}</div>
  <button @click="counter++">+</button>
  <button @click="$router.back()">返回</button>

  <script scope=".">
    return class {
      init() {
        this.$watch(() => this.counter, () => {
          this.$log("counter", this.counter);
          this.$emit("change", { value: this.counter });
        });
        this.resizeStop = this.$monitSize(this.$id.panel, () => this.$log("panel resized"));
      }
      cleanup() {
        this.resizeStop?.();  // 释放监听（$monitSize 可返回停止函数）
      }
    };
  </script>
</template>
```
- 使用 `$watch` 与 `$emit` 同步状态。
- 通过 `$router.back()` 实现返回。
- `$monitSize` 监听元素尺寸变化，`cleanup` 中清理资源。

## 12.10 建议
- 避免在 `$watch` 中创建新的 watcher 或复杂副作用，必要时结合 `$delay` / `$next` 控制节奏。
- 使用 `$path` 访问静态资源可保持组件在不同包、不同部署路径下可用。
- 调试时配合 `$log` 输出上下文信息，便于定位组件名与行号。

充分利用这些内置工具，可以让生成的组件保持简洁又具备工程能力。

## 智能体提示
- 当回答“如何访问 DOM/父级作用域”时，优先列出 `$id`、`$parent`、`$rootElem` 等引用，帮助用户快速定位元素。
- 若涉及状态监听，强调 `$watch` 支持返回停止函数，配合 `$delay`/`$next` 控制节奏，避免在表达式中执行副作用。
- 关于资源路径问题，提醒使用 `$path` 与 `@/` 前缀，而非硬编码绝对地址。
- 解释插件或主题问题时，可引用本章与第 16、17 章的章节，说明 `$color`、`$Colors`、`WCEX.usePlugins` 的配合关系。
