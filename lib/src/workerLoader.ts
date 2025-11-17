/**
 * Worker 加载工具器
 * 可以判断当前是否在Worker线程中
 * 主进程可以加载Worker，并导出Worker对象
 */
import { Logger } from './common/logger';
const log = Logger("AIGU:WorkerLoader")


export const isWorker = !self.window
export let worker = undefined as Worker | undefined;

if (!isWorker) {
    const srcScript = (document.currentScript as HTMLScriptElement).src;
    let workerUrl = srcScript.replace(/index\.js$/, `worker/worker.js?__DEV=${localStorage.__DEV || ''}`)
    log.info('WorkerUrl:', srcScript, workerUrl)

    worker = new Worker(workerUrl, { name: "AiguWorker" })

}
