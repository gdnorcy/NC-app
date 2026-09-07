import { config } from './config.js';
import { createApp } from './app.js';
import { createDb } from './db.js';
import { startJobWorker } from './jobs.js';
import { retileSceneHandler } from './routes/scenes.js';

const db = createDb();
const app = createApp({ db });

// 启动异步任务 worker（金字塔切片重建等；失败自动重试，进程重启不丢任务）
const stopWorker = startJobWorker(db, {
  'scene-tiling': retileSceneHandler,
});
process.on('exit', stopWorker);

app.listen(config.port, () => {
  console.log(`360全景服务已启动: http://localhost:${config.port}`);
  console.log(`管理后台: http://localhost:${config.port}/admin`);
});
