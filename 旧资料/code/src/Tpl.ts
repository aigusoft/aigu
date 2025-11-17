/**
 * 2022-4-3 新增实现本地组件加载(标签不包含"--",但包含"-")
 * 从当前html所在目录进行加载组件
 * 有效地 WebComponent 字符 "-_."
 * "-" 用于进行 kebebCase 文件名
 * "." 用于分割 npm 包和实际文件
 * "_" 用于替换文件路径分割 "/"
 * 例如:
 *    1. @abc/def 包里的路径 ui/myButton.html 对应 html tag 为: <abc_def.ui_my-button>
 *    2. 当前目录下组件:  ui/dark/btn.html 对应在 ui 访问 tag 可以为 <ui_dark_btn>
 *    3. 在当前包中可直接使用短名称进行引用 <abc_def_test-component>
 *
 * @TODO shadow.adoptedStyleSheets = [sheet]; 使用此属性进行 css 和 style 缓存和加载
 */

import { _StyleParser } from "./StyleParser";
import { elementAttrs, PromiseExt as _PromiseExt, _Utils } from "./Utils";
import { _observer } from "./Observer";
import { _registerElement, _replaceWithNewTag } from "./Wc";
import { _htmlMeta } from "./HtmlMeta";
import { ITagInfo, _parseTag, _buildTag, _kebabPkgName } from "./WcTag";
// import { uiLibrary } from './UiLibrary';
import { _umdLoader } from "./UmdLoader";
import { _pluginsManager } from "./plugins/Plugins";
import { WcLog } from "./Logger";
import { TplElem } from "./TplElem";
import { ScopedElement } from "./plugins/IPlugins";
const log = WcLog(module);

export const SymbolScopeNoCall = Symbol("ScopeNoCall");

// 初始化模板根元素
export interface ITplData {
  _type: string;
  _value: any;
  _orgName: string; //原始的名字
  _orgValue: string; // 原始的值
  _scopeName: string; // 通过kebabToSnake转换的本地scopeName
  _attName: string; //与key一致的attName
  // attrName: string; // 原始属性值(去除 $,@以及点等解析数据)
}

/**
 * 管理模板数据，包括模板属性数据和内部数据
 * 属性数据定义在<template>
 * 内部数据定义在 <meta name="scope">上
 */
export class _TplData {
  private _tplElem: HTMLTemplateElement | undefined;
  /**
   * 属性映射表, key为实际的属性名，kebab格式，不包括$,@等
   */
  private _propData = {} as { [k: string]: ITplData; };
  // private _propSortedKeys = [] as string[]; // 对props进行排序，特殊属性（@,$,:）排列在后
  private _scopeData = {} as { [k: string]: ITplData; };
  private _scopeMetaEl: HTMLMetaElement | undefined;
  constructor() { }
  /**
   * 初始化模板 props 的管理
   * @param tplEl
   * @returns
   */
  init(tplEl: HTMLTemplateElement) {
    this._tplElem = tplEl;
    this._propData = this._parseAttrs(tplEl);
    // this._propSortedKeys = Object.keys(this._propData).sort((a, b) => (a == b ? 0 : a < b ? 1 : -1));
    this._scopeMetaEl = tplEl.content.querySelector("meta[name=scope]") as HTMLMetaElement;
    if (!this._scopeMetaEl) {
      this._scopeMetaEl = document.createElement("meta");
      this._scopeMetaEl.setAttribute("name", "scope");
      const first = tplEl.content.firstElementChild;
      if (first) tplEl.content!.insertBefore(this._scopeMetaEl, first);
      else tplEl.content.appendChild(this._scopeMetaEl);
    }
    this._scopeData = this._parseAttrs(this._scopeMetaEl);
    return this;
  }
  props() {
    return this._propData;
  }

  private _parseAttrs(el: Element): { [k: string]: ITplData; } {
    const data = {} as { [k: string]: ITplData; };
    for (let i = 0; i < el.attributes.length; i++) {
      // 初始化解析传入参数
      const att = el.attributes[i];
      // 排除meta元素的name属性
      if (el instanceof HTMLMetaElement && att.name == "name") continue;

      if (att.name.startsWith("@")) {
        // 创建根元素的事件绑定
        data[att.name] = {
          _type: "@",
          _value: att.value,
          _orgValue: att.value,
          _scopeName: "",
          _orgName: att.name,
          _attName: att.name,
        };
      } else {
        const sp = att.name.split(".");
        // const name = sp[0];
        const attName = sp[0].replace(/^[$:@]/, "");
        const type = sp[1] || "string";
        const value = att.value;

        data[attName] = {
          _type: type,
          _value: this._parseValue(type, value),
          _orgName: att.name,
          _orgValue: value,
          _scopeName: _Utils._kebabToSnake(attName),
          _attName: attName,
        };
      }
    }
    return data;
  }

  _scopeDataEach(callback: (prop: ITplData, key: string) => void) {
    Object.keys(this._scopeData).forEach((key) => {
      callback(this._scopeData[key], key);
    });
  }

  /**
   * 按照排序一次回调每个属性
   * @param callback
   */
  // _propsSortedEach(callback: (prop: ITplData, key: string) => void) {
  //   for (let i = 0; i < this._propSortedKeys.length; i++) {
  //     let k = this._propSortedKeys[i];
  //     callback(this._propData[k], k);
  //   }
  // }
  propsExist(name: string) {
    return (this._propData as Object).hasOwnProperty(name);
  }
  propType(name: string) {
    return this._propData[name]?._type;
  }


