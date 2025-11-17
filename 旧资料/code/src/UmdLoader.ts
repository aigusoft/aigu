//==============================================
// 标准amd规范实现，支持模块依赖和加载
// 支持标准 commonjs 软件包的动态依赖和加载
// 自动根据请求地址获取和尝试 npm 库地址
// 2022-8-30 为满足加载复杂模块需求，对子模块和插件化加载进行修改和支持，进行重构：功能如下：
// 1. 主模块由原有单一索引修改为两个：
//      A、以文件url为主索引的文件模块索引
//      B、以 npm 模块名索因的模块，npmModule可 包含多个文件Module
//      C、每个文件模块可包含子模块（由define定义的子模块导出）
// 2. NPM 模块内部 require 将查找父模块, 在文件模块或者npm范围内查找引用关系
// 3. 对于内部使用 require.toDir 方式转换的包，从属于当前的NPM模块.1

//==============================================
import { Defer } from "./Defer";
import { PromiseExt, _Utils } from "./Utils";
import { WcLog } from "./Logger";
import { _htmlMeta } from "./HtmlMeta";
import { _observer } from "./Observer";
import { INpmModuleInfo } from "./ExportedType";
import { _hotFileCache } from "./HotLoader";

const log = WcLog(module);

const _npmModules = _htmlMeta.modules;
export const _amdLoaders = {} as { [k: string]: Promise<{ define: Function, require?: Function; }> | undefined; };

// ==========================================
// === NEW
export let _umdLoader: Umd;

abstract class _ISubModule {
  abstract _name(): string;
  abstract _getModule(): _UmdModule;
}

class _UmdChunk {
  private _deps: string[] = [];
  private _initExports = undefined as any;

  constructor(private _umdSubModule: _ISubModule, private _chunkName: string) { }
  _updateDeps(deps: string[] | undefined) {
    if (deps instanceof Array) this._deps = deps;
    else if (typeof deps == "string") this._deps = [deps];

    return this;
  }
  _updateDefineExports(exportsObj: any) {
    this._initExports = exportsObj;
    if (this._umdSubModule._getModule()._npmInfo.preload) {
      log.debug("sync preload module:", this._umdSubModule._name, this._chunkName);
      this._resloveSync();
    }
    return this;
  }

  // 同步执行函数，加载 webpack环境
  _resloveSync() {
    let funcOrResult = this._initExports;
    if (typeof funcOrResult === "function") {
      let retval = funcOrResult.apply(this._initExports, this._deps);
      this._defer.reslove(retval);
    } else {
      this._defer.reslove(funcOrResult);
    }
    return this;
  }

  private _defer = new Defer(`${this._chunkName}@${this._umdSubModule._name()}`, async (selfDefer) => {
    // 获取子模块的导出
    // log.debug('reslove module func:', this._fileModule.npmModule()?.name(), this._fileModule.url(), this._childName);
    // debugger;
    let m = this._chunkName.match(/(.+)\!(.+)/);

    let pluginsName = m ? m[1] : undefined;
    let childName = m ? m[2] : this._chunkName;

    let exportObj = {} as any;

    let deps: any[] =
      (await this._umdSubModule
        ._getModule()
        ?._loadDeps(this._deps, exportObj, this._umdSubModule instanceof _UmdFile ? this._umdSubModule : undefined)) ||
      [];

    if (this._initExports == undefined) {
      // 未初始化Chunk，需动态加载
      if (pluginsName) {
        let pluginsMod = this._umdSubModule._getModule()._getPlugins(pluginsName);
        if (!pluginsMod) {
          log.debug("not found Plugins:", pluginsName);
          return undefined;
        }

        let chunkResult = await new Promise((res, rej) => {
          pluginsMod?._load(
            childName,

            this._umdSubModule
              ._getModule()
              ?._requireFactory(false, this._umdSubModule instanceof _UmdFile ? this._umdSubModule : undefined),
            (pluginsResult: any) => {
              // 插件的load函数，处理完成后的结果，
              res(pluginsResult);
            },
            {}
          );
        });
        return chunkResult;
      } else {
        // 无方法
        log.warn("module chunk no exports", this._umdSubModule._name(), this._chunkName);
        return undefined;
      }
    }

    if (typeof this._initExports != "function") {
      // 处理和加载导出函数
      // 直接返回
      return this._initExports;
    }

    // 函数调用标准方式加载
    let func = this._initExports as (...args: any[]) => any;
    // 普通加载
    // log.debug('-- deps:', deps);
    try {
      let retval = func.apply(func, deps);
      // 如果插件加载，则调用插件处理
      if (retval) return retval;
    } catch (e) {
      // debugger
      log.warn("load chunk failed:", (window as any).__webpack_require__, this._chunkName, e);
    }

    // 没有default，则设置default
    if (!exportObj.default) exportObj.default = exportObj;
    if (!exportObj.hasOwnProperty("__esModule")) {
      Object.defineProperty(exportObj, "__esModule", {
        value: true,
        enumerable: false,
      });
    }

    return exportObj;
    // }
    // throw Error('---EEEE');
  });

