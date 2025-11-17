// 定义woo使用的各种元数据

import { StringUtils } from "./utils";

export const aiguMetas = {
  // 定义woo加载事件的名称,默认为DOMContentLoaded
  loadEvent: {
    name: 'aigu-load-event',
    content: 'DOMContentLoaded',
  },
  // 加载Dom元素时自动隐藏,对首页和所有元素生效
  loadCloak: {
    name: 'aigu-load-cloak',

    // 是否自动隐藏元素,自动转换字符串为布尔值
    _content: true,
    get content() {
      return this._content.toString();
    },
    set content(val: string) {
      this._content = StringUtils.parseBool(val);
    }

  },
  // 加载进度条,是否显示元素加载的进度条，对所有元素生效
  loadProgress: {
    name: 'aigu-load-progress',
    content: 'aigui-ui.progress', // 默认进度条标签名称
    delay: '500', // 设置显示进度条的超时时间，即多长时间内组件未能加成完成则显示进度条
  }
};
