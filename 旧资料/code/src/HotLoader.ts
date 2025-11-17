/**
 * hotload 机制:
 * 1. 仅组件使用hotload,其他变化将导致reload
 * 3. 使用 websocket 接受通知
 * 4. 支持来自多个来源的HotLoad协同开发
 */

import { elementAttrs, _Utils } from './Utils';
import { wcRegister } from './WcRegister';
import { _Tpl } from './Tpl';
import { Wc, _replaceWithNewTag } from './Wc';
import { WcLog } from './Logger';
import { _htmlMeta } from './HtmlMeta';
import { _buildTag } from './WcTag';
import { _umdLoader } from './UmdLoader';
import { ScopedElement } from './plugins/IPlugins';
import { devConfig } from './Dev';

const _log = WcLog(module);


/**
 * Hot Websocket Connect
 */
class _HotConnection {
  private _websocket = null as WebSocket | null;
  private _runFlag = true;
  private _hotPkgName = ''

  constructor(private _hotHost: string) {
    _log.debug("Dev Hot:", this._hotHost);

    this._open();
  }

  private async _open() {
    // 连接到开发服务器,获取包名
    try {
      let pkgJson = await (await fetch(`http://${this._hotHost}/package.json`, { referrerPolicy: 'no-referrer-when-downgrade' })).json();
      this._hotPkgName = pkgJson.name;
      _log.debug("Dev Hot Open:", this._hotPkgName, this._hotHost);

      // log.log('open developer hot loader');
      this._websocket = new WebSocket(`ws://${this._hotHost}/_hotws`);
      this._websocket.addEventListener('close', (ev) => {
        _log.log('closed...', ev.code);
        // 5 秒后重连
        if (this._runFlag) setTimeout(() => this._open(), 5000);
      });
      this._websocket.addEventListener('open', (ev) => {
        _log.log('hotloader opened');
      });
      this._websocket.addEventListener('message', (ev) => {
        window.dispatchEvent(new CustomEvent('wc-hotload', { detail: JSON.parse(ev.data) }));
      });
    } catch (e: any) {
      _log.warn("dev hotload failed:", this._hotHost, e.message)
    }

  }
  close() {
    this._runFlag = false;
    this._websocket?.close();
  }
}

/**
 * 热更新，更新所有当前包的同名组件
 */
async function _doHotUpdate(upPkg: string | undefined, component: string) {
  let matched = false;

  async function _updateTag(upTag: string) {
    const wcCls = customElements.get(upTag) as any;
    if (wcCls) {
      _log.info('hot tag:', upTag);
      matched = true;
      let tpl = wcCls.$tpl;
      // _log.info('load tpl:', upTag);

      // 取消以tag开始的js模块

      // 重新加载tpl
      const newTpl = new _Tpl(upTag, tpl.info.from);
      await newTpl._waitReady();
      _log.info('tpl ready:', upTag);
      // 更新模板
      const Cls = customElements.get(upTag) as any;
      if (Cls) {
        // 更新模板
        _log.info('update tpl');
        Cls.updateTpl(newTpl);

        // 更新所有 el
        wcRegister.findByTag(upTag).forEach((wc) => {

          function _findHostWc(el: Node | null): Wc | null {
            return el ? ((el as any).host ? (el as any).host.$wc : _findHostWc(el.parentNode)) : null;
          }
          // // 查找 wc 父 WC，调用update进行更新，继承原有scope数据
          // const parentWc = _findHostWc(wc.$rootElem);
          _replaceWithNewTag(<ScopedElement>wc.$rootElem, upTag);

          // if(parentWc){
          //   _log.debug('replace in wc')
          //   parentWc._replaceElWith(wc.$rootElem as ScopedElement,upTag);
          // }else{
          //   // 替换自身,不处理scope
          //   _log.debug('replace in html')
          //   _Utils._replaceWithNewTag(<ScopedElement>wc.$rootElem,upTag);
          // }

        });
      }
    } else {
      _log.info('hot changed no match:', upTag);
    }
  }
  let tag1 = _buildTag('', component);
  let p = location.pathname.replace(/^(.*\/).*?$/, '$1')

  let url = _Utils._joinUrl(_htmlMeta.root||location.origin,p+component);

  _umdLoader.removeFileMatched(url);
  // 取消同名JS注册信息，强制重新加载JS
  await _updateTag(tag1);

  if (upPkg) {
    let existMod = _umdLoader.findModule(upPkg);
    if (existMod) {
      let tag2 = _buildTag(upPkg, component);
      _umdLoader.removeFileMatched(existMod._toUrl(component))
      await _updateTag(tag2);
    }
  }

  if (!matched) {
    _log.info('hot changed no matched:', component);
    // location.reload();
  }
}
export const _hotFileCache = {} as { [k: string]: string };
// 处理 wcHotLoad 事件, 500毫秒合并更新一次
window.addEventListener('wc-hotload', async (ev) => {
  let msg = (ev as CustomEvent).detail as { project: string; path: string; content?: string } | undefined;
  if (!msg) return;
  _log.warn('hot changed:', msg);

  // 去除扩展名  整理路径分隔符
  const component = msg.path.replace(/\..+?$/, '').replace(/\\/g, '/');
  setTimeout(() => {
    _doHotUpdate(msg?.project, component);
  }, 100);
});

// 当开启调试模式时，启动到开发服务器的ws通讯
let pkgs = devConfig?.pkgs;
if (pkgs) {
  for (let k of
    Object.keys(pkgs)) {
    let v = pkgs[k];
    if (v.enable) {
      new _HotConnection(v.hostport);
    }
  }
}