  private _parseValue(type: string, value: string) {
    try {
      switch (type) {
        case "bool":
          return !(value == "no" || value == "false" || parseInt(value) <= 0);
        case "int":
          return parseInt(value);
        case "float":
          return parseFloat(value);
        case "number":
          return parseFloat(value);
        case "object":
        case "obj":
          if (value.startsWith("{") && value.endsWith("}")) {
            return new Function(`return ${value}`).call(undefined);
          } else return undefined;
        case "array":
          if (value.startsWith("[") && value.endsWith("]")) {
            return new Function(`return ${value}`).call(undefined);
          } else return undefined;

        default:
          return value;
      }
    } catch (e: any) {
      log.warn(
        "parse value failed:",
        `type=${type}, `,
        `value=${value}[${typeof value}], `,
        "<" + this._tplElem?.getAttribute("_tpl") + ">",
        this._scopeMetaEl
      );
      return undefined;
    }
  }

  /**
   * 获取模板定义的props,解析value，不存在则返回默认值
   * @param name 名称
   * @param value 值
   */
  propsGetValue(name: string, value: string | null): any | undefined {
    if (!this.propsExist(name)) {
      // 不存在的属性
      log.warn(`${this._tplElem?.tagName} undefined prop "${name}", valid props:`, Object.keys(this._propData));
      return undefined;
    }
    if (typeof value === "string") {
      // 解析属性
      return this._parseValue(this._propData[name]._type, value);
    } else if (value == null || value == undefined) {
      // 无效的值，返回默认
      return this._propData[name]._value;
    } else {
      return value;
    }
  }
  getData(name: string): ITplData | undefined {
    return this._propData[name] || this._scopeData[name];
  }

  /**
   * 设置模板数据
   * @param name 名称
   * @param value 值
   * @param onlyDefault 是否只有当前值不存在的时候才设置
   */
  setData(name: string, value: string) {
    const data = (this._propData as Object).hasOwnProperty(name) ? this._propData : this._scopeData;
    // 不存在时不进行设置，可能是script中的值，使用原始默认值
    if (data[name]) {
      data[name]._orgValue = value;
      data[name]._value = this._parseValue(data[name]._type, value);
    }
  }
}

/**
 * 模板类，预编译和解析模板
 * 动态加载模板
 */
export class _Tpl {
  tag: string;
  info: ITagInfo;
  comment = "";
  // extendsUi?: string; // 扩展UI 元素标签名称

  /**
   * 保存预加载的所有 scope 列表
   */
  private _preloadScopes = {} as { [k: string]: any; };

  tplRoot?: HTMLTemplateElement;

  private _tidCounter = 1;
  private _scriptIdCounter = 1;
  _styleParser = new _StyleParser();

  // private static _tplRootElem: HTMLTemplateElement | null;
  /**
   * 索引为字符串,以|分隔的的标志:1
   * 如针对attr, "{tid}|{attrName}|{forIndex}"
   * 如针对style, "{tid||{ruleName}|{styleName}"
   */
  private _dataBinder = new Map<string, Function | Function[]>();
  private _elementsMap = new Map<number, Element>();

  private _loadPromise: Promise<any>;
  private _tplData = new _TplData();

  // private static _register = {} as { [k: string]: _Tpl };
  constructor(tag: string, from: string | undefined) {
    log.debug(`load component <${tag}>, from: ${from},${typeof from}`);

    this.tag = tag.toLowerCase();
    this.info = _parseTag(tag, from);
    // this.extendsUi = extendsUi;
    // 全局注册
    // _Tpl._register[this.tag] = this;

    // 启动加载模板
    this._loadPromise = this._load();
  }
  // static getRegistedTpl(tag: string): _Tpl | undefined {
  //   return _Tpl._register[tag];
  // }
  _getTplData() {
    return this._tplData;
  }
  _waitReady(): Promise<any> {
    return this._loadPromise;
  }

  // _cloneElementByTid(tid: number, toTag: string | undefined) {
  //   const el = <Element>this._elementsMap.get(tid)!.cloneNode(true);
  //   return toTag ? _Utils._cloneToNewTag(el, toTag, true, true) : el;
  // }

  private _addTplToDomRoot(tpl: HTMLTemplateElement) {
    let rootEl = document.getElementById("wc-templates") as HTMLTemplateElement;
    if (rootEl) {
      const tag = tpl.getAttribute("tpl");
      const exist = rootEl.content.querySelector(`[tpl="${tag}"]`);
      if (exist) {
        log.info("replace tpl:", tag);
        exist.replaceWith(tpl);
      } else rootEl.content.appendChild(tpl);
    }
  }

