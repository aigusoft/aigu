/**
 * --> Props 实现缺省值
 * --> $id 自动映射 具有 id 的 元素
 */
import "./HotLoader";

import { _observer } from "./Observer";
import { objectGet, _Utils } from "./Utils";
import { wcRegister } from "./WcRegister";
import { router } from "./Router";
import { ITplData, _TplData, _Tpl } from "./Tpl";
import { IScope, Scope } from "./Scope";

import { _htmlMeta } from "./HtmlMeta";
import { IStyleInfo } from "./StyleParser";
import { _umdLoader } from "./UmdLoader";
import { Logger } from "./Logger";
import { _pluginsManager } from "./plugins/Plugins";

import { WcLog } from "./Logger";
import { ScopedElement } from "./plugins/IPlugins";
import { _stylesMonit } from "./StylesMonit";
const log = WcLog(module);

type IElemAni = {
  from?: string;
  active?: string;
  to?: string;
  isRunning: boolean;
  aniStartCallback: (ev: any) => any;
  aniEndCallback: () => any;
  completedCallback?: (el: Element) => any;
};

/**
 * 新增功能，全局注入的scope
 */
// export const _globalUsedScope = {} as any;

/**
 * 注册一个标签，创建和加载模板,默认使用 "div" 块元素
 * @param elemTag
 * @returns 注册成功的模板类
 */
export function _registerTag(elemTag: string, isTag: string | undefined | null, from: string | undefined): _Tpl | undefined {
  let usedTag = (isTag || elemTag).toLowerCase();

  if (usedTag.indexOf("-") < 0) return undefined;
  let existedCls = customElements.get(usedTag);

  if (existedCls) {
    return (existedCls as any).$tpl;
  }
 
  // 获取基类
  let BaseCls = (isTag ? Object.getPrototypeOf(document.createElement(elemTag))["constructor"] : HTMLElement) as typeof HTMLElement;
  // 创建类
  let wcCls = class extends BaseCls {
    static $tpl = new _Tpl(usedTag, from);
    static version = 1;
    static updateTpl(tpl: _Tpl) {
      wcCls.$tpl = tpl;
      wcCls.version++;
    }
    $wc: Wc;
    constructor() {
      super();
      // 检测和进行懒加载模板
      this.$wc = new Wc(this as any, wcCls.$tpl);
    }

    connectedCallback() {
      this.$wc._onConnected();
      // this.$wc.init();
    }
    disconnectedCallback() {
      this.$wc._onDisconnected();
      // this.$wc.close();
    }
  };
  try {
    customElements.define(usedTag, wcCls, { extends: isTag ? elemTag : undefined });
    // log.debug(`register WebComponent: <${elemTag}>`, isTag ? `is=<${isTag}>` : '');
  } catch (e: any) {
    log.error(e.message);
  }

  return wcCls.$tpl;
}

/**
 * 注册和加载 WebComponent和模板
 * @param el
 */
export async function _registerElement(htmlElem: Element, from: string | undefined, deep: boolean) {
  let waitPromises = [] as Promise<any>[];

  // 2022-6-17 修复注册template内部元素
  async function _applyEl(el: Element) {
    if (!(el instanceof Element)) return;
    if (deep) {
      let children = el instanceof HTMLTemplateElement ? el.content.children : el.children;
      for (let i = 0; i < children.length; i++) {
        await _applyEl(children[i] as Element);
      }
    }
    // 1. 获取 TAG
    let elemTag = el.tagName.toLowerCase();
    let isTag = el.getAttribute("is");

    let t = _registerTag(elemTag, isTag, from);

    if (t) {
      if (el.hasAttribute("!sync")) {
        // 同步加载模板
        await t._waitReady();
      } else {
        // 异步加载模板
        waitPromises.push(t._waitReady());
      }
    }
  }

  waitPromises.push(_applyEl(htmlElem));

  return Promise.all(waitPromises);
}

export class Wc {
  // --- 静态函数

  $wcId = 0;
  $id1 = new Proxy(
    {},
    {
      get: (t, p) => {
        return this._rootShadow?.getElementById(p as string);
      },
    }
  ) as { [k: string]: HTMLElement | Element };
  $class = new Proxy(
    {},
    {
      get: (t, p) => {
        const ret: HTMLElement[] = [];
        let nodes = this._rootShadow?.querySelectorAll(`.${p as string}`);
        nodes.forEach((v) => {
          ret.push(v as HTMLElement);
        });
        return ret;
      },
    }
  );
  $router = router;
  $rootElem: HTMLElement;
  $rootParentElem?: HTMLElement;
  $log: any;

