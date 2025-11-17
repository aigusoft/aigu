// import { _loadColors } from './Colors';
import { devConfig } from "./Dev";
import { INpmModuleInfo } from "./ExportedType";
import { WcLog } from "./Logger";
import { _Utils } from "./Utils";
import { _buildTag } from "./WcTag";
const log = WcLog(module);

let DEV = {} as { [k: string]: string };

let pkgs = devConfig?.pkgs;
if (pkgs) {
  for (let k of Object.keys(pkgs)) {
    let v = pkgs[k];
    if (v.enable) {
      DEV[k] = `http://${v.hostport}`;
      // 创建新的META入口
      let meta = document.createElement("meta");
      meta.setAttribute("name", "module");
      meta.setAttribute("pkg", k);
      meta.setAttribute("url", DEV[k]);
      document.head.appendChild(meta);
    }
  }
}
// let DEV = {} as { [k: string]: string };
// try {
//   let d = localStorage.getItem("DEV");
//   if (d) DEV = JSON.parse(d);
//   // 创建新的META入口
//   Object.keys(DEV).forEach(k=>{
//     let meta = document.createElement('meta');
//     meta.setAttribute('name','module')
//     meta.setAttribute('pkg',k)
//     meta.setAttribute('url',DEV[k])
//     document.head.appendChild(meta);
//   })
// } catch (e: any) {
//   log.warn("DEV load failed:", e.message);
// }

/**
 * META 字段解析
 * 支持同名配置通过localStorage 变量 进行覆盖
 */
class _HtmlMetaParser {
  public root?: string; // 定义 root dir 可选参数，主要是在打包到vscode时或者其他项目时手动配置HTML加载的根路径
  public debug?: string; //
  public npmUrl = location.origin + "/node_modules";
  public npmCors = false;
  // public ui = {} as {
  //   pkg?: string | null;
  //   version?: string | null;
  //   content?: string | null;
  //   preload: boolean;
  //   url?: string | null;
  // };
  public modules = {} as { [k: string]: INpmModuleInfo };

  // public ui = : { pkg: string; components: { [k: string]: string } };
  public lang?: string;

  public colors = {} as { [k: string]: string };

  constructor() {
    // 初始化加载调试模块url配置

    let metaElements = document.head.getElementsByTagName("meta");
    for (let i = 0; i < metaElements.length; i++) {
      let el = metaElements[i];
      switch (el.getAttribute("name")) {
        case "root":
          this.root = el.getAttribute("content")?.trim() || undefined;
          if (this.root) {
            if (!(this.root.startsWith("http://") || this.root.startsWith("https://"))) {
              this.root = this.npmUrl + this.root;
            }
          }
          break;
        // 解析 debug meta 标签
        case "debug":
          this.debug = el.getAttribute("content")?.trim() || undefined;
          break;
        // 解析npm标签
        case "npm":
          this.npmUrl = this.rootUrl(el.getAttribute("content") || "/node_modules");
          if (this.npmUrl.startsWith("http://") || this.npmUrl.startsWith("https://")) {
            // 如果是全路径名，直接使用
          } else if (this.npmUrl.startsWith("/")) {
            // 添加全路径名名称
            this.npmUrl = location.origin + this.npmUrl;
          } else {
            // 添加相对路径名
            this.npmUrl = _Utils._joinUrl(location.origin + location.pathname.replace(/^(.*\/).*?$/, "$1"), this.npmUrl);
          }
          if (!this.npmUrl.endsWith("/")) this.npmUrl += "/";
          this.npmCors = el.hasAttribute("cors");
          break;

        // module
        case "module":
          this._parseMetaModule(el);
          break;

        case "lang":
          this.lang = el.getAttribute("content")?.trim().toLowerCase() || undefined;
          break;

        case "no-import-global-css":
          // 拒绝导入全局css
          break;

        default:
      }
    }
    log.debug("load html meta", this);
  }

  rootUrl(url: string) {
    return decodeURI( url.startsWith("/") || url.match(/^https?:\/\//)
      ? url
      : this.root
      ? _Utils._joinUrl(this.root, url)
      : _Utils._joinUrl(location.origin + location.pathname.replace(/^(.*\/).*?$/, "$1"), url)); // 取当前路径，排除文件名
    // : _Utils._joinUrl(location.origin + location.pathname, '..', url); // 取当前路径，排除文件名
  }

  _parseMetaModule(el: HTMLMetaElement) {
    let pkg = el.getAttribute("pkg");
    let content = el.getAttribute("content");
    let deps = el.getAttribute("deps");
    let global = el.getAttribute("global");
    let url = el.getAttribute("url");
    let preload = el.hasAttribute("preload");
    let version = el.getAttribute("version") || undefined;
    let exportName = el.getAttribute("export-name") || undefined;
    let prefix = el.getAttribute("prefix") || undefined;
    let esm = el.hasAttribute("esm") ? "true" : undefined;
    let cjs = el.hasAttribute("cjs") ? "true" : undefined;
    let amd = el.hasAttribute("amd") ? "true" : undefined;
    let _eval = el.hasAttribute("eval") ? "true" : undefined;
    if (!pkg) return undefined;

    if (DEV[pkg]) {
      url = DEV[pkg];
      log.warn("using dev module:", pkg, url);
    }

    if (url) {
      if (url.startsWith("/")) url = location.origin + url;
      if (url.startsWith(".")) url = _Utils._joinUrl(location.origin + location.pathname, "..", url);
    }

    // if (this.modules[pkg]) {
    //   log.warn("register module existed", el);
    // }
    let cors = el.hasAttribute("cors") ? _Utils._checkBool(el.getAttribute("cors")) : this.npmCors;

    let baseUrl = url || _Utils._joinUrl(this.npmUrl, version ? `${pkg}@${version}` : pkg, prefix);
    let mod: INpmModuleInfo = {
      name: pkg,
      baseUrl,
      files: (content ? content.split(";").filter((v) => v.trim().length > 0) : ["index.js"]).map((v) => _Utils._joinUrl(baseUrl, v)),
      deps: deps ? deps.split(";").filter((v) => v.trim().length > 0) : [],
      globalVar: global || undefined,
      preload,
      version,
      _url: url,
      exportName,
      prefix,
      esm,
      cjs,
      amd,
      cors,
      eval: _eval,
    };

    this.modules[pkg] = mod;
    return mod;
  }

  relPath(component: string, ext: string, from: string | undefined | null) {
    return from
      ? _Utils._joinUrl(_htmlMeta.npmUrl, from, component + ext)
      : _htmlMeta.root
      ? _Utils._joinUrl(_htmlMeta.root, from, component + ext)
      : _Utils._joinUrl(
          location.protocol + "//" + location.host + location.pathname,
          location.pathname.endsWith("/") ? undefined : "..",
          component + ext
        );
  }
}

export const _htmlMeta = new _HtmlMetaParser();

// export function registerModule(modInfo: INpmModuleInfo) {
//   if (_htmlMeta.modules[modInfo.name]) log.warn('registerModule Existed', modInfo.name);

//   _htmlMeta.modules[modInfo.name] = modInfo;
// }
