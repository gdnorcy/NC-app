import { config } from './config.js';
import { createApp } from './app.js';
import { createDb } from './db.js';
import { startJobWorker } from './jobs.js';
import { retileSceneHandler } from './routes/scenes.js';
import { createDistributionService } from './services/distribution.js';

const db = createDb();
const app = createApp({ db });

// 启动异步任务 worker（金字塔切片重建等；失败自动重试，进程重启不丢任务）
const stopWorker = startJobWorker(db, {
  'scene-tiling': retileSceneHandler,
});
process.on('exit', stopWorker);

// 分销结算定时任务：每 10 分钟扫描 T+N 到期快照（待结算 → 可提现）
const distribution = createDistributionService(db);
const settleTimer = setInterval(() => {
  try {
    distribution.settleDueOrders();
  } catch (e) {
    console.error('分销结算失败:', e?.message || e);
  }
}, 10 * 60 * 1000);
settleTimer.unref();

app.listen(config.port, () => {
  console.log(`360全景服务已启动: http://localhost:${config.port}`);
  console.log(`管理后台: http://localhost:${config.port}/admin`);
});