  $waitComponents = async () => {
    // 等待自身加载完成
    await this._initPromise;
    // 获取所有子元素,并等待子元素加载完成
    let nodes = this._rootShadow.querySelectorAll("[wcid]");
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i] as ScopedElement;
      // 等待子元素加载完成
      await (node as any).rootScope.$waitComponents();
    }
  };

  tag: string;
  _rootScope = _observer.watch({}) as IScope;
  _curBinder = undefined as undefined | (Function & { __STEP?: any; __STEP_RESET?: boolean; __STEP_RUNNING?: boolean });
  // data binder 表
  private $tpl: _Tpl;
  // private _binder;
  private _dataBinderMap = new Map<string, Function>();
  // root Scope 有些常用方法
  /**
   * 监控DOM和属性信息变更
   */
  private _mutationObserver = new MutationObserver(this._moCallback.bind(this));
  // 跟踪元素 eid
  private _eidCounter = 1;

  private _timerSet = new Set<number>();
  private _watcherId = 0;
  private _rootShadow!: ShadowRoot;

  /**
   * WC类构造函数
   */
  constructor(rootEl: Element, tpl: _Tpl) {
    _observer._nowatch(this);
    this.$wcId = wcRegister.register(this);
    // this._binder = this.$wcId;
    this.$tpl = _observer._nowatch(tpl);
    this.$rootElem = rootEl as HTMLElement;
    this.tag = rootEl.tagName.toLowerCase();
  }

  /**
   * 为rootScope注入一个全局对象
   * 此全局对象将在所有的scope中生效
   * @param name
   * @param used
   */
  // static use(name: string, used: any) {
  //   _globalUsedScope[name] = used;
  // }

  // 考虑到多次挂载情况（移动等，仅处理第一次挂载）
  // 其他情况可以调用 mount 回调？？
  _initFlag = false;
  _initPromise: Promise<any> | undefined = undefined;
  _onConnected() {
    if (!this._initFlag) {
      this._initFlag = true;
      this._initPromise = this._init();
    } else {
      // log.debug("reconnected", this.tag);
      this._reconnect();
    }
  }
  _onDisconnected() {
    // 在下一个周期检测是否真正断开，处理移动元素逻辑
    setTimeout(() => {
      if (!this.$rootElem.isConnected) {
        // log.debug("disconnected", this.tag);
        this._onClose();
      }
    });
  }

  async _reconnect() {
    // // 当组件移动时调用，更新所有CSS
    // this._rootShadow.querySelectorAll("style").forEach((el) => {
    //   // this._initStyleElement(el as any, false);
    // });
  }

  /**
   * 初始化 webcomponent
   */
  async _init() {
    let tpl = this.$tpl;
    let rootEl = this.$rootElem;
    this.$rootParentElem = (rootEl.parentNode instanceof ShadowRoot ? rootEl.parentNode.host : rootEl.parentElement) as HTMLElement;

    // 创建影子Dom,注意，当使用原生元素时，不是所有元素都可以添加Shadow。
    try {
      this._rootShadow = rootEl.shadowRoot || rootEl.attachShadow({ mode: "open" });
    } catch (e) {
      // 创建一个新div元素
      let newEl = document.createElement("div");
      let nodes = [] as Node[];
      for (let i = 0; i < rootEl.childNodes.length; i++) {
        const node = rootEl.childNodes.item(i);
        nodes.push(node);
      }
      newEl.append(...nodes);
      rootEl.appendChild(newEl);
      this._rootShadow = newEl.shadowRoot || newEl.attachShadow({ mode: "open" });
    }

    // 设置默认显示类型为 block
    this.$rootElem.setAttribute("wcid", this.$wcId.toString());
    // 等待模板加载完成
    try {
      await tpl._waitReady();
    } catch (e) {
      log.error("load tpl failed:", tpl.tag, tpl.info.url, e);
    }

    // 初始化 root scope
    this._rootScope = tpl._createScope(this.$rootElem);

    // 混入全局used到rootScope
    // Object.assign(this._rootScope, _globalUsedScope);

    // Object.setPrototypeOf(this.rootScope, wcUsedScope);
    // 设置rootScope 到rootEL
    (this.$rootElem as any).rootScope = this._rootScope;

    const docFragment = tpl._cloneDocumentFragment();
    // 初始化RootScope

    // 设置rootScope 的 $id和$wc
    this._rootScope.$id = this.$id1 as any;
    this._rootScope.$class = this.$class as any;
    this._rootScope.$wc = this as any;
    this._rootScope.$emit = this.$emit.bind(this);
    this._rootScope.$timer = this.$timer.bind(this);
    this._rootScope.$router = this.$router;
    this._rootScope.$watch = this.$watch.bind(this);
    this._rootScope.$noWatch = this.$noWatch.bind(this);
    this._rootScope.$root = this._rootScope;
    this._rootScope.$parent = this._rootScope;
    this._rootScope.$rootElem = this.$rootElem;
    this._rootScope.$rootParentElem = this.$rootParentElem;
    this._rootScope.$loader = _umdLoader as any;
    this._rootScope.$json = JSON.stringify;
    this._rootScope.$delay = function (ms: number) {
      return new Promise((res) => setTimeout(res, ms));
    };
    this._rootScope.$waitComponents = this.$waitComponents.bind(this);
    // $next 用于等待下个周期
    this._rootScope.$next = function () {
      return new Promise((res) => requestAnimationFrame(() => res()));
    };
    let self = this;
    // $step 用于多步执行,工厂函数
    this._rootScope.$step = function (...args: (any | [any, number])[]) {
      // 整理传入参数
      let steps = args.map((v) =>
        v instanceof Array
          ? {
              value: v[0],
              delay: v[1] || 0,
            }
          : {
              value: v,
              delay: 0,
            }
      );
      let selfFunc = self._curBinder;
      if (!selfFunc) {
        log.warn('"$step" not support in this context', this);
        return steps[0].value;
      }
      let funcDesc = selfFunc.toString().match(/^[\s\S]*\{return ([\s\S]*)\}[\s\S]*$/)?.[1] || "unknown";
      // // 初始化步骤参数对象
      if (!selfFunc.__STEP) {
        this.$log("step init", funcDesc);
        selfFunc.__STEP = _observer.watch({
          cur: 0,
          value: steps[0].value,
          binder: selfFunc,
        });
      }
      let stepObj = selfFunc.__STEP as { cur: number; value: any; binder: Function };

      if (stepObj.cur >= steps.length - 1) {
        // 检测STEP重置标志
        if (selfFunc.__STEP_RESET) {
          this.$log("step reset", funcDesc);
          selfFunc.__STEP_RESET = false;
          stepObj.cur = 0;
          stepObj.value = steps[stepObj.cur].value;
        } else {
          this.$log("step end", funcDesc);
          selfFunc.__STEP_RESET = true;
        }
      }

      // 执行下一步
      if (stepObj.cur < steps.length - 1 && !selfFunc.__STEP_RUNNING) {
        selfFunc.__STEP_RUNNING = true;
        setTimeout(() => {
          stepObj.cur++;
          stepObj.value = steps[stepObj.cur].value;
          selfFunc && (selfFunc.__STEP_RUNNING = false);
        }, steps[stepObj.cur].delay);
      }
      this.$log("step run", stepObj.cur, stepObj.value, steps[stepObj.cur].delay, funcDesc);

      return stepObj.value;
    };

    // this.rootScope.$res = this.$res.bind(this);
    this._rootScope.$path = this.$path.bind(this);
    this._rootScope.$tpl = this.$tpl;
    this._rootScope.$npm = _htmlMeta.npmUrl;
    this._rootScope.$go = this.$router.go.bind(this.$router) as any;
    this._rootScope.$log = Logger(`${this.tag}-${this.$wcId}`) as any;

    // 应用PluginsScope
    let pluginScope = _pluginsManager._stages().scope;
    for (let k of Object.keys(pluginScope)) {
      let v = pluginScope[k];
      if (typeof v == "function") {
        this._rootScope[k] = v.bind(this._rootScope);
      } else {
        this._rootScope[k] = v;
      }
    }

    // 应用wcPre插件
    await _pluginsManager._stages().wcPre?.(this._rootScope, docFragment);

    // 初始化组件属性和meta数据，应排除初始化指定的"cloak类"
    this._initPropsAndMetaScope(docFragment);

    // 初始化模板元素
    if (this._propsOnCreate) this._propsOnCreate(docFragment);
    // 等待异步调用
    await this._callRootScopeCallback("onCreate", [docFragment]);

    // 一次性附加到 document,@BUGFIX 在附加到shadow之前，元素本身就不可见，否则导致无法恢复cloak状态
    this._initCloak(false);
    this._rootShadow!.appendChild(docFragment);
    this._applyTemplateDeep(this._rootShadow as any);

    // 应用wcPost插件, wcPost 调用发生在挂载DOM之后，且已经初始化所有的模板子元素
    // 但未应用监控元素变更
    await _pluginsManager._stages().wcPost?.(this._rootScope);

    // 监控自身变化
    this._mutationObserver.observe(this.$rootElem, { attributes: true });
    // // 监控子元素变化
    this._mutationObserver.observe(this._rootShadow, { childList: true, subtree: true });

    // // 监听组件属性的变化，执行相关操作
    this._propsOnTimerList.forEach((v) => {
      this.$timer(v.timer, v.fn);
    });

    // 切换组件为显示状态或者当前的 $show 状态
    this._initCloak(true);

    // 处理READY
    requestAnimationFrame(async () => {
      // 检测所有子元素, 等待所有子元素加载完毕后发送ready事件

      if (this._propsOnReady) this._propsOnReady();
      await this._callRootScopeCallback("onReady", [this]);
      // Ready事件不冒泡
      this.$emitEvent({ name: "ready", detail: { from: this.tag }, toElem: this.$rootElem, isBubbles: false, isComposed: false });
    });
  }

  // 获取当前组件计算后的style状态，进行缓存和处理

  /**
   * 初始化一次性显示
   */
  _initCloak(show: boolean) {
    let root = this.$rootElem as ScopedElement;
    if (show) {
      // 恢复或者删除cloak属性,下个周期处理
      root.classList.remove("cloak");
    } else {
      root.classList.add("cloak");
    }
  }

  $path(src: string, ext?: string) {
    return src ? this.$tpl._relPath(src, ext).url : "";
  }

  _onClose() {
    // log.debug('--- close', this.tag);
    // 取消当前组件的注册
    wcRegister.unregister(this);
    // 取消dom监听
    this._mutationObserver.disconnect();
    // 取消timer
    this._timerSet.forEach((id) => {
      clearInterval(id);
    });
    // 取消属性监听
    _stylesMonit._unregisterWc(this.$wcId);
    // 调用回调,回调函数需在rootScope定义

    this._callRootScopeCallback("onDestroy", [this]);
    if (this._propsOnDestroy) {
      this._propsOnDestroy();
    }

    // destroy 事件不冒泡
    this.$emitEvent({ name: "destroy", detail: { from: this.tag }, toElem: this.$rootElem, isBubbles: false, isComposed: false });

    _pluginsManager._stages().wcDestroy?.bind(this._rootScope)();
    this._rootShadow.innerHTML = "";
  }

  /**
   * 创建一个新的子元素，检测并自动注册组件，并附加到指定元素
   * @param tag
   * @param attrs
   * @param toElem
   */
  // newChild(tag: string, attrs: { [k: string]: string }, toElem: HTMLElement) {
  //   const el = document.createElement(tag);
  //   Object.keys(attrs).forEach((k) => {
  //     el.setAttribute(k, attrs[k].toString());
  //   });
  //   Wc.register(el, true);
  //   toElem.appendChild(el);
  // }

  _callRootScopeCallback(name: string, args: any[]): any {
    const callback = this._rootScope[name] as Function;
    if (typeof callback === "function") {
      return callback.apply(this._rootScope, args);
    }
  }

  /**
   * 跟踪变化，调用callback
   * @param tracker
   * @param callback
   */
  $watch(tracker: Function, callback: Function) {
    const binderKey = `-1|$watch|${this._watcherId++}`;
    let _fn = () => {
      _observer.trackCall(this.$wcId, binderKey, tracker);
      callback();
    };

    this._dataBinderMap.set(binderKey, _fn);
    // _fn();
    _observer.trackCall(this.$wcId, binderKey, () => {
      // 第一次调用时，对所有的属性进行跟踪
      JSON.stringify(tracker());
    });
    // callback();
  }
  $noWatch(obj: any) {
    return _observer._nowatch(obj);
  }
  /**
   * 发送一个事件，此事件将从当前元素冒泡传递到window
   * @param eventName
   * @param data
   * @param toElem 设定事件触发元素，默认为自身
   */
  $emit(nameOrEvent: string | Event, detailOrtoElem?: Element | any, toElem?: Element) {
    // log.info('$emit:', nameOrEvent);

    const to = toElem || (detailOrtoElem instanceof Element ? detailOrtoElem : this.$rootElem);
    const detail = detailOrtoElem instanceof Element ? {} : detailOrtoElem;

    const ev =
      nameOrEvent instanceof Event
        ? nameOrEvent
        : new CustomEvent(nameOrEvent, {
            detail: detail,
            composed: true,
            bubbles: true,
            cancelable: true,
          });
    to.dispatchEvent(ev);
  }
  $emitEvent(eventOptions: { name: string; detail: any; toElem: Element; isBubbles: boolean; isComposed: boolean }) {
    const ev = new CustomEvent(eventOptions.name, {
      detail: eventOptions.detail,
      composed: eventOptions.isComposed,
      bubbles: eventOptions.isBubbles,
      cancelable: true,
    });
    eventOptions.toElem.dispatchEvent(ev);
  }

  /**
   * 注册一个timer,此Timer将自动销毁
   * 如果 timeout 小于0 ,则首先执行fn
   */
  $timer(timeout: number, fn: Function) {
    if (timeout < 0) {
      timeout = -timeout;
      fn();
    }
    this._timerSet.add(setInterval(fn, timeout));
  }

  _findBinderFunc(key: string): Function | Function[] | undefined {
    return this._dataBinderMap.get(key);
  }

  /**
   * DOM 属性监听事件回调
   * @param muArray
   * @param ob
   */
  private _moCallback(muArray: MutationRecord[], ob: any) {
    muArray.forEach((mu) => {
      const el = mu.target as ScopedElement;
      if (mu.type === "attributes" && mu.attributeName) {
        // 属性变动
        let attName = mu.attributeName;

        // 处理prop属性变更
        if (el === this.$rootElem) {
          let tplData = this.$tpl._getTplData();
          // 检测是否为prop属性
          const prop = tplData.props()[attName];

          // 如果非prop属性,则设置到当前元素的$scope中
          if (prop === undefined) {
            // log.debug('mu attributes changed no prop',attName, mu.attributeName);
          } else if (attName != "class" && attName != "style") {
            // 需要判断是否wc自身定义的props
            // 排除"class" 属性，class属性不传入内部,以实现内外部class属性合并
            // log.debug('mu attributes changed',attName, mu.attributeName);

            if (el.$scope && el.$scope.hasOwnProperty(prop._scopeName)) {
              // 从scope中取值判断和赋值
              if (el.$scope[prop._scopeName] != this._rootScope[prop._scopeName]) {
                this._rootScope[prop._scopeName] = el.$scope[prop._scopeName];
              }
            } else {
              // 取属性值,检测属性是否真正变化
              // log.debug('mu attributes changed', prop.scopeName, mu.attributeName, el.getAttribute(prop.attName));
              // 需要判断属性类型以及是否动态属性，动态属性不处理
              if (!prop._orgName.match(/^[$:@]/)) {
                // 当为bool类型时，且默认无此属性时，设置为false，当attr存在时，使用标准判定逻辑(true/false/0/1)bool 类型需要特殊处理，\其他类型设置为内部值
                if (tplData.propType(prop._attName) === "bool" && !el.hasAttribute(prop._attName)) {
                  this._rootScope[prop._scopeName] = false;
                } else {
                  let v = tplData.propsGetValue(prop._attName, el.getAttribute(prop._attName));
                  if (v != undefined && this._rootScope[prop._scopeName] != v) {
                    this._rootScope[prop._scopeName] = v;
                  }
                }
              }
            }
          }
        }
      } else if (mu.type == "childList") {
        // 子元素变动，自动注册和注销元素
        mu.removedNodes.forEach((ele) => {
          // 同时检测是否有父节点，否则不是删除而是移动，不处理删除逻辑
          // 有可能的BUG，检测父节点非空，但是已经被删除（删除了父节点）
          if (ele instanceof Element && ele.parentNode == null) {
            // log.debug('removedNodes', ele, ele.parentNode);
            this._deepCleanElemBinder(ele as ScopedElement, true);
          }
        });
        mu.addedNodes.forEach(async (ele) => {
          // 检测和注册新增元素，检测是否有$scope被初始化，否则可能是重复创建（移动）
          if (ele instanceof Element && !ele.hasOwnProperty("rootScope")) {
            // 注册 Webcomponent
            await _registerElement(ele, this.$tpl.info.from, true);
            // 应用模板，检测当前ele是否已经拥有某个scope，否则自动创建
            if (!(ele as ScopedElement).$scope) {
              this._applyTemplateDeep(ele as ScopedElement);
            }
          }
        });
      }
    });
  }
  private _propsOnDestroy = undefined as undefined | (() => void);
  private _propsOnReady = undefined as undefined | (() => void);
  private _propsOnCreate = undefined as undefined | ((doc: DocumentFragment) => void);
  private _propsOnTimerList = [] as { timer: number; fn: () => void }[];

  /**
   * 初始化当前组件 attr 到scope和元素
   * @param attrName
   * @param procEvent
   */
  private _initPropsAndMetaScope(preloadDoc: DocumentFragment) {
    // 初始化props
    const tplData = this.$tpl._getTplData();
    let self = this;

    // 初始化meta 全局变量
    tplData._scopeDataEach((data, attrName) => {
      this._rootScope[_Utils._kebabToSnake(attrName)] = data._value;
    });

    // 创建rootScope数据绑定
    function _propCreateEventBinder(attrName: string) {
      // 绑定组件事件，动态属性改变不处理，仅在初始化时处理
      const tpl = self.$tpl;
      const tplKey = `root|${attrName}`;
      const tplBinder = tpl._getBinder(tplKey) as Function;
      // 调用tplBinder，参数:"$scope", "$el", "$ev",'$$func'
      if (attrName == "@create") {
        self._propsOnCreate = () => {
          try {
            self._curBinder = tplBinder;
            tplBinder?.call(self, self._rootScope, preloadDoc, {});
          } catch (e: any) {
            log.error("on props @create fail:", e.message, self.$rootElem);
          }
        };
      } else if (attrName == "@ready") {
        self._propsOnReady = () => {
          try {
            self._curBinder = tplBinder;
            tplBinder?.call(self, self._rootScope, self.$rootElem, {});
          } catch (e: any) {
            log.error("on props @ready fail:", e.message, self.$rootElem);
          }
        };
      } else if (attrName == "@destroy") {
        self._propsOnDestroy = () => {
          try {
            self._curBinder = tplBinder;
            tplBinder?.call(self, self._rootScope, self.$rootElem, {});
          } catch (e: any) {
            log.error("on props @destroy fail:", e.message, self.$rootElem);
          }
        };
      } else if (attrName.startsWith("@timer")) {
        const sp = attrName.split(".");
        let timerFn = () => {
          try {
            self._curBinder = tplBinder;
            tplBinder?.call(self, self._rootScope, self.$rootElem, {});
          } catch (e: any) {
            log.error("on props @timer fail:", e.message, self.$rootElem);
          }
        };
        self._propsOnTimerList.push({
          timer: sp[1] ? parseInt(sp[1]) || 1000 : 1000,
          fn: timerFn,
        });
        // 下个周期立即执行一次
        requestAnimationFrame(() => {
          timerFn();
        });
      } else {
        self._createEventBinder(self.$rootElem, attrName);
      }
    }
    // 合并cls
    function _mergeCls(cls1: string | null | undefined, cls2: string | null | undefined) {
      return [...new Set(((cls1 || "") + " " + (cls2 || "")).trim().split(/\s+/))].join(" ");
    }

    /**
     * 获取元素外部属性的值
     * 不存在则返回 null
     * 可选是否获取元素属性
     */
    function _getOuterPropValue(prop: ITplData) {
      const elScope = (self.$rootElem as any).$scope as { [k: string]: any };
      // 在获取外部属性时，如果存在scope，则以scope为准，否则以元素属性为准
      let value =
        elScope && elScope.hasOwnProperty(prop._scopeName) ? elScope[prop._scopeName] : self.$rootElem.getAttribute(prop._attName);

      // 外部为字符串时，解析，否则返回null或者外部值
      return typeof value == "string" ? tplData.propsGetValue(prop._attName, value) : value;
    }

    // 输出属性值到组件外部
    function _outputPropValue(prop: ITplData) {
      // log.warn("OUTPUT _outputPropValue:",prop.scopeName)

      // === 处理属性
      const elScope = (self.$rootElem as any).$scope as { [k: string]: any };

      if (prop._attName == "class") {
        // 双向合并到EL class属性中
        let outScopeValue = elScope && elScope.hasOwnProperty("class") ? elScope.class : "";
        let cls = _mergeCls(outScopeValue, self._rootScope[prop._scopeName]);
        self.$rootElem.setAttribute(prop._attName, cls);
      } else {
        // 非 class类输出属性
        if (elScope && elScope.hasOwnProperty(prop._scopeName)) {
          // 外部为scope动态属性，直接设置,并判断是否一致
          if (elScope[prop._scopeName] !== self._rootScope[prop._scopeName]) elScope[prop._scopeName] = self._rootScope[prop._scopeName];
        } else {
          // 外部无定义scope,直接设置外部元素属性变量输出
          if (prop._type == "bool") {
            if (_Utils._checkBool(self._rootScope[prop._scopeName])) {
              self.$rootElem.setAttribute(prop._attName, self._toStringAttr(self._rootScope[prop._scopeName]));
            } else {
              self.$rootElem.removeAttribute(prop._attName);
            }
          } else {
            let value = self._toStringAttr(self._rootScope[prop._scopeName]);
            self.$rootElem.setAttribute(prop._attName, value);
          }
        }
      }
    }
    // 同时还需要检测外部scope同名属性变更，写入到内部
    let outScope = (self.$rootElem as any).$scope;

    function _watchProp(prop: ITplData) {
      // 监控内部数据变化, 内部数据变化监控发生在下个周期

      // setTimeout(() => {
      self.$watch(
        () => self._rootScope[prop._scopeName],
        () => {
          // 输出
          if (!outScope || self._rootScope[prop._scopeName] !== outScope[prop._scopeName]) {
            // if (self._rootScope[prop.scopeName] !== prop.value) {
            // prop.value = self._rootScope[prop.scopeName];
            _outputPropValue(prop);
            // })
            // 自动发送 'change' 事件，触发双向绑定
            self.$rootElem.dispatchEvent(
              new CustomEvent("change", { detail: { prop: prop._scopeName, attr: prop._attName, value: self._rootScope[prop._scopeName] } })
            );
          }
        }
      );
      // });

      if (outScope && outScope.hasOwnProperty([prop._scopeName])) {
        self.$watch(
          () => outScope[prop._scopeName],
          () => {
            // 输入
            if (self._rootScope[prop._scopeName] !== outScope[prop._scopeName]) {
              // prop.value = self._rootScope[prop.scopeName];
              self._rootScope[prop._scopeName] = outScope[prop._scopeName];
            }
          }
        );
      }
    }

    // 首先初始化应用静态属性和事件，由于动态绑定数据可能使用静态变量，因此需要按照顺序初始化
    // 先初始化普通属性，特殊字符开始的属性后初始化
    let tplProps = tplData.props();
    let propKeys = Object.keys(tplProps);

    // 处理外部scope的所有非当前元素prop属性，设置到元素attr上
    Reflect.ownKeys(outScope || {}).forEach((k) => {
      if (typeof k !== "string") return;
      if (k.startsWith("$")) return;
      if (k == "eid" || k == "tid" || k == "wcid") return;
      // 排除内部scope属性
      let k1 = _Utils._kebabCase(k as string);
      // if(tplProps[k1]) return;
      // 其他属性将设置到元素上
      let v = outScope[k];
      if (typeof v == "boolean") {
        if (v) {
          self.$rootElem.setAttribute(k1, "");
        } else {
          self.$rootElem.removeAttribute(k1);
        }
      } else {
        self.$rootElem.setAttribute(k1, v);
      }
    });
    // 外部scope有定义，且不是动态属性

    propKeys.forEach((k) => {
      // 普通属性的初始化
      let prop = tplProps[k];
      if (!prop._orgName.match(/^[:$@]/)) {
        // 如果外部有定义，则导入外部定义值，否则输出内部值到外部
        let outerValue = _getOuterPropValue(prop);
        if (!(outerValue == null || outerValue == undefined)) {
          // 保存外部元素到内部scope, 排除class属性，因为此属性需要合并
          if (prop._attName != "class") {
            this._rootScope[prop._scopeName] = outerValue;
          } else {
            this._rootScope[prop._scopeName] = tplData.propsGetValue(k, null);
            _outputPropValue(prop);
          }
        } else {
          // 获取定义的默认值
          this._rootScope[prop._scopeName] = tplData.propsGetValue(k, null);
          _outputPropValue(prop);
        }
        // 监控变化并输出
        _watchProp(prop);
      }
    });

    // 动态属性的初始化，发生在下个周期
    propKeys.forEach((k) => {
      let prop = tplProps[k];
      if (prop._orgName.startsWith("@")) {
        // 创建事件绑定
        _propCreateEventBinder(prop._orgName);
      } else if (prop._orgName.startsWith(":") || prop._orgName.startsWith("$")) {
        /**
         * 处理动态数据,动态数据将自动根据变化计算表达式，将结果输出到外部对象
         */

        // 计算动态表达式结果并处理数据绑定
        const binderKey = `root|${prop._orgName}`;
        let tplBinder = this.$tpl._getBinder(binderKey) as Function;

        let outerValue = _getOuterPropValue(prop);

        if (!(outerValue === null || outerValue === undefined || outerValue === "")) {
          // 外部包含绑定数据
          this._rootScope[prop._scopeName] = outerValue;
        } else {
          this._createDataBinder(binderKey, () => {
            // 监控内部数据主主动变化, 注意不要触发外部变更依赖
            // 读取变更计算结果
            this._curBinder = tplBinder;
            const calcedValue = tplBinder.call(this._rootScope, this._rootScope, this.$rootElem);
            // setTimeout(() => {
            // 异步处理设置！！重要，处理双向变更依赖
            // prop.value = calcedValue
            this._rootScope[prop._scopeName] = calcedValue;
            // });
          });
        }

        _watchProp(prop);
      }
    });
  }

  /**
   * 查找父 scope 直到 rootScope
   */
  private _findParentScope(curEl: Element | null): any {
    if (!curEl) return this._rootScope;
    if ((curEl as any) == this.$rootElem) return this._rootScope;
    if ((curEl as any).$scope) return (curEl as any).$scope;
    return this._findParentScope(curEl.parentElement);
  }

  /**
   * 为元素初始化本地Scope，自动设置prototype到父元素或者指定的元素
   * @param el
   * @returns
   */
  private _initLocalScope(el: ScopedElement, parentScope: object | undefined, initScope: any) {
    const self = this;
    if (el.$scope) return el.$scope;
    if ((el as Element) == this.$rootElem) return el.$scope;

    const parent = parentScope || this._findParentScope(el.parentElement);
    // 设置scope原型继承，最终设置到实例自身的代理scope
    // 初始化 $attr 对象以自动化检测和处理
    const scope = {} as any;
    if (initScope) {
      Object.assign(scope, initScope);
    }

    function _mergeClass(scopeValue: string) {
      let rootClass = (el as any).rootScope?.["class"] || "";
      let clsList = (scopeValue + " " + rootClass).trim().split(/\s+/);
      let newCls = [...new Set(clsList)].join(" ");
      el.setAttribute("class", newCls);
    }

    Object.assign(scope, { $el: el, $parent: parent });
    // if(el.$ani.has)
    // if(Reflect.has(scope,'class')) _mergeClass(scope.class)
    // else if(Reflect.has(scope,'style')) el.setAttribute('style',scope.style)
    // else {

    // }

    Object.setPrototypeOf(scope, parent);

    function _applyScopeProp(prop: string | Symbol, v: any) {
      if (typeof prop != "string") return;
      if (!prop.match(/^[a-z]/)) return;
      if (!scope.hasOwnProperty(prop)) return;
      const attrName = _Utils._kebabCase(prop);

      // 检查class，合并自定义元素的 rootScope
      if (attrName == "class" && (el as any).rootScope) {
        _mergeClass(v);
        return;
      }
      // 所有 localScope 成员，如果为字母开头，全部设置到attr上
      if (_Utils._checkBool(v)) {
        el.setAttribute(attrName, self._toStringAttr(v));
      } else {
        el.removeAttribute(attrName);
      }

      // 检测是否有el原生属性，如有则设置原生属性(style除外，因为style是对象，不是值)
      if (Reflect.has(el, attrName)) {
        if (attrName != "style") Reflect.set(el, attrName, v);
        else el.setAttribute("style", v);
      } else {
        // 设置属性到 rootscope
        let rs = (el as any).rootScope;
        if (rs && rs.hasOwnProperty(prop)) {
          rs[prop] = v;
        }
      }
    }
    // 监听本地scope对象改变,并处理
    el.$scope = _observer.watch(scope, (prop, v) => {
      _applyScopeProp(prop, v);
    });

    return el.$scope;
  }

  /**
   * @TODO 火狐浏览器兼容性BUG, 修复
   */
  private _initStyleElement(el: ScopedElement, initDateBinder: boolean) {
    const tid = el.getAttribute("tid")!;
    const eid = el.getAttribute("eid")!;
    const tpl = this.$tpl;
    const css = tpl._styleParser._getParsedCss(parseInt(tid));
    if (!css) return;
    let cssText = "";
    let self = this;

    /**
     * 从css样式表中查找RULE
     * @param root
     * @param ruleName
     * @returns
     */
    function _findRule(root: ShadowRoot, ruleName: string) {
      // 查找样式表, 并进行更新
      for (let i = 0; i < root.styleSheets.length; i++) {
        const sheet = root.styleSheets.item(i);
        if (sheet!.ownerNode === el) {
          for (let j = 0; j < sheet!.cssRules.length; j++) {
            const rule = sheet!.cssRules.item(j);

            // @TODO Css 系统的 RULE 名称为标准化的CSS选择器格式，两个选择条件间仅有一个空格
            // 进行匹配时，如果ruleName未标准化将导致匹配失败，无法进行rule动态变更
            // 解决方法，删除空格后进行比对，当前可能造成匹配异常，因为删除空格后将有可能重名
            if (rule instanceof CSSStyleRule) {
              if (rule.selectorText.replace(/ /g, "") === ruleName.replace(/ /g, "")) return rule;
            }
          }
        }
      }
    }

    function _calcStyleValue(style: IStyleInfo[string], ruleName: string) {
      const binderResults: string[] = [];
      // 计算binder，并进行跟踪
      const binderKey = `${eid}|${ruleName}|${style.styleName}`;
      style.binderFuncs.forEach((func) => {
        // log.log('---!!!!call', func.call(this, el._scope, el));
        // 初始化 当前的bind
        self._curBinder = func;
        binderResults.push(_observer.trackCall(self.$wcId, binderKey, func.bind(el.$scope, el.$scope, el)));
      });
      let index = 0;
      // log.log('----!binderResults', binderResults);
      // 初始化Style
      return style.text.replace(/(("[$:].+?")|('[$:].+?'))/g, () => binderResults[index++]);
    }
    Object.keys(css).forEach((ruleName) => {
      let ruleInfo = css[ruleName].rules;
      if (!ruleInfo) {
        // 未解析的css，可能是 @开头的其他css
        // cssText += `${ruleName}{${css[ruleName].text}}\n`;
        cssText += css[ruleName].text + "\n";
        return;
      }
      // 解析标准CSS
      // log.log(`tid=${tid},ruleName=`, ruleName, css[ruleName]);
      let styText = "";
      // 设置绑定Key,数据变化时调用
      let ruleItem = undefined as CSSStyleRule | undefined;

      // 生成绑定数据
      for (let styKey of Object.keys(ruleInfo)) {
        const sty = ruleInfo[styKey];
        const binderKey = `${eid}|${ruleName}|${styKey}`;

        // 初始化Style
        const calcStyValue = _calcStyleValue(sty, ruleName);

        styText += `${sty.styleName}:${calcStyValue};`;

        if (initDateBinder) {
          this._dataBinderMap.set(binderKey, () => {
            _observer.trackCall(this.$wcId, binderKey, () => {
              const calcStyValue = _calcStyleValue(sty, ruleName);

              if (!(ruleItem && ruleItem.parentStyleSheet?.ownerNode)) {
                // 检测到变化或者节点失效时更新ruleItem引用
                ruleItem = _findRule(this._rootShadow, ruleName);
              }
              ruleItem?.style.setProperty(sty.styleName, calcStyValue);
            });
          });
        }
      }

      cssText += `${ruleName}{${styText}}\n`;
    });

    // 首次初始化本地STYLE
    el.textContent = cssText;
  }

  /**
   * 数据绑定跟踪函数，函数执行完毕后
   * @param binderKey
   * @param trackedfn
   */
  private _createDataBinder(binderKey: string, trackedfn: Function) {
    this._dataBinderMap.set(binderKey, () => {
      _observer.trackCall(this.$wcId, binderKey, trackedfn);
    });
    _observer.trackCall(this.$wcId, binderKey, trackedfn);
  }
  private _createElemDataBinder1(binderKey: string, trackedfn: Function, applyFn: Function) {
    let _fn = () => {
      let results = _observer.trackCall(this.$wcId, binderKey, trackedfn);
      applyFn(results);
    };

    this._dataBinderMap.set(binderKey, _fn);
    _fn();
  }

  private _getElemBinderKey(el: Element, attOrRule: string) {
    const eid = el.getAttribute("eid");
    return `${eid}|${attOrRule}`;
  }

  /**
   * 应用数据绑定对象,返回function,则直接调用,或者等待promise或者处理值
   * @param binderReturn
   * @param callback
   */
  private _applyBinder(binderReturn: any, callback: (value: any) => any) {
    if (typeof binderReturn === "function") {
      this._applyBinder(binderReturn(), callback);
      return;
    }
    if (binderReturn instanceof Promise) {
      binderReturn.then((value) => {
        this._applyBinder(value, callback);
      });
      return;
    }

    callback(binderReturn);
  }

  private _applyBinderAsync(binderReturn: any): any | Promise<any> {
    if (typeof binderReturn === "function") {
      return this._applyBinderAsync(binderReturn());
    }
    if (binderReturn instanceof Promise) {
      return binderReturn.then((value) => {
        return this._applyBinderAsync(value);
      });
    }
    return binderReturn;
  }

  _applyTemplateDeep(el: ScopedElement) {
    // 检测是否当前对象有Scope，否则创建和初始化此元素
    // 根元素不处理，直接处理所有子元素
    if (el !== (this._rootShadow as any)) {
      this._applyElementTemplate(el);
    }
    // 处理SVG标签
    el.querySelectorAll("svg[src]").forEach((svgEl) => this._applySvgSrc(svgEl as ScopedElement));

    // log.info('_applyElementDeep!!', el);
    el.querySelectorAll("[tid]").forEach((child) => {
      this._applyElementTemplate(child as ScopedElement);
    });
    // 对slot元素应用
    el.querySelectorAll("[slot]").forEach((child) => {
      if (!child.hasAttribute("eid")) this._applyElementTemplate(<any>child);
    });

    el.querySelectorAll("slot").forEach((child) => {
      if (!child.hasAttribute("eid")) this._applyElementTemplate(<any>child);
    });
  }
  _removeBinderKey(binderKey: string) {
    this._dataBinderMap.delete(binderKey);
  }

  _deepCleanElemBinder(el: ScopedElement, isDeep: boolean) {
    const _cleanBinder = (elem: ScopedElement) => {
      // 清理注册的STYLE事件
      _stylesMonit._unregisterEl(elem);
      // 清理注册的绑定
      elem.$bindKeys?.forEach((k) => {
        this._dataBinderMap.delete(k);
      });
      elem.$bindKeys = undefined;
    };

    if (isDeep) {
      el.querySelectorAll("[eid]").forEach((e) => {
        // 清理style监控
        // 清理绑定
        _cleanBinder(e as ScopedElement);
      });
    }
    _cleanBinder(el);
  }

  /**
   * 支持附加事件属性为: stop,prevent,capture,once
   * 支持附加标记 .self
   * 2021.5 支持@click.stop.capture类似用法
   *
   * @param el
   * @param attName
   */
  private _createEventBinder(el: ScopedElement | Element, attName: string) {
    const tpl = this.$tpl;
    const tplId = el == this.$rootElem ? "root" : el.getAttribute("tid");
    const tplKey = `${tplId}|${attName}`;
    const tplBinder = tpl._getBinder(tplKey) as Function;
    if (!tplBinder) {
      throw new Error(`_createTrackBinder: not found tpl :${tplKey}`);
    }
    const sp = attName.split(".");
    const flags = {} as { [k: string]: boolean | number };
    for (let i = 1; i < sp.length; i++) {
      // 判断标记是否为数字
      const num = parseInt(sp[i]);
      if (isNaN(num)) {
        flags[sp[i]] = true;
      } else {
        // 如果为数字，则设置throttle参数
        flags["throttle"] = num;
      }
    }
    let eventName = sp[0].substring(1);
    // 事件默认捕获和阻止事件传播以及应用passive模式
    const self = this;

    if (eventName.startsWith("!")) {
      // 处理Style绑定
      eventName = eventName.slice(1);

      _stylesMonit._registerStyleMonit(el as ScopedElement, eventName);
    }

    if (flags.throttle) {
      // 处理限流功能
      const delay = typeof flags.throttle == "number" ? flags.throttle : 100;
    }

    const options: AddEventListenerOptions = {
      passive: flags.prevent == true ? false : !!flags.passive, // 如果事件内部调用prevent, 则设置passive
      once: !!flags.once,
      capture: !!flags.capture, // 防止父组件拦截消息
    };
    el.addEventListener(
      eventName,
      function (ev) {
        // 阻止默认行为
        if (flags.prevent) ev.preventDefault();
        // 阻止传播
        if (flags.stop) ev.stopPropagation();
        // 跳过 self不匹配
        if (flags.self && ev.target != el) return;
        // log.log('-------------- on ev,', orgAttrName, ev, self);
        self._curBinder = tplBinder;
        tplBinder.call((el as ScopedElement).$scope, el == self.$rootElem ? self._rootScope : (el as ScopedElement).$scope, el, ev);
      },
      options
    );
  }

  private _toStringText(value: any): string {
    switch (typeof value) {
      case "string":
        return value;
      case "undefined":
      case "symbol":
      case "function":
        return "";
      case "bigint":
      case "number":
      case "boolean":
        return value.toString();
    }
    if (value === null) return "";
    return JSON.stringify(value, null, 2);
  }

  private _toStringAttr(value: any): string {
    if (value instanceof Array) return "Array";
    if (value instanceof Map) return "Map";
    if (value instanceof Set) return "Set";
    switch (typeof value) {
      case "string":
        return value;
      case "undefined":
        return "";
      case "bigint":
      case "number":
      case "boolean":
        return value.toString();
    }
    if (value === null) return "";
    return "";
  }

  private _applyElemTextNodes(el: ScopedElement, calcResults: any[]) {
    try {
      let textId = 0;
      for (let i = 0; i < el.childNodes.length; i++) {
        let node = el.childNodes[i];
        if (node.nodeType !== Node.TEXT_NODE) continue;
        let nodeValue = calcResults[textId];
        if (nodeValue instanceof Promise) {
          nodeValue.then((v) => node.replaceWith(document.createTextNode(this._toStringText(v))));
        } else {
          node.replaceWith(document.createTextNode(this._toStringText(nodeValue)));
        }

        textId++;
      }
    } catch (e: any) {
      log.warn("apply text failed", el, ",", e.message);
    }
  }

  private _applyElemAttr(el: ScopedElement, attrName: string, calcResult: any) {
    const _fn = (result: any) => {
      try {
        // 常规,保存动态elem
        let sp = attrName.split(".");
        let propName = _Utils._kebabToSnake(sp[0]);
        let flags = sp.slice(1);

        // 下个周期处理，避免引入重复的依赖信息!!!非常重要，可以实现使外部变更和内部变更同时生效
        if (el.$scope[propName] !== result) el.$scope[propName] = result;

        // 应用plugins扩展功能
        _pluginsManager._stages().wcApply?.(el.$scope, propName, flags, result);
        // 检查并处理SVG src
        this._applySvgSrc(el);

        // 应用特殊属性：if,vis,show
        // 标准 HTML 元素
        switch (propName) {
          case "if":
            // 应用if
            this._apply$If(el);

            break;
          case "show":
            this._apply$Show(el);
            break;
          case "vis":
            this._apply$Vis(el);
            break;
          case "sort":
          case "filter":
          case "for":
            this._apply$For(el);
            break;
          case "as":
            // 将 $as 在下个周期执行,使 $as 等待其他属性初始化完毕后最后应用
            requestAnimationFrame(() => {
              this._apply$As(el);
            });
            break;
        }
      } catch (e: any) {
        log.warn(`${el.tagName} attr:${attrName} invalid! `, e.message, el);
        // throw e;
      }
    };

    if (calcResult instanceof Promise) {
      calcResult.then((v) => _fn(v));
    } else {
      _fn(calcResult);
    }
  }

  /**
   * 为指定元素创建数据绑定
   * @param el
   * @param attName
   */
  private _createElementDataBinder(el: ScopedElement, attName: string) {
    const tpl = this.$tpl;
    const tplId = el.getAttribute("tid");
    // log.debug('_createElementDataBinder',el,attName)

    const tplBinder = tpl._getBinder(`${tplId}|${attName}`);
    if (!tplBinder) {
      throw new Error(`_createTrackBinder: not found tpl <${el.tagName}>:${tplId},attr=${attName}`);
    }
    const orgAttrName = attName.substring(1);
    // 跟踪 bindkeys
    const binderKey = this._getElemBinderKey(el, attName);
    if (el.$bindKeys === undefined) el.$bindKeys = [];
    el.$bindKeys.push(binderKey);

    // 计算
    if (tplBinder instanceof Array) {
      // 文本节点
      this._createElemDataBinder1(
        binderKey,
        () => {
          // 计算多个文本节点值
          let results = tplBinder.map((f) => {
            this._curBinder = f;
            return f.call(el.$scope, el.$scope, el);
          });
          results.forEach((v) => {
            if (v instanceof Array) {
              // 为Array进行优化处理
              !v.length;
            }
          });
          return results;
        },
        (results: any[]) => this._applyElemTextNodes(el, results)
      );
    } else {
      // 属性节点
      this._createElemDataBinder1(
        binderKey,
        () => {
          // 计算属性节点值
          this._curBinder = tplBinder;
          let ret = tplBinder.call(el.$scope, el.$scope, el);
          if (ret instanceof Array) {
            // 为Array进行优化处理, 触发数组变更
            !ret.length;
          }
          return ret;
        },
        (result: any) => {
          this._applyElemAttr(el, orgAttrName, result);
        }
      );
    }

    // this._createDataBinder(binderKey, this._applyElemAttrBinderFactory(el, orgAttrName, tplBinder));
  }

  private _getAniClass(el: ScopedElement, state: string) {
    let attr = el.getAttribute("ani-" + state);
    if (attr) return attr;
    if (el.hasAttribute("ani")) {
      return (el.getAttribute("ani") || "ani") + "-" + state;
    }
    return undefined;
  }
  /**
   * 为元素应用 'ani' 动画标签
   * 动画三个阶段:
   * 1. 设置 from,固定起始属性
   * 2. 设置 active,启动动画
   * 2. 设置 to Class, 删除 from class
   * 3. remove to,active
   * @param el
   * @returns
   */
  // private _applyAttrAni(el: ScopedElement, enterOrLeave: boolean, completeCallback?: (el: Element) => any) {
  //   // 检测是否设置动画属性
  //   if (!el.hasAttribute("ani") || el instanceof HTMLTemplateElement) {
  //     // 检查当前元素是否正在执行动画
  //     if (completeCallback) completeCallback(el);
  //     return;
  //   }

  //   function nextFrame(callback: () => void) {
  //     setTimeout(() => {
  //       requestAnimationFrame(() => {
  //         callback();
  //       });
  //     }, 50);
  //   }

  //   let _runAniFun = () => {
  //     // 启动新动画
  //     let ani = {} as IElemAni;
  //     el.style.animationPlayState = "paused";
  //     // 初始化的 ani
  //     const mode = enterOrLeave ? "enter" : "leave";
  //     ani.from = this._getAniClass(el, `${mode}-from`);
  //     ani.active = this._getAniClass(el, `${mode}-active`);
  //     ani.to = this._getAniClass(el, `${mode}-to`);
  //     ani.isRunning = false;
  //     ani.completedCallback = completeCallback;
  //     if (!(ani.from || ani.active || ani.to)) {
  //       return;
  //     }
  //     el.$ani = ani;

  //     // log.debug('--- do ani:', el.tagName, enterOrLeave, ani);

  //     // 首先初始化为from状态,清理动画
  //     if (ani.from) el.classList.add(...ani.from!.split(" "));
  //     if (ani.active) el.classList.remove(...ani!.active.split(" "));
  //     // log.debug('ani from :', ani.from);
  //     el.style.animationPlayState = "running";

  //     // 下一帧激活active,切换到 from，并激活
  //     nextFrame(() => {
  //       ani.aniEndCallback = () => {
  //         // log.log('--- aniEndCallback', ani);
  //         // 调用回调函数
  //         if (completeCallback) completeCallback(el);
  //         // 移除监听器
  //         el.removeEventListener("animationend", ani!.aniEndCallback);
  //         el.removeEventListener("transitionend", ani!.aniEndCallback);
  //         el.$ani = undefined;
  //         requestAnimationFrame(() => {
  //           if (ani!.from) el.classList.remove.apply(el.classList, ani!.from.split(" "));
  //           if (ani!.active) el.classList.remove.apply(el.classList, ani!.active.split(" "));
  //           if (ani!.to) el.classList.remove.apply(el.classList, ani!.to.split(" "));
  //         });
  //       };
  //       ani.aniStartCallback = (ev) => {
  //         // log.log('--- aniStartCallback', ani, ev.target);
  //         ani!.isRunning = true;
  //         el.removeEventListener("animationstart", ani!.aniStartCallback);
  //         el.removeEventListener("transitionstart", ani!.aniStartCallback);
  //       };

  //       // 添加 active
  //       if (ani!.active) el.classList.add(...ani!.active!.split(" "));

  //       // log.debug('ani active :', ani!.active);
  //       el.addEventListener("animationstart", ani!.aniStartCallback);
  //       el.addEventListener("transitionstart", ani!.aniStartCallback);
  //       el.addEventListener("animationend", ani!.aniEndCallback);
  //       el.addEventListener("transitionend", ani!.aniEndCallback);

  //       // 在下一帧切换到to

  //       nextFrame(() => {
  //         // 检测是否进入animate状态,否则立即调用回调函数
  //         if (ani!.to) el.classList.add(...ani!.to.split(" "));
  //         if (ani!.from) el.classList.remove(...ani!.from.split(" "));
  //         // log.debug('ani to :', ani!.to);

  //         // if (ani!.from) el.classList.remove.apply(el.classList, ani!.from.split(' '));
  //         // if (ani!.to) el.classList.add.apply(el.classList, ani!.to.split(' '));

  //         // 200毫秒内动画未开始，则强制移除动画，执行回调，避免异常
  //         setTimeout(() => {
  //           if (!ani!.isRunning) {
  //             log.warn("animate force stop, please check css", el);
  //             if (ani!.completedCallback) ani!.completedCallback(el);
  //           }
  //         }, 1000);
  //       });
  //     });
  //   };

  //   // 检测当前是否正在动画，否则暂停动画，清理动画类，并在下一帧重新处理动画
  //   let ani = el.$ani as IElemAni | undefined;
  //   if (ani) {
  //     // log.debug('-- clean ani');
  //     // 清理动画
  //     el.removeEventListener("animationend", ani.aniEndCallback);
  //     el.removeEventListener("transitionend", ani.aniEndCallback);
  //     (el as HTMLElement).style.animationPlayState = "paused";
  //     // 调用上次回调函数
  //     if (ani.completedCallback) ani.completedCallback(el);

  //     if (ani.from) el.classList.remove.apply(el.classList, ani.from.split(" "));
  //     if (ani.active) el.classList.remove.apply(el.classList, ani.active.split(" "));
  //     if (ani.to) el.classList.remove.apply(el.classList, ani.to.split(" "));

  //     el.$ani = undefined;
  //     setTimeout(() => {
  //       _runAniFun();
  //     });
  //   } else {
  //     _runAniFun();
  //   }
  // }
  /**
   * 重新更新el, 可以使用已有的scope
   * @param el
   */
  // replaceEl(el: ScopedElement, toTag: string | undefined) {
  //   // this._deepDeleteElemBinderAndRef(el);
  //   const tid = parseInt(el.getAttribute("tid")!);
  //   const tpl = this.$tpl;

  //   let newEl = tpl._cloneElementByTid(tid, toTag) as ScopedElement;

  //   // 继承 $scope
  //   if (el.$scope) {
  //     newEl.$scope = el.$scope;
  //     newEl.$scope.$el = newEl;
  //   }

  //   el.replaceWith(newEl);
  //   this._applyTemplateDeep(newEl);
  //   return newEl;
  // }

  private _removeEl(el: HTMLElement) {
    // 调用并等待close回调函数
    if (this._propsOnDestroy) {
      this._propsOnDestroy();
    }
    let closeRet = this._callRootScopeCallback("onClose", [this]);
    if (closeRet instanceof Promise) {
      closeRet.then((v) => {
        el.remove();
      });
    } else {
      el.remove();
    }
  }

  // private _apply$For = _Utils._delayCall(this._apply$For1.bind(this));
  /**
   * 检查和应用 $for 元素
   * @param forEl
   * @returns
   */
  private _apply$For(el: ScopedElement & { __applyFor?: Function }): void {
    if (!(el instanceof HTMLTemplateElement && el.$scope && el.$scope.hasOwnProperty("for"))) return;

    let _fn = (forEl: ScopedElement) => {
      const forEid = forEl.getAttribute("eid");
      // 递归获取所有子元素
      function _forElemList() {
        let list = [] as ScopedElement[];

        forEl.parentNode?.querySelectorAll(`[for-eid="${forEid}"]`)?.forEach((el) => list.push(el as ScopedElement));
        return list;
      }

      // 定义内部函数
      /**
       * 遍历For对象
       * @param callback
       */
      function _forObjForEach(forObj: any, callback: (v: any, k: any, o: any) => any) {
        if (typeof forObj === "number") {
          for (let i = 0; i < forObj; i++) callback(i, i, forObj);
        } else if (forObj instanceof Array) {
          forObj.forEach(callback);
        } else if (forObj instanceof Set) {
          forObj.forEach(callback);
        } else if (forObj instanceof Map) {
          forObj.forEach(callback);
        } else if (typeof forObj === "object") {
          Object.keys(forObj).forEach((name) => {
            callback(forObj[name], name, forObj);
          });
        }
      }

      // if(forEid == '27') debugger;
      // ============= 执行FOR 处理逻辑
      const forValueName = forEl.getAttribute("for-value")!;
      const forIndexName = forEl.getAttribute("for-index")!;

      // 获取当前的元素列表
      let existedForElemList = _forElemList();

      // 获取新的元素列表
      // 创建已有的元素valuesMap
      let existedElemValueMap = new Map<any, ScopedElement>();
      existedForElemList.forEach((v) => {
        existedElemValueMap.set(v.$scope[forIndexName], v);
      });

      let forObject = forEl.$scope.for instanceof Array ? [...forEl.$scope.for] : forEl.$scope.for;
      // 处理原始数据对象，并处理sort和filter,只有针对数组生效
      if (forObject instanceof Array && forEl.$scope.hasOwnProperty("sort") && forEl.$scope.sort) {
        let sort = forEl.$scope.sort;
        if (typeof sort === "object") {
          // 使用数组匹配多项排序,格式:{a:1,b:0,'a.b':1}
          forObject.sort((a, b) => {
            let ret = 0;
            for (let sortK of Object.keys(sort)) {
              let dir = sort[sortK] > 0;
              // log.debug('check sort:', sortK, dir);
              if (objectGet(a, sortK) < objectGet(b, sortK)) {
                ret = dir ? -1 : 1;
              } else if (objectGet(a, sortK) > objectGet(b, sortK)) {
                ret = dir ? 1 : -1;
              }
            }
            // 相等
            return ret;
          });
        } else if (!_Utils._checkBool(sort)) {
          // 倒序数组，拷贝新的对象
          forObject.reverse();
        }
      }

      // 根据过滤结果重建新的子元素列表
      // 如果对应元素已经存在，则重用已有元素
      let calcedChildLiSt = [] as ScopedElement[];
      let newChildSet = new Set<ScopedElement>();
      _forObjForEach(forObject, (value, index, obj) => {
        let existedEl = existedElemValueMap.get(index);
        if (existedEl) {
          if (existedEl.$scope) {
            existedEl.$scope[forIndexName] = index;
            existedEl.$scope[forValueName] = value;
          }

          newChildSet.add(existedEl);
          calcedChildLiSt.push(existedEl);
        } else {
          // 创建新的for子元素
          let newEl = (<HTMLTemplateElement>(<any>forEl)).content.firstElementChild?.cloneNode(true) as ScopedElement;
          newEl.setAttribute("for-eid", forEl.getAttribute("eid")!);

          let scope = {} as any;
          scope[forIndexName] = index;
          scope[forValueName] = value;
          (newEl as ScopedElement).__initScope = {
            parentScope: forEl.$scope,
            scope,
          };
          this._applyTemplateDeep(newEl);
          calcedChildLiSt.push(newEl);
          newChildSet.add(newEl);
        }
      });

      function _getNextRealIfEl(el: Element) {
        let ifRealEl = el.nextSibling;
        if (ifRealEl && ifRealEl instanceof HTMLElement) {
          let eid = el.getAttribute("eid");
          let ifEid = ifRealEl.getAttribute("if-eid");
          if (eid == ifEid) return ifRealEl;
        }
      }
      // 对比新旧两个列表，进行同步，移动元素不产生leave ani,只产生enter动画
      // 1.删除所有不存在于新列表中的元素，删除
      existedForElemList = existedForElemList.filter((el) => {
        if (!newChildSet.has(el)) {
          // 如果el是$if,则删除$if模板元素和真实的if元素
          let ifRealEl = _getNextRealIfEl(el);
          if (ifRealEl) {
            ifRealEl.remove();
          }
          el.remove();
          // });
          return false;
        }
        return true;
      });

      // 遍历，插入或者新增,同步新旧列表
      calcedChildLiSt.forEach((el, i) => {
        let prevEl = existedForElemList[i - 1] || forEl;
        if (el != existedForElemList[i]) {
          // 不一致，添加元素或者移动
          let prevRealEl = _getNextRealIfEl(prevEl);
          if (prevRealEl) prevRealEl.after(el);
          else prevEl.after(el);

          // 为列表插入元素
          existedForElemList.splice(i, 0, el);
          // this._applyTemplateDeep(el);
          // 应用进入动画
          // this._applyAttrAni(v, true);
        }
      });
    };

    if (!el.__applyFor) el.__applyFor = _Utils._delayCall(_fn.bind(this));

    el.__applyFor(el);
  }

  /**
   * 使用模板元素转换方法切换if状态
   * 删除所有相关的dataBinder
   * 对于 if 标签，如果同时存在 for 标签, if 标签将作用在每个for的 ITEM上
   * @param ifTempElem
   */
  private _apply$If(el: ScopedElement & { __applyIf?: Function }) {
    if (!(el instanceof HTMLTemplateElement && el.$scope && el.$scope.hasOwnProperty("if"))) return;
    const _fn = (ifTempElem: ScopedElement) => {
      const flag = _Utils._checkBool(ifTempElem.$scope.if);

      if (flag) {
        // 切换显示状态
        let ifEl = ifTempElem.nextElementSibling as ScopedElement;

        // 检测是否已经在显示状态
        if (!(ifEl && ifEl.getAttribute("if-eid") == ifTempElem.getAttribute("eid"))) {
          const newEl = (<HTMLTemplateElement>(<any>ifTempElem)).content.firstElementChild?.cloneNode(true) as ScopedElement;

          newEl.setAttribute("if-eid", ifTempElem.getAttribute("eid")!);
          ifTempElem.after(newEl);
          newEl.__initScope = {
            parentScope: ifTempElem.$scope,
            scope: {},
          };
          this._applyTemplateDeep(newEl);
          // 下个周期切换
          // this._applyAttrAni(newEl, true);
          // 下个周期设置 "if" 属性，以进行切换
          // requestAnimationFrame(() => {
          //   newEl.setAttribute("if", "");
          // });
          return;
        }
      } else {
        // 切换隐藏状态
        // 2023-12-29 首先设置attr,添加
        let ifEl = ifTempElem.nextElementSibling as ScopedElement;
        if (ifEl && ifEl.getAttribute("if-eid") == ifTempElem.getAttribute("eid")) {
          // 删除原有元素的data binder
          // 删除 $id
          // this._deepDeleteElemBinderAndRef(ifEl);
          if (!((ifEl as any) instanceof HTMLTemplateElement)) {
            // this._applyAttrAni(ifEl, false, (aniEl) => {
              this._removeEl(ifEl as HTMLElement);
            // });
          }
        }
      }
    };

    // 限制和延时调用$if,disabled
    // if (!el.__applyIf) el.__applyIf = _Utils._delayCall(_fn.bind(this));
    // el.__applyIf(el);

    // Modify by zf: 2023.12.23
    _fn(el);
  }

  // 替换一个元素，并保留当前元素的scope,attrs,保留当前eid
  // async _replaceElWith(el: ScopedElement, toTag: string) {
  // let tidAttr = el.getAttribute("tid")!;

  // _Utils._replaceNewTag;

  // let newEl = tidAttr
  //   ? (this.$tpl._cloneElementByTid(parseInt(tidAttr), toTag) as ScopedElement)
  //   : (_Utils._replaceNewTag(el, toTag, true, true) as ScopedElement);
  //
  // 注册所有
  // let tagTpl = _registerTag(toTag,undefined,this.$tpl.info.from);
  // await tagTpl?._waitReady();

  /**
   * 复制新元素
   */
  // await _Utils._replaceWithNewTag(el, toTag);

  // let newEl = document.createElement(toTag) as ScopedElement;
  // 检测和注册新的TAG
  // await _registerElement(newEl, this.$tpl.info.from, false);
  // 清除原有元素的引用和绑定
  // this._deepCleanElemBinder(el, false);

  // // 初始化Scope
  // if (el.$scope) {
  //   newEl.__initScope = { parentScope: el.$scope.$parent, scope: el.$scope };
  // }

  // 复制属性
  // for (let i = 0; i < el.attributes.length; i++) {
  //   const att = el.attributes[i];
  //   // 排除已在scope中属性
  //   let scopeName = _Utils._kebabToSnake(att.name);
  //   if ((!att.name.startsWith('!')) && el.$scope && Reflect.has(el.$scope, scopeName)) {
  //     // scope变量 检测类型，并设置属性
  //     let v = el.$scope[scopeName];
  //     if ((typeof v == 'string') || typeof v == 'number' || typeof v == 'boolean') {
  //       newEl.setAttribute(att.name, v.toString());
  //     }
  //   } else {
  //     newEl.attributes.setNamedItem(att.cloneNode(false) as any);
  //   }
  // }
  // el.$scope = undefined;
  // this._applyTemplateDeep(newEl);
  // 初始化新元素
  // el.replaceWith(newEl);
  // return newEl;
  // }

  /**
   * 应用 $as 属性
   * 新的 元素 继承原有元素的属性，scope以及slot子元素
   * @param el
   * @returns
   */
  private async _apply$As(el: ScopedElement) {
    let as = el.getAttribute("as")?.toLowerCase();
    let tag = el.tagName.toLowerCase();
    // log.debug("_apply$As", tag,"tid=",el.getAttribute('tid'),"eld=",el.getAttribute('eid'), "to", as);
    if (el instanceof HTMLTemplateElement) return;

    let tidAttr = el.getAttribute("tid");
    if (as && tag != as && tidAttr) {
      let newEl = await _replaceWithNewTag(el, as);
      // log.debug("new as El", newEl);
    }
  }

  /**
   * 初始化 $Show
   *
   */
  private _init$Show(el: ScopedElement) {
    if (el.style && el.style.display && el.style.display.toLowerCase() != "none") {
      el.$orgDisplay = el.style.display;
    }
  }
  /**
   * $ show 参数 默认为true, 0,false,或者不存在为false
   * @param el
   * @param init
   * @returns
   */
  private _apply$Show(el: ScopedElement, init?: boolean) {
    if (!(el.$scope && el.$scope.hasOwnProperty("show"))) return;

    function _setDisplayStyle() {
      const isShow = _Utils._checkBool(el.$scope.show);
      if (isShow) {
        if (el.$orgDisplay) {
          el.style.display = el.$orgDisplay!;
        } else {
          el.style.removeProperty("display");
        }
      } else {
        el.style.display = "none";
      }
    }

    // 切换显示时即时切换，切换隐藏时等待动画完成
    let startShow = _Utils._checkBool(el.$scope.show);
    if (startShow) {
      _setDisplayStyle();
    }
    // this._applyAttrAni(el, startShow, () => {
      _setDisplayStyle();
    // });
  }

  private _apply$Vis(el: ScopedElement) {
    if (!(el.$scope && el.$scope.hasOwnProperty("vis"))) return;
    const isVis = _Utils._checkBool(el.$scope.vis);

    if (isVis) {
      // 显示
      el.style.visibility = "visible";
      // this._applyAttrAni(el, true, () => {});
    } else {
      // 隐藏
      // this._applyAttrAni(el, false, () => {
        el.style.visibility = "hidden";
      // });
    }
  }

  private _applySlotElement(el: HTMLElement) {}

  /**
   * 为元素应用模板
   * @param el
   * @param tplInstance
   */
  _applyElementTemplate(el: ScopedElement) {
    // if(el instanceof HTMLTemplateElement) return;
    // 处理 as 属性
    // log.info('_applyElementTemplate!!', this._eidCounter, el.tagName, el.getAttribute('eid'));
    el.setAttribute("eid", (this._eidCounter++).toString());
    // 处理动态属性和文本
    let normalAttrs = [] as Attr[];
    let eventAttrs = [] as Attr[];
    let bindAttrs = [] as Attr[];
    for (let i = 0; i < el.attributes.length; i++) {
      let att = el.attributes.item(i)!;
      // 需首先初始化所有attr scope属性,否则在数据绑定时将出现"未发现变量"的错误
      if (att.name.startsWith("@")) {
        // 事件绑定无需初始化 scope 变量
        eventAttrs.push(att);
      } else if (att.name.startsWith(":") || att.name.startsWith("$")) {
        bindAttrs.push(att);
      } else {
        normalAttrs.push(att);
      }
    }

    // 首先初始化所有的普通属性
    let initScope = (el.__initScope?.scope || {}) as any;

    for (let att of normalAttrs) {
      let sp = att.name.split(".");
      let name = sp[0];
      let flag = sp[1];

      if (flag == "lazy") {
        // 懒加载
        initScope[_Utils._kebabToSnake(name)] = "";
        setTimeout(() => {
          el.$scope[_Utils._kebabToSnake(name)] = att.value;
        }, 50);
        el.removeAttributeNode(att);
        // el.setAttribute(name, att.value);
      } else { 
        initScope[_Utils._kebabToSnake(name)] = att.value;
      }
    }

    // 绑定属性初始化，需提前初始化，防止scope覆盖对象
    for (let att of bindAttrs) {
      let sp = att.name.slice(1).split(".");
      let name = sp[0];
      if (name.length > 0) {
        initScope[_Utils._kebabToSnake(name)] = "";
        el.removeAttribute(att.name);
      }
    }

    let scope = this._initLocalScope(el, el.__initScope?.parentScope, initScope);
    // 处理sloted Element
    function _findSlotParentScope(el: HTMLSlotElement | null): any {
      if (!el) return {};
      if ((<any>el).$scope) return (<any>el).$scope;
      return _findSlotParentScope(<any>el.parentElement);
    }

    if (el instanceof HTMLSlotElement) {
      el.addEventListener("slotchange", () => {
        el.assignedElements().forEach((slotedEl) => {
          let sc = (slotedEl as ScopedElement)?.$scope;
          if (sc) {
            sc.$slot = _findSlotParentScope(el) || {};
          }
        });
      });
    } else if (el.hasAttribute("slot")) {
      scope.$slot = _findSlotParentScope(el.assignedSlot) || {};
    }
    // 处理style元素
    if (el.tagName.toLowerCase() === "style") {
      this._initStyleElement(el, true);
      return;
    }

    // 进行数据绑定
    for (let att of bindAttrs) {
      this._createElementDataBinder(el, att.name);
    }

    // 初始化事件属性
    for (let att of eventAttrs) {
      // 最后做事件绑定，因为事件绑定可能使用到数据属性
      this._createEventBinder(el, att.name);
      el.removeAttribute(att.name);
    }

    // 如果是slot元素，则监听事件
    // 处理 as
    // 需要提前处理IF
    // this._apply$If(el);
    // this._apply$For(el);

    // 处理动态属性和文本
    this._init$Show(el);
    // this._apply$Vis(el);
    // 初始化检测进入动画
    // this._applyAttrAni(el, true);
  }

  /**
   * 自动加载含有src的svg元素
   * @param el
   */
  private async _applySvgSrc(el: ScopedElement) {
    if (!(el instanceof SVGElement)) return;
    // 如果src未改变则重新加载
    let srcStr = el.$scope?.src || el.getAttribute("src");
    if (!srcStr) return;
    // log.debug('!__++++', srcStr);

    let src = this.$path(srcStr);
    if (src == (el as any).__loaded) return; // 重复不加载
    (el as any).__loaded = src;

    // 加载svg内容，并替换子节点,复制viewBox属性
    let doc = (await _umdLoader.getFile(src).getResult()) as DocumentFragment;
    if (doc) {
      let svg = doc?.querySelector("svg");
      if (svg) {
        // 删除所有子节点
        while (el.firstChild) el.removeChild(el.firstChild);
        svg.childNodes.forEach((n) => el.append(n.cloneNode(true)));
        el.setAttribute("viewBox", svg.getAttribute("viewBox")!);
      } else {
        log.warn("load svg failed", el);
        _umdLoader.removeFileMatched(src); // 删除文件，下次重试
      }
    }

    // if (el.$scope) log.debug('_applySvgSrc:', el, src);
  }
}

