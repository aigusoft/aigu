import { WcLog } from './Logger';
import { PromiseExt, _Utils } from './Utils';
const log = WcLog(module);

/**
 * Defer 异步 Promise 类
 * 超时后警告错误，不终止
 */
export class Defer<T = any> {
  private _promise?: Promise<any>;
  private _resultValue?: T;

  private _state = 'init' as 'init' | 'loading' | 'end';

  constructor(private _name: string, private _loader: (selfDefer: Defer) => Promise<any>, private _timeoutMs = 15000) {
  }
  state() {
    return this._state;
  }
  resultSync() {
    return this._resultValue;
  }
  async result() {
    if (this._state == 'init') {
      this._state = 'loading';
      try {
        this._promise = PromiseExt._timeout(this._loader(this), this._timeoutMs);
        this._resultValue = await this._promise;
      } catch (e) {
        log.warn('load error', this._name, e);
      }
      this._state = 'end';
    } else if (this._state == 'loading') {
      return await this._promise;
    }

    return this._resultValue;
  }
  reslove(result: any) {
    this._resultValue = result;
    this._state = 'end';
  }
}
