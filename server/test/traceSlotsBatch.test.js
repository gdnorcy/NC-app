/**
 * 回归锁：P1「批次级展位 ⊕ 全局展位合并下发」+「关联商品与商城打通」的路由层契约。
 *
 * 🔴 为什么单独一层：
 *   1) 批次展位是新字段 batch_slots_json —— 最容易踩 #532「后台加了字段、POST/PUT 列清单没加 →
 *      每次保存清空」；必须锁「保存 → 落库 → 编辑幂等」整条链。
 *   2) 密钥复用租户展示位密钥（用户 2026-10-31 拍板）：批次展位不配鉴权码，
 *      服务端统一成租户 authKey —— 锁「首次保存统一、再次保存不变（已印链接不失效）」。
 *   3) C 端下发合并顺序（批次在前、全局在后）+ 密钥剥离 + [FWM] 变量替换。
 *   4) toshop_json 只存 ids，验真时按在售商品实时 join；未开通商城 → 空数组（整区不渲染）。
 */
import { describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';

describe('P1：批次展位合并下发 + 关联商品(商城打通)', () => {
  let tmpDir, db, app, server, token;

  const T = 13;
  const GLOBAL_KEY = 'sk-batch-global-9f3c7a1e5b2d00';
  const BATCH = 'BAT01';

  before(async () => {    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-batch-slots-'));
    const prev = { ...config };
    Object.assign(config, {
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      dbPath: path.join(tmpDir, 'test.db'),
      webDistDir: path.join(tmpDir, 'web-dist'),
      storageProvider: 'local',
      storageProviders: JSON.stringify({ local: {} }),
      adminUser: 'admin',
      adminPass: 'admin123',
    });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    db = createDb(config.dbPath);
    app = createApp({ db });
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    globalThis.__traceSlotsBatchPrev = prev;

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('traceBatchSlots', '13800009999', hash, salt, 'tenant_admin', T);
    // solutions 含 trace + goods：关联商品下发要过 hasSolution('goods') 门禁
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"trace\",\"goods\"]')").run(T, 'P1批次展位测试租户');
    const login = await request(app).post('/api/auth/login').send({ username: 'traceBatchSlots', password: 'admin123' });
    token = login.body.token;
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceSlotsBatchPrev);
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const putSettings = (settings) => auth(request(app).put('/api/customer/trace/settings')).send({ settings });
  const batchRow = (id) => db.prepare('SELECT * FROM trace_batches WHERE id = ?').get(id);

  async function makeBatch(extra = {}) {
    // 批次号唯一约束：每个用例单独建批，随机后缀避免「批次号已存在」串扰
    const tag = Math.random().toString(36).slice(2, 8).toUpperCase();
    const res = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: `B${tag}`, product: 'P1展位产品', ...extra });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.id;
  }
  async function makeCode(id) {
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    return gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];
  }
  async function verify(code, openid = 'p1-a') {
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', openid).send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  }

  // ── 1) 批次展位保存落库：列清单已同步（#532），且密钥统一为租户展示位密钥 ──
  it('POST /batches 保存 batch_slots_json：归一化落库 + authKey 统一为租户全局密钥', async () => {
    const put = await putSettings({ slotsEnabled: 1, showSlotsOnQuery: 1, displaySlots: [{ when: 1, title: '全局位', cover: '/g.png', link: '/pages/g', authKey: GLOBAL_KEY }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    const id = await makeBatch({
      batchSlots: [
        { when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba?c=[FWM]' },
        { when: 2, title: '批次位B', cover: '/bb.png', link: '/pages/bb' },
      ],
    });
    const row = batchRow(id);
    const slots = JSON.parse(row.batch_slots_json);
    assert.equal(slots.length, 2, '两个批次展位都应落库');
    for (const s of slots) assert.equal(s.authKey, GLOBAL_KEY, '批次展位应统一复用租户展示位密钥');
    assert.ok(!row.batch_slots_json.includes('keyCipher'), '批次展位不应有 keyCipher 影子字段');
  });

  // ── 2) 编辑幂等：再次 PUT 同批不重生成密钥（已印链接不失效） ──
  it('PUT /batches/:id 幂等：已有统一密钥的展位再次保存不换密钥', async () => {
    const id = await makeBatch({ batchSlots: [{ when: 1, title: '幂等位', cover: '/bb.png', link: '/pages/bb' }] });
    const before1 = JSON.parse(batchRow(id).batch_slots_json)[0].authKey;
    assert.equal(before1, GLOBAL_KEY);

    const res = await auth(request(app).put(`/api/customer/trace/batches/${id}`))
      .send({ batch: BATCH, product: '改名产品', batchSlots: [{ when: 1, title: '幂等位', cover: '/bb.png', link: '/pages/bb' }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const after1 = JSON.parse(batchRow(id).batch_slots_json)[0].authKey;
    assert.equal(after1, before1, '编辑保存不应重生成密钥（否则已印出的链接全失效）');
  });

  // ── 3) C 端下发：批次位在前、全局位随后，密钥剥离 + [FWM] 替换 ──
  it('验真下发 slots = 批次⊕全局（批次在前带 scope），密钥剥净、[FWM] 已替换', async () => {
    const id = await makeBatch({
      batchSlots: [{ when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba?c=[FWM]' }],
    });
    const code = await makeCode(id);
    const body = await verify(code);

    assert.ok(Array.isArray(body.slots), '应下发 slots 数组');
    const titles = body.slots.map((s) => s.title);
    assert.deepEqual(titles, ['批次位A', '全局位'], '批次展位应排在全局展位之前');
    assert.equal(body.slots[0].scope, 'batch', '批次位应带 scope=batch');
    assert.equal(body.slots[1].scope, 'global', '全局位应带 scope=global');
    assert.ok(!JSON.stringify(body.slots).includes(GLOBAL_KEY), '鉴权码本体绝不能下发到 C 端');
    assert.ok(!JSON.stringify(body.slots).includes('keyCipher'), '密钥密文不能下发到 C 端');
    assert.equal(body.slots[0].link, `/pages/ba?c=${code}`, '[FWM] 应由服务端替换为真实码');
    assert.equal(body.slots[0].authKey, undefined, 'authKey 字段应被剥掉');
  });

  // ── 4) 关联商品：toshop_json.ids 实时 join 在售商品下发 ──
  it('验真下发 toshop：按 ids 实时 join 本租户在售商品（改价/下架即时同步，非快照）', async () => {
    // 🔴 P1 总闸：商城集成「商品来源」须选 1 本平台商城商品，关联商品卡才下发
    await putSettings({ mallSource: 1 });
    const g1 = db.prepare("INSERT INTO goods (customer_id, title, thumb, price, market_price, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'sell', datetime('now'), datetime('now'))").run(T, '溯源关联商品一', '/g1.png', 12.5, 15.0).lastInsertRowid;
    const g2 = db.prepare("INSERT INTO goods (customer_id, title, thumb, price, market_price, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'sell', datetime('now'), datetime('now'))").run(T, '溯源关联商品二', '/g2.png', 88, 99).lastInsertRowid;
    const g3 = db.prepare("INSERT INTO goods (customer_id, title, thumb, price, market_price, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'off', datetime('now'), datetime('now'))").run(T, '已下架商品', '/g3.png', 1, 2).lastInsertRowid;

    const id = await makeBatch({ toshop: { ids: [g1, g2, g3] } });
    const code = await makeCode(id);
    const body = await verify(code);

    assert.ok(Array.isArray(body.batch.toshop), '验真响应应下发 toshop 数组');
    assert.deepEqual(body.batch.toshop.map((x) => x.id), [g1, g2], '只应 join 在售商品，已下架(g3)不出现');
    const first = body.batch.toshop[0];
    assert.equal(first.title, '溯源关联商品一');
    assert.equal(first.price, 12.5, '价格实时取 goods 表');
    assert.ok('marketPrice' in first, '应下发 marketPrice');
  });

  // ── 4b) 后台关联商品候选池：GET /trace/goods 只返回本租户在售商品 ──
  it('后台关联商品候选池：只返回本租户在售商品（sell 过滤 + keyword）', async () => {
    const cg1 = db.prepare("INSERT INTO goods (customer_id, title, thumb, price, market_price, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'sell', datetime('now'), datetime('now'))").run(T, '后台候选一', '/c1.png', 9.9, 12).lastInsertRowid;
    const cg2 = db.prepare("INSERT INTO goods (customer_id, title, thumb, price, market_price, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'off', datetime('now'), datetime('now'))").run(T, '后台候选已下架', '/c2.png', 1, 2).lastInsertRowid;
    const list = await auth(request(app).get('/api/customer/trace/goods?page=1&pageSize=100'));
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const ids = list.body.list.map((g) => Number(g.id));
    assert.ok(ids.includes(Number(cg1)), '在售商品应出现在候选池');
    assert.ok(!ids.includes(Number(cg2)), '已下架商品不应出现在候选池');
    assert.equal(list.body.list[0].price, 9.9, '候选应带实时价格');
    const kw = await auth(request(app).get('/api/customer/trace/goods?keyword=候选一'));
    assert.equal(kw.status, 200, JSON.stringify(kw.body));
    assert.equal(kw.body.list.length, 1, 'keyword 应过滤出目标商品');
    assert.equal(kw.body.list[0].title, '后台候选一');
  });

  // ── 4c) 未开通商城应用 → 候选接口 403（与 C 端 toshop 空数组同口径） ──
  it('后台关联商品候选池：租户未开通 goods 应用 → 403', async () => {
    db.prepare("UPDATE projects SET solutions = ? WHERE id = ?").run(JSON.stringify(['trace']), T);
    try {
      const res = await auth(request(app).get('/api/customer/trace/goods'));
      assert.equal(res.status, 403, '未开通商城应用应 403');
      assert.match(String(res.body.error || ''), /商城应用/);
    } finally {
      db.prepare("UPDATE projects SET solutions = ? WHERE id = ?").run(JSON.stringify(['trace', 'goods']), T);
    }
  });

  // ── 5) 未开通商城应用 → toshop 空数组（C 端整区不渲染） ──
  it('租户未开通 goods 应用：toshop 为空数组（即便配了 ids）', async () => {
    // 临时撤掉 goods 开通态，模拟未开通商城
    db.prepare("UPDATE projects SET solutions = ? WHERE id = ?").run(JSON.stringify(['trace']), T);
    const id = await makeBatch({ toshop: { ids: [9999] } });
    const code = await makeCode(id);
    const body = await verify(code, 'p1-b');
    assert.ok(Array.isArray(body.batch.toshop), 'toshop 字段恒为数组');
    assert.equal(body.batch.toshop.length, 0, '未开通商城不应下发任何关联商品');
  });

  // ── 6) slots 总开关关闭 → 批次位也不下发（批次位受同一总闸约束） ──
  it('slotsEnabled=0 时批次展位与全局展位都不下发', async () => {
    const put = await putSettings({ slotsEnabled: 0, displaySlots: [{ when: 1, title: '全局位', cover: '/g.png', link: '/pages/g', authKey: GLOBAL_KEY }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const id = await makeBatch({ batchSlots: [{ when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba' }] });
    const code = await makeCode(id);
    const body = await verify(code, 'p1-c');
    assert.deepEqual(body.slots, [], '总开关关闭后批次展位也不应下发');
  });

  // ── 7) 查询页闸门：默认关（showSlotsOnQuery=0），即便总闸开 + 有展位也不下发 ──
  it('查询页闸门默认关：showSlotsOnQuery=0 时即便总闸开+有展位，slots 也不下发', async () => {
    // 🔴 总闸开 + 全局展位已配，但查询页闸门显式关 → C 端验真结果页不应出现任何展位。
    const put = await putSettings({ slotsEnabled: 1, showSlotsOnQuery: 0, displaySlots: [{ when: 1, title: '全局位', cover: '/g.png', link: '/pages/g', authKey: GLOBAL_KEY }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const id = await makeBatch({ batchSlots: [{ when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba' }] });
    const code = await makeCode(id);
    const body = await verify(code, 'p1-q1');
    assert.deepEqual(body.slots, [], '查询页闸门默认关闭：总闸开且有展位也应不下发');
  });

  // ── 8) 查询页闸门显式开：showSlotsOnQuery=1 且总闸开 → 下发（批次⊕全局） ──
  it('查询页闸门开：showSlotsOnQuery=1 且总闸开 → 下发批次⊕全局展位', async () => {
    const put = await putSettings({ slotsEnabled: 1, showSlotsOnQuery: 1, displaySlots: [{ when: 1, title: '全局位', cover: '/g.png', link: '/pages/g', authKey: GLOBAL_KEY }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const id = await makeBatch({ batchSlots: [{ when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba' }] });
    const code = await makeCode(id);
    const body = await verify(code, 'p1-q2');
    assert.ok(Array.isArray(body.slots) && body.slots.length === 2, '闸门开后应下发 批次⊕全局 两展位');
    assert.equal(body.slots[0].title, '批次位A');
    assert.equal(body.slots[1].title, '全局位');
  });

  // ── 9) 批次级覆盖：批次强制隐藏(0) 压制全局开 ──
  it('批次级覆盖：show_slots_query=0 强制隐藏，即便全局开也不下发', async () => {
    const put = await putSettings({ slotsEnabled: 1, showSlotsOnQuery: 1, displaySlots: [{ when: 1, title: '全局位', cover: '/g.png', link: '/pages/g', authKey: GLOBAL_KEY }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const id = await makeBatch({ batchSlots: [{ when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba' }], showSlotsQuery: 0 });
    const code = await makeCode(id);
    const body = await verify(code, 'p1-q3');
    assert.deepEqual(body.slots, [], '批次强制隐藏应压制全局开');
    const row = batchRow(id);
    assert.equal(Number(row.show_slots_query), 0, '批次列 show_slots_query 应落库为 0');
  });

  // ── 10) 批次级覆盖：show_slots_query=-1 继承全局，全局开则下发（列清单已同步 #532） ──
  it('批次级覆盖：show_slots_query=-1 继承全局，全局开则下发；列清单已同步', async () => {
    const put = await putSettings({ slotsEnabled: 1, showSlotsOnQuery: 1, displaySlots: [{ when: 1, title: '全局位', cover: '/g.png', link: '/pages/g', authKey: GLOBAL_KEY }] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const id = await makeBatch({ batchSlots: [{ when: 1, title: '批次位A', cover: '/ba.png', link: '/pages/ba' }], showSlotsQuery: -1 });
    const code = await makeCode(id);
    const body = await verify(code, 'p1-q4');
    assert.ok(body.slots.length === 2, '继承全局(开)应下发展位');
    const row = batchRow(id);
    assert.equal(Number(row.show_slots_query), -1, '批次列应落库为 -1');
  });
});
