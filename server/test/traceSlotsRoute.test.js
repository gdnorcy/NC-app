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
describe('展示位路由层：密钥不落明文 + 脱敏回显 + C 端按条件下发', () => {
  let tmpDir, db, app, server, token;

  const T = 12;
  // 收敛后展示位只有一个密钥字段 authKey（明文存储、复制给对接方，但不下发到 C 端）。
  const PLAIN = 'sk-live-9f3c7a1e5b2d';

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
    { when: 1, title: '全部可见', cover: '/a.png', link: '/pages/a' },
    { when: 2, title: '仅首查', cover: '/b.png', link: '/pages/b' },
    { when: 5, title: '首位每次', cover: '/c.png', link: '/pages/c' },
    { when: 4, title: '非首位', cover: '/d.png', link: '/pages/d' },
  ];

  // ── 1) #532 偏差3 收敛：展示位只有一个密钥字段 authKey，接口密钥影子字段彻底移除 ──
  //    2026-10-31 之前有 accessKey/keyCipher（接口密钥，预留、零消费点 = 空头权益）。
  //    现在：提交 accessKey 既不应落库、也不应回显；库里不再有 keyCipher 概念。
  it('收敛后：提交 accessKey 不落库、不回显，库里无 keyCipher', async () => {
    const res = await putSettings({ displaySlots: [{ ...SLOTS[0], accessKey: PLAIN }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const raw = storedJson();
    assert.ok(!raw.includes('keyCipher'), '收敛后库里不应再有 keyCipher 字段');
    const stored = JSON.parse(raw).displaySlots[0];
    assert.equal(stored.accessKey, undefined, 'accessKey 字段不应落库');
    assert.ok(!raw.includes(PLAIN), `明文不应落库：${raw}`);
  });

  // ── 2) GET 回显里不再出现 accessKey/keyCipher（旧的脱敏串口径废弃）──
  it('GET 回显不含 accessKey / keyCipher 字段', async () => {
    const res = await auth(request(app).get('/api/customer/trace/settings'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const slot = res.body.settings.displaySlots[0];
    assert.equal(slot.accessKey, undefined, '收敛后不应再下发给前端的 accessKey');
    assert.equal(slot.keyCipher, undefined, '收敛后不应再下发给前端的 keyCipher');
    assert.ok(!JSON.stringify(res.body).includes(PLAIN), '明文泄漏到响应体');
  });

  // ── 3) authKey 仍是唯一密钥字段，且明文存储可复制给对接方（不下发到 C 端由 #13 锁）──
  it('authKey 是唯一密钥字段：保存后原样回显（明文可见、给对接方）', async () => {
    const KEY = 'ip15xdm4oglys0ei12luwm4o4lukswog';
    const res = await putSettings({ displaySlots: [{ ...SLOTS[0], authKey: KEY }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const get = await auth(request(app).get('/api/customer/trace/settings'));
    assert.equal(get.body.settings.displaySlots[0].authKey, KEY, '鉴权码应原样回显给后台（要复制给对接方）');
    assert.ok(!JSON.parse(storedJson()).displaySlots[0].keyCipher, '不应生成 keyCipher');
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
  it('展示条件非法（0/1/2/3/4/5 之外）→ 400', async () => {
    // 3 已是合法档（仅非首次查询，#552 补），用 6 当非法值
    const res = await putSettings({ displaySlots: [{ ...SLOTS[0], when: 6 }] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /展示条件非法/);
  });

  // ── 6) C 端下发：按「展示条件 + 本次查询态」挑，且保持配置顺序 ─────────
  it('C 端验真按展示条件下发 slots（首查/换位两次各一次判定）', async () => {
    // 6.1 配好四个位（含一个位带 authKey，验证明文鉴权码不会漏到 C 端 —— 见 #13）
    const put = await putSettings({ displaySlots: SLOTS.map((s, i) => ({ ...s, authKey: i === 0 ? 'ip15xdm4oglys0ei12luwm4o4lukswog' : '' })) });
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

  // ── 6b) #552 仅非首次查询（when=3）：按「这个码被查第几次」分流，与查询人无关 ──
  // 🔴 2026-10-31 补：展示位原先缺这一档，活动位早有「仅非首次查询」。同一语义两套口径会坑租户。
  //    when=3 看的是 isFirstQuery（码被查第 1 次 vs 第 2+ 次），不是 isTopQueryer（人是不是首位）。
  it('仅非首次查询(when=3)：码第1次查不显示、第2+次查才显示（与查询人无关）', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: 'NF01', product: '非首次产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    await putSettings({ slotsEnabled: 1, displaySlots: [{ when: 3, title: '复访才见', cover: '/a.png', link: '/pages/a' }] });

    // ① 这个码首次被查（任何人）→ 不渲染
    const first = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'nf-a').send({ co: code });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.slots, [], '码首查竟显示了「仅非首次」位');

    // ② 同一个码第二次被查（不同人）→ 渲染；即便第二个人是「首位查询人」也不影响
    db.prepare("UPDATE trace_histories SET created_at = datetime('now', '-1 minute') WHERE tenant_id = ?").run(T);
    const second = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'nf-b').send({ co: code });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.deepEqual(second.body.slots.map((s) => s.title), ['复访才见'], '码第2次查应显示「仅非首次」位');
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

  // ── 9) 展示位总开关（slotsEnabled）：关掉 → C 端一个位都不下发 ─────────
  it('总开关关掉 → C 端不下发任何展示位（后台关掉即彻底不出现）', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: 'SW01', product: '开关产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    const off = await putSettings({ slotsEnabled: 0, displaySlots: [{ ...SLOTS[0], hidden: 0 }] });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(Number(JSON.parse(storedJson()).slotsEnabled), 0, '总开关没落库');

    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'sw1').send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.slots, [], '总开关关掉后 C 端仍下发了展示位');
  });

  // ── 10) 位级隐藏开关（hidden）：该位不下发，其它位照常 ────────────────
  it('单个位 hidden=1 → 该位不下发，其它位不受影响', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: 'HD01', product: '隐藏产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    await putSettings({
      slotsEnabled: 1,
      displaySlots: [
        { ...SLOTS[0], title: '保留位', hidden: 0 },
        { ...SLOTS[1], title: '隐藏位', hidden: 1 },
      ],
    });
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'hd1').send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.slots.map((s) => s.title), ['保留位'], 'hidden 位不该下发');
  });

  // ── 11) GET 回显双开关（后台开关不回显 = 用户以为没保存） ─────────────
  it('GET 回显带 slotsEnabled 与每个位的 hidden', async () => {
    await putSettings({ slotsEnabled: 1, displaySlots: [{ ...SLOTS[0], hidden: 1 }] });
    const res = await auth(request(app).get('/api/customer/trace/settings'));
    assert.equal(res.status, 200);
    assert.equal(Number(res.body.settings.slotsEnabled), 1);
    assert.equal(Number(res.body.settings.displaySlots[0].hidden), 1);
  });

  // ── 12) 占位符服务端替换（{CODE}/{TID}）──────────────────────────────
  // 🔴 以前这个替换只在微信图文侧做过，C 端拿到的还是字面量 {CODE} → 点进去必然坏。
  it('展示位标题/链接里的 {CODE}/{TID} 由服务端替换成真实值', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: 'PH01', product: '占位产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    await putSettings({
      slotsEnabled: 1,
      displaySlots: [{ when: 1, title: '码 {CODE}', cover: '/a.png', link: '/pages/x?co={CODE}&tid={TID}' }],
    });
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'ph1').send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.slots[0].link, `/pages/x?co=${code}&tid=${T}`, '链接占位符没被替换');
    assert.equal(res.body.slots[0].title, `码 ${code}`, '标题占位符没被替换');
  });

  // ── 13) 鉴权码明文绝不随公开接口出网；[KEY] 出网的是签名（md5(码+鉴权码)）──
  // 🔴 2026-10-31 安全加固：原先把 authKey 裸字段随 slot 下发到 C 端（公开接口、可被抓包），
  //    即使链接里改成签名，密钥本体还是泄漏了。这里锁死「字段不出网 + 链接只带签名」。
  it('展示位鉴权码明文不出 C 端；[KEY] 只替换成 md5(防伪码 + 鉴权码)', async () => {
    const AUTHKEY = 'ip15xdm4oglys0ei12luwm4o4lukswog';
    const batch = await auth(request(app).post('/api/customer/trace/batches')).send({ batch: 'AK01', product: '鉴权码产品' });
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    await putSettings({
      slotsEnabled: 1,
      displaySlots: [{ when: 1, title: 't', cover: '/a.png', link: `/pages/x?m=[KEY]`, authKey: AUTHKEY }],
    });
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'ak1').send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const slot = res.body.slots[0];
    // ① 明文鉴权码本体不得随字段出网
    assert.equal(slot.authKey, undefined, '鉴权码明文字段随 C 端响应出网了');
    assert.ok(!JSON.stringify(res.body.slots).includes(AUTHKEY), '鉴权码明文内容泄漏到 C 端响应');
    // ② 链接里的 [KEY] 必须是签名、且对应 md5(code + AUTHKEY)
    const crypto = await import('node:crypto');
    const expect = crypto.createHash('md5').update(`${code}${AUTHKEY}`, 'utf8').digest('hex');
    assert.equal(slot.link, `/pages/x?m=${expect}`, `链接里的 [KEY] 应是 md5 签名，实际：${slot.link}`);
  });

  // ── 14) P0 过期拦截：批次 expire_at 已过期 → 验真被拒 ──
  it('批次已过有效日期 → 验真返回 400 expired', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'EXP01', product: '过期产品', expireAt: '2000-01-01' });
    assert.equal(batch.status, 200, JSON.stringify(batch.body));
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'exp1').send({ co: code });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.expired, true, '应标记 expired');
  });

  // ── 15) P0 params / wailink 下发到 C 端（不再空头）──
  it('自定义属性(params)与溯源外链(wailink)随验真结果下发给 C 端', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'PW01', product: '属性产品', params: [{ k: '材质', v: '纯棉' }, { k: '规格', v: 'L' }], wailink: { sy: 'https://x.com/trace/abc' } });
    assert.equal(batch.status, 200, JSON.stringify(batch.body));
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'pw1').send({ co: code });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.batch.params.length, 2, 'params 应原样下发');
    assert.equal(res.body.batch.params[0].k, '材质');
    assert.equal(res.body.batch.wailink.sy, 'https://x.com/trace/abc', 'wailink.sy 应下发');
  });

  // ── 16) P0 窜货闭环：查询地区与限售区域前 2 字不一致 → 标记 cross_region ──
  it('查询省与限售省不一致 → chuanhuoHit=true 且码被打标 cross_region=1', async () => {
    const batch = await auth(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'CR01', product: '窜货产品', isChuanhuo: 1, chuanhuoLimit: { province: '广东', city: '深圳' } });
    assert.equal(batch.status, 200, JSON.stringify(batch.body));
    const gen = await auth(request(app).post(`/api/customer/trace/batches/${batch.body.id}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    const code = gen.body.content.split('\n').map((s) => s.trim()).filter(Boolean)[0];

    // 查询者上报省=北京（与限售省 广东 前 2 字不一致）→ 命中跨区
    const res = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'cr1').send({ co: code, province: '北京', city: '北京' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.batch.chuanhuoHit, true, '应命中跨区');
    assert.equal(res.body.batch.crossRegion, 1, '码应被打标');

    // 同省不误判：省=广东 市=广州（市与限购市 深圳 不一致也应命中；这里验证省级通过、市级不一致仍命中）
    const res2 = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'cr2').send({ co: code, province: '广东', city: '广州' });
    assert.equal(res2.status, 200, JSON.stringify(res2.body));
    assert.equal(res2.body.batch.chuanhuoHit, true, '省同、市异应仍命中跨区');

    // 完全匹配：省=广东 市=深圳 → 不命中
    const res3 = await request(app).post(`/api/trace/public/verify?tid=${T}`).set('x-openid', 'cr3').send({ co: code, province: '广东', city: '深圳' });
    assert.equal(res3.status, 200, JSON.stringify(res3.body));
    assert.equal(res3.body.batch.chuanhuoHit, false, '省+市均匹配不应命中跨区');

    // 后台列表应汇总出 cross_region_count >= 1
    // 🔴 批次号会被码制归一化（如 CR01 → 000CR01），断言须用 endsWith 而非全等。
    const list = await auth(request(app).get('/api/customer/trace/batches'));
    const row = list.body.list.find((b) => String(b.batch).endsWith('CR01'));
    assert.ok(row && row.cross_region_count >= 1, `后台列表应显示窜货异常计数 (row=${JSON.stringify(row)})`);
  });
});