/**
 * 替换一个元素为一个新的标签，属性和子元素完全一致
 * 删除原有元素的数据绑定
 * 重建新元素的数据绑定
 * @param fromElem
 * @param toTag
 */

export async function _replaceWithNewTag(fromElem: ScopedElement, toTag: string): Promise<ScopedElement> {
  // 获取toTag,
  let hostEl = _Utils._findRootWcElem(<HTMLElement>fromElem);
  let tplFrom = (<any>hostEl)?.$wc?.$tpl?.info?.from;
  let toTpl = _registerTag(toTag, undefined, tplFrom);
  if (toTpl) await toTpl._waitReady();

  function _cloneAttrs(_fromEl: ScopedElement, _toEl: HTMLElement) {
    let ownScopeKey = {} as { [k: string]: any };
    if (_fromEl.$scope) {
      Reflect.ownKeys(_fromEl.$scope).forEach((v) => {
        if (typeof v == "string") ownScopeKey[v] = true;
      });
    }

    for (let i = 0; i < _fromEl.attributes.length; i++) {
      // 排除已在scope中属性
      if (!ownScopeKey[_Utils._kebabToSnake(_fromEl.attributes[i].name)])
        _toEl.attributes.setNamedItem(_fromEl.attributes[i].cloneNode() as Attr);
    }
  }
  function _moveChilds(_fromEl: HTMLElement, _toEl: HTMLElement) {
    // 移动所有子元素
    let nodes = [];
    for (let i = 0; i < _fromEl.childNodes.length; i++) {
      let child = _fromEl.childNodes.item(i) as ScopedElement;
      // let newChild = child.cloneNode(true);
      // // 检查并复制子元素的$scope
      // if (_fromEl.childNodes.item(i).$scope) {
      //   }
      if (child.$scope) {
        child.$scope.$el = child;
      }
      nodes.push(child);

      // .cloneNode(true));
    }
    // 移动所有的子节点到新元素
    _toEl.append(...nodes);
  }

  const newEl = <ScopedElement>document.createElement(toTag);
  let fromScope = (<ScopedElement>fromElem).$scope;

  // 检查from是否具有scope，如有则需要进行数据同步，否则直接替换
  if (fromScope) {
    // 动态tag替换
    let tpl = <_Tpl>(<any>fromScope).$tpl;
    let tid = fromElem.getAttribute("tid")!;
    let tElem = tpl._getElementByTid(tid);
    let wc = <Wc>(<any>fromScope).$wc;

    // 复制tElem所有属性到新元素
    _cloneAttrs(<ScopedElement>tElem, <HTMLElement>newEl);
    // 复制现有属性到新元素, 覆盖默认值,排除已在scope中的属性
    _cloneAttrs(<ScopedElement>fromElem, <HTMLElement>newEl);
    // 移动from所有子元素到新元素
    _moveChilds(<HTMLElement>fromElem, <HTMLElement>newEl);

    // 复制模板元素的attrs

    // 初始化Scope
    newEl.__initScope = { parentScope: fromScope.$parent, scope: fromScope };

    // 重新设置所有子元素的$parent指向,
    for (let i = 0; i < newEl.children.length; i++) {
      let child = newEl.children.item(i)! as ScopedElement;
      if (child.$scope && child.$scope.$parent == fromElem.$scope) {
        // 将原指向来源元素的$parent修正到新元素
        child.$scope.$parent = newEl.$scope;
      }
    }

    // 清理源数据绑定
    wc._deepCleanElemBinder(fromElem, false);
    delete fromElem.$scope;

    // 初始化元素绑定
    wc._applyElementTemplate(newEl);

    // 替换新元素
    fromElem.replaceWith(newEl);
  } else {
    log.debug("replaceWithNewTag 2", fromElem, toTag, fromScope);

    // 静态tag替换, 直接复制属性和子元素
    _cloneAttrs(<ScopedElement>fromElem, <HTMLElement>newEl);
    _moveChilds(<HTMLElement>fromElem, <HTMLElement>newEl);
    fromElem.replaceWith(newEl);
  }

  return newEl;
}
