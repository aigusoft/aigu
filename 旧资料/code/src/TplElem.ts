import { WcLog } from "./Logger";
import { _Utils } from "./Utils";
const log = WcLog(module);

/**
 * 实现对Tpl元素的遍历和访问以及常用方法
 */
export class TplElem {
    private static _attrNodeCache = {} as { [k: string]: Attr };
    attrs={} as Readonly<{ [k: string]: Attr }> ;
    elem:Element
    constructor( _elem: Element) {
      this.elem=_elem
      let ret = {} as { [k: string]: string };
      for (let i = 0; i < this.elem.attributes.length; i++) {
        let att = this.elem.attributes[i];
        ret[att.name] = att.value;
        (this.attrs as any)[att.name] = att;
      }
    }
    /**
     * 遍历子节点, deep 代表是否
     * @param deep
     */
    async walkChild(onChild: (childEl: TplElem) => Promise<void>, deep: boolean = false) {
      await _Utils._walkChild(this.elem, (child) => onChild(new TplElem(child)), deep);
    }
  

    setAttr(name: string, value: string) {
      let att = this.attrs[name];
      if (att) att.value = value;
      else log.warn("invalid set tpl attr:", name, value, this.elem);
    }
    remove(name: string) {
      let att = this.attrs[name];
      if (att) {
        this.elem.removeAttributeNode(att);
      }
    }
    addAttrs(attrList: { [k: string]: string }) {
      let needlist = [] as string[];

      for (let k of Object.keys(attrList)) {
        let v = attrList[k];
        if (TplElem._attrNodeCache[k]) {
          // 以及缓存，直接设置
          let _att = TplElem._attrNodeCache[k].cloneNode() as Attr;
          _att.value = v;
          this.elem.setAttributeNode(_att);
          log.warn('--> addAttrs cached',_att.name,_att.value)
        } else {
          needlist.push(`${k}="${v}"`);
        }
      }
  
      if (needlist.length > 0) {
        // 创建并缓存节点
        let el = document.createElement("template");
        el.innerHTML = `<div ${needlist.join(" ")}></div>`;
        let attributes = el.content.firstElementChild!.attributes;
        for (let i = 0; i < attributes.length; i++) {
          let _att = attributes.item(i)!.cloneNode() as Attr;
          // 设置节点
          this.elem.setAttributeNode(_att.cloneNode() as Attr);
          // 缓存属性
          _att.value = "";
          TplElem._attrNodeCache[_att.name] = _att;
          log.warn('--> addAttrs create',_att.name,_att.value)

        }
      }
    }
  }
  