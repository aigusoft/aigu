import { wcRegister } from "./WcRegister";
import { WcLog } from "./Logger";

const log = WcLog(module);

/**
 * @file Observer
 * 探测器类，用于创建或者映射可探测对象
 * 对象在变更时将自动调用
 * A对象、 B对象可以随意删除，不影响订阅回收
 * 处理根对象为变更跟踪对象，根对象为非自动回收对象
 * 使用全局elemID以及TrackerId进行变更跟踪，避免强引用导致的垃圾回收问题
 */

type ELEM_ID = number;
type BINDER_KEY = string;
type DEPEND_MAP = Map<ELEM_ID, Set<BINDER_KEY>>;

/**
 * 符号对象，标志一个对象已经是可探测的对象
 */
const SymbolObserver = Symbol("Observer");
const SymbolProxyedObj = Symbol("ProxyedObj");
/**
 * 符号对象，标志一个对象自身的依赖，而不是属性
 * 所有属性的依赖均被添加到对象本身。
 * 当对象结构发生改变时，通知对象自身的所有依赖，如增加或删除属性等
 */
const SymbolSelfDependes = Symbol("ObjectSelfDeps");

/**
 * 导出依赖监控信息，用于调试
 */
const _dependsCallStatus = {
  callerCounter: 0,
  // callerSet: [] as string[],
  noticCounter: 0,
};

/**
 * 全局依赖跟踪处理数据
 */
const _dependsTracker = {
  callerSet: new Set<Function>(),
  realtimeNotices: 0,
  delayApplyFlag: false,
};

// function _applyAllTrackedDepends() {
//   // let tm = new Date().getTime();
//   // let count = _dependsTracker.callerSet.size;

//   // 更新调用跟踪状态
//   if (_dependsTracker.callerSet.size > 0) {
//     _dependsCallStatus.callerCounter = _dependsTracker.callerSet.size;
//     const set = [] as any;
//     _dependsTracker.callerSet.forEach((func) => {
//       set.push((func as any).__tracker);
//     });
//     // _dependsCallStatus.callerSet = set;
//     _dependsCallStatus.noticCounter = _dependsTracker.realtimeNotices;
//   }
//   _dependsTracker.callerSet.forEach((binderFn) => {
//     binderFn();
//   });

//   // 重新初始化事件搜集器
//   _dependsTracker.callerSet.clear();
//   _dependsTracker.realtimeNotices = 0;

//   // let tm1 = new Date().getTime();
//   // console.log("tracker:", count, tm1 - tm);
// }
let _wcex_ready_flag = false;
window.addEventListener("wcex-loaded", () => {
  _wcex_ready_flag = true;
});

let __TRACK = localStorage.getItem('__TRACK') != null
/**
 * 在20毫秒时间间隔内应用跟踪变更
 */
function _applyTracker20ms() {
  // log.warn(`apply changes: `,_wcex_ready_flag,_dependsTracker.callerSet.size);

  if (_wcex_ready_flag && _dependsTracker.callerSet.size > 0) {
    let tmStart = new Date().getTime();
    let traceTm=0;
    let counter = 0;
    let allSize = _dependsTracker.callerSet.size;
    for (let fn of _dependsTracker.callerSet) {
      if(__TRACK) traceTm = new Date().getTime()
      fn();
      if(__TRACK) {
        let tm = new Date().getTime() - traceTm;
        if(tm > 10) {
          log.info(`apply changes: trace long time`,tm,(fn as any).__tracker);
        }
      }
      _dependsTracker.callerSet.delete(fn);
      // 每20次调用计算时间
      counter++;
      if (counter % 20 == 0) {
        // 最多占用20毫秒时间
        let tm = new Date().getTime() - tmStart;
        if (tm > 20) break;
      }
    }
    let tm = new Date().getTime() - tmStart;
    if(__TRACK) log.info(`apply changes: all=${allSize},tm=${tm},proc=${counter}`);

  }
  // 继续请求
  requestAnimationFrame(_applyTracker20ms);
}
requestAnimationFrame(_applyTracker20ms);

/**
 * 延时调用函数, 当变更数据>500时处理
 */
