// 插件，实现监控某个元素的size变化

import { WcLog } from "../Logger";
import { IPlugins } from "./IPlugins";
const log = WcLog(module);

/**
 * 监控某个元素大小发生改变
 */
export const $monitSize: IPlugins = {
    name: "$monitSize",
    scope: {
      $monitSize(el:HTMLElement,callback:(sz:ResizeObserverEntry)=>void){
        (el as any).__resizeCB = callback;
        if(!this.__resizeObserver){
            this.__resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    (entry.target as any).__resizeCB?.(entry)
                }
            })
          }
          (this as any).__resizeObserver.observe(el)
        }
    },
    wcDestroy(){
        let ob = (this as any).__resizeObserver as ResizeObserver|undefined
        if(ob){
            ob.disconnect();
            delete (this as any).__resizeObserver
        }
    }
  };
  