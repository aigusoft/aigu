// 简化版 kebabCase2
import { WcLog } from "./Logger";
import { _Tpl } from "./Tpl";
const _log = WcLog(module);


/**
 * 生成模板字符串求值函数
 *
 * @param str
 */
export function mkScopedExpr(str: string) {
  return new Function("scope", "$el", `with(scope){return \`${str}\`}`);
}

/**
 * 直接求值
 * @param str
 */
export function mkScopedValue(str: string) {
  return new Function("scope", "$el", `with(scope){return ${str}}`);
}

/**
 * 生成事件函数
 * @param str
 */
export function mkScopedEvent(str: string) {
  return new Function("scope", "$el", "$ev", `with(scope){${str}}`);
}

export function objectGet(obj: any, path: string) {
  let o = obj;
  try {
    for (let p of path.split(".")) {
      o = o[p];
    }
    return o;
  } catch (e) {
    return undefined;
  }
}

// /**
//  * 遍历元素，生成快照进行遍历，防止执行中的变动
//  * @param el
//  * @param callback
//  */
export function eachAttr(el: Element, callback: (attr: Attr) => void) {
  const attrs = [];
  for (let i = 0; i < el.attributes.length; i++) {
    attrs.push(el.attributes.item(i)!);
  }
  attrs.forEach(callback);
}

export function elementAttrs(el: Element) {
  const names = [];
  for (let i = 0; i < el.attributes.length; i++) {
    names.push(el.attributes.item(i)!);
  }
  return names;
}

export const _Utils = {
  // 遍历所有子元素
  async _walkChild(
    elem: Element | DocumentFragment,
    onChildElem: (childEl: Element) => Promise<void> | void,
    deep: boolean = false,
    parentFirst = true
  ) {
    var _walk = async (el: Element | DocumentFragment) => {
      for (let i = 0; i < el.children.length; i++) {
        let child = el.children[i];
        if (parentFirst) await onChildElem(child);
        if (deep) {
          await _walk(child);
        }
        if (!parentFirst) await onChildElem(child);
      }
    };
    await _walk(elem);
  },
  /**
   * 遍历对象
   * @param obj
   * @param callback
   */
  _objFor<T extends {}>(obj: T, callback: (v: T[keyof T], k: string) => void): void {
    for (let k of Object.keys(obj)) {
      callback((obj as any)[k], k);
    }
  },
  _objLength(obj: any) {
    return Object.keys(obj).length;
  },
  /**
   * 将大写字母开头转换为-[小写字母]
   */
  _kebabCase(s: string) {
    return s
      .replace(/[\u0020-\u002F\u003a-\u0040]/g, "-")
      .replace(/[A-Z][^A-Z]*/g, (m) => "-" + m.toLowerCase())
      .replace(/-+/g, "-")
      .replace(/^-+/, "");
  },

  _kebabCase2(s1: string, s2: string) {
    return !!s1 ? _Utils._kebabCase(s1) + "-" + _Utils._kebabCase(s2) : _Utils._kebabCase(s2);
  },


  /**
   * 获取指定元素所在的 shadowRoot 的
   * @param el 
   */
  _findRootWcElem(el: Node): HTMLElement | undefined {
    let p = el.parentNode;
    if (!p) return undefined;

    if (p instanceof ShadowRoot) {
      return <HTMLElement>p.host;
    }
    return this._findRootWcElem(p);
  },

  /**
   * 链接多个url路径，自动检测每个部分中间是否有 '/',保障不重复或者自动添加
   * 自动检测和处理.和..
   * @param parts
   */
  _joinUrl(...parts: (string | undefined | null)[]) {
    const pathList = [] as string[];
    parts.forEach((url, i) => {
      if (i == 0 && url) {
        // 检测第一个路径是否为'/'开始
        if (url.startsWith("/")) pathList.push("");
        else {
          // 第一个url，检测类似 http:// 的前缀
          const sp = url.split("://", 2);
          if (sp.length == 2) {
            pathList.push(sp[0] + ":/");
            url = sp[1];
          }
        }
      }
      // 对每个url进行分割，检测'.'和'..'
      if (url) {
        const sp = url.split("/");
        sp.forEach((part) => {
          if (part.length == 0 || part == ".") return;
          // .. 回退路径
          if (part == "..") return pathList.pop();
          // 添加路径
          pathList.push(part);
        });
      }
    });
    return pathList.join("/");
  },

  /**
   * 检测一个bool变量
   * @param value
   * @returns
   */
  _checkBool(value: any): boolean {
    function _checker(v: any): boolean {
      switch (typeof v) {
        case "bigint":
        case "number":
          return v > 0;
        case "boolean":
          return v;
        case "function":
          return _checker(v());
        case "object":
          return v == null
            ? false
            : v instanceof Array
              ? v.length > 0
              : v instanceof Map
                ? v.size > 0
                : v instanceof Set
                  ? v.size > 0
                  : Object.getOwnPropertyNames(v).length > 0;
        case "string":
          let vv = v.trim();
          return vv == "" || value == "0" || value == "false" || value == "no" ? false : true;
        case "symbol":
          return true;
        case "undefined":
          return false;
        default:
          return false;
      }
    }
    return _checker(value);
  },

  /**
   * 用于style名称转换
   */
  _kebabToSnake(str: string) {
    return str
      .replace(/^[-:$@]+/, "")
      .split(/-+/)
      .map((s, i) => {
        return i > 0 ? s.slice(0, 1).toUpperCase() + s.slice(1) : s;
      })
      .join("");
  },

  /**
   * 获取扩展名,不包含'.'
   * 获取最后一段路径
   */
  _extNameFromUrl(url: string) {
    let sp = url.split("/");
    let last = sp[sp.length - 1];
      let m = last.match(/^(.*)\.(.+?)$/);
      if (m) return m[2];
    return "";
  },

  /**
   * 判断对象是否class，简单判断
   * @param obj
   */
  _isClass(obj: any) {
    if (typeof obj == "function") {
      if (obj.prototype.constructor == obj) return true;
    }
    return false;
  },


  /**
   * 类似lodash.debounce同样功能，仅在最后一次调用时执行传入函数
   */
  _delayCall(fn: (...s: any[]) => void, delay = 50): (...a: any[]) => void {
    let callNum = 0;
    return (...args: any[]) => {
      callNum++;
      let curNum = callNum;
      setTimeout(() => {
        // 检测是否最后一次调用
        if (callNum === curNum) {
          fn(...args);
        }
      }, delay);
    };
  },


  // 分段执行一个生成器函数，将需要大量计算的操作分解到20毫秒一个间隔，在requestAnimationFrame()中分布执行
  // 避免影响UI更新
  async _execInAnimationFrame(fn: () => Generator) {
    let start = performance.now();
    let gen = fn();
    let res = gen.next();
    let counter = 0;
    while (!res.done) {
      if (performance.now() - start > 20) {
        // 等待下一个周期
        await new Promise(resolve => requestAnimationFrame(resolve));
        start = performance.now();
      }
      res = gen.next();
    }
  }

};

