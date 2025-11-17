import { IElemJson, StringUtils, WebUtils } from '../common/utils';
import { DomUtils } from './domUtils';
import { Logger } from '../common/logger';
import { MainMessage } from '../message';
import { aiguMetas } from '../common/aiguMetas';

// 实现WebComponents相关的功能,运行于主线程
// 查找变更的组件或者元素,一次性加载和更新所有变化内容，提高性能
// 组件标签: 仅支持全称
const log = Logger('Aigu:MainComponent');

export const componentRegistry = new Map<string, MainComponent>();

export class BaseComponent extends HTMLElement {
  private _scripts: HTMLScriptElement[] = [];
  constructor() {
    super();
    // 读取_cid属性,获取组件内容,添加到shadowRoot
    // 获取组件内容
    const cid = this.getAttribute('_cid');
    log.info('BaseComponent constructor', this.tagName, cid);
    if (cid) {
      const comp = componentRegistry.get(cid);
      if (comp) {
        comp.attachElement(this);
        const initData = comp.getInitData()!!;
        for (const k in initData.attrs) {
          this.setAttribute(k, initData.attrs[k]);
        }
        this.attachShadow({ mode: 'open' }).innerHTML = initData.content;

        // 如果有script标签,则执行script标签内容
        this.shadowRoot?.querySelectorAll('script').forEach((el) => {
          console.log("发现脚本:", el);
          el.remove()
          this._scripts.push(el);

          //          this.shadowRoot?.appendChild(el);
          // el.replaceWith(el);
        })

      } else {
        log.error('BaseComponent', 'Component not found', cid);
      }
    }
  }
  connectedCallback() {
    // 组件内部script需要在dom初始化并连接成功后执行,每个组件实例都会执行一次此脚本
    // 执行脚本时，可使用$component引用当前组件实例
    (window as any).$component = this;
    this._scripts.forEach((el) => {
      // 执行脚本
      const script = document.createElement('script');
      script.textContent = el.textContent;
      this.shadowRoot?.appendChild(script);
    });
    (window as any).$component = undefined;
    log.info('connectedCallback', this.tagName.toLowerCase());
    this.setAttribute('_ready', '');
  }
  adoptedCallback() { }
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    // 属性变化跟踪
  }

  disconnectedCallback() {
    log.info('disconnectedCallback', this.tagName.toLowerCase());
    const cid = this.getAttribute('_cid');
    if (cid) {
      // 通知worker线程删除组件
      componentRegistry.delete(cid);
    }
  }
}

/**
 * 主线程组件, 主线程组件可以通过传入元素或者元素描述对象,来创建组件实例
 */
export class MainComponent {
  static _cidCounter = 1;
  // 组件实例ID,由主线程生成并为每一个有效的WOO组件分配一个唯一的ID
  public _cid: string;

  private _tag = '';
  private _loadPromise: Promise<void>;
  private _attrs: { [key: string]: string } = {};
  private _rootElem?: HTMLElement;
  private _initData?: { tag: string; attrs: { [key: string]: string }; content: string };

  /**
   *
   * @param _rel 引用来源,可以是Url或者Npm包名
   * @param el 元素
   */
  constructor(el: HTMLElement | { tag: string; attrs: { [k: string]: string }; relUrl: string }) {
    if (el instanceof HTMLElement) {
      this._cid = `${el.tagName.toLowerCase()}-${MainComponent._cidCounter++}`;
      el.setAttribute('_cid', this._cid);
    } else {
      this._cid = `${el.tag}-${MainComponent._cidCounter++}`;
      el.attrs['_cid'] = this._cid;
    }

    const reqInfo =
      el instanceof HTMLElement
        ? {
          tag: el.tagName.toLowerCase(),
          attrs: DomUtils.elemAttrs(el),
          relUrl: `${location.origin}${location.pathname}`,
        }
        : el;
    this._loadPromise = MainMessage.loadComponent.send(reqInfo).then((data) => {
      this._initData = data;
      this._tag = data.tag;
      this._attrs = data.attrs;

      log.info('MainComponent', this._tag, this._attrs);

      if (el instanceof HTMLElement) {
        // 检测标签一致性
        if (el.tagName != data.tag) {
          DomUtils.renameElemTag(el, data.tag);
        }
      }
      componentRegistry.set(this._cid, this);
    });
  }
  get tag() {
    return this._tag;
  }
  get attrs() {
    return this._attrs;
  }
  get rootElem() {
    return this._rootElem;
  }