  /**
   * 等待 加载并返回结果
   * @returns
   */
  async getResult() {
    return this._defer.result();
  }

  /**
   * 同步获取结果，必须为同步加载模块或者之前已经获取过结果
   * 用于某些不能异步处理的场合
   * @returns
   */
  _getResultSync() {
    return this._defer.resultSync();
  }
}

/**
 * 支持插件化加载
 * 逻辑和流程：插件化加载首先查找plugin
 * 然后调用 插件 load 函数加载插件对象，返回结果
 *
 */
class _UmdPlugins implements _ISubModule {
  private _childChunks: { [k: string]: _UmdChunk; } = {};

  constructor(private _umdModule: _UmdModule, private _pluginsName: string, private _pluginChunk: _UmdChunk) { }
  /**
   * 控制加载的defer
   */

  _name(): string {
    return this._pluginsName;
  }

  _getModule() {
    return this._umdModule;
  }

  _getChunk(name: string) {
    if (!this._childChunks[name]) this._childChunks[name] = new _UmdChunk(this, name);
    return this._childChunks[name];
  }

  _findChunk(name: string) {
    return this._childChunks[name];
  }

  /**
   *
   * @param childName
   * @param parentRequire
   * @param onload
   * @param config
   */
  _load(childName: string, parentRequire: any, onload: (results: any) => void, config: any) {
    // 加载新的插件组件
    this._pluginChunk
      .getResult()
      .then((pluginObj) => {
        pluginObj.load(childName, parentRequire, onload, config);
      })
      .catch((e) => {
        log.error("get plugin chunk error:", this._pluginsName, e);
      });
  }
}

interface _ICjsScope {
  [k: string]: {
    module: { id: string; exports: {}; };
    require: () => any;
  };
}
class _CjsModules {
  private _cjsModulesScope = {} as _ICjsScope;
  constructor() { }

  /**
   * 获取CJS Scope
   * @param name
   * @returns
   */
  _getScope(name?: string) {
    const script = document.currentScript as HTMLScriptElement;
    let id = name || script?.id || script?.src;
    if (!id) {
      log.error("load cjs module scope failed, no currentScript", script);
    }

    if (!this._cjsModulesScope[id]) {
      this._cjsModulesScope[id] = {
        module: {
          id,
          exports: {},
        },
        require: _umdLoader.getFile(id)._getModule()._requireFactory(true),
      };
    }
    return this._cjsModulesScope[id];
  }
}

class _UmdFile implements _ISubModule {
  private _chunks: { [k: string]: _UmdChunk; } = {};

  /**
   * 加载后的HTML元素，可以是html模板、css style 元素、svg元素、脚本等
   */
  private _el?: HTMLElement;

  /**
   * 缺省导出模块，可能没有
   */
  private _defaultModule?: _UmdChunk;

  private _isModulejs = false;

  constructor(private _umdModule: _UmdModule, private _fileUrl: string) { }

  _name() {
    return this._fileUrl;
  }

  _getModule() {
    return this._umdModule;
  }
  _url() {
    return this._fileUrl;
  }

