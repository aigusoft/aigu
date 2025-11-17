import { IColors, IColorsSchema } from './plugins/$color';
import { Router } from './Router';
import { Umd } from './UmdLoader';

export interface LoaderResult{
  getResult():Promise<any>;
}
export interface Loader{
  getFile(fileUrl: string):LoaderResult;
  getModule(pkgName: string):LoaderResult;
}

export declare class CScope {
  constructor();
  $id: { [k: string]: HTMLElement; };
  $class : { [k: string]: HTMLElement[]; };
  $router: Router;
  $path(src: string, ext?: string): string;
  $log: Console & ((...args: any[]) => any);
  $go:((tag: string, params?: { [k: string]: string; })=> void) | ((area:string,tag: string, params?: { [k: string]: string; })=> void);
  $root: {[k:string]:any};
  $parent: {[k:string]:any}; // 指向上级Scope
  $rootElem: HTMLElement;
  $rootParentElem: HTMLElement;
  
  $color: IColors;
  $Colors:IColorsSchema;
  $json:(obj:any)=>string;

  $npm:string; // 当前NPM Url

  // 弹出指定元素或者标签
  $pop: (target: HTMLElement | string) => void;
  $loader:Loader;
  // 监听intersection事件，成功发送 'intersection'事件
  $monitSize(el:HTMLElement,callback:(sz:ResizeObserverEntry)=>void ):void;
  // $intersection: (el: HTMLElement)=> void;
  // 等待所有组件加载完成 
  $waitComponents(): Promise<any>; 

  $emit(nameOrEvent: string | Event, detailOrtoElem?: Element | any, toElem?: Element): void;
  $watch(tracker: Function, callback: Function): void;
  $observer(obj:any): void;
  $noWatch<T extends object>(obj: T): T;
  $delay(ms:number):Promise<void>;
  $next():Promise<void>;
  $step(...args:(any|[any,number])[]):any;
  onReady(): void;
  onDestroy(): void;
  onCreate(doc:DocumentFragment): void;
  onClose(): void;
}

export type IScope = CScope & { [k: string]: any; };

export const Scope = class {
  // @ts-ignore
  constructor() { }
} as typeof CScope;