  async waitLoad(autoApply = true) {
    await this._loadPromise;
    if (autoApply) this._apply();
  }
  getInitData() {
    return this._initData;
  }
  attachElement(el: HTMLElement) {
    this._rootElem = el;
  }
  private _apply() {
    // 注册标签
    if (!customElements.get(this._tag)) {
      // 注册标签
      const cls = class extends BaseComponent { };
      customElements.define(this._tag, cls);
      log.debug('registerWebComponents', this._tag);
    }
  }
}



// 注册全局Dom变更监听对象
export const aiguDomObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    switch (mutation.type) {
      case 'childList':
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            // log.info("add child", node)
          });
          mutation.removedNodes.forEach((node) => {
            log.info("remove child", node)
          });
        }
        break;

      case 'attributes':
        log.info("attr change", mutation.attributeName)

        break;
    }

  });
});
// 启动全局Dom变更监听对象,第一个对象是document的第一个元素,即<html>标签

const htmlRootNode = document?.firstElementChild as HTMLElement;
aiguDomObserver.observe(htmlRootNode, { childList: true, subtree: true, attributes: true });

/**
 *  应用AIGU元数据
 * @param metaElem 元数据元素
 */
function _applyAiguMeta(metaElem: HTMLElement) {
  let metaName = metaElem.getAttribute('name');
  // 只有在预定义列表中的Meta和其属性才读取和设置
  if (metaName) {
    // varName 将 metaName 中的 aigu- 前缀替换为空字符串,并转换为驼峰命名
    let varName = StringUtils.toCamelCase(metaName.replace('aigu-', ''));
    if (Reflect.has(aiguMetas, varName)) {
      let meta = Reflect.get(aiguMetas, varName);
      // 获取所有属性，设置所有属性
      let attrs = metaElem.attributes;
      for (let i = 0; i < attrs.length; i++) {
        let attr = attrs[i];
        if (Reflect.has(meta, attr.name)) {
          meta[attr.name] = attr.value;
        } else {
          log.warn(`invalid attr: meta[name=${metaName}] attr=${attr.name}`)
        }
      }
      log.info('load meta:', meta);
    }
  }
}


function _loadDocumentMetas() {
  document.querySelectorAll(`meta[name^="aigu-"]`).forEach((el) => {
    _applyAiguMeta(el as HTMLElement);
  });
}


// 加载主文档
export async function mainLoadDocument() {
  let startTm = Date.now();
  // 加载所有Meta
  _loadDocumentMetas();

  // 等待workerReady事件

  // 等待页面加载完毕，然后开始加载和解析所有组件
  await WebUtils.waitEventOnce(window,aiguMetas.loadEvent.content)
  log.info('Document Ready:', aiguMetas.loadEvent.content)

  // 等待workerReady事件
  await WebUtils.waitEventOnce(window,'aigo-worker-ready')
  log.info('Worker Ready:', 'aigo-worker-ready')

  // 设置meta到worker
  // await MainMessage.setGlobalMeta.send({ meta: aiguMetas, htmlUrl: `${location.origin}${location.pathname}` });
  // await message.send('M:SetGlobalMeta', { meta: wooMetas, htmlUrl: `${location.origin}${location.pathname}` });
  // 加载所有组件

  // const docComponents = [] as MainComponent[];
  // // 2. 获取所有未注册的MainComponents标签,创建组件实例
  // DomUtils.deepChildElement(document.body, (el) => {
  //   if (DomUtils.isUnregisterWebComponentTag(el.tagName)) {
  //     docComponents.push(new MainComponent(el));
  //   }
  // });

  // // 自动应用所有组件
  // await Promise.all(docComponents.map((comp) => comp.waitLoad(true)));

  document.body.setAttribute('aigu-ready', '');
  // 发送事件通知整个页面加载完毕
  window.dispatchEvent(new Event('aigu-ready'));
  console.log('AIGU loaded:', Date.now() - startTm, 'ms');
}