  private async _fetctContext(url: string) {
    try {
      let sp = url.split("#");
      let options: any = this._umdModule._npmInfo.cors ? { credentials: "include", redirect: "follow", mode: "cors", referrerPolicy: 'no-referrer-when-downgrade' } : {};
      let res = await fetch(sp[0], { cache: 'default', ...options });
      switch (sp[1]) {
        case "json":
          return res.json();
        case "arreabuffer":
          return res.arrayBuffer();
        case "blob":
          return res.blob();
        default:
          return res.text();
      }
    } catch (e: any) {
      log.error("fetch content failed:", url, e.message);
    }
  }
  private async _loadHtmlElem(el: HTMLElement) {

    return new Promise((res, rej) => {
      // 加载css
      el.addEventListener("error", (err) => {
        log.error("load error", this._fileUrl, err);
        // 不中断
        res(el);
      });
      el.addEventListener("load", (ev) => {
        log.info(`load ok`, this._fileUrl);
        res(el);
      });
      document.head.appendChild(el);
    });
  }
  private async _getJsChunksExports() {
    // 解析和处理子模块结果
    if (this._defaultModule) return this._defaultModule.getResult();

    let chunkNames = Object.keys(this._chunks);
    if (chunkNames.length == 0) {
      // log.warn('file module no exports', this._fileUrl);
      return undefined;
    }
    // 如果只有一个chunks则返回此Chunks
    if (chunkNames.length == 1) return this._chunks[chunkNames[0]].getResult();

    // 有多个子模块，默认取 index
    let definedExport = this._umdModule?._preDefinedExportName() || "index";
    let child =
      this._chunks["index.js"] || this._chunks["main"] || this._chunks["main.js"] || this._chunks[definedExport];

    if (child) {
      let ret = await child.getResult();

      return ret;
    } else {
      // 否则返回最后一个模块
      let keys = Object.keys(this._chunks);
      if (keys.length == 0) {
        // log.warn('module no child', this._fileUrl);
        return undefined;
      } else {
        return this._chunks[keys[keys.length - 1]].getResult();
      }
    }
  }

  /**
   * 直接运行Script内容，并获取输出
   *
   * @todo 增加 define 支持
   */
  private _directCjsRunScriptgetResult(jsContent: string): any {
    try {
      let cjsFunc = new Function("module", "exports", "require", "__ID", jsContent);
      // 获取当前scope
      let cjsScope = _umdLoader._cjsModules._getScope(this._fileUrl);

      let ret = cjsFunc.call(
        cjsScope.module,
        cjsScope.module,
        cjsScope.module.exports,
        cjsScope?.require,
        this._fileUrl
      );
      // 优先exports
      if (typeof cjsScope.module.exports !== "object" || (typeof cjsScope.module.exports == "object" && Object.keys(cjsScope.module.exports).length > 0)) {
        return cjsScope.module.exports;
      } else if (ret !== undefined) return ret;
      else {
        log.warn("module no exports: ", this._fileUrl);

      }
    } catch (e: any) {
      log.error("exec script failed:", e, this._name(), this._url(), jsContent);
    }
  }

  /**
   * 直接运行Script内容，并获取输出
   *
   * @todo 增加 define 支持
   */
  private _evalRunScriptgetResult(jsContent: string): any {
    try {
      let self = this;
      // 获取当前scope
      let cjsScope = _umdLoader._cjsModules._getScope(this._fileUrl);
      function _exec() {
        var module = cjsScope.module,
          exports = cjsScope.module.exports,
          require = cjsScope.require,
          __ID = self._fileUrl;
        let ret = eval.bind({ module, exports, require, __ID })(jsContent);
        return ret;
      }
      let ret = _exec();

      if (ret !== undefined) return ret;
      return cjsScope.module.exports;
    } catch (e: any) {
      log.error("exec script failed:", this._name(), this._url(), jsContent);
    }
  }

