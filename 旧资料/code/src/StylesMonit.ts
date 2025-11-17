/**
 * 实现对元素样式的全局跟踪
 * 新特性：监控当前元素 computedStyleMap 变化
 * 实际测试，computedStyleMap（火狐不兼容） 性能足够，100万次执行不到100毫秒
 * ！！window.getComputedStyle(aa,null).color（火狐和Webkit兼容语法）
 * 新语法： @!box-shadow=""
 * @! 通过定期监控，获取style变更，并发送通知: 包含 $style 特殊参数
 *
 * 需要考虑一些复杂情况：如元素从DOM中删除，元素移动...
 */

import { WcLog } from "./Logger";
import { _observer } from "./Observer";
import { PromiseExt, _Utils } from "./Utils";
import { ScopedElement } from "./plugins/IPlugins";
const log = WcLog(module);

class StylesMonit {
  private _monitInfo = {} as {
    [wcid: string]: {
      // 元素所在的WC
      [eid: string]: {
        // 元素自身的eid
        el: Element;
        styles: { [styName: string]: string; };
      };
    };
  };
  private _runningFlag = false;
  constructor() {
    window.addEventListener("wcex-loaded", () => {
      log.info("run StylesMonit");
      // 全部组件加载完成后才启动监听
      if (!this._runningFlag) {
        this._runningFlag = true;
        this._run();
      }
    });
  }
  async _run() {
    while(1){
      await this._check();
      await PromiseExt._wait(100);
    }
  }
  // 检测变更, 最多20毫秒，否则延时到下个周期
  async _check() {
    let self = this;
    await _Utils._execInAnimationFrame(function *(){
    for (let wcid of Object.keys(self._monitInfo)) {
      let wc = self._monitInfo[wcid];
      for (let eid of Object.keys(wc)) {
        let elInfo = wc[eid];
        if (!elInfo.el.isConnected) {
          log.warn('remove monit style', elInfo.el);
          delete wc[eid];
        } else {
          // 执行监测
            let styles = window.getComputedStyle(elInfo.el, null);
            for (let styName of Object.keys(elInfo.styles)) {
              let curStyle = styles.getPropertyValue(styName);
              if (curStyle !== elInfo.styles[styName]) {
                // log.warn("---!!! style changed:",styName,elInfo.el)
                // 通知变更
                elInfo.styles[styName] = curStyle;
                elInfo.el.dispatchEvent(new CustomEvent(styName, { detail: curStyle }));
              }
            }
            // 跳出和计算
            yield(true)
        }
      }
    }
  })

  }

  /**
   * 注册一个监听，当发生改变时发送相关的event
   * @param el
   * @param styleName
   */
  _registerStyleMonit(el: ScopedElement, styleName: string) {

    // debugger
    let wcid = el.$scope?.$wc?.$wcId;
    if (!wcid) return;
    let eid = el.getAttribute('eid');
    if (!eid) return;
    if (!this._monitInfo[wcid]) {
      this._monitInfo[wcid] = {};
    }
    if (!this._monitInfo[wcid][eid]) {
      this._monitInfo[wcid][eid] = { el, styles: {} };
    }
    this._monitInfo[wcid][eid].styles[styleName] = "";
  }
  _unregisterEl(el: ScopedElement) {
    let wcid = el.$scope?.$wc?.$wcId;
    if (!wcid) return;
    let eid = el.$scope?.eid;
    if (!eid) return;
    let monInfo = this._monitInfo?.[wcid]?.[eid];
    if (!monInfo) return;
    delete this._monitInfo[wcid][eid];
  }
  _unregisterWc(wcid: number) {
    let info = this._monitInfo?.[wcid];
    if (!info) return;
    delete this._monitInfo[wcid];
  }
}

export const _stylesMonit = _observer._nowatch(new StylesMonit());

(window as any).__STYMON = _stylesMonit;