const SYM_ONCE_RESULT = Symbol("Utils_OnceResults");

export const PromiseExt = {
  /**
   * 超时Promise
   * @param promise
   * @param timeoutMs
   * @returns
   */
  _timeout(promise: Promise<any>, timeoutMs: number) {
    return Promise.race([
      promise,
      new Promise((res, rej) => {
        setTimeout(() => {
          rej("timeout");
        }, timeoutMs);
      }),
    ]);
  },

  /**
   * 仅执行一次的promise，第一次调用获取结果，后续调用将等待第一次完成后，直接获取结果
   * 请求为创建Promise的函数,可以是async函数
   */
  once(key: string, promiseFactory: () => Promise<any>): Promise<any> {
    let results = Reflect.get(this.once, SYM_ONCE_RESULT);
    if (!results) {
      results = {};
      Object.defineProperty(this.once, SYM_ONCE_RESULT, { value: results, enumerable: true });
    }

    if (results[key]) return results[key];
    results[key] = promiseFactory();
    return results[key];
  },

  _wait(timeoutMs: number) {
    return new Promise(res => {
      setTimeout(res, timeoutMs);
    });
  }
};

// /**
//  * 创建一个限流函数，限制函数调用频率，使函数在指定时间内只执行一次
//  * 函数调用的时机发生在间隔的开始，如在间隔的时间内发生多次，则在下一次的时间间隔开始时执行
//  * @param fn 
//  * @param delayTime 
//  */
// export function _throttleFunction(fn: ((...args: any[]) => void) & {__throttle:{
//   lastCall:number,
//   timer:number,
//   args:any[]
// }}, delayTime = 50):void {
//   if(!fn.__throttle) {
//     // 初始化限流数据
//     fn.__throttle = {
//       lastCall:0,
//       timer:0,
//       args:[]
//     };
//   }

//   let data = fn.__throttle!;
//   let now = performance.now();
//   let delta = now - data.lastCall;
//   if(delta >= delayTime) {
//     // 超过间隔时间，直接执行
//     data.lastCall = now;
//     fn.apply(fn,data.args);
//     data.args = [];
//   } else {
//     // 未超过间隔时间，等待下一次间隔
//     data.args = args;
//     if(data.timer) return;
//     data.timer = setTimeout(()=>{
//       data.timer = 0;
//       data.lastCall = performance.now();
//       fn.apply(fn,data.args);
//       data.args = [];
//     },delayTime - delta);
//   }

// }

// function * abc(){

//   yield('');

// }
// async function frameIntervalExec(fn:()=>Generator ){
//   return new Promise((req,res)=>{
//     // 执行分段函数
//     let it = fn();
//     // 首次运行
//     it.next();
//     requestAnimationFrame

//   })
// }
// frameIntervalExec(abc)