  /**
   * 控制加载的defer
   */
  private _defer = new Defer(this._fileUrl, async () => {

    // 加载实际文件
    if (!this._el) {
      // 创建加载元素或直接完成
      let ext = _Utils._extNameFromUrl(this._fileUrl);
      switch (ext) {
        case "cjs":
        case "jsm":
        case "js":
        case "": {
          // 无扩展名默认js
          // cjs 依赖需要序列化加载，由于需要使用公共全局对象，
          // 规则：检测
          let el = document.createElement("script");
          // if (this._fileUrl.match(/throttle/)) debugger;

          if (this._isModulejs || ext == "jsm" || this._umdModule._npmInfo.esm) {

            // esm 模块加载,通过事件获取结果
            el.type = "module";
            el.id = this._fileUrl;

            el.textContent = `import * as obj from "${this._fileUrl}";document.getElementById("${this._fileUrl}").dispatchEvent(new CustomEvent('esm-result',{detail:obj}));`;
            // 加载esm模块
            let result = await new Promise((res, rej) => {
              el.addEventListener("esm-result", (ev) => {
                let esmResult = (ev as CustomEvent).detail;
                if (esmResult.default) esmResult = esmResult.default;
                res(esmResult);
              });
              document.head.appendChild(el);
            });
            // ESM模块不监控变化
            log.info(`load esm-result ok`, this._fileUrl, result);
            // console.log('--!!!!', result);
            return result;
          }
          el.src = this._fileUrl;
          el.id = this._fileUrl;

          // 判断加载模式, CJS 模式需要创建包装器，将其包装在module函数局部空间, 使用eval执行！！
          if (ext == "cjs" || this._umdModule._npmInfo.cjs) {

            let jsContent = await this._fetctContext(this._fileUrl);
            return this._directCjsRunScriptgetResult(jsContent);
          }

          if (this._umdModule._npmInfo.eval) {
            let jsContent = await this._fetctContext(this._fileUrl);
            return this._evalRunScriptgetResult(jsContent);
          }
          // 默认运行 amd 兼容
          // if(this._fileUrl.match(/clock\.js/)) debugger;
          // if(this._fileUrl.match(/mqtt/)) debugger;

          // log.debug('start load js [AMD]', this._fileUrl);
          // debugger;
          await this._loadHtmlElem(el);

          // 首先检测全局变量
          if (this._umdModule._npmInfo.globalVar) {
            return (window as any)[this._umdModule._npmInfo.globalVar];
          } else {
            return await this._getJsChunksExports();
          }

        }
        case "css": {
          let ret = await this._fetctContext(this._fileUrl);
          let el = document.createElement("style");
          (el as HTMLStyleElement).innerHTML = ret;
          el.id = this._fileUrl;
          // 直接返回结果，不进行全局加载
          return el;
        }
        case "svg":
        case "html": {
          // 加载HTML模板或者svg元素
          let ret = await this._fetctContext(this._fileUrl);
          let el = document.createElement("template");
          (el as HTMLTemplateElement).innerHTML = ret;
          // 直接完成元素标签
          return el.content;
        }
        case "json":
          try {
            let ret = await this._fetctContext(this._fileUrl);
            return JSON.parse(ret);
          } catch (e) {
            log.warn("load fail", this._fileUrl, e);
            return {};
          }

        default:
          // 否则使用内容fetch进行加载,使用 "后缀#"分割类型，支持text,json,arraybuffer,blob
          // log.warn('load file type no supported', this._fileUrl);
          return this._fetctContext(this._fileUrl);
      }
    }


    // 加载和处理直接标签
    if (!(this._el instanceof HTMLScriptElement)) {
      await this._loadHtmlElem(this._el);
      return this._el;

    }

    // 处理返回对象
    if (!this._el.hasAttribute("src")) {
      // 直接加载脚本内容
      return this._directCjsRunScriptgetResult(this._el.textContent || "");
    }


    const src = this._umdModule._toUrl(this._el.getAttribute('src')!);
    // 检测自定义amdloader,无需scope对象
    let amdLoaderName = this._el.getAttribute('amdloader');
    if (amdLoaderName) {
      // 加载中的loader不再次重复加载
      if (_amdLoaders[amdLoaderName!]) return undefined;

      log.info("custom amd loader start:", amdLoaderName, src);
      // 准备加载新的loader
      _amdLoaders[amdLoaderName!] = new Promise((res) => {
        // 加载 amdloader 使用同步加载，防止 define 冲突
        this._fetctContext(src).then(jsContent => {
          // 准备加载自定义amdloader
          (window as any).define = undefined;
          let fn = new Function(jsContent);
          fn.call(window);
          let loader = {
            define: (window as any).define,
            require: (window as any).require
          };
          (_amdLoaders[amdLoaderName!] as any).loader = loader;
          // 还原
          (window as any).define = define;
          log.info("custom amd loader ok:", amdLoaderName);
          res(loader);
        });
      });
      return undefined;
    }

    // 需创建新对象加载src，否则无法得到回调通知, 异步加载
    // 创建全局cjs兼容加载器，支持umd双模加载
    let newEl = document.createElement("script");
    newEl.src = src;
    newEl.type = this._el.type;
    newEl.id = this._el.id;
    await this._loadHtmlElem(newEl);
    return await this._getJsChunksExports();

  });

  /**
   * 等待 加载并返回结果
   * @returns
   */
  async getResult() {
    return this._defer.result();
  }

  /**
   * 同步获取结果，必须为同步加载模块或者之前已经获取过结果
   * 用于某些不能异步处理的场合
   * @returns
   */
  getResultSync() {
    return this._defer.resultSync();
  }

  resolveResult(result: any) {
    this._defer.reslove(result);
    return this;
  }

  updateHtmlElement(el: HTMLElement) {
    this._el = el;
    return this;
  }

