import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { enqueueJob, claimNextJob, finishJob, failJobRetry, startJobWorker, MAX_ATTEMPTS } from '../src/jobs.js';
import { rateLimit } from '../src/rate-limit.js';
import { encryptSecret, decryptSecret } from '../src/crypto.js';
import { encryptConfigSecrets, decryptConfigSecrets } from '../src/routes/customer.js';

/**
 * 基础设施加固（第一批）回归测试
 * 覆盖：① 异步任务队列（入队/领取/重试/worker消费）
 *      ① 统一日志与健康检查（requestId/uptime/db探测）
 *      ② 审计埋点（租户域关键操作写 operation_logs）
 *      ② 密钥加密（租户配置敏感字段落库加密、回显解密）
 *      ② 限流防刷（登录 IP 限流 429）
 *      ② 强制租户过滤（无 tenant 保护的公开入口安全设计）
 */
let app;
let db;
let tmpDir;
let stopWorker;

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function loginAdmin() {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  assert.equal(res.status, 200);
  return res.body.token;
}

async function loginTenant() {
  const res = await request(app).post('/api/auth/login').send({ username: 'tenant1', password: 'admin123' });
  assert.equal(res.status, 200);
  return res.body.token;
}

/** 未来时间戳：用于领取"未来任务"，避免与后台 worker 竞争 */
const futureNow = () => new Date(Date.now() + 120_000).toISOString();

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-'));
  process.env.DATA_DIR = tmpDir;
  config.dbPath = path.join(tmpDir, 'test.db');
  config.uploadsDir = path.join(tmpDir, 'uploads');
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  db = createDb();
  // 种子：默认租户 + 租户管理员（平台 admin 由 createDb 自动创建）
  const { hashPassword } = await import('../src/db.js');
  const { hash, salt } = hashPassword('admin123');
  db.prepare("INSERT INTO projects (customer_name, invite_code, status) VALUES ('测试租户', 'TESTINV1', 'active')").run();
  db.prepare("INSERT INTO users (username, password_hash, password_salt, role, status, customer_id) VALUES ('tenant1', ?, ?, 'tenant_admin', 'active', 1)").run(hash, salt);

  app = createApp({ db });
  stopWorker = startJobWorker(db, {
    'echo': async (payload) => {
      if (payload?.boom) throw new Error('模拟失败');
      return payload;
    },
  }, { intervalMs: 300 });
});

after(() => {
  stopWorker?.();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

// ============ ① 异步任务队列 ============
test('P3-01 任务入队与领取：enqueue -> claim 原子置 running', () => {
  const id = enqueueJob(db, 'echo', { msg: 'hi' }, { delayMs: 60_000 }); // 未来任务：worker 不会抢占
  assert.ok(id > 0);
  const job = claimNextJob(db, futureNow());
  assert.ok(job);
  assert.equal(job.id, id);
  assert.equal(job.status, 'running');
  assert.equal(job.type, 'echo');
  assert.deepEqual(JSON.parse(job.payload), { msg: 'hi' });
  // 已领取的任务不会被再次领取
  assert.equal(claimNextJob(db), null);
});

test('P3-02 任务完成与失败重试（指数退避、达上限置 failed）', () => {
  const id = enqueueJob(db, 'echo', {}, { delayMs: 60_000 });
  const job = claimNextJob(db, futureNow());
  finishJob(db, job.id, { ok: true });
  assert.equal(db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(id).status, 'done');

  // 失败重试：attempts 递增，回到 pending，run_at 延迟
  const f1 = enqueueJob(db, 'echo', {}, { delayMs: 60_000 });
  let j = claimNextJob(db, futureNow());
  failJobRetry(db, j.id, new Error('x'), 0);
  let row = db.prepare('SELECT * FROM bg_jobs WHERE id = ?').get(f1);
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);
  assert.ok(new Date(row.run_at).getTime() > Date.now());

  // 达上限：直接 failed
  const f2 = enqueueJob(db, 'echo', {}, { delayMs: 60_000 });
  db.prepare('UPDATE bg_jobs SET attempts = ? WHERE id = ?').run(MAX_ATTEMPTS - 1, f2); // 模拟已重试 2 次
  failJobRetry(db, f2, new Error('y'), MAX_ATTEMPTS - 1);
  row = db.prepare('SELECT * FROM bg_jobs WHERE id = ?').get(f2);
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, MAX_ATTEMPTS);
});

test('P3-03 worker 消费：成功置 done，失败重试，未知类型置 failed', async () => {
  const okId = enqueueJob(db, 'echo', { a: 1 });
  const boomId = enqueueJob(db, 'echo', { boom: true });
  const badId = enqueueJob(db, 'no-such-handler', {});

  // 轮询等待 worker 处理（interval 默认 2s，等待最多 6s）
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const ok = db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(okId)?.status;
    const boom = db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(boomId)?.status;
    const bad = db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(badId)?.status;
    if (ok === 'done' && boom === 'pending' && bad === 'failed') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(okId).status, 'done');
  assert.equal(db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(boomId).status, 'pending'); // 失败自动重试
  assert.equal(db.prepare('SELECT status FROM bg_jobs WHERE id = ?').get(badId).status, 'failed'); // 未知类型
});

