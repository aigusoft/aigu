/**
 * 处理 WC 插件，为 wc 增加功能或者处理器
 * 插件将在以下几个阶段生效：
 * 1. 模板预处理和解析： tpl 初始化加载原始模板后，进行模板预处理，支持tpl解析前和解析后处理
 *      tpl:{pre,post}
 * 2. 组件实例化阶段：wc 进行实例化模板时加载
 *      wc: {pre,post}
 * 3. 运行时依赖对象变更
 *      changed:{pre,post}
 */

import { WcLog } from '../Logger';
import { _observer } from '../Observer';
import { IPlugins, IPluginsTplFunc, IPluginsTplParserFunc, IPluginsWcApplyFunc, IPluginsWcDestroyFunc, IPluginsWcPostFunc, IPluginsWcPreFunc } from './IPlugins';
const log = WcLog(module);

/**
 * 管理和运行plugins
 * 插件提供以下系统扩展能力
 * tpl扩展，预解析和处理tpl
 * scope扩展，向组件的scope中注入自定义函数
 * wc组件扩展, 运行时对组件的解析和处理
 */
class PluginsManager {
  private _setPlugins = [] as IPlugins[];

  // 多个阶段，可能调用回调函数参数不一样
  private _pluginStages = {
    tplPre: undefined as IPluginsTplFunc | undefined,
    tplPost: undefined as IPluginsTplFunc | undefined,
    tplParse: undefined as IPluginsTplParserFunc | undefined,
    wcPre: undefined as IPluginsWcPreFunc | undefined,
    wcPost: undefined as IPluginsWcPostFunc | undefined,
    wcApply: undefined as IPluginsWcApplyFunc | undefined,
    wcDestroy: undefined as IPluginsWcDestroyFunc | undefined,
    // 自定义注入scope的对象
    scope: {} as { [k: string]: any; },
    _applyScope(rootScope: any) {
      for (let k of Object.keys(this.scope)) {
        let v = this.scope[k];
        rootScope[k] = (typeof v == 'function') ? v.bind(rootScope) : v;
      }
    }
  };

  private _dirty = false;

  /**
   * 启用一个插件, 按照优先级插入到
   * @param plugins 插件
   * @returns
   */
  use(plugins: IPlugins) {
    this._setPlugins.push(plugins);
    this._dirty = true;
    // 初始化插件提供的全局Scope
  }

  _stages() {
    if (this._dirty) {
      this._dirty = false;
      this._build();
    }
    return this._pluginStages;
  }

  private _build() {
    // 重建列表
    const list = {
      tplPre: [] as { plugin: IPlugins; func: Function; }[],
      tplParse: [] as { plugin: IPlugins; func: Function; }[],
      tplPost: [] as { plugin: IPlugins; func: Function; }[],
      wcPre: [] as { plugin: IPlugins; func: Function; }[],
      wcPost: [] as { plugin: IPlugins; func: Function; }[],
      wcApply: [] as { plugin: IPlugins; func: Function; }[],
      wcDestroy: [] as { plugin: IPlugins; func: Function; }[],
    };
    const scope = {} as { [k: string]: any; };
    // 按照优先级顺序处理插件
    for (let p of this._setPlugins.sort((a, b) => (a.priority ||1) -(b.priority||1))) {
      if (p.tplPre) list.tplPre.push({ plugin: p, func: p.tplPre });
      if (p.tplPost) list.tplPost.push({ plugin: p, func: p.tplPost });
      if (p.tplParse) list.tplParse.push({ plugin: p, func: p.tplParse });
      if (p.wcPre) list.wcPre.push({ plugin: p, func: p.wcPre });
      if (p.wcPost) list.wcPost.push({ plugin: p, func: p.wcPost });
      if (p.wcApply) list.wcApply.push({ plugin: p, func: p.wcApply });
      if (p.wcDestroy) list.wcDestroy.push({ plugin: p, func: p.wcDestroy });
      if (p.scope) Object.assign(scope, p.scope);
    }
    function _callAll(stages: { plugin: IPlugins; func: Function; }[]) {
      return async (...args: any[]) => {
        for (let st of stages) {
          await st.func.apply(st.plugin, args);
        }
      };
    }

    // 设置调用函数
    this._pluginStages.scope = scope;
    this._pluginStages.tplPre = list.tplPre.length > 0 ? _callAll(list.tplPre) : undefined;
    this._pluginStages.tplParse = list.tplParse.length > 0 ? _callAll(list.tplParse) : undefined;
    this._pluginStages.tplPost = list.tplPost.length > 0 ? _callAll(list.tplPost) : undefined;
    this._pluginStages.wcPre = list.wcPre.length > 0 ? _callAll(list.wcPre) : undefined;
    this._pluginStages.wcPost = list.wcPost.length > 0 ? _callAll(list.wcPost) : undefined;
    this._pluginStages.wcApply = list.wcApply.length > 0 ? _callAll(list.wcApply) : undefined;
    this._pluginStages.wcDestroy = list.wcDestroy.length > 0 ? _callAll(list.wcDestroy) : undefined;
    log.debug(
      'using plugins:',
      this._setPlugins.map((v) => v.name)
    );
  }
}

export const _pluginsManager = _observer._nowatch(new PluginsManager());
