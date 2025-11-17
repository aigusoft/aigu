import { WorkerMessage } from './message'
import { mainLoadDocument } from "./main/mainComponent";
import pkg from '../package.json'
import "./workerLoader"
import "./main/mainMessage"
import { Logger } from 'common/logger';

console.log('Power By ', pkg.name, pkg.version);
const log = Logger("AIGU:index")

// 为避免启动时的闪烁,html可通过 <style> 标签初始化隐藏body对象
// 等待worker准备好后加载主文档

// 开发模式处理HotReload
new EventSource('/esbuild').addEventListener('change', (ev) => {
    log.warn('esbuild ---> change  ', ev.data)
    location.reload()
})


// 获取当前脚本的路径
export default {}