  /**
   * 异步加载模板
   * 使用<script>标签加载, 以支持mhtml文件
   */
  private async _load() {
    // 异步读取模板,使用 <script> 加载??，支持
    try {
      const htmlUrl = this.info.url;

      // 加载模板内容
      log.warn('load tpl:', htmlUrl);

      const doc = await _umdLoader.getModule(this.info.pkg)._getFile(htmlUrl).getResult();
      // const t = document.createElement('template') as HTMLTemplateElement;
      // try {
      //   if (!this.srcHtml) this.srcHtml = await UmdLoader.staticFetch(htmlUrl, false);
      //   t.innerHTML = this.srcHtml;
      // } catch (e: any) {
      //   log.error('wc template load fail', htmlUrl, e.message);
      //   return;
      // }
      if (!doc) throw Error("load html template failed");
      // 获取注释信息
      if (doc.firstChild instanceof Comment) {
        this.comment = doc.firstChild.textContent || "";
      }

      if (!(doc.firstElementChild instanceof HTMLTemplateElement)) {
        throw Error("template invalid");
      }
      const elRoot = (doc.firstElementChild as HTMLTemplateElement).cloneNode(true) as HTMLTemplateElement;

      //加载和注册子元素WC
      // _tplRegister.register(el, this.info.from);
      // 预加载 module
      // if(this.tag)
      await this._preloadDepsModule(elRoot);

      // 预处理组件内部短名称
      await _Utils._walkChild(
        elRoot.content,
        async (el) => {
          // 预处理所有短名称，更改为包含包名的长名称，自内而外进行处理
          if (el.tagName.indexOf("-") >= 0 && this.info.from && el.tagName.indexOf(".") < 0) {
            //检测是否已经注册
            if (!customElements.get(this.tag)) {
              let pkgPart = _kebabPkgName(this.info.from);
              let eltag = el.tagName.toLowerCase();
              if (pkgPart.indexOf("-") && eltag.endsWith("-")) {
                // 去除最后的 '-'
                eltag = eltag.slice(0, eltag.length - 1);
              }
              await _replaceWithNewTag(<ScopedElement>el, pkgPart + "." + eltag);
              // el.replaceWith(newEl);
            }
          }
        },
        true,
        false
      );

      // 处理预加载插件模板,使得插件有机会处理模板中的link标签
      await _pluginsManager._stages().tplPre?.(elRoot.content);

      // 预处理模板，检测模板是否引用外部css，并注入css
      await this._preloadCssLinkAndStyle(elRoot);

      // 预处理模板，检测模板是否引用外部js，注入JS
      await _PromiseExt._timeout(this._preloadAllScripts(elRoot), 15000);

      // 预处理模板，检测是否引入数据到外部作用域

      this.tplRoot = elRoot;

      // 处理 UI 组件, 排除掉指定标签
      // 获取忽略的UI替换组件

      // let exclude = (elRoot instanceof HTMLTemplateElement ? elRoot.content : elRoot)
      //   .querySelector('meta[name=exclude]')
      //   ?.getAttribute('content')
      //   ?.split(';')
      //   .filter((v) => v.trim());
      // uiLibrary.applyUiElement(elRoot, exclude);

      // 解析和初始化模板属性
      elRoot.setAttribute("_tpl", this.tag);
      let props = this._tplData.init(elRoot).props();

      Object.keys(props).forEach((k) => {
        let p = props[k];
        let n = p._orgName;
        if (n.startsWith("@") || n.startsWith("$") || n.startsWith(":")) {
          const binderKey = `root|${n}`;
          // 创建数据绑定元素
          this._dataBinder.set(binderKey, this._mkScopeBinder(n, p._value));
        }
      });
      // ._propsSortedEach((prop, key) => {
      //   if (key.startsWith('@') || key.startsWith('$') || key.startsWith(':')) {
      //     const binderKey = `root|${key}`;
      //     // 创建数据绑定元素
      //     this._dataBinder.set(binderKey, this._mkScopeBinder(key, prop.value));
      //   }
      // });

      // 解析和预处理模板，进行语法糖修正, 检测需要加载的元素, 返回需要预加载的 WC 组件名称
      await this._preProcessElem(elRoot);
      // 遍历和递归解析所有子元素模板
      this._parseElemTpl(elRoot);

      // 加载使用到的 WC 组件
      await _registerElement(elRoot, this.info.from, true);

      // 处理预加载插件模板,注册后生效
      await _pluginsManager._stages().tplPost?.(elRoot.content);

      // this._parseTpl();

      this._addTplToDomRoot(elRoot);
      // log.info(`tpl ok: <${this.tag}>`);

      // 全部模板加载完成后定义组件
    } catch (e: any) {
      log.error(`load <${this.tag}> failed:`, e.message);
      // 发送异常事件
      window.dispatchEvent(new CustomEvent("wc-error", { detail: { tag: this.tag, err: e.message } }));
    }
  }