// function _DelayApplyCallerTracker() {
//   // 延后执行
//   if (!_dependsTracker.delayApplyFlag) {
//     _dependsTracker.delayApplyFlag = true;
//     // 等待wcex加载完成后启动搜集
//     // 合并 20 MS 内的变更事件
//     requestAnimationFrame(() => {
//       _applyAllTrackedDepends();
//       // 重置更新标志
//       _dependsTracker.delayApplyFlag = false;
//     });
//   } else {
//     if (_dependsTracker.callerSet.size > 500) {
//       setTimeout(() => {
//         _applyAllTrackedDepends();
//       });
//     }
//   }
// }

/**
 * 依赖对象类
 */
class Depends {
  // 跟踪 key
  private _trackMap = new Map<string | number | Symbol, DEPEND_MAP>();

  /**
   * 创建依赖跟踪对象
   */
  constructor() {}

  /**
   * 获取属性关联的依赖
   * @param prop
   */
  _getDeps(prop: string | number | Symbol) {
    return this._trackMap.get(prop);
  }

  /**
   * 为属性添加依赖
   * @param prop
   * @param dep
   */
  _addDeps(prop: string | number | Symbol, dep: { wcId: number; binderKey: string }) {
    let depsMap = this._trackMap.get(prop);
    if (!depsMap) {
      depsMap = new Map() as DEPEND_MAP;
      this._trackMap.set(prop, depsMap);
    }
    let depSet = depsMap.get(dep.wcId);
    if (!depSet) {
      depSet = new Set();
      depsMap.set(dep.wcId, depSet);
    }
    depSet.add(dep.binderKey);
  }
  /**
   * 删除属性的依赖
   * @param prop
   */
  _removePropDeps(prop: string | number | Symbol) {
    this._trackMap.delete(prop);
  }

  /**
   * 触发事件，搜集 50毫秒内所有事件，去重，统一发送
   * 同时触发默认跟踪事件
   * @param objSymbol
   * @param prop
   */
  _noticeChange(prop: string | number | Symbol) {
    const propDeps = this._trackMap.get(prop);
    if (!propDeps) return;

    propDeps.forEach((trackerSet, wcId) => {
      // 检测ElemId和TrackId是否存在，否则从跟踪队列删除
      const el = wcRegister.getEl(wcId);
      if (!el) {
        // el 已经被删除
        propDeps.delete(wcId);
        return;
      }
      trackerSet.forEach((binderKey) => {
        const binderFn = el._findBinderFunc(binderKey);
        if (!binderFn) {
          // 指定的 binder 已经被删除
          trackerSet.delete(binderKey);
          return;
        }

        // 添加到跟踪函数
        if (binderFn instanceof Array) {
          for (let fn of binderFn) {
            _dependsTracker.realtimeNotices++;
            (fn as any).__tracker = { prop, wcId, binderKey, name: "__tracker 1" };

            _dependsTracker.callerSet.add(fn);
          }
        } else {
          _dependsTracker.realtimeNotices++;
          (binderFn as any).__tracker = { prop, wcId, binderKey, name: "__tracker 2" };

          _dependsTracker.callerSet.add(binderFn);
        }
      });
    });

    // 延时合并发送事件
    // _DelayApplyCallerTracker();
  }
  /**
   * 延时处理发送消息，搜集一段事件内的消息，合并发送
   */
}

class Observer {
  private _depsTracker = null as { wcId: number; binderKey: string } | null;

