// 统一管理开发者信息

export interface IDev {
  debugOutput: boolean;
  pkgs: {[k:string]:{
    enable: boolean;
    hostport: string;
  }};
}
export let devConfig = {} as IDev;

try {
  let d = localStorage.getItem("__DEV");
  if (d) devConfig = JSON.parse(d);
} catch (e) {};


