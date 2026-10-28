/**
 * 回归锁：首页展示位（C 端验真结果页下方推广位）的**路由层**契约。
 *
 * 🔴 为什么单测之外还要这一层：
 *   traceSlots.test.js 只锁纯函数（上限 / 条件 / 挑选），锁不住路由层三个真实事故面：
 *     1) 接口密钥**明文落库**（先归一化再加密，顺序反了就会中招）
 *     2) GET /settings 把**密文回显给浏览器**（租户凭据泄漏）
 *     3) C 端拿到的 slots 与后台配的**不一致**（条件算错 / 顺序被打乱）
 *   这三类都是「纯函数全绿、线上出事」型缺陷，只能打真实 HTTP + 查库拦。
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
import { decryptSecret } from '../src/crypto.js';

describe('展示位路由层：密钥不落明文 + 脱敏回显 + C 端按条件下发', () => {
  let tmpDir, db, app, server, token;

  const T = 12;
  // 脱敏口径 = 前 4 + **** + 后 4（见 crypto.js maskSecretValue）
  const PLAIN = 'sk-live-9f3c7a1e5b2d';
  const MASKED = 'sk-l****5b2d';

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-slots-'));
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
    globalThis.__traceSlotsPrev = prev;

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('traceSlots', '13800008888', hash, salt, 'tenant_admin', T);
    // 🔴 solutions 必须含 trace —— 否则 hasSolution 门禁 403，后面全测不到点上。
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"trace\"]')").run(T, '展示位测试租户');
    const login = await request(app).post('/api/auth/login').send({ username: 'traceSlots', password: 'admin123' });
    token = login.body.token;
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceSlotsPrev);
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const putSettings = (settings) => auth(request(app).put('/api/customer/trace/settings')).send({ settings });
  const storedJson = () => db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(T)?.settings_json || '';

  const SLOTS = [
    { when: 1, title: '全部可见', cover: '/a.png', link: '/pages/a', color: '#ff0000' },
    { when: 2, title: '仅首查', cover: '/b.png', link: '/pages/b', color: '#00ff00' },
    { when: 5, title: '首位每次', cover: '/c.png', link: '/pages/c', color: '' },
    { when: 4, title: '非首位', cover: '/d.png', link: '/pages/d', color: '#0000ff' },
  ];

  // ── 1) 密钥：密文落库、明文不落库 ────────────────────────────────────
  it('保存展示位：接口密钥密文落库，明文绝不进库', async () => {
    const res = await putSettings({ displaySlots: [{ ...SLOTS[0], accessKey: PLAIN }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const raw = storedJson();
    assert.ok(!raw.includes(PLAIN), `明文密钥落库了：${raw}`);
    const stored = JSON.parse(raw).displaySlots[0];
    assert.ok(stored.keyCipher, '库里应有 keyCipher');
    assert.equal(decryptSecret(stored.keyCipher), PLAIN, '密文解不开或值不对');
    assert.equal(stored.accessKey, undefined, '明文 accessKey 不应落库');
  });

  // ── 2) 回显：只给脱敏串，不给密文 ────────────────────────────────────
  it('GET 回显只给脱敏串：密文与明文都不出网', async () => {
    const res = await auth(request(app).get('/api/customer/trace/settings'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const slot = res.body.settings.displaySlots[0];
    assert.equal(slot.accessKey, MASKED, `脱敏串不对：${slot.accessKey}`);
    assert.equal(slot.keyCipher, undefined, '密文绝不能回显给浏览器');
    assert.ok(!JSON.stringify(res.body).includes(PLAIN), '明文泄漏到响应体');
  });

  // ── 3) 幂等：脱敏串原样回传 = 不改密钥；新明文才覆盖 ──────────────────
  it('脱敏串原样回传不改变密文；传新明文才覆盖', async () => {
    const before = JSON.parse(storedJson()).displaySlots[0].keyCipher;

    const keep = await putSettings({ displaySlots: [{ ...SLOTS[0], accessKey: MASKED }] });
    assert.equal(keep.status, 200, JSON.stringify(keep.body));
    assert.equal(JSON.parse(storedJson()).displaySlots[0].keyCipher, before, '回传脱敏串竟然改了密钥');

    const NEW = 'sk-live-rotated-0001';
    const rot = await putSettings({ displaySlots: [{ ...SLOTS[0], accessKey: NEW }] });
    assert.equal(rot.status, 200, JSON.stringify(rot.body));
    const after = JSON.parse(storedJson()).displaySlots[0].keyCipher;
    assert.notEqual(after, before, '传新明文却没有覆盖密钥');
    assert.equal(decryptSecret(after), NEW);
  });

  // ── 4) 上限 8：第 9 个 400，且不落库 ─────────────────────────────────
  it('第 9 个展示位被拒（400），非法提交不落库', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...SLOTS[0], title: `位${i + 1}` }));
    const res = await putSettings({ displaySlots: nine });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /最多 8 个/);
    assert.equal(JSON.parse(storedJson()).displaySlots.length, 1, '非法提交竟然落库了');
  });

  // ── 5) 展示条件非法 → 400 ────────────────────────────────────────────
  it('展示条件非法（0/1/2/4/5 之外）→ 400', async () => {
    const res = await putSettings({ displaySlots: [{ ...SLOTS[0], when: 3 }] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /展示条件非法/);
  });

  // ── 6) C 端下发：按「展示条件 + 本次查询态」挑，且保持配置顺序 ─────────
  it('C 端验真按展示条件下发 slots（首查/换位两次各一次判定）', async () => {
    // 6.1 配好四个位（第一个位带密钥，验证密文不会漏到 C 端）
    const put = await putSettings({ displaySlots: SLOTS.map((s, i) => ({ ...s, accessKey: i === 0 ? PLAIN : '' })) });
    assert.equal(put.status, 200, JSON.stringify(put.body));

    // 6.2 建批次 + 生成码
    const batch = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'SLOT01', product: '展示位产品' });
    assert.equal(batch.status, 200, JSON.stringify(batch.body));
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`))
      .send({ codetype: 6, codeno: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    // 6.3 首位查询人首次查（openid=aaa）：ALL + FIRST + TOP_EVERY 渲染，NOT_TOP 不渲染
    const first = await request(app).post(`/api/trace/public/verify?tid=${T}`)
      .set('x-openid', 'aaa').send({ co: code });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.slots.map((s) => s.title), ['全部可见', '仅首查', '首位每次'], '首查下发的展示位不对');
    assert.ok(!JSON.stringify(first.body.slots).includes('keyCipher'), '密钥密文泄漏到 C 端');
    assert.ok(!JSON.stringify(first.body.slots).includes(PLAIN), '密钥明文泄漏到 C 端');

    // 6.4 换个人查（openid=bbb）：非首位 → ALL + NOT_TOP，FIRST/TOP_EVERY 都不渲染
    const second = await request(app).post(`/api/trace/public/verify?tid=${T}`)
      .set('x-openid', 'bbb').send({ co: code });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(second.body.slots.map((s) => s.title), ['全部可见', '非首位'], '非首位下发的展示位不对');

    // 6.5 首位查询人再查一次（openid=aaa）：非首次但仍是首位 → ALL + TOP_EVERY
    // 🔴 既有「21 秒内同码同人不重复计数」的防抖会让这次直接命中 recent 而不累加 num，
    //    测不到「复访」语义。把历史时间拨早模拟窗口已过，不用真等 21 秒。
    db.prepare("UPDATE trace_histories SET created_at = datetime('now', '-1 minute') WHERE tenant_id = ?").run(T);
    const again = await request(app).post(`/api/trace/public/verify?tid=${T}`)
      .set('x-openid', 'aaa').send({ co: code });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual(again.body.slots.map((s) => s.title), ['全部可见', '首位每次'], '首位复访下发的展示位不对');
  });

  // ── 7) 查询次数 num 必须真递增（回归锁） ──────────────────────────────
  // 🔴 原判据 `if (num > 1)` 让 num 永远卡在 1：首查置 1 后不满足条件 → 永不 +1
  //    → first 恒 true → 「仅首次查询可见」的展示位永远显示、首查奖励重复发。
  it('复访次数 num 逐次递增，first 第二次起为 false', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'NUM01', product: '计数产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`))
      .send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    const first = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'zzz').send({ co: code });
    assert.equal(first.body.num, 1, '首查 num 应为 1');
    assert.equal(first.body.first, true, '首查 first 应为 true');

    for (const expect of [2, 3]) {
      db.prepare("UPDATE trace_histories SET created_at = datetime('now', '-1 minute') WHERE tenant_id = ?").run(T);
      const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'zzz').send({ co: code });
      assert.equal(res.body.num, expect, `第 ${expect} 次查询 num 应递增到 ${expect}，实际 ${res.body.num}`);
      assert.equal(res.body.first, false, '第二次起 first 应为 false');
    }
  });

  // ── 8) 复访备注必须递进：第 N 次查询备注 = 「第N次查询」（回归锁） ──────
  // 🔴 原 bug：备注用「自增前的 record.num」拼，第 2、3 次查询的备注仍写「第1次查询」。
  //    两台手机扫同一码（不同 openid）即触发：计数 num 是对的，但查询记录备注全标「第1次查询」。
  it('复访备注递进：第1/2/3次查询备注分别为「第1次/第2次/第3次查询」', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'RMK01', product: '备注产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`))
      .send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    // 三个不同 openid 模拟「同一码被两台/三台手机扫」（不同人 → 不命中 21 秒同人防抖）
    const openids = ['aaa', 'bbb', 'ccc'];
    const expectRemarks = ['第1次查询', '第2次查询', '第3次查询'];
    for (let i = 0; i < openids.length; i += 1) {
      const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', openids[i]).send({ co: code });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const remark = db.prepare('SELECT remark FROM trace_histories WHERE tenant_id = ? AND summary = ? AND openid = ? ORDER BY id DESC LIMIT 1')
        .get(T, code, openids[i])?.remark;
      assert.equal(remark, expectRemarks[i], `第 ${i + 1} 次查询备注应为「${expectRemarks[i]}」，实际「${remark}」`);
    }
    const num = db.prepare('SELECT num FROM trace_codes WHERE tenant_id = ? AND code = ?').get(T, code)?.num;
    assert.equal(Number(num), 3, `三次查询后 num 应为 3，实际 ${num}`);
  });
});
