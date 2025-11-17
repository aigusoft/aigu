/**
 * Logger 处理，开发模式，直接绑定console.log，显示源码
 * 运行模式：绑定函数，显示时间戳，搜集日志，发送到日志服务器
 * 通过 window.error 处理全局异常, 自动计算时间
 * @param exportsObj
 * @returns
 */

import { devConfig } from './Dev';
import { pkgName } from './pkg';

const metaDebug = !!document.head.querySelector('meta[name=debug]');

let loggerlastTm = -1;

/**
 *
 * @param mod 使用 this 指针或者字符串
 * @param pkg 包名
 * @returns log
 */
export function Logger(mod: any, pkg?: string) {
  let title = '';
  // 字符串模式，自定义
  if (typeof mod == 'string') title = (pkg || '') + ':' + mod;
  else if (typeof mod == 'function') {
    const sp = (mod.moduleId as string).split('/');
    if (!pkg) {
      for (let i = 0; i < sp.length; i++) {
        if (sp[i].startsWith('@')) {
          pkg = title + sp[i] + '/' + (sp[i + 1] || '');
          break;
        }
      }
    }
    title = (pkg || '') + ':' + sp[sp.length - 1].replace(/\..*?$/, '');
  } else if (typeof mod == 'object') {
    // 对象模式，用于库 Logger(module) 加载
    const m = typeof mod.id == 'string' ? mod.id.match(/^.*\/(.+?)(\..*)?$/) : '';
    title = (pkg || '') + ':' + (m && m.length > 2 ? m![1] : mod.id);
  }
  const h = Math.round(Math.random() * 360);
  const timeStyle = `color:hsl(${h},100%,40%);font-style: italic;`;
  const fileStyle = `color:hsl(${h},100%,40%);font-weight: 900;font-size:12px;`;

  let thislastTm = -1;
  // 默认显示warn以上级别
  const enableDebug = devConfig.debugOutput || metaDebug;
  // const DEBUG = (localStorage.getItem('DEBUG') || metaDebug || '').split(';');
  const logList = ['debug', 'log', 'info', 'warn', 'error'];
  function none() {}

  const con = function (...args: any[]) {
    (con as any).log.call(con, ...args);
  };
  Reflect.setPrototypeOf(
    con,
    new Proxy(console, {
      get(t: any, p: string) {
        // 计算时间
        let level = logList.indexOf(p);
        if (level < 0) return t[p]; // 不在LOG定义的方法，返回原始函数

        // debugger;
        if (level <= 2 && !enableDebug) {
           return none; // 低于level 不显示
        }

        let tm = new Date().getTime();
        let spanAll = loggerlastTm > 0 ? tm - loggerlastTm : 0;
        let spanThis = thislastTm > 0 ? tm - thislastTm : 0;
        loggerlastTm = tm;
        thislastTm = tm;
        return (console as any)[p].bind(
          console,
          `%c${p.substring(0, 1).toUpperCase()}|${spanAll}|${spanThis} %c${title}`,
          timeStyle,
          fileStyle
        );
      },
    })
  );
  return con as any as Console;
}

export function WcLog(module: { id: string }) {
  return Logger(module, pkgName);
}

// 定义全局log对象
(window as any).Log = Logger('global');
