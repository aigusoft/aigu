export interface ILoaderInfo {
  name: string; // 模块名称
  files: string[]; // 加载文件,第一个 JS 为主文件导出
  global?: string; // 是否使用全局变量，或者 UMD 模式
  deps?: string[]; // 依赖的外部包
  preload: boolean;
}