  getChildChunk(childName: string) {
    if (!this._chunks[childName]) this._chunks[childName] = new _UmdChunk(this, childName);
    return this._chunks[childName];
  }
  findChunk(childName: string) {
    return this._chunks[childName];
  }

  getDefaultModule() {
    if (!this._defaultModule) this._defaultModule = new _UmdChunk(this, "_default_");
    return this._defaultModule;
  }

  /**
   * 设置文件从属的npm，仅设置一次，否则警告
   * @param npmModule
   */
  updateNpmModule(npmModule: _UmdModule) {
    this._umdModule = npmModule;
    return this;
    // else log.warn('multi set file to npmModule', this._fileUrl, npmModule);
  }

  updateModuleJs(isModuleJs: boolean) {
    this._isModulejs = isModuleJs;
  }

  /**
   * 如果文件从属于npm包，从npm包引用，否则从全局npm仓库引用
   * @param url
   * @returns
   */
  toUrl(url: string) {
    // url = url.replace('\\', '/');
    // let ext = _Utils._extNameFromUrl(url);
    // if (!ext) url = url + '.js';

    // 从当前html文件路径计算相对路径
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
    // 从当前请求文件路径计算相对路径
    else if (url.startsWith(".")) return _Utils._joinUrl(this._fileUrl, "..", url);
    // 以npm根路径查找
    else return this._umdModule._toUrl(url);
  }
}

class _UmdModule {
  private _moduleFiles: { [k: string]: _UmdFile; } = {};
  private _pluginsMap: { [k: string]: _UmdPlugins; } = {};
  _npmInfo: INpmModuleInfo;

  /**
   * 加载仓库所有子文件，获取子文件模块的默认导出，取最后一个文件的导出
   */
  private _defer = new Defer("PKG: " + this._pkgName, async () => {

    let filesResults = await Promise.all(this._npmInfo.files.map((v) => this._getFile(v).getResult()));

    // 检测是否组件包含css
    filesResults.forEach((f) => {
      if (f instanceof HTMLStyleElement) {
        // 从组件导入的css默认注入全局
        if (!document.getElementById(f.id)) {
          document.head.appendChild(f.cloneNode());
        }
      }
    });

    if (filesResults.length > 0) {
      return filesResults[filesResults.length - 1];
    } else {
      log.warn("npm module no files export", this._pkgName);
    }
  });

  constructor(private _pkgName: string) {
    // if(this._pkgName.match(/throttle/)) debugger;
    this._npmInfo = _htmlMeta.modules[this._pkgName];
    if (!this._npmInfo) {
      this._npmInfo = {
        name: this._pkgName, // 模块名称
        preload: false, // 是否预加载
        files: ["index.js"], // 加载文件,第一个 JS 为主文件导出
        baseUrl: _Utils._joinUrl(_htmlMeta.npmUrl, this._pkgName),
        cors: _htmlMeta.npmCors,
      };
      // log.error('NO define NPM Package: ', _pkgName);
    }
  }
  // npmInfo() {
  //   return this._npmInfo;
  // }

  _getPlugins(pluginsName: string) {
    if (!this._pluginsMap[pluginsName]) {
      // 尝试获取plugins
      let chunk = this._findChunk(pluginsName);
      if (chunk) this._pluginsMap[pluginsName] = new _UmdPlugins(this, pluginsName, chunk);
    }
    return this._pluginsMap[pluginsName];
  }

  /**
   * 获取所有需要的依赖
   * @param exportObj
   * @returns
   */
  async _loadDeps(deps: string[], exportObj: any, referFile?: _UmdFile): Promise<any[]> {
    const results = [] as any[];
    for (let depName of deps) {
      if (depName == "require") {
        results.push(this._requireFactory(true));
      } else if (depName == "exports") {
        results.push(exportObj);
      } else {
        // 尝试获取子模块
        // 检测是否插件加载，在插件目录创建新的插件模块
        results.push(await this._requireExports(depName, referFile));
      }
    }

    return results;
  }