  /**
   * 根据传入参数获取绝对路径
   * "@/" 映射为NPM路径
   * "./" 相对路径
   *   
   * @param src 源
   * @param ext 扩展名
   * @returns 绝对路径
   */
  _relPath(src: string, ext?: string): { url: string, pkg?: string, relPath?: string; } {

    // if(src.match('httpLib')) debugger;
    if (src.startsWith("@/")) src = src.slice(2);
    if (src == ".") src = _htmlMeta.rootUrl(_Utils._kebabToSnake(this.info.component) + ext || "");
    if (src.startsWith('./') || src.startsWith('../')) {
      // 相对引用
      if (this.info.from) {
        // 相对来源路径引用包
        return { url: _Utils._joinUrl(this.info.url, "..", src) };
      } else {
        // 当前根引用
        let r = _htmlMeta.rootUrl(_Utils._kebabToSnake(this.info.component));
        let p = _Utils._joinUrl(r, "..", src);
        return { url: p };
      }
    } else if (src.startsWith('/') || src.startsWith('http://') || src.startsWith('https://')) {
      // 绝对引用
      return { url: src };
    } else {
      // npm 引用,检测npm包名规则（@aaa/bbb）或者 aaabbb
      let sp = src.split("/");

      let pkg = sp[0].startsWith("@")
        ? {
          // 两部分包名
          name: sp.slice(0, 2).join("/"),
          path: sp.slice(2).join("/"),
        }
        : {
          name: sp[0],
          path: sp.slice(1).join("/"),
        };
      let m = _htmlMeta.modules[pkg.name];
      // if(!pkg.path) pkg.path = 'index.js'
      // return  _Utils._joinUrl(m.baseUrl,  pkg.path)
      let p1 = m?.baseUrl
        ? _Utils._joinUrl(m.baseUrl, pkg.path)
        : _Utils._joinUrl(_htmlMeta.npmUrl, m?.version ? `${pkg.name}@${m.version}` : pkg.name, pkg.path);
      return { url: p1, pkg: pkg.name, relPath: pkg.path };
    }
  }

  private _getCssTplRoot(): HTMLTemplateElement {
    const el = document.getElementById("wc-styles") as HTMLTemplateElement;
    if (!el) {
      const tpl = document.createElement("template");
      tpl.id = "wc-styles";
      document.body.appendChild(tpl);
      return tpl;
    }
    return el;
  }
  private async _preloadDepsModule(rootEl: HTMLTemplateElement) {
    let preloadModules = rootEl.content.querySelectorAll("meta[name=module]");
    for (let i = 0; i < preloadModules.length; i++) {
      let el = preloadModules[i] as HTMLMetaElement;
      let mod = _htmlMeta._parseMetaModule(el);
      if (mod && mod.preload) {
        await _umdLoader.getModule(mod.name).getResult();
        // await umdLoader.getMainModule(mod.name, undefined).getExports();
      }
    }
  }

  /**
   * 预加载 CSS,通过全局加载css模块,复制css标签
   * 全局加载CSS注入 <template id="wc-css">
   */

  private async _preloadCssLinkAndStyle(rootEl: HTMLTemplateElement) {
    let linkList = rootEl.content.querySelectorAll("link[rel=stylesheet]");
    // const removeGlobalLink = [] as HTMLElement[];
    // 所有css link 默认转换为style，避免浏览器多次加载
    for (let i = 0; i < linkList.length; i++) {
      let cssLink = linkList.item(i) as HTMLLinkElement;
      let href = cssLink.getAttribute("href") || ".";
      let cssUrl = this._relPath(href, ".css").url;
      try {
        let global = cssLink.getAttribute("global");
        let newEl: HTMLStyleElement;
        if (global == "link") {
          // 使用原始link标签
          newEl = cssLink.cloneNode(true) as HTMLLinkElement;
          newEl.setAttribute("href", cssUrl);
        } else {
          let elResult = (await _umdLoader.getModule(this.info.pkg)._getFile(cssUrl).getResult()) as HTMLStyleElement;
          // 注入到全局
          newEl = elResult.cloneNode(true) as HTMLStyleElement;
        }
        newEl.id = cssUrl;
        if (global != null) newEl.setAttribute("global", global);

        if (global != null) {
          // 全局注入
          let existed = document.getElementById(newEl.id);
          if (existed) existed.remove();
          // cssLink.replaceWith(newEl.cloneNode(true));
          cssLink.remove();
          document.head.appendChild(newEl);

        } else {
          cssLink.replaceWith(newEl);
        }
        // cssLink.replaceWith(elResult.cloneNode(true));
      } catch (e) {
        log.error("load css failed:", this.tag, cssUrl);
        continue;
      }
    }

    // 导出全局 style
    let globalStyles = rootEl.content.querySelectorAll("style[global]");
    for (let i = 0; i < globalStyles.length; i++) {
      let id = `${this.tag}-style-${i}`;
      // 删除已有的全局样式
      let existed = document.getElementById(id);
      if (existed) existed.remove();

      globalStyles[i].setAttribute("id", id);
      document.head.appendChild(globalStyles[i]);
    }

    // 导入全局style
    this._importGlobalStyles(rootEl);
    // let importStyles = document.head.querySelectorAll("style[global=import]");
    // // log.debug("--> importStyle",this.tag,importStyles)
    // for (let i = 0; i < importStyles.length; i++) {
    //   if (!rootEl.content.getElementById(importStyles[i].id)) {
    //     // 检查ID，避免重复导入
    //     let sty = importStyles[i].cloneNode(true);
    //     rootEl.content.insertBefore(sty, rootEl.content.firstElementChild);
    //   }
    // }
  }

  _importGlobalStyles(toRootEl: HTMLElement) {

    let root = toRootEl instanceof HTMLTemplateElement ? toRootEl.content : toRootEl.shadowRoot;
    // 检测是否拒绝全局导入
    if (root?.querySelector('meta[name="no-import-global-css"]')) return;

    // 导入全局style
    let importStyles = document.head.querySelectorAll("style[global=import]");
    // let document.head.querySelectorAll("style[global=import]");

    if (root) {
      for (let i = 0; i < importStyles.length; i++) {
        if(!importStyles[i].id){
          importStyles[i].id = `import-document-style-${i}`;
        }
        if (!root.getElementById(importStyles[i].id)) {
          // 检查ID，避免重复导入
          let sty = importStyles[i].cloneNode(true);
          root.insertBefore(sty, root.firstElementChild);
        }
      }
    }
  }