  private _badFunctionsSet = new Set<Function>();
  constructor() {
    this._nowatch(_dependsCallStatus);
  }
  /**
   * 执行函数，搜集依赖信息并返回
   * 当依赖信息变化时，自动执行listener
   * 需要保存listener跟踪关系，取消注册时调用
   */
  trackCall(wcId: number, binderKey: string, trackerfunc: Function) {
  //   if(binderKey.startsWith('18|$for')) 
  //   {
  //     debugger;
  //     console.log("----------trackCall",binderKey)
  // }

    this._depsTracker = { wcId, binderKey };
    var result;
    try {
      if (!this._badFunctionsSet.has(trackerfunc)) {
        result = trackerfunc();
        if (result instanceof Array) {
          !result.length; // 如果获取结果为Array，需要触发Array成员以记录跟踪
        }else if(result instanceof Set){
          !result.size;
        }else if(result instanceof Map){
          !result.size;
        }
      }
    } catch (e: any) {
      // 阻止后续的变更依赖
      wcRegister.getEl(wcId)?._removeBinderKey(binderKey);
      this._badFunctionsSet.add(trackerfunc);
      log.error("trackCall failed:", e.message, binderKey);
      // 输出友好的调试信息
      let m = binderKey.match(/^(\d+)|(.*)/);
      if (m && m.length == 3) {
        let eid = parseInt(m[1]);
        let el = wcRegister.getEl(wcId)?.$rootElem?.shadowRoot?.querySelector(`*[eid="${eid}"]`);
        log.error("please check:", wcRegister.getEl(wcId)?.$rootElem, el, binderKey);
      } else {
        log.error("please check:", wcRegister.getEl(wcId)?.$rootElem);
      }
    }
    this._depsTracker = null;
    return result;
  }

  private _objDependes(obj: any) {
    return obj[SymbolObserver] as Depends;
  }

  private _autoTrackDeps(obj: any, prop?: string | number | Symbol) {
    if (this._depsTracker) {
        // console.warn("--- _autoTrackDeps",prop,this._depsTracker)
      if (typeof prop !== "undefined") {
        // if(typeof obj[prop as any] !== 'function')
        this._objDependes(obj)._addDeps(prop, this._depsTracker);
      }
      this._objDependes(obj)._addDeps(SymbolSelfDependes, this._depsTracker);
    }
  }

  _status() {
    return _dependsCallStatus;
  }

  _isSystemObj(obj: any) {
    return (
      obj instanceof Node ||
      obj instanceof Window ||
      obj instanceof Promise ||
      obj instanceof Document ||
      obj instanceof DocumentFragment ||
      obj instanceof ResizeObserver ||
      obj instanceof MutationObserver ||
      obj instanceof IntersectionObserver ||
      obj instanceof Event
    );
  }