  /**
   * 读取返回值
   * @param modOrChunkName
   */
  private async _requireExports(modOrChunkName: string, referFile?: _UmdFile) {
    // 尝试获取已经加载子模块，成功则直接返回
    let chunk = this._findChunk(modOrChunkName);
    if (chunk) return chunk.getResult();


    // if (modOrChunkName.match('aichat')) debugger;

    // 检测是否插件加载，在插件目录创建新的插件模块
    let m = modOrChunkName.match(/(.+)\!(.+)/);
    let pluginsName = m ? m[1] : undefined;
    let childName = m ? m[2] : modOrChunkName;

    if (pluginsName) {
      // 插件加载
      let pluginsMod = this._getPlugins(pluginsName);
      if (!pluginsMod) {
        log.error("not found loader plugins", pluginsName);
        return undefined;
      }
      return await pluginsMod._getChunk(modOrChunkName).getResult();
    }

    // 尝试当前文件
    let fileMod = this._findFile(modOrChunkName);
    if (fileMod) return fileMod.getResult();

    // 兼容性处理
    if (modOrChunkName.startsWith('@/')) modOrChunkName = modOrChunkName.slice(2);
    // 检查是是否NPM模块加载
    // debugger;
    let ext = _Utils._extNameFromUrl(modOrChunkName);

    if (modOrChunkName.startsWith('.') || modOrChunkName.startsWith('/') || modOrChunkName.startsWith('http://') || modOrChunkName.startsWith('https://')) {
      // 直接计算refer返回路径
      if (!ext) {
        modOrChunkName = modOrChunkName + ".js";
      } else if (ext == "ts") {
        modOrChunkName = modOrChunkName.replace(/\.ts$/, ".js");
      }
      // 返回直接引用
      return this._getFile(modOrChunkName, referFile).getResult();
    }
    // 通过npm模块进行计算相对引用路径
    m = modOrChunkName.match(/^(@[a-z0-9-\.]+\/[a-z0-9-\.]+)(\/.*)?$/);
    if (!m) m = modOrChunkName.match(/^([a-z0-9-\.]+)(\/.*)?$/);
    if (m) {
      let pkg = m[1];
      let file = m[2];
      if (!file) {
        // 返回模块默认导出
        return _umdLoader.getModule(pkg).getResult();
      }
      // 添加默认扩展名
      if (!ext) {
        file = file + ".js";
      } else if (ext == "ts") {
        file = file.replace(/\.ts$/, ".js");
      }

      // 返回指定NPM包文件
      return _umdLoader.getModule(pkg)._getFile(file, referFile).getResult();
    }
  }

  private _findChunk(chunkName: string) {
    for (let k of Object.keys(this._moduleFiles)) {
      let fileMod = this._moduleFiles[k];
      let chunk = fileMod.findChunk(chunkName);
      if (chunk) return chunk;
    }
    for (let k of Object.keys(this._pluginsMap)) {
      let plugin = this._pluginsMap[k];
      let chunk = plugin._findChunk(chunkName);
      if (chunk) return chunk;
    }
  }

  /**
   * 请求工厂函数
   */
  _requireFactory(globalRequire: boolean, referFile?: _UmdFile) {
    let requireFn: any = (reqModules: string | string[], res?: (v?: any) => void, rej?: (e: any) => void) => {
      const modArray = reqModules instanceof Array ? reqModules : [reqModules];

      if (!res) {
        // 静态加载
        try {
          const result = modArray.map(
            (mod) =>
              this._findChunk(mod)?._getResultSync() ||
              this._findFile(referFile ? referFile.toUrl(mod) : this._toUrl(mod))?.getResultSync() ||
              _umdLoader.findModule(mod)?._getResultSync()
          );
          return result.length === 1 ? result[0] : result;
        } catch (e) {
          return [];
        }
      }
      // 动态加载
      // const retArray = [] as any[];
      // 动态加载依赖，首先尝试加载子模块，否则尝试加载全局模块
      const deps = modArray.map((mod) => {
        let promiseResult = this._requireExports(mod, referFile);
        // 如果支持全局加载，请求全局模块
        return globalRequire ? promiseResult || _umdLoader.getModule(mod).getResult() : promiseResult;
      });

      // 不要使用Promise.all，因为依赖可能有先后关系
      return Promise.all(deps).then((values) => res(values.length === 1 ? values[0] : values));
    };
    requireFn.toUrl = (modName: string) => {
      return referFile ? referFile.toUrl(modName) : this._toUrl(modName);
    };
    requireFn.configure = {
      // paths: { vs: '/npm/monaco-editor/dev/vs' },
    };
    return requireFn;
  }

  // name() {
  //   return this._npmInfo.name;
  // }
  _preDefinedExportName() {
    return this._npmInfo.exportName;
  }