  /**
   * 加载一个 script, 自动命名
   * @param scriptEl
   * @returns
   */
  async _preloadScript(scriptEl: HTMLScriptElement) {
    let ret = {} as any;
    let scopeName = scriptEl.getAttribute("scope");
    // 首先将脚本节点移除
    scriptEl.remove();

    // 创建新的全局

    if (!scopeName) {
      // 加载标准js
      scriptEl.id = `${this.info.url}-script-${this._scriptIdCounter++}`;
      return await _umdLoader.getModule(this.info.pkg)._getElemModule(scriptEl).getResult();
    }
    // 加载scoped
    let src = scriptEl.getAttribute("src");
    if (src) {
      // 获取模块名和包名
      if (src.endsWith(".ts")) src = src.replace(/\.ts$/, ".js");
      if (src == ".") src = this.info.url.replace(/^(.+)(\..+?)$/, "$1.js");
      // else if (src.endsWith(".ts")) src = src.replace(/\.ts$/, ".js");
      // if (src.match('debounce')) debugger;
      let rel = this._relPath(src, '.js');
      // 
      //  src.replace(/^@\//, _htmlMeta.npmUrl);
      // 加载文件，自动处理引用
      // 检测和加载模块默认导出
      if (rel.pkg) {
        // 加载指定软件包文件
        if (rel.relPath) {
          ret = await _umdLoader.getModule(rel.pkg)._getFile(rel.relPath).getResult();
        } else {
          ret = await _umdLoader.getModule(rel.pkg).getResult();
        }
      }
      else {
        // 加载当前包的导出文件
        let umdFile = _umdLoader.getModule(this.info.pkg)._getFile(rel.url);
        if (scriptEl.type == "module") {
          umdFile.updateModuleJs(true);
        }
        ret = await umdFile.getResult();
      }

    } else {
      // 直接加载元素
      scriptEl.id = `${this.info.url}@${this._tidCounter++}.js`;
      ret = await _umdLoader.getModule(this.info.pkg)._getElemModule(scriptEl).getResult();
    }
    let obj = ret?.default || ret || {};

    if (scriptEl.hasAttribute("nowatch")) {
      _observer._nowatch(obj);
    }
    if (scriptEl.hasAttribute("nocall")) {
      if (!(obj as any)[SymbolScopeNoCall]) {
        Object.defineProperty(obj, SymbolScopeNoCall, { value: {} });
      }
    }

    this._preloadScopes[scopeName] = obj;
  }

  _cloneDocumentFragment() {
    return (this.tplRoot?.content.cloneNode(true) as DocumentFragment) || new DocumentFragment();
  }
  /**
   * 根据 tid 复制模板中指定元素
   * @param tid 
   * @returns 
   */
  _getElementByTid(tid:number|string):HTMLElement|undefined{
    if(typeof tid === 'string') tid = parseInt(tid);
    return this._elementsMap.get(tid) as HTMLElement ;
  }


  /**
   * 预加载 JS
   * src：
   *   . 映射到组件同名 .js
   *   ./ 开头映射到当前目录
   *   直接加载，映射到NPM库目录
   *   / 映射到绝对路径
   *   http:// 映射到
   * 无src，直接执行
   *
   * scope 对象设置对应 scope 的名称
   *
   */
  async _preloadAllScripts(rootEl: HTMLTemplateElement) {
    const scriptsElemList = rootEl.content.querySelectorAll("script");

    const promises = [] as Promise<any>[];
    // 加载每个script标签
    for (let i = 0; i < scriptsElemList.length; i++) {

      let el = scriptsElemList[i];
      let src = el.getAttribute("src");
      try {
        promises.push(this._preloadScript(scriptsElemList[i]));
      } catch (e: any) {
        log.warn("load script failed:", src, e.message);
      }
    }
    await Promise.all(promises);
    // 删除所有scriptTag
    scriptsElemList.forEach((el) => el.remove());
  }
  /**
   * 创建模板使用的scope
   * meta 数据标签导入外部数据，meta 导入数据作为全局 scope 对象
   */
  _createScope(el: Element) {
    let scope = this._preloadScopes["."] || {};

    if (_Utils._isClass(scope)) scope = new scope();
    scope = _observer.watch(scope);

    // 为scope所有的函数绑定
    for (let k of Object.keys(scope)) {
      let v = scope[k];
      if (typeof v == "function" && typeof v.bind == "function") {
        scope[k] = v.bind(scope);
      }
    }

    for (const k of Object.keys(this._preloadScopes)) {
      if (k == ".") continue;
      const sc = this._preloadScopes[k];
      // 创建 scope
      if (typeof sc == "function") {
        // 如果未定义NoCall, 则执行
        if (Object.getOwnPropertyDescriptor(sc, SymbolScopeNoCall)) {
          scope[k] = _observer._nowatch(sc);
        } else {
          // scope[k + "_"] = observer.watch(sc);
          if (_Utils._isClass(sc)) {
            try {
              scope[k] = _observer.watch(new sc());
            } catch (e) {
              log.warn("export scope not support new()", k, sc);
              scope[k] = _observer.watch(sc());
            }
          } else {
            scope[k] = sc();
          }
        }
      } else {
        scope[k] = _observer.watch(sc);
      }
    }

    return scope;
  }
  /**
   * 根据Key获取指定的数据绑定函数
   * @param key
   */
  _getBinder(key: string) {
    return this._dataBinder.get(key);
  }