  private _mkProxy(obj: any) {
    if (!(obj instanceof Object)) return obj;
    if (typeof obj == "function") return obj;
    if (obj == null) return obj;

    if (Reflect.has(obj,SymbolObserver)) return obj;
    if (Reflect.has(obj,SymbolProxyedObj) ) return obj[SymbolProxyedObj];

    if (!Reflect.isExtensible(obj)) return obj;

    // 排除 DOM 基础类
    if (this._isSystemObj(obj)) return obj;

    // 已经设置过可探测标志的类，不做处理,BUFFIX:有些可探测对象不是proxy，而是get/set
    // 保存所有可探测的成员对象标志，设置为不可枚举
    // if ((obj as Object).hasOwnProperty(SymbolObserver))

    Object.defineProperty(obj, SymbolObserver, {
      value: new Depends(),
      enumerable: false,
      writable: false,
    });
    // 递归所有子对象
    Reflect.ownKeys(obj).forEach((k)=>{
      if(typeof k == 'string' && typeof obj[k] == 'object'){
        let desc = Reflect.getOwnPropertyDescriptor(obj,k);
        if(desc?.writable && desc.configurable && (!(desc.get || desc.set))){
          obj[k] = this._mkProxy(obj[k]);
        }
      }
    })
    // Object.getOwnPropertyNames(obj).forEach((k) => {
    //   Reflect.
    //   const v = obj[k];
    //   if (typeof v == "object") {
    //     obj[k] = this._mkProxy(v);
    //   }
    // });
    // if (obj instanceof Array) debugger;
    const self = this;
    const proxyed = new Proxy(obj, {
      get(t, prop, r) {
        // 对属性类型跟踪变更
        if (typeof prop !== "symbol") {
          // if(obj instanceof Set) debugger;
          self._autoTrackDeps(obj, prop);
        }
        // 对Set,Map等对象进行跟踪
        if (obj instanceof Set || obj instanceof Map) {
          if (prop == "add" || prop == "delete" || prop == "clear" || prop == "set") {
            self._objDependes(obj)._noticeChange(SymbolSelfDependes);
          }
        }

        // 对Array对象进行跟踪
        if(obj instanceof Array){
          if (prop == "push" || prop == "pop" || prop == "shift" || prop == "unshift" || prop == "splice" || prop == "sort" || prop == "reverse") {
            self._objDependes(obj)._noticeChange(SymbolSelfDependes);
            self._objDependes(obj)._noticeChange('length');
          }
        }

        // 绑定所有的方法到原始对象,排除数组,因为数组方法绑定到proxy对象将导致proxy无法监控数组变化出发通知
        if (typeof obj[prop] == "function" && !(obj instanceof Array)) {
          return obj[prop].bind(obj);
        }

        return obj[prop];
      },
      set(t, prop, value, r) {

        const newFlag = !(obj.hasOwnProperty && obj.hasOwnProperty(prop));
        // (typeof obj[prop] != 'object') &&
        // debugger
        if (typeof obj[prop] != "object" || obj[prop] !== value) {
          obj[prop] = self._mkProxy(value);
          // 获取依赖通知变更
          self._objDependes(obj)._noticeChange(prop);
          // 检测是否新增属性，新增属性调用obj的通知
        }
        if (t instanceof Array || newFlag) {
          self._objDependes(obj)._noticeChange(SymbolSelfDependes);
        }

        // 所有变动均通知父对象
        // self._objDependes(obj)._noticeChange(SymbolSelfDependes);

        return true;
      },
      deleteProperty(t, prop) {
        self._autoTrackDeps(obj, prop);
        // 获取依赖通知变更
        const deps = self._objDependes(obj);
        // 触发父依赖变更，通知所有对象
        deps._noticeChange(prop);

        deps._noticeChange(SymbolSelfDependes);
        // 删除依赖属性
        deps._removePropDeps(prop);
        delete obj[prop];
        return true;
      },
    });
    if (obj instanceof Set || obj instanceof Map) {
      // 对于Set 或者 Map 不设置原型
      return proxyed;
    }

    // 转换原型对象为Proxy,当请求原型方法时,绑定方法到 this到 proxyed 对象
    // 主要实现自定义类内部使用this指针改变成员变量的跟踪
    const proto = Object.getPrototypeOf(obj);

    if (proto && proto != Object.prototype && proto != Array.prototype && !(proto instanceof HTMLElement) && !(proto instanceof Node)) {
      Object.setPrototypeOf(
        obj,
        new Proxy(proto, {
          get(t, p, r) {
            let prop = Reflect.getOwnPropertyDescriptor(t, p);
            if (prop?.get) return Reflect.get(t, p, r);
            return typeof t[p] == "function" ? t[p].bind(proxyed) : t[p];
          },
        })
      );
    }

    // 保存proxy对象,防止多次循环调用
    Object.defineProperty(obj, SymbolProxyedObj, {
      value: proxyed,
      enumerable: false,
      writable: false,
    });
    return proxyed;
  }
  private _watchProperty(obj: any, prop: string | symbol, value: any, onSet?: (prop: string, v: any) => void) {
    var self = this;
    if (this._isSystemObj(obj)) return obj;
    if (typeof prop == "symbol") return obj;
    if (obj instanceof Node || obj instanceof Map || obj instanceof Set) return obj;
    // 如果对象属性为函数，则设置函数this指针
    if (typeof obj[prop] == "function") {
      // obj[prop] = obj[prop].bind()
      return obj;
    }
    // 设置 get/set 方法
    var _v = self._mkProxy(typeof value === "undefined" ? obj[prop] : value) as ProxyHandler<any>;
    Object.defineProperty(obj, prop, {
      enumerable: true,
      configurable: true,
      get() {
        // 对属性类型跟踪变更
        self._autoTrackDeps(obj, prop);
        return _v;
      },
      set(v: any) {
        // @!!! BUGFIX 必须用全等,当属性为object时也需要通知
        // if(prop == 'component') console.log('--- SET!! component',prop,v);
        if (typeof _v != "object" || _v !== v) {
          // 设置新属性
          _v = self._mkProxy(v);
          onSet?.(prop, _v);
          // 获取依赖通知变更
          self._objDependes(obj)._noticeChange(prop);
          // self._objDependes(obj)._noticeChange(SymbolSelfDependes);

        }

        return true;
      },
    });
    return obj;
  }
  /**
   * 设置对象观测标志，使对象不在进行观测处理
   */
  _nowatch<T extends object>(obj: T): T {
    // 保存所有可探测的成员对象标志，设置为不可枚举
    if (!(obj.hasOwnProperty && obj.hasOwnProperty(SymbolObserver)))
      Object.defineProperty(obj, SymbolObserver, {
        value: new Depends(),
        enumerable: false,
        writable: false,
      });
    return obj;
  }