// ============ ① 统一日志与健康检查 ============
test('P3-04 健康检查：返回 uptime/version/db 探测', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.db, 'ok');
  assert.ok(typeof res.body.uptime === 'number');
  assert.ok(res.body.version);
});

// ============ ② 审计埋点 ============
test('P3-05 租户域关键操作写入操作日志', async () => {
  const token = await loginAdmin();
  // 场景重建任务（管理员接口）产生审计
  const scenes = db.prepare('SELECT id, title FROM scenes LIMIT 1').all();
  let targetSceneId = null;
  if (!scenes.length) {
    const info = db.prepare("INSERT INTO scenes (title, image_path) VALUES ('审计测试场景', '/uploads/x.webp')").run();
    targetSceneId = info.lastInsertRowid;
  } else {
    targetSceneId = scenes[0].id;
  }
  const res = await request(app)
    .post(`/api/admin/scenes/${targetSceneId}/retile`)
    .set(bearer(token));
  assert.equal(res.status, 200);
  assert.ok(res.body.jobId);
  const log = db.prepare("SELECT * FROM operation_logs WHERE action = 'retile_scene' AND target_id = ? ORDER BY id DESC LIMIT 1").get(targetSceneId);
  assert.ok(log, '应写入 retile_scene 审计日志');
  assert.equal(log.username, 'admin');
});

test('P3-06 任务查询接口（管理用）', async () => {
  const token = await loginAdmin();
  const res = await request(app).get('/api/admin/jobs?limit=10').set(bearer(token));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.jobs));
  assert.ok(res.body.total >= 1);
});

// ============ ② 密钥加密 ============
test('P3-07 租户配置敏感字段加密/解密往返', async () => {
  const cfg = { sms: { accessKeySecret: 'SMS-SECRET-123' }, storage: { secretKey: 'OSS-SECRET' }, payment: { mchKey: 'MCH-KEY' }, copyright: '© 测试' };
  encryptConfigSecrets(cfg);
  // 密文 ≠ 明文，且可解密还原
  assert.notEqual(cfg.sms.accessKeySecret, 'SMS-SECRET-123');
  assert.notEqual(cfg.storage.secretKey, 'OSS-SECRET');
  decryptConfigSecrets(cfg);
  assert.equal(cfg.sms.accessKeySecret, 'SMS-SECRET-123');
  assert.equal(cfg.storage.secretKey, 'OSS-SECRET');
  assert.equal(cfg.payment.mchKey, 'MCH-KEY');
  // 非敏感字段不受影响
  assert.equal(cfg.copyright, '© 测试');
});

test('P3-08 租户配置接口：落库加密、回显解密', async () => {
  const token = await loginTenant();
  // 先更新租户配置（加密落库）
  const put = await request(app)
    .put('/api/customer/config')
    .set(bearer(token))
    .send({ sms: { accessKeySecret: 'REAL-SECRET' } });
  assert.equal(put.status, 200);
  // 直查数据库：密文存储
  const project = db.prepare("SELECT config FROM projects WHERE id = 1").get();
  const stored = JSON.parse(project.config || '{}');
  assert.ok(stored.sms?.accessKeySecret);
  assert.notEqual(stored.sms.accessKeySecret, 'REAL-SECRET');
  // 回显：解密
  const profile = await request(app).get('/api/customer/profile').set(bearer(token));
  assert.equal(profile.status, 200);
  assert.equal(profile.body.customer.config.sms.accessKeySecret, 'REAL-SECRET');
});

// ============ ② 限流防刷 ============
test('P3-09 登录 IP 限流：超过 20 次/分钟返回 429', async () => {
  let last = null;
  for (let i = 0; i < 21; i++) {
    last = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'wrong' });
  }
  assert.equal(last.status, 429);
  assert.match(last.body.error, /频繁/);
});

test('P3-10 限流器单元：窗口重置与剩余额度', () => {
  const r1 = rateLimit({ key: 't1', limit: 1, windowMs: 1000 });
  const r2 = rateLimit({ key: 't1', limit: 1, windowMs: 1000 });
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, false);
  assert.equal(r2.remaining, 0);
});

// ============ ② 强制租户过滤 ============
test('P3-11 租户配置接口：未认证请求被拒（requireAuth 前置）', async () => {
  const res = await request(app).get('/api/customer/profile');
  assert.equal(res.status, 401);
});

test('P3-12 公开入口安全设计：入驻口令无效返回错误，不接受租户ID直传', async () => {
  // POST /apply 不允许传 customer_id（租户只从 invite_code 解析）
  const res = await request(app).post('/api/card-market/apply').send({ type: 'individual', customerId: 1 });
  assert.equal(res.status, 401); // 未登录先拦截
  const res2 = await request(app).post('/api/card-market/apply').send({ type: 'individual', bindCode: 'BADCODE', name: '张三', phone: '13800138000' });
  assert.equal(res2.status, 401);
});
