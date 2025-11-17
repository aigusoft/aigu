import { _amdLoaders, _umdLoader } from "./UmdLoader";
import { pkgName, pkgVersion } from "./pkg";
import { _Tpl } from "./Tpl";
import { _htmlMeta } from "./HtmlMeta";
import { _registerElement, Wc } from "./Wc";
import { _pluginsManager } from "./plugins/Plugins";
import { $color } from "./plugins/$color";

const log = WcLog(module);

export * from "./ExportedType";

// 导出函数
// export const tplApplyAttrs = _Utils._tplApplyAttrs;
// export { registerModule } from './HtmlMeta';

console.log("powered by", pkgName, pkgVersion);
const startTm = new Date();

import { WcLog } from "./Logger";
import { IPlugins } from "./plugins/IPlugins";
import { _Utils } from "./Utils";
import { $monitSize } from "./plugins/$monitSize";
import { _observer } from "./Observer";
import { _buildTag, _parseTag } from "./WcTag";
log.debug(pkgName, pkgVersion);

// 导出全局定义的WC
const _wcGlobal = {

  // 使用注册插件
  usePlugins: _pluginsManager.use.bind(_pluginsManager),
  // 注册一个WebComponents元素
  registerElement: _registerElement,

  watch(obj:any){
    return _observer.watch(obj);
  },
  // 不监听一个对象
  noWatch(obj: any) {
    return _observer._nowatch(obj);
  },

  parseTag(tag:string){
    return _parseTag(tag);
  },
  buildTag(pkg: string | undefined, component: string){
    return _buildTag(pkg,component);
  },

  npmUrl:_htmlMeta.npmUrl,
  // 定义的外部模块信息
  modules: _htmlMeta.modules,

  amdloader:_amdLoaders,

  loadTime: 0,
} as any;
// 导出的全局对象
(window as any).WCEX = _wcGlobal;

// 注册自身包，防止多次加载
const script = document.currentScript as HTMLScriptElement;
if (!script) {
  const errInfo = "your browser not support currentScript!, please replace Browser";
  log.error(errInfo);
}
// 预注册自身包
_umdLoader.getModule(pkgName)._resolveResult(exports)._getFile(script.src!).resolveResult(exports);

// 预初始化插件
_pluginsManager.use($color);
_pluginsManager.use($monitSize);

// 初始化和解析HTML入口
// 隐藏页面，执行加载，执行完成后统一显示页面
// let el = document.getElementsByTagName('html')[0];
// el.style.display = 'none';
let initFlag = false; // 确保仅初始化一次
window.addEventListener("DOMContentLoaded", async (ev) => {
  if (initFlag) return;
  initFlag = true;

  // 解析和预加载依赖库
  for (let k of Object.keys(_htmlMeta.modules)) {
    let mod = _htmlMeta.modules[k];
    if (mod.preload) {
      await _umdLoader.getModule(mod.name).getResult();
    }
  }

  // 注册实际使用到的组件(实时解析,  按需加载)
  await _registerElement(document.body, undefined, true);
  // 等待完成

  // 监听主文档，处理html元素注册
  let _mo = new MutationObserver((muList) => {
    muList.forEach((mu) => {
      if (mu.type == "childList") {

        mu.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const startTm = new Date();
            _registerElement(node, undefined, false).then(()=>{
              _wcGlobal.loadTime = new Date().getTime() - startTm.getTime();
            });
          }
        });
      }
    });
  });
  _mo.observe(document.body, { childList: true, subtree: true });

  // 统计加载时间
  _wcGlobal.loadTime = new Date().getTime() - startTm.getTime();
  console.log(`all completed, ${_wcGlobal.loadTime}ms`);
  window.dispatchEvent(new CustomEvent("wcex-loaded", { detail: { time: _wcGlobal.loadTime } }));
});