  /**
   * 观察一个对象
   * 对象自身使用 get/set
   * 对象成员使用 proxy
   * 数组对象,Set,Map等使用proxy处理
   * 对象自身原型使用 proxy 处理新增
   * 不处理对象原型变量
   * @param obj
   * @param onSet 当设置对象的成员函数时回调函数
   * @returns
   */
  watch<T extends Object>(obj: T, onSet?: (prop: string, v: any) => void) {
    const self = this;
    // 已经设置过可探测标志的类，不做处理
    if (obj.hasOwnProperty && obj.hasOwnProperty(SymbolObserver)) return obj;

    // 判断是否是obj对象
    if (typeof obj !== "object" || obj instanceof Array) {
      // log.warn('', obj);
      return obj;
    }
    // if(obj instanceof Array){
    //   return this._mkProxy(obj)
    // }
    // 检测对象是否可扩展
    if (!Reflect.isExtensible(obj)) return obj;

    // 排除HTML原生对象
    if (this._isSystemObj(obj)) return obj;

    // 排除空对象
    if (obj == null) return obj;

    // if (Reflect.has(obj, SymbolObserver)) return obj;
    // 保存所有可探测的成员对象标志，设置为不可枚举
    Object.defineProperty(obj, SymbolObserver, {
      value: new Depends(),
      enumerable: false,
      writable: false,
    });
    // 观测所有已有属性, 使用 get/set
    // Object.getOwnPropertyNames(obj).forEach((prop) => {
    Object.keys(obj).forEach((prop) => {
      // 排除 成员函数以及 symbol Key
      this._watchProperty(obj, prop, undefined, onSet);
    });
    // 设置 __proto__ 以处理新增属性, 检查原型是否有此属性，否则新建属性需设置在 obj 之上
    Object.setPrototypeOf(
      obj,
      new Proxy(Object.getPrototypeOf(obj) || {}, {
        set(target, prop, value, receiver) {
          // 此时, target指向 proto, receiver == obj为原始对象
          try {
            // TODO: 判断一致性，值不一样时调用
            // 判断是否自身对象,须使用"has"判断!
            if (Reflect.has(target, prop)) {
              // 原型属性
              target[prop] = self._mkProxy(value);
              self._objDependes(obj)._noticeChange(prop);
            } else {
              //   // 在自身创建新变量
              //   // log.info('-- new set 2', prop);
              self._watchProperty(obj, prop, value, onSet);
              // Reflect.defineProperty(receiver, prop, {
              //   value: self._watchProperty(obj, prop, value, onSet),
              //   configurable: true,
              //   enumerable: true,
              //   writable: true,
              // });
              // 通知变更
              self._objDependes(obj)._noticeChange(prop);
              self._objDependes(obj)._noticeChange(SymbolSelfDependes);
            }

            // if (typeof target[prop] !== 'undefined') {
            //   // log.info('-- new set 1', prop);
            //   // if (prop == 'aabbcc') debugger;
            //   // 当前原型链有此对象，直接赋值到原型链

            //   target[prop] = self._mkProxy(value);
            //   self._objDependes(obj)._noticeChange(prop);
            // } else {
            //   // 在自身创建新变量
            //   // log.info('-- new set 2', prop);
            //   self._watchProperty(obj, prop, value, onSet);
            //   // 通知变更
            //   self._objDependes(obj)._noticeChange(prop);
            //   self._objDependes(obj)._noticeChange(SymbolSelfDependes);
            // }
            // 调用回调函数
            if (onSet) onSet(prop as string, value);
          } catch (e) {
            log.error("observer set fail:", e, target, prop, value);
          }
          return true;
        },
      })
    );

    return obj;
  }
}

export const _observer = new Observer();

// 导出全局NOWATCH函数
(window as any).__OB_STATUS = function () {
  return _dependsCallStatus;
};
