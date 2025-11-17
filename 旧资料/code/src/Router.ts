import { _Utils } from "./Utils";
import { pkgName } from "./pkg";
import { WcLog } from "./Logger";
import { _buildTag } from "./WcTag";
import { _observer } from "./Observer";

const log = WcLog(module);

/**
 * Route is Components, 路由即组件，路由名称-> RouteView id, 路由参数-> attr
 * USAGE:
 *  默认路由: #/tag?abc=xxx&def=yyy
 *        映射TAG: <tag abc="xxx" def="yyy">
 *  命名路由: #tag1?a=23&b=24/area:tag2?abc=xxx/
 * <tag1 a="23" b="24"></tag1>
 */

export interface IComponentRoute {
  [k: string]: string;
}
export interface IRoute {
  [k: string]: { tag: string; attrs: { [k: string]: string } };
}
export class Router {
  private _pathRoute = [] as IComponentRoute[];
  private _params = {} as { [k: string]: string };
  route = _observer.watch({}) as IRoute;

  constructor() {
    // 监控 hash 变化事件
    window.addEventListener(
      "hashchange",
      () => {
        this.route = this.parse(location.hash);
        // 发送自定义事件到windows
        const ev = new CustomEvent("route-change", {
          detail: this.route,
        });
        window.dispatchEvent(ev);
      },
      false
    );

    this.route = this.parse(location.hash);
  }

  private _parseNamedPart(part: string): IRoute[string] & { name: string } {
    let sp1 = part.split(":");
    let name = (sp1.length > 1 ? sp1[0] : "") || "default";
    let partTag = sp1.length > 1 ? sp1[1] : part;
    let sp2 = partTag.split("?");
    let tag = sp2[0].toLowerCase();
    let partAttrs = sp2[1];
    let attrs = {} as { [k: string]: string };
    if (partAttrs) {
      let sp3 = partAttrs.split("&");
      for (let at of sp3) {
        if (at) {
          let sp4 = at.split("=");
          attrs[sp4[0].toLowerCase()] = sp4[1] || "";
        }
      }
    }
    return { name, tag, attrs };
  }

  parse(loc: string): IRoute {
    const hash = decodeURIComponent(loc.startsWith("#") ? loc.slice(1) : loc);
    // 切割params和路径
    const r = {} as IRoute;
    const sp = hash.split(";");
    sp.forEach((v) => {
      let p = this._parseNamedPart(v);
      if (p) {
        r[p.name] = p;
      }
    });
    return r;
  }

  back() {
    history.back();
  }

  // *  命名路由: #tag1?a=23&b=24/name:tag2?abc=xxx/
  private _buildHash(routeConfig: IRoute) {
    let hash = "";
    // 和当前route合并，以使可以只改变单一路由
    _Utils._objFor(routeConfig, (v, k) => {
      if (k) this.route[k] = v;
      else this.route["default"] = v;
    });
    let isFirst = true;
    _Utils._objFor(this.route, (rInfo, rName) => {
      if (isFirst) isFirst = false;
      else hash += ";";
      if (rName == "default") rName = "";
      if (rName) hash += `${rName}:`;
      hash += rInfo.tag;
      let first = true;
      if (rInfo.attrs) {
        _Utils._objFor(rInfo.attrs, (v, k) => {
          hash += (first ? "?" : "&") + `${k}=${v}`;
          first = false;
        });
      }
    });
    return encodeURIComponent(hash);
  }

  /**
   * 使用: go(tag,arrts:{}) 或者 go(name,tag,attrs:{})
   * 一个参数时，如果是字符串，则直接跳转到该url, 检测参数是否包含:,包含:的参数将分割为area:component
   * @param path
   * @param params
   * @returns
   */
  go(arg1: any, arg2?: any, arg3?: any) {
    // 一个参数
    let route = {} as IRoute;

    if (arg2 == undefined && arg3 == undefined) {
      if (typeof arg1 == "string") {
        // 如果以http://或者https://或者以/开头，则直接跳转
        if (arg1.startsWith("http://") || arg1.startsWith("https://") || arg1.startsWith("/")) {
          return (window.location.href = arg1);
        }
        // 解析路由
        route = this.parse(arg1);
        // 跳转
      } else if (typeof arg1 == "object") {
        // 以路由对象格式合并
        route = arg1;
      } else {
        log.error("go() param error", arg1, arg2, arg3);
      }
    } else if (arg3 == undefined) {
      // 两个参数，当第二个参数为字符串时，第一个参数为路由名称，第二个参数为tag
      // 两个参数，当第二个参数为对象时，第一个参数为tag，第二个参数为attrs
      if (typeof arg2 == "string") {
        route[arg1] = { tag: arg2, attrs: {} };
      } else if (typeof arg2 == "object") {
        route["default"] = { tag: arg1, attrs: arg2 };
      } else {
        log.error("go() param error", arg1, arg2, arg3);
      }
    } else {
      // 三个参数
      route[arg1] = { tag: arg2, attrs: arg3 };
    }
    return (location.hash = this._buildHash(route));

    // // check arg1 is string and startWith http://,https:// 则直接跳转
    // if (typeof arg1 == "string" && (arg1.startsWith("http://") || arg1.startsWith("https://"))) {
    // 	return (window.location.href = arg1);
    // }

    // if (typeof arg1 == "object") {
    // 	// 以路由对象格式合并
    // 	location.hash = this._buildHash(arg1);
    // 	return;
    // }
    // let route: IRoute = {};
    // if (typeof arg1 == "string" && typeof arg2 == "string") {
    // 	// 三参数
    // 	route[arg1] = { tag: arg2, attrs: arg3 || {} };
    // } else {
    // 	// 二参数或者1参数
    // 	route["default"] = { tag: arg1, attrs: arg2 || {} };
    // }
    // let hash = this._buildHash(route);
    // if (hash != location.hash) {
    // 	location.hash = hash;
    // }
  }
}
export const router = new Router();
