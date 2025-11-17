import { pkgVersion } from './pkg';
import { IPlugins } from './plugins/IPlugins';
import { IScope } from './Scope';
import { TplElem } from './TplElem';


export { Logger } from './Logger';
export let loadTime = 0;
export { Scope } from './Scope';
export {ComDesc} from './ComDesc'
export const VERSION = pkgVersion;




export interface INpmModuleInfo {
    name: string; // 模块名称
    files: string[]; // 加载文件,第一个 JS 为主文件导出
    prefix?: string; // 使用的相对路径，使用于文件名拼接包名+Base
    baseUrl?: string; // 解析出的相对URL
    exportName?: string; // 指定导出子模块名称作为模块导出，默认为'index,或index.js'
    globalVar?:string; // 指定使用全局对象导出
    deps?: string[]; // 依赖的外部包
    preload?: boolean; // 是否预加载
    version?: string | null; // 指定版本
    _url?: string | null; // 强制加载模块不使用NPM，使用指定的URL
    esm?: string; // 是否强制使用ESM方式加载
    cjs?: string; // 是否强制使用CJS方式加载
    amd?: string; // 是否强制使用AMD方式加载
    eval?:string; // 是否采用eval模式加载
    cors?: boolean; // 是否采用cors获取
  }
  

/**
 * 为符合 webpack 模块导出定义相关全局对象
 */
declare global {
  var require: {
    context: (dir: string) => any;
    keys: () => string[];
  };
  var module: { id: string; hot: any; };
  var exports: any;
  var WCEX:{ 
    usePlugins(plugins: IPlugins) :void;
    registerElement(htmlElem: Element, from: string | undefined, deep: boolean):void;
    watch<T>(obj: T):T;
    noWatch<T>(obj: T):T;
    parseTag(tag: string): {pkg:string,component:string}; 
    buildTag(pkg: string | undefined, component: string): string ;
    npmUrl:string;

    modules:INpmModuleInfo;
    loadTime:number;
    amdloader:{ [k: string]: Promise<{ define: Function,require?:Function}>|undefined}
  }

}
