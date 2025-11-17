import { IPlugins } from "./IPlugins";
import { WcLog } from "../Logger";
import { _observer } from "../Observer";
const log = WcLog(module);

/**
 * 转换RGB到HSL，返回百分数*100
 * @returns
 */
function _rgbToHsl(r: number, g: number, b: number) {
  (r /= 255), (g /= 255), (b /= 255);
  var max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  var h: number = 0,
    s: number = 0,
    l: number = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function _range(n: number, max: number) {
  if (n < 0) return 0;
  else if (n > max) return max;
  return n;
}

// 全局配色表
export type IColors = {
  pri: Hsla;
  pria: Hsla; // 主变色
  sec: Hsla;
  seca: Hsla; // 辅变色
  text: Hsla;
  texta: Hsla; // 文本变色
  textr: Hsla; // 文本反向色
  bg: Hsla;
  bga: Hsla; // 背景变色
  bgr: Hsla; // 背景反向色
  ok: Hsla;
  warn: Hsla;
  error: Hsla;
  none: Hsla;
} & { [k: string]: Hsla };

/**
 * 管理HLSA色彩
 */
export class Hsla {
  /**
   * 构造
   * @param $h 0-360, 可为负数，自动循环
   * @param $s 0-100, 自动取百分数，超上下限取上下限值
   * @param $l 0-100, 自动取百分数，超上下限取上下限值
   * @param $a 0-100, 小数取值
   */
  constructor(public $h: number = 0, public $s: number = 70, public $l: number = 50, public $a: number = 100) {
    // 内部不监控变化，因为通过Proxy处理快捷颜色
    _observer._nowatch(this);
    this.$h = $h < 0 ? 360 + ($h % 360) : $h > 360 ? $h % 360 : $h;
    this.$s = _range($s, 100);
    this.$l = _range($l, 100);
    this.$a = _range($a, 100);

    // 配置原型为proxy,处理快捷色表
    // Reflect.setPrototypeOf(
    //   this,
    //   new Proxy(Reflect.getPrototypeOf(this)!, {
    //     get(t: any, p, r: any) {
    //       log.debug('----!!COLOR PROXY:', t, p, r);
    //       return r[p];
    //     },
    //   })
    // );
  }
  /**
   * 从hsl或者hsla或者rgb或rgba中解析标准的hsla对象
   * @param color
   */
  static from(color: string): Hsla {
    if(color.startsWith('#')){
      // 解析16进制rgb
      let r = parseInt(color.slice(1,3),16) || 0;
      let g = parseInt(color.slice(3,5),16) || 0;
      let b = parseInt(color.slice(5,7),16) || 0;
      let hsl = _rgbToHsl(r, g, b);
      return new Hsla(hsl.h, hsl.s, hsl.l);
    }

    let m = color.trim().match(/^([a-z]+)\((.+)\)$/);
    // debugger;
    try {
      if (m && m.length == 3) {
        let mode = m[1];
        let sp = m[2].split(",");
        switch (mode) {
          case "hsl": {
            return new Hsla(parseFloat(sp[0]), parseFloat(sp[1]), parseFloat(sp[2]));
          }
          case "hsla": {
            return new Hsla(parseFloat(sp[0]), parseFloat(sp[1]), parseFloat(sp[2]), parseFloat(sp[3]));
          }
          case "rgb": {
            let r = parseFloat(sp[0]);
            let g = parseFloat(sp[1]);
            let b = parseFloat(sp[2]);
            let hsl = _rgbToHsl(r, g, b);
            return new Hsla(hsl.h, hsl.s, hsl.l);
          }
          case "rgba": {
            let r = parseFloat(sp[0]);
            let g = parseFloat(sp[1]);
            let b = parseFloat(sp[2]);
            let a = parseFloat(sp[3]);
            let hsl = _rgbToHsl(r, g, b);
            return new Hsla(hsl.h, hsl.s, hsl.l, a);
          }
        }
      }
    } catch (e) {
      log.warn("parse color failed!", color);
    }
    return new Hsla();
  }

  toString() {
    return `hsla(${this.$h},${this.$s}%,${this.$l}%,${this.$a / 100})`;
  }
  /**
   * 变换色相，在当前色基础上增加或者减少,数字为变换值
   * @param level
   */
  h(level: number) {
    return new Hsla(this.$h + level, this.$s, this.$l, this.$a);
  }
  hh(level: number) {
    return new Hsla(level, this.$s, this.$l, this.$a);
  }
  /**
   * 变换色度（饱和度）
   * @param level
   */
  s(level: number) {
    return new Hsla(this.$h, this.$s + level, this.$l, this.$a);
  }
  ss(level: number) {
    return new Hsla(this.$h, level, this.$l, this.$a);
  }
  /**
   * 变换亮度
   * 根据当前配色模式：深色或者浅色，调节方向
   * @param level
   */
  l(level: number) {
    return new Hsla(this.$h, this.$s, this.$l + (_colorSchema.mode ? -level : level), this.$a);
  }
  ll(level: number) {
    return new Hsla(this.$h, this.$s, level, this.$a);
  }
  /**
   * 变换透明度
   * @param level
   */
  a(level: number) {
    return new Hsla(this.$h, this.$s, this.$l, this.$a + level);
  }
  aa(level: number) {
    return new Hsla(this.$h, this.$s, this.$l, level);
  }
}

// 定义配色表方案
let _colorSchema = {
  mode: 1,
  load() {
    _loadColors();
  },
  set(colorName: string, hsl: string) {
    try {
      let colors = JSON.parse(localStorage.getItem("__COLORS") || "{}");
      colors[colorName] = hsl;
      localStorage.setItem("__COLORS", JSON.stringify(colors));
      _loadColors();
    } catch (e) {
      log.warn("user colors invalid");
      localStorage.removeItem("__COLORS");
    }
  },
  setMode(mode: number) {
    try {

      localStorage.setItem("__COLOR_MODE", mode.toString());
      this.mode =mode;      
      _loadColors();
    } catch (e) {
      log.warn("user color mode invalid");
      localStorage.removeItem("__COLOR_MODE");
    }
  },
  switchMode() {
    try {
      let m = parseInt(localStorage.getItem('__COLOR_MODE')||'0');
      this.setMode((m==0)?1:0)
    } catch (e) {
      log.warn("user color mode invalid");
      localStorage.removeItem("__COLOR_MODE");
    }
  },
  colors: _observer.watch({}) as IColors,
  Hsla: Hsla,
};
export type IColorsSchema = typeof _colorSchema;
// Object.defineProperties(Hsla.prototype, props);

// 初始化快捷配色级别变量
function _initLevelColor() {
  for (let k of ["h", "s", "l", "a"]) {
    for (let p of ["", "_"]) {
      // 初始化0level默认返回自身
      for (let i = 1; i < 10; i++) {
        // let value: Hsla | undefined;
        Object.defineProperty(Hsla.prototype, k + i + p, {
          enumerable: true,
          configurable: true,
          get() {
            if (i == 0) return this;
            // if (!value) value =
            return (this as any)[k]((k == "h" ? 18 : k == "a" ? 10 : 5) * i * (p == "" ? 1 : -1));
            // return value;
          },
        });
      }
    }
  }
}

function _loadColors() {
  let colorMetaEl = document.head.querySelector("meta[name=colors]");
  // 加载localStorage colorMode
  let localMode = localStorage.getItem("__COLOR_MODE");
  if (localMode != null) {
    _colorSchema.mode = parseInt(localMode) ? 1 : 0;
  } else {
    // 尝试从meta中加载模式
    if (colorMetaEl) {
      _colorSchema.mode = parseInt(colorMetaEl.getAttribute("mode") || "-1");
    }
  }
  // 初始化默认配色
  // _colorSchema.
  let load_colors ={
    pri: new Hsla(220),
    sec:undefined,
    info: new Hsla(0, 0, 50),
    ok: new Hsla(125),
    warn: new Hsla(35),
    error: new Hsla(0),
    none: new Hsla(0, 0, 0, 0),
  } as any as IColors;

  // 混合meta配色和本地保存配色
  if (colorMetaEl) {
    try {
      for (let i = 0; i < colorMetaEl.attributes.length; i++) {
        let att = colorMetaEl.attributes.item(i);
        if (att?.name && att.name != "mode" && att.name != "name") {
          load_colors[att.name] = Hsla.from(att.value);
        }
      }
    } catch (e) {
      log.warn("parse meta colors failed:", e, colorMetaEl);
    }
  }

  // 加载保存的本地颜色
  let localColorsStr = localStorage.getItem("__COLORS");
  if (localColorsStr) {
    try {
      let parsed = JSON.parse(localColorsStr);
      Object.keys(parsed).forEach((k) => {
        load_colors[k] = Hsla.from(parsed[k]);
      });
    } catch (e) {
      log.warn("parse local colors failed:", e);
    }
  }

  // 根据主色配置生成默认色
  if (!load_colors.sec) load_colors.sec = load_colors.pri.h(18*5);
  if (!load_colors.text)
    load_colors.text =  load_colors.pri.ll(10) ;
  if (!load_colors.bg)
    load_colors.bg = load_colors.pri.ll(90);

  if(!_colorSchema.mode){
    // 暗夜模式，自动设置颜色
    load_colors.bg = load_colors.bg.ll(100- load_colors.bg.$l)
    load_colors.text = load_colors.bg.ll(100- load_colors.text.$l)
  }
  
  // 生成辅助色板，pria, seca, texta, bga, textr,bgr
  load_colors.pria = load_colors.pri.h(-24);
  load_colors.seca = load_colors.sec.h(-24);
  load_colors.texta = load_colors.text.ss(50).h(-10);
  load_colors.textr = load_colors.texta.ll(100 - load_colors.texta.$l);
  load_colors.bga = load_colors.bg.ss(50).h(-10);
  load_colors.bgr = load_colors.bg.ll(100 - load_colors.bg.$l);


  Object.assign(_colorSchema.colors,load_colors);
  // 根据配色方案加载色彩级别
  _initLevelColor();

  // 为 html 元素应用bg和text
  if (_colorSchema.mode >= 0) {
    let html = document.firstElementChild as HTMLElement;
    if(html.hasAttribute('color')){
      html.style.color = _colorSchema.colors.text.toString();
      html.style.backgroundColor = _colorSchema.colors.bg.toString();
      html.style.setProperty('--color-mode',_colorSchema.mode.toString())
    }
  }

  // 为 全局 css 设置 色彩模式变量

  // log.info("load colors:", _colorSchema.mode,_colorSchema.colors);
}

_loadColors();

export const $color: IPlugins = {
  name: "$color",
  scope: {
    $color: _colorSchema.colors,
    $Colors: _colorSchema,
  },
};

(window as any).__COLORS = _colorSchema;