  private async _loadModuleDeps(): Promise<any> {
    // 检测和加载依赖包
    // 如果依赖包使用'*'，则读取package.json 的 dependencies 字段获取依赖包信息

    return PromiseExt.once(this._pkgName, async () => {
      log.debug("load dependencies: ", this._pkgName);

      let deps = this._npmInfo?.deps || [];
      if (deps.indexOf("*") >= 0) {
        let pkg = await this._getFile("package.json").getResult();
        let pkgDeps = pkg?.dependencies ? Object.keys(pkg.dependencies) : [];
        deps = [...pkgDeps, ...deps.filter((v) => v != "*")];
      }
      let depResults = deps.map((v) => {
        return _umdLoader.getModule(v).getResult();
      });
      return Promise.all(depResults);
    });
  }
  async getResult() {
    await this._loadModuleDeps();

    let ret = await this._defer.result();
    return ret;
  }
  _getResultSync() {
    return this._defer.resultSync();
  }
  _resolveResult(result: any) {
    this._defer.reslove(result);
    return this;
  }

  _findChildModule(childModName: string) {
    for (let k of Object.keys(this._moduleFiles)) {
      let f = this._moduleFiles[k];
      let mod = f.findChunk(childModName);
      if (mod) return mod;
    }
  }

  /**
   * 如果无扩展名，则添加默认扩展名为'.js'
   * @param url 根据当前引用处理逻辑地址
   * @returns
   */
  _toUrl(url: string) {
    // url = url.replace('\\', '/');

    // let ext = _Utils._extNameFromUrl(url);
    // if (!ext) url = url + '.js';
    // 绝对地址直接返回
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    // 引用相对路径（主HTML）
    else if (url.startsWith(".")) return _Utils._joinUrl(location.origin, location.pathname, url);
    // 引用npm仓库路径, '@/' 兼容性处理
    else if (url.startsWith("@/")) return _Utils._joinUrl(_htmlMeta.npmUrl, url.slice(2));
    // 以当前npm包路径查找
    // else return _htmlMeta.relPath()
    else return _Utils._joinUrl(this._npmInfo.baseUrl, url);
  }

  /**
   * 获取NPM包从属的文件模块，如果文件模块已经存在，则更新文件的NPM包引用
   * 自动创建不存在的文件模块
   * @param fileUrlOrRelPath
   */
  _getFile(fileUrlOrRelPath: string, referFile?: _UmdFile): _UmdFile {

    let _id = fileUrlOrRelPath.startsWith('/') ? this._toUrl(fileUrlOrRelPath) : referFile ? referFile.toUrl(fileUrlOrRelPath) : this._toUrl(fileUrlOrRelPath);
    const id = decodeURIComponent(_id);

    if (this._moduleFiles[id]) return this._moduleFiles[id];
    let f = _umdLoader.getFile(id).updateNpmModule(this);
    this._moduleFiles[id] = f;
    return f;
  }
  private _findFile(fileUrlOrRelPath: string, referFile?: _UmdFile): _UmdFile | undefined {
    let _id = referFile ? referFile.toUrl(fileUrlOrRelPath) : this._toUrl(fileUrlOrRelPath);
    const id = decodeURIComponent(_id);
    return this._moduleFiles[id];
  }

  // getPluginsModule(pluginsName: string): UmdFile {
  //   let pluginsId = 'PLUGINS: ' + pluginsName;
  //   if (this._fileModules[pluginsId]) return this._fileModules[pluginsId];

  //   // 创建新的插件模块
  //   let mod = new UmdFile(pluginsId);
  //   mod.setNpmModule(this).resolveResult(pluginsId);
  //   this._fileModules[pluginsId] = mod;
  //   return mod;
  // }

  _removeFile(fileUrlOrRelPath: string) {
    let _id = this._toUrl(fileUrlOrRelPath);
    const id = decodeURIComponent(_id);
    if (this._moduleFiles[id]) delete this._moduleFiles[id];
  }

  _getElemModule(el: HTMLScriptElement | HTMLStyleElement | HTMLLinkElement) {
    if (!el.id) el.id = `${el.tagName}-unknown-${_LOADER_ID_COUNTER++}`;
    let src = el instanceof HTMLLinkElement ? el.href : (el as any).src;
    // 不能使用 clonenode 处理script节点，否则无法加载esm模块;

    return this._getFile(src || el.id).updateHtmlElement(el as HTMLElement);
  }
}
let _LOADER_ID_COUNTER = 1;

// class CjsLoader {
//   private _fileLoadScopeMap: {
//     [k: string]: {
//       module: {id};
//       export: {};
//       require: () => any;
//     };
//   } = {};
//   constructor(){

