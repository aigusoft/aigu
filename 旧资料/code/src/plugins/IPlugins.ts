import { IScope } from '../Scope';
import { TplElem } from '../TplElem';

/**
 * 扩展的HTML/SVG元素类型，用于关联作用域（scope）及相关元数据
 * @property $scope 绑定到元素的作用域对象（任意类型）
 * @property $bindKeys 可选属性，存储与元素绑定的键名列表（用于数据绑定追踪）
 * @property $orgDisplay 可选属性，记录元素原始的display样式（用于显示/隐藏切换）
 * @property $ani 可选属性，存储元素的动画相关配置
 * @property __initScope 初始化作用域时的上下文信息（包含父作用域和当前作用域）
 */
export type ScopedElement = (HTMLElement | SVGElement) & {
    $scope: any;
    $bindKeys?: string[];
    $orgDisplay?: string;
    $ani?: any;
    __initScope: { parentScope: any; scope: any };
};

/**
 * 模板解析阶段的插件函数类型（在解析模板元素时执行）
 * @param tplEl 需要处理的模板元素（TplElem类型）
 * @returns 可选的Promise（支持异步处理）
 */
export type IPluginsTplParserFunc = (tplEl: TplElem) => Promise<void> | void;

/**
 * 模板文档片段的插件函数类型（用于模板预处理/后处理阶段）
 * @param tplDoc 模板解析生成的文档片段（DocumentFragment）
 * @returns 可选的Promise（支持异步处理）
 */
export type IPluginsTplFunc = (tplDoc: DocumentFragment) => Promise<void> | void;

/**
 * Web组件（WC）初始化前的插件函数类型（组件创建阶段）
 * @param rootScope 组件的根作用域对象（IScope类型）
 * @param doc 组件对应的文档片段（DocumentFragment）
 * @returns 可选的Promise（支持异步处理）
 */
export type IPluginsWcPreFunc = (rootScope: IScope, doc: DocumentFragment) => Promise<void> | void;

/**
 * Web组件（WC）初始化后的插件函数类型（组件创建完成阶段）
 * @param rootScope 组件的根作用域对象（IScope类型）
 * @returns 可选的Promise（支持异步处理）
 */
export type IPluginsWcPostFunc = (rootScope: IScope) => Promise<void> | void;

/**
 * Web组件（WC）属性更新时的插件函数类型（数据绑定更新阶段）
 * @param localScope 属性所属的局部作用域对象（IScope类型）
 * @param propName 被更新的属性名
 * @param flags 更新标志位（用于传递额外信息，如更新类型）
 * @param value 更新后的值
 * @returns 可选的Promise（支持异步处理）
 */
export type IPluginsWcApplyFunc = (localScope: IScope, propName: string, flags: string[], value: any) => Promise<void> | void;

/**
 * Web组件（WC）销毁时的插件函数类型（组件卸载阶段）
 * @returns 可选的Promise（支持异步处理）
 */
export type IPluginsWcDestroyFunc = () => Promise<void> | void;

/**
 * 插件接口定义，描述插件的核心能力和扩展点
 * @property name 插件唯一标识名称（用于区分不同插件）
 * @property priority 可选优先级（数值越高越优先执行，默认按注册顺序执行）
 * @property tplPre 可选模板预处理函数（在模板解析前执行）
 * @property tplParse 可选模板解析函数（在解析具体模板元素时执行）
 * @property tplPost 可选模板后处理函数（在模板解析完成后执行）
 * @property wcPre 可选组件初始化前函数（在组件创建初期执行）
 * @property wcPost 可选组件初始化后函数（在组件创建完成后执行）
 * @property wcApply 可选组件属性更新函数（在数据绑定更新时执行）
 * @property wcDestroy 可选组件销毁函数（在组件卸载时执行）
 * @property scope 可选作用域扩展对象（键值对形式，自动注入到组件作用域中）
 */
export interface IPlugins {
    name: string;
    priority?: number;
    tplPre?: IPluginsTplFunc;
    tplParse?: IPluginsTplParserFunc;
    tplPost?: IPluginsTplFunc;
    wcPre?: IPluginsWcPreFunc;
    wcPost?: IPluginsWcPostFunc;
    wcApply?: IPluginsWcApplyFunc;
    wcDestroy?: IPluginsWcDestroyFunc;

    // 自定义注入scope的对象（键为作用域属性名，值为具体实现）
    scope?: { [k: string]: any; };
}
