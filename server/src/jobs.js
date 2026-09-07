/**
 * 轻量异步任务队列（SQLite 持久化 + 轮询 worker）
 * - 任务持久化到 bg_jobs 表，进程重启不丢任务
 * - 失败自动重试（最多 MAX_ATTEMPTS 次，指数退避）
 * - 用于耗时任务：金字塔切片重建、短信发送等，避免阻塞 HTTP 请求
 */

export const JOB_STATUS = { PENDING: 'pending', RUNNING: 'running', DONE: 'done', FAILED: 'failed' };

export const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 30_000; // 首次重试延迟 30s，之后翻倍

/** 入队一个任务，返回 job id */
export function enqueueJob(db, type, payload = {}, { delayMs = 0 } = {}) {
  const runAt = new Date(Date.now() + delayMs).toISOString();
  const info = db
    .prepare(
      `INSERT INTO bg_jobs (type, payload, status, attempts, run_at) VALUES (?, ?, ?, 0, ?)`
    )
    .run(type, JSON.stringify(payload || {}), 'pending', runAt);
  return info.lastInsertRowid;
}

/** 领取下一个可执行任务（原子：置 running 后返回最新行） */
export function claimNextJob(db, now = new Date().toISOString()) {
  const row = db
    .prepare(`SELECT * FROM bg_jobs WHERE status = ? AND run_at <= ? ORDER BY id ASC LIMIT 1`)
    .get('pending', now);
  if (!row) return null;
  db.prepare(`UPDATE bg_jobs SET status = ?, started_at = ? WHERE id = ?`).run('running', now, row.id);
  return db.prepare('SELECT * FROM bg_jobs WHERE id = ?').get(row.id);
}

/** 完成任务 */
export function finishJob(db, id, { ok = true, error = null } = {}) {
  db.prepare(`UPDATE bg_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?`).run(
    ok ? 'done' : 'failed',
    error ? String(error).slice(0, 1000) : null,
    new Date().toISOString(),
    id
  );
}

/** 失败重试（未达上限：回 pending + 指数退避；已达上限：failed） */
export function failJobRetry(db, id, error, currentAttempts) {
  const attempts = currentAttempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    db.prepare(
      `UPDATE bg_jobs SET status = 'failed', attempts = ?, error = ?, finished_at = ? WHERE id = ?`
    ).run(attempts, String(error?.message || error).slice(0, 1000), new Date().toISOString(), id);
    return;
  }
  const runAt = new Date(Date.now() + RETRY_BASE_MS * attempts).toISOString();
  db.prepare(
    `UPDATE bg_jobs SET status = ?, attempts = ?, error = ?, run_at = ? WHERE id = ?`
  ).run('pending', attempts, String(error?.message || error).slice(0, 1000), runAt, id);
}

/** 查询任务列表（管理用） */
export function queryJobs(db, { status, type, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (type) { where.push('type = ?'); params.push(type); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db
    .prepare(`SELECT * FROM bg_jobs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), Number(offset));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM bg_jobs ${whereSql}`).get(...params)?.n || 0;
  return { jobs: rows, total };
}

/**
 * 启动轮询 worker。
 * handlers: { type: async (payload, job, db) => void }
 * 返回 stop 函数。
 */
export function startJobWorker(db, handlers, { intervalMs = 2000 } = {}) {
  const timer = setInterval(async () => {
    let job = null;
    try {
      job = claimNextJob(db);
      if (!job) return;
      const handler = handlers[job.type];
      if (!handler) {
        finishJob(db, job.id, { ok: false, error: `未知任务类型: ${job.type}` });
        return;
      }
      let payload = {};
      try { payload = JSON.parse(job.payload || '{}'); } catch { /* 保持空 payload */ }
      await handler(payload, job, db);
      finishJob(db, job.id, { ok: true });
    } catch (e) {
      console.error(`[jobs] 任务执行失败 type=${job?.type} id=${job?.id}`, e?.message || e);
      if (job) failJobRetry(db, job.id, e, job.attempts || 0);
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