  private _parseElemTpl(el: Element | DocumentFragment) {
    // 预处理元素信息，语法糖和for元素
    if (el instanceof Element) {
      switch (el.tagName.toLowerCase()) {
        // 跳过script
        case "script":
          break;
        // 处理 style 元素
        case "style":
          // 添加模板ID
          const tid = this._tidCounter++;
          el.setAttribute("tid", tid.toString());
          this._elementsMap.set(tid, el as Element);
          this._styleParser._parseTpl(el as HTMLStyleElement);
          break;
        default:
          // 处理和映射标准元素
          // 预处理和检测文件标签，如具备 info.from,则替换为新标签
          this._processElem(el);
      }
    }
    // 递归处理子元素
    const childs = el instanceof HTMLTemplateElement ? el.content.children : el.children;
    if (childs) {
      for (let i = 0; i < childs.length; i++) {
        this._parseElemTpl(childs[i]);
      }
    }
  }

  /**
   * 生成模板字符串求值函数
   * @TODO 使用模板函数替代 过时的with
   * let f = new Function(...Object.keys(a),'console.log("@@@",a,b,c)')
   *
   * @param str
   */
  private _mkScopeBinder(attrName: string, str: string): Function {
    let s = typeof str == "string" ? str.trim() : str;
    try {
      switch (attrName[0]) {
        case ":":
          return new Function("$scope", "$el",`with($scope){return \`${s}\`;}`);
        case "$":
          return new Function("$scope", "$el", `with($scope){return ${s}}`);
        case "@":
          return new Function("$scope", "$el", "$ev", `with($scope){${s};}`);
      }
    } catch (e: any) {
      console.error(`fail make scope ${attrName},in <${this.tag}>,value="${str}"`, e.message);

      return () => "";
    }
    throw Error("make Attr scope failed: " + attrName);
  }

  private _isAttrCanBinding(attrName: string) {
    switch (attrName[0]) {
      case ":":
      case "$":
      case "@":
        return true;
    }
    return false;
  }

