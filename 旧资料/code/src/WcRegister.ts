import { Wc } from './Wc';
import { WcLog } from './Logger';
const log = WcLog(module);

/**
 * 动态 ELEMENT 注册
 */
export class ElementRegister {
  private _idCounter = 1;
  private _register = new Map<number, Wc>();
  constructor() {}

  register(el: Wc) {
    const id = this._idCounter++;
    this._register.set(id, el);
    // log.info('register!!', id,el.$rootElem);
    return id;
  }
  unregister(el: Wc) {
    this._register.delete(el.$wcId);
    // log.info('unregister!!', el.$wcId,el.$rootElem);
  }
  getEl(elId: number) {
    return this._register.get(elId);
  }
  findByTag(tag: string) {
    const elList = [] as Wc[];
    for (const mm of this._register) {
      if (mm[1].tag.toLowerCase() === tag) elList.push(mm[1]);
    }
    return elList;
  }
}
export const wcRegister = new ElementRegister();