//   }
// }

// self.module

export class Umd {
  _cjsModules = new _CjsModules();

  /**
   * 包含所有直接Url加载的文件模块
   */
  private _files: { [k: string]: _UmdFile; } = {};
  /**
   * 包含引用NPM包模块，可引用多个文件模块
   */
  private _npmModules: { [k: string]: _UmdModule; } = {};
  constructor() { }

  getModule(pkgName: string | undefined) {
    let name = pkgName || "/";
    if (!this._npmModules[name]) this._npmModules[name] = new _UmdModule(name);
    return this._npmModules[name];
  }

  findModule(pkgName: string) {
    return this._npmModules[pkgName];
  }

  /**
   * 获取或者创建一个新的文件模块
   * 支持 js, css, svg,
   * 文件模块为独立文件模块，不从属于任何NPM包
   * @param fileUrl 文件
   * @returns FileModule
   */
  getFile(__fileUrl: string) {
    const fileUrl = decodeURIComponent(__fileUrl);
    if (!this._files[fileUrl]) this._files[fileUrl] = new _UmdFile(this.getModule("/"), fileUrl);
    return this._files[fileUrl];
  }

  findFile(__fileUrl: string) {
    const fileUrl = decodeURIComponent(__fileUrl);
    return this._files[fileUrl];
  }

  /**
   * 删除匹配文件
   * @param fileUrlNoExt
   */
  removeFileMatched(__fileUrlNoExt: string) {
    const fileUrlNoExt = decodeURIComponent(__fileUrlNoExt);

    for (let k of Object.keys(this._files)) {
      if (k.startsWith(fileUrlNoExt + ".")) {
        let m = this._files[k]._getModule();
        if (m) {
          m._removeFile(k);
        }
        delete this._files[k];
      }
    }
  }
}
_umdLoader = _observer._nowatch(new Umd());

(window as any).__LOADER = _umdLoader;

/**
 * 标准 AMD 全局定义文件
 * umd 模块加载的主入口
 * 考虑两种启动方式，一种是通过依赖进行加载，另一种为直接引入 script 进行加载
 */
// Define
function define(arg1: any, arg2: any, arg3: any) {

  // 解析出包名，检测是否使用了自定义的loader
  if (document.currentScript) {
    let src = (document.currentScript as HTMLScriptElement).src;
    if (src && src.startsWith(WCEX.npmUrl)) {
      let s = src.slice(WCEX.npmUrl.length);
      let pkg = s.startsWith('@') ? s.match(/^(@.+?\/.+?)\/.*$/)?.[1] : s.match(/^(.+?)\/.*$/)?.[1];
      if (pkg && WCEX.amdloader[pkg]) {
        // 使用自定义加载器加载
        return (WCEX.amdloader[pkg] as any).loader.define(arg1, arg2, arg3);
      }
    }
  }

  // 检测和处理参数
  let childName: string | undefined;
  let defineExportsFunc: any;
  let deps: string[] = [];
  if (arg3) {
    // 三个参数
    childName = arg1;
    deps = arg2 instanceof Array ? arg2 : [arg2];
    defineExportsFunc = arg3;
  } else if (arg2) {
    if (arg1 instanceof Array) deps = arg1;
    else childName = arg1;
    defineExportsFunc = arg2;
    // 两个参数
  } else {
    // 一个参数
    defineExportsFunc = arg1;
  }
  // 获取当前的 script 标签
  const script = document.currentScript as HTMLScriptElement;
  if (!script) {
    return log.warn("currentScript() failed!, define() must run in sync <script> tag", defineExportsFunc);
  }
  if (!script.id) script.id = "script-inline-" + _LOADER_ID_COUNTER++;
  // 生成 scriptId
  let scriptId = script.src || script.id;
  // 获取所属的文件模块, 如果此文件属于NPM包，则在NPM包加载时已经预注册此文件模块，并关联到当前NPM
  // debugger
  let fileMod = _umdLoader.getFile(scriptId);
  if (childName) fileMod.getChildChunk(childName)._updateDeps(deps)._updateDefineExports(defineExportsFunc);
  else {
    fileMod.getDefaultModule()._updateDeps(deps)._updateDefineExports(defineExportsFunc);
  }

  // 返回导出内容，兼容某些库使用
  return defineExportsFunc;
}
// 依照amd规范定义子集
Object.defineProperty(define, "amd", { value: { wcex: true } });
(window as any).define = define;
// export default umdLoader;
