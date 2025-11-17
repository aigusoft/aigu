import { Logger } from "./logger";

const log = Logger("WOO:Utils")



export const PromiseExt = {
  /**
   * 超时 Promise，并清理定时器，避免泄露
   */
  timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject("timeout");
      }, timeoutMs);

      promise.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  },

  /**
   * 等待指定毫秒
   */
  wait(timeoutMs: number) {
    return new Promise<void>(resolve => {
      setTimeout(resolve, timeoutMs);
    });
  }
};

export class Defer<T = any> {
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _reject!: (reason?: any) => void;
  private _promise: Promise<T>;
  private _isSettled = false;
  private _timer: any = null;

  constructor(
    public name?: string,
    private _timeoutMs: number = -1
  ) {
    const basePromise = new Promise<T>((res, rej) => {
      this._resolve = res;
      this._reject = rej;
    });

    if (this._timeoutMs > 0) {
      // 手动实现超时，而不是通过 PromiseExt.timeout
      this._promise = new Promise<T>((resolve, reject) => {
        this._timer = setTimeout(() => {
          this._clearTimer();
          this._safeReject("timeout");
        }, this._timeoutMs);

        basePromise.then(
          v => {
            this._clearTimer();
            resolve(v);
          },
          e => {
            this._clearTimer();
            reject(e);
          }
        );
      });
    } else {
      this._promise = basePromise;
    }
  }

  /**
   * 等待结果，可额外传自定义一次性超时时间
   */
  result(timeout: number = -1) {
    if (timeout > 0) {
      return PromiseExt.timeout(this._promise, timeout);
    }
    return this._promise;
  }

  /**
   * 手动 resolve
   */
  resolve(value: T) {
    this._safeResolve(value);
  }

  /**
   * 手动 reject
   */
  reject(reason?: any) {
    this._safeReject(reason);
  }

  /**
   * 手动取消（reject + 标记）
   */
  cancel(reason: string = "cancelled") {
    this._safeReject(reason);
  }

  /**
   * 内部安全 resolve
   */
  private _safeResolve(value: T) {
    if (this._isSettled) return;
    this._isSettled = true;
    this._clearTimer();
    this._resolve(value);
  }

  /**
   * 内部安全 reject
   */
  private _safeReject(reason?: any) {
    if (this._isSettled) return;
    this._isSettled = true;
    this._clearTimer();
    this._reject(reason);
  }

  /**
   * 清理定时器
   */
  private _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}


/**
 * 网络工具类
 */

export const NetUtils = {
  async httpGetText(url: string) {
    return fetch(url).then(res => {
      if (res.ok) {
        return res.text()
      } else {
        throw new Error(`${res.status} ${res.statusText}: ${url}`)
      }
    })
  },
  async httpGetJson(url: string) {
    return JSON.parse(await this.httpGetText(url))
  }
}


export interface IElemJson {
  tag: string
  attrs: { [k: string]: string }
  children: (IElemJson | string)[]
}

export const JsUtils = {

  /**
   * 对象映射,过滤undefined
   * @param obj 
   * @param fn 
   * @returns 
   */
  objectMap<T extends { [k: string]: any }, R>(obj: T, fn: (v: T[string], k: string) => R): { [k in keyof T]: NonNullable<R> } {
    let newObj = {} as any
    for (let k of Object.keys(obj)) {
      let v = fn(obj[k], k)
      if (v !== undefined) newObj[k] = v
    }
    return newObj
  },

  objectMapToArray<T extends { [k: string]: any }, R>(obj: T, fn: (v: T[string], k: string) => R): NonNullable<R>[] {
    let arr = [] as any[]
    for (let k of Object.keys(obj)) {
      let v = fn(obj[k], k)
      if (v !== undefined) arr.push(v)
    }
    return arr
  },
  objectForEach<T extends { [k: string]: any }>(obj: T, fn: (v: T[string], k: string) => void) {
    for (let k of Object.keys(obj)) {
      fn(obj[k], k)
    }
  },
  isClass(obj: any): boolean {
    if (!(typeof obj === 'function')) return false
    try {
      let tmp = class extends obj { }
      return true
    } catch (e) {
      return false
    }
  },

}
export const WebUtils={

  /**
 * 监听一个事件目标对象的事件，并等待其触发，支持超时
 * 
 * @param elem 事件目标对象
 * @param name 事件名称
 * @param timeoutMs 超时时间，默认-1表示不超时

 * @returns Promise<void>
 */
  async waitEventOnce(elem: EventTarget, name: string, timeoutMs: number = -1): Promise<void> {
    return new Promise<void>((res, rej) => {
      let timer: any = null;
      const handler = () => {
        if (timer) clearTimeout(timer);
        elem.removeEventListener(name, handler);
        res();
      };

      // 绑定一次性事件
      elem.addEventListener(name, handler, { once: true });

      // 如果设置了超时
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          elem.removeEventListener(name, handler);
          rej("timeout");
        }, timeoutMs);  
      }
    });
  },

}

export const StringUtils = {
  /**
   * 将字符串转换为驼峰命名
   * @param str 
   * @returns 
   */
  toCamelCase(str: string) {
    return str.replace(/-./g, (x) => x[1].toUpperCase());
  },
  /**
   * 将字符串转换为下划线命名
   * @param str 
   * @returns 
   */
  toUnderscore(str: string) {
    return str.replace(/[A-Z]/g, (x) => `_${x.toLowerCase()}`);
  },
  /**
   * 将字符串转换为蛇形命名
   * @param str 
   * @returns 
   */

  toSnakeCase(str: string) {
    return str.replace(/[A-Z]/g, (x) => `_${x.toLowerCase()}`);
  },

  /**
   * 将字符串转换为布尔值，可转换的字符串值为'true','1','false','0','yes','no','on','off',
   * 大于1的数字形式也会被认为是true
   * @param str 
   * @returns bool
   */
  parseBool(str: string) {
    return str === 'true' || str === 'yes' || str === 'on' || Number(str) > 0;
  },

  /**
   * 将字符串转换为整数
   * @param str 
   * @returns int
   */
  parseInt(str: string) {
    return Number(str).toFixed(0);
  },

  /**
   * 将字符串转换为浮点数
   * @param str 
   * @param precision 精度，默认-1表示不限制精度
   * @returns float
   */
  parseFloat(str: string, precision: number = -1) {
    let n = Number(str);
    return isNaN(n) ? 0 : precision < 0 ? n : Number(n.toFixed(precision));
  },

}