  private _processElem(el: Element) {
    // 注册WC
    // 为每个独立元素生成唯一的模板元素ID

    const tid = this._tidCounter;
    let isBind = false;
    // 检测和处理每个属性
    for (const att of elementAttrs(el)) {
      // 检查是否有绑定或者为自定义的elem
      if (!this._isAttrCanBinding(att.name)) continue;
      isBind = true;
      const binderKey = `${tid}|${att.name}`;
      // 绑定元素内文本
      if (att.name == ":" || att.name == "$") {
        // 文本绑定，处理多个表达式
        const fns = [] as Function[];
        const childs = el instanceof HTMLTemplateElement ? el.content.childNodes : el.childNodes;
        childs.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            try {
              fns.push(this._mkScopeBinder(att.name, node.nodeValue!));
            } catch (e: any) {
              log.error("element bind failed:", el, att.name, att.value, e);
            }
          }
        });
        this._dataBinder.set(binderKey, fns);
        continue;
      }
      // 绑定标准属性
      try {
        // 处理属性
        this._dataBinder.set(binderKey, this._mkScopeBinder(att.name, att.value));
      } catch (e: any) {
        log.error("element bind failed:", el, att.name, e);
      }
    }
    // 自定义标签进行绑定tid
    if (el.tagName.match(/-/)) isBind = true;
    if (isBind) {
      this._tidCounter++;
      el.setAttribute("tid", tid.toString());
      this._elementsMap.set(tid, el);
    }
  }

  /**
   * 双向绑定
   * @param el
   * @param varName
   * @param scopeName
   */
  private _bidirBindValue(el: Element, attrName: string, scopeName: string) {
    let varName = _Utils._kebabToSnake(attrName);
    let binderFunc = `var o=$el.rootScope||$el;${scopeName}=o.${varName}`;

    if (el.hasAttribute(varName)) {
      // 如果有默认值则设置默认值到初始化属性
      this._tplData.setData(scopeName, el.getAttribute(varName)!);
      // 判断是否有type属性且type属性为radio或者checkbox
      // 删除同名的 value,
      el.removeAttribute(varName);
    }
    const tempEl = document.createElement("template") as HTMLTemplateElement;
    const ev = "change";
    tempEl.innerHTML = `<div $${varName}="${scopeName}" @input.stop.${varName}="${binderFunc}" @${ev}.stop.${varName}="${binderFunc}"></div>`;
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(0)!.cloneNode(false) as Attr);
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(1)!.cloneNode(false) as Attr);
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(2)!.cloneNode(false) as Attr);
  }

  private _bidirBindRadio1(el: Element, scopeName: string, valueAttr: string, events: string[]) {
    // 初始化name属性为scopeName
    let attrs = {} as { [k: string]: string; };
    attrs["$checked"] = `${scopeName} === ${valueAttr}`;
    for (let ev of events) {
      attrs[`@${ev}.${scopeName}`] = `${scopeName}=${valueAttr}`;
    }

    for (let att of this._createCustomAttrs(attrs)) {
      el.setAttributeNode(att);
    }
    el.setAttribute("name", scopeName);
  }
  private _bidirBindCheckBox1(el: Element, scopeName: string, valueAttr: string, events: string[]) {
    /**
     * 双向绑定自动设置 checked attr
     */

    // 初始化name属性为scopeName
    el.setAttribute("name", scopeName);
    let attrs = {} as { [k: string]: string; };
    attrs["$checked"] = `(${scopeName} instanceof Array)?${scopeName}.indexOf(${valueAttr})>=0:false`;
    for (let ev of events) {
      attrs[`@${ev}.${scopeName}`] = `if(!(${scopeName} instanceof Array)) ${scopeName}=[]; var i = ${scopeName}.indexOf(${valueAttr});i>=0?${scopeName}.splice(i,1):${scopeName}.push(${valueAttr})`;
    }

    for (let att of this._createCustomAttrs(attrs)) {
      el.setAttributeNode(att);
    }
  }
  /**
   * 双向绑定 value 到 单选全局对象
   * @param el
   * @param checkName 需要检查的属性
   * @param scopeVar 全局本地scope对象
   * @param eventName 接收的事件名称
   */
  private _bidirBindRadio(el: Element, checkName: string, scopeVar: string, eventName: string) {
    // 尝试使用{getter/setter??}
    // 当 checked 属性内部不存在时，则需要主动改变 checked
    // let binderFunc = `var o=$el.rootScope||$el;var c=(o.${checkName}!=undefined)?o.${checkName}:${checkName};if(c) ${scopeName}=value`;

    let binderFunc = `${scopeVar}=value`;

    // 初始化 checked
    if (el.hasAttribute(checkName)) {
      // 如果有默认值则设置默认值到初始化属性
      this._tplData.setData(scopeVar, el.getAttribute("value")!);
      // 移除 checked 属性，因为将自动绑定 $checked属性
      el.removeAttribute(checkName);
    }
    const tempEl = document.createElement("template") as HTMLTemplateElement;

    tempEl.innerHTML = `<div $${checkName}="${scopeVar}===value" @${eventName}="${binderFunc}" ></div>`;
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(0)!.cloneNode(false) as Attr);
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(1)!.cloneNode(false) as Attr);
  }

  private _bidirBindCheckBox(el: Element, checkAttrName: string, scopeName: string, eventName: string) {
    let checkName = _Utils._kebabToSnake(checkAttrName);

    let binderFunc = `var o=$el.rootScope||$el;var v=value;var s=${scopeName};var i=s.indexOf(v);var c=(o.${checkName}!=undefined)?o.${checkName}:${checkName};if(c && i<0) s.push(v);if(!c && i>=0) s=s.splice(i,1);`;
    // let binderFunc = `console.log('checkbox')`;

    // 初始化 checked
    if (el.hasAttribute(checkName)) {
      // 如果有默认值则设置默认值到初始化属性
      const data = this._tplData.getData(scopeName);
      if (data?._value instanceof Array) {
        const v = el.getAttribute("value");
        if (v && data._value.indexOf(v) < 0) {
          data._value.push(v);
        }
      }
      el.removeAttribute(checkName);
    }
    const tempEl = document.createElement("template") as HTMLTemplateElement;

    tempEl.innerHTML = `<div $${checkName}="${scopeName}.indexOf(value)>=0" @${eventName}="${binderFunc}" ></div>`;
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(0)!.cloneNode(false) as Attr);
    el.setAttributeNode(tempEl.content.firstElementChild!.attributes.item(1)!.cloneNode(false) as Attr);
  }

  private _createCustomElement(tag: string, attrs: { [k: string]: string; }) {
    let tpl = document.createElement("template");
    let strAttr = Object.keys(attrs)
      .map((k) => `${k}="${attrs[k]}"`)
      .join(" ");
    tpl.innerHTML = `<${tag} ${strAttr}></${tag}>`;
    return tpl.content.firstChild as Element;
  }
  private _createCustomAttrs(attrValues: { [k: string]: string; }) {
    let tpl = document.createElement("template") as HTMLTemplateElement;
    let strAttr = Object.keys(attrValues)
      .map((k) => `${k}="${attrValues[k]}"`)
      .join(" ");
    tpl.innerHTML = `<div ${strAttr}></div}>`;
    let retAttrs = [] as Attr[];
    let el = tpl.content.firstChild as Element;
    for (let i = 0; i < el.attributes.length; i++) {
      let att = el.attributes.item(i)!;
      retAttrs.push(att.cloneNode() as Attr);
    }
    return retAttrs;
  }

  /**
   * 预处理元素，语法糖处理
   * $$ 默认绑定 value,否则绑定内部属性为
   * 双向绑定要求必须显式指定 name 和 type 字段
   * name([checked],[event])=""
   * @param el
   */
  private async _preProcessElem(el: Element) {
    if (!(el instanceof Element)) return;
    // 处理TPL解析插件
    await _pluginsManager._stages()?.tplParse?.(new TplElem(el));

    let allAttrs = elementAttrs(el);

    // 预处理所有的 attr, 预处理 $for 和 $if
    let $forAttrs = [] as Attr[];
    function _pushForAtt(elem: Element, names: string[], remove: boolean) {
      names.forEach((n) => {
        let at = elem.attributes.getNamedItem(n);
        if (at) {
          $forAttrs.push(at.cloneNode() as Attr);
          if (remove) elem.attributes.removeNamedItem(n);
        }
      });
    }

    let $ifAtt = undefined as Attr | undefined;
    // 遍历和处理所有属性
    for (let att of allAttrs) {
      // 处理 $$ 语法糖
      if (att.name.startsWith("$$")) {
        // log.info('do bidir default Binder');
        this._bidirBindValue(el, att.name.slice(2) || "value", att.value);
        el.attributes.removeNamedItem(att.name);
      }
      // 处理 $: 语法糖, 单选和多选组件,格式为$:[valueAttr].[event].[event2]="scope" 和 $::[valueAttr].[event]="scope",前者单选，后者多选
      else if (att.name.startsWith("$:")) {
        // debugger
        const isMulti = att.name.startsWith("$::");
        let valPart = isMulti ? att.name.slice(3) : att.name.slice(2);
        let sp = valPart.split(".");
        let valueAttr = sp[0] || "value";
        let events = sp.slice(1);
        let scopeName = att.value;
        if (!scopeName) {
          log.error('using "$:" invalid, must need $:="value", in ', this.tag, el);
          return;
        }
        if (events.length == 0) events.push("change");

        // log.info('$@ Binder', el);
        // 格式: $@.[attr]="scopeVar", 如果scope

        // 参数1: checker, 参数2: eventName
        // const event = att.name.slice(2) || "change";
        // const checked = att.value || "checked";
        // const name = el.getAttribute("name");
        // const type = el.getAttribute("type") || "radio";
        if (isMulti) {
          // 多选
          this._bidirBindCheckBox1(el, scopeName, valueAttr, events);
        } else {
          // 单选
          this._bidirBindRadio1(el, scopeName, valueAttr, events);
        }
        el.attributes.removeNamedItem(att.name);
      } else if (att.name == "$if") {
        // 检测 $if
        $ifAtt = att.cloneNode() as Attr;
        el.attributes.removeNamedItem($ifAtt.name);
      } else {
        // 检查 FOR 属性,// $for(v,k)="obj|array|number"
        let m = att.name.match(/\$for(\((\w+)?,?(\w+)?\)$|$)/);
        if (m && m.length == 4) {
          // 处理 for 属性
          let forIndex = m[3] || "index";
          let forValue = m[2] || "value";
          let customAttrs = {
            $for: att.value,
            "for-index": forIndex,
            "for-value": forValue,
          } as any;

          // $for解析
          // @TODO: 更新为工具库版本，setAttr
          let forTempEl = this._createCustomElement("template", customAttrs);
          _pushForAtt(forTempEl, ["$for", "for-index", "for-value", "$for-items"], false);
          _pushForAtt(el, ["sort", "$sort"], true);

          el.attributes.removeNamedItem(att.name);
        }
      }
    }

    if ($forAttrs.length > 0) {
      // 首先处理 $for
      let tplForEl = document.createElement("template");
      $forAttrs.forEach((att) => tplForEl.attributes.setNamedItem(att));
      el.replaceWith(tplForEl);
      tplForEl.content.appendChild(el);
      if ($ifAtt) {
        // 再处理 $if, 这样同时有2层的 <template>
        let tplIfEl = document.createElement("template");
        tplIfEl.attributes.setNamedItem($ifAtt);
        el.replaceWith(tplIfEl);
        tplIfEl.content.appendChild(el);
      }
      // if ($ifAtt) {
      //   // 同时具有 $if 和 $for
      //   // 首先处理 $for
      //   let tplForEl = document.createElement("template");
      //   $forAttrs.forEach((att) => tplForEl.attributes.setNamedItem(att));
      //   el.replaceWith(tplForEl);
      //   tplForEl.content.appendChild(el);

      //   // 再处理 $if, 这样同时有2层的 <template>
      //   let tplIfEl = document.createElement("template");
      //   tplIfEl.attributes.setNamedItem($ifAtt);
      //   el.replaceWith(tplIfEl);
      //   tplIfEl.content.appendChild(el);
      // }else{
      //   // 仅具有 $for
      //   let tplEl = document.createElement("template");
      //   $forAttrs.forEach((att) => tplEl.attributes.setNamedItem(att));
      //   el.replaceWith(tplEl);
      //   tplEl.content.appendChild(el);
      // }
    } else if ($ifAtt) {
      // 预处理只有$if，没有 $for的节点
      let tplEl = document.createElement("template");
      tplEl.attributes.setNamedItem($ifAtt);
      el.replaceWith(tplEl);
      tplEl.content.appendChild(el);
    }

    // if ($ifAtt || $forAttrs.length > 0) {
    //   // 创建新的<template>  对象,应用 $if 和 $for
    //   let tplEl = document.createElement("template");
    //   if ($ifAtt) tplEl.attributes.setNamedItem($ifAtt);

    //   $forAttrs.forEach((att) => tplEl.attributes.setNamedItem(att));

    //   el.replaceWith(tplEl);
    //   tplEl.content.appendChild(el);
    // }

    const childs = el instanceof HTMLTemplateElement ? el.content.children : el.children;
    if (childs) {
      for (let i = 0; i < childs.length; i++) {
        await this._preProcessElem(childs[i] as Element);
      }
    }
  }
}
