/**
 * 回归锁：防伪溯源 P0/P1/P2 —— 印刷后锁死密钥 / 试印·演示分区 / 激活闸门（2026-10-29）
 *
 * 背景（对标系统补齐的三条强项）：
 *   P0 印刷后锁死密钥：正式印刷过码之后，k1~k4（校验密钥）与 m1~m5（码结构）都不可再改 ——
 *      改 k → 已印码校验位全错 → 消费者扫出来全是「已失效」；
 *      改 m2 → 批次段宽度变了 → 已印码切不出批次号 → 同样全废。
 *      （原实现只锁结构、明确写着「唯一能安全改的是 k」—— 恰恰说反了。）
 *   P1 演示/试印意图分区：试印码与正式码必须可区分 —— 走**流水号空间顶部预留段**，
 *      不扣库存、不锁码制、产出包带【演示·试印】标注、正式统计不含试印码。
 *   P2 激活闸门（先印后绑）：批次未被激活（经销商扫码绑定）之前，消费者扫码只得到
 *      「请联系经销商扫码激活」，看不到溯源详情（复用后台已有的 isjihuo 开关）。
 *
 * 钉死：
 *   1) 试印生成：demo_num 累加、num 不动、库存不扣、码制不锁
 *   2) 试印码流水号落在预留段（999000 起），且与正式码不撞号
 *   3) 试印码包带【演示·试印】标注；HTML 包带红色横幅
 *   4) 试印码 C 端验真返回 demo=true
 *   5) 正式生成后码制被锁（locked_at 非空），GET /code-rule 回传 locked=true
 *   6) 锁定后改 k1~k4 被拒、改 m1~m5 被拒、只改 zdl 允许
 *   7) 试印**不**触发锁定（试印的意义就是先试后定）
 *   8) 激活闸门：开启且未激活 → 403「尚未激活」；激活后放行
 *   9) 经销商凭口令自助激活；口令错误 403 且留痕
 *  10) 正式统计口径不含试印码（countTraceCodesGenerated 只算正式码）
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb, countTraceCodesGenerated, ensureTenantTraceRule, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';
import { DEMO_SERIAL_RESERVED, demoSerialBase } from '../src/services/traceCode.js';

describe('防伪溯源 P0/P1/P2：印刷锁定 / 试印分区 / 激活闸门', () => {
  let tmpDir, db, app, server;
  let tokenA, tokenB;

  const A = 941; // 试印 / 印刷锁定租户
  const B = 942; // 激活闸门租户

  const authA = (r) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r) => r.set('Authorization', `Bearer ${tokenB}`);

  const ruleOf = (t) => JSON.parse(db.prepare('SELECT rule_json FROM trace_code_rules WHERE tenant_id = ?').get(t)?.rule_json || '{}');
  const lockOf = (t) => String(db.prepare('SELECT locked_at FROM trace_code_rules WHERE tenant_id = ?').get(t)?.locked_at || '');
  const batchOf = (t, id) => db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(t, id);

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-gate-'));
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
    globalThis.__traceGatePrev = prev;

    const { hash, salt } = hashPassword('admin123');
    const insUser = db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)");
    insUser.run('tracePrintA', '13800000941', hash, salt, 'tenant_admin', A);
    insUser.run('tracePrintB', '13800000942', hash, salt, 'tenant_admin', B);
    const insProj = db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"trace\"]')");
    insProj.run(A, '印刷锁定租户');
    insProj.run(B, '激活闸门租户');

    tokenA = (await request(app).post('/api/auth/login').send({ username: 'tracePrintA', password: 'admin123' })).body.token;
    tokenB = (await request(app).post('/api/auth/login').send({ username: 'tracePrintB', password: 'admin123' })).body.token;

    // 🔴 码制播种：测试里直接 INSERT projects（不走 POST /projects）→ 建租户时的
    //    ensureTenantTraceRule 不会被调用 → 必须显式补播种，否则没有码制行，
    //    正式生成后的 locked_at 写不进去（UPDATE 影响 0 行 → 「生成了却没锁」）。
    ensureTenantTraceRule(db, A);
    ensureTenantTraceRule(db, B);

    // 库存给 100 条（试印不扣、正式要扣 → 便于断言库存变化）
    for (const t of [A, B]) {
      db.prepare('INSERT OR IGNORE INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
        .run(t, '{}', '{}', 100);
    }
  });

  after(() => {
    try { server?.close(); } catch {}
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, globalThis.__traceGatePrev);
  });

  /* ══════════════ P1 试印 / 演示分区 ══════════════ */

  it('P1 试印生成：不扣库存、不锁码制、demo_num 累加而 num 不动', async () => {
    const created = await authA(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'P1', product: '试印产品', factory: '厂', brand: '牌' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = Number(created.body.id);
    const cocomBefore = Number(db.prepare('SELECT cocom FROM trace_settings WHERE tenant_id = ?').get(A).cocom);

    const gen = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 5, demo: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    assert.equal(Number(gen.body.created), 5);
    assert.equal(gen.body.demo, true, '响应未标记 demo=true');

    const row = batchOf(A, id);
    assert.equal(Number(row.demo_num), 5, 'demo_num 未累加');
    assert.equal(Number(row.num), 0, '试印码不该计入正式 num');
    assert.equal(Number(db.prepare('SELECT cocom FROM trace_settings WHERE tenant_id = ?').get(A).cocom), cocomBefore, '试印扣了库存');
    assert.equal(lockOf(A), '', '试印把码制锁了 —— 试印的意义就是先试后定');
  });

  it('P1 试印码流水号落在预留段，且与正式码不撞号', async () => {
    const rule = ruleOf(A);
    const base = demoSerialBase(rule);
    assert.ok(base > 0, '码制流水号空间容不下试印号段');
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);

    const gen = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 3, demo: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    const lines = String(gen.body.content).split('\n').map((s) => s.trim()).filter(Boolean);
    const codeLines = lines.filter((l) => l.startsWith(rule.m['1']));
    assert.equal(codeLines.length, 3, `应产出 3 个码，实际 ${codeLines.length}：${lines.join(' | ')}`);
    for (const code of codeLines) {
      const serial = code.slice(rule.m['1'].length + rule.m['2'], rule.m['1'].length + rule.m['2'] + rule.m['3']);
      assert.ok(Number(serial) >= base, `试印码流水号 ${serial} 未落在预留段（${base} 起）`);
      assert.ok(Number(serial) < base + DEMO_SERIAL_RESERVED, `试印码流水号 ${serial} 越界`);
    }
  });

  it('P1 试印码包带【演示·试印】标注；HTML 包带红色横幅', async () => {
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);
    const txt = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 2, demo: 1 });
    assert.equal(txt.status, 200);
    assert.ok(String(txt.body.content).includes('【演示·试印】'), '文本码包缺【演示·试印】标注');
    assert.ok(String(txt.body.filename).startsWith('democode_'), `试印文件名未标记：${txt.body.filename}`);

    const html = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 2, codeno: 2, demo: 1 });
    assert.equal(html.status, 200);
    assert.ok(String(html.body.content).includes('demo-banner'), 'HTML 试印包缺红条');
    assert.ok(String(html.body.content).includes('【演示·试印】'), 'HTML 试印包缺标注');
    assert.ok(String(html.body.filename).startsWith('democode_'), `试印文件名未标记：${html.body.filename}`);
  });

  it('P1 试印码 C 端验真返回 demo=true（扫码一眼能分清试印品）', async () => {
    const rule = ruleOf(A);
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);
    const gen = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 1, demo: 1 });
    const code = String(gen.body.content).split('\n').map((s) => s.trim()).find((l) => l.startsWith(rule.m['1']));
    assert.ok(code, '没取到试印码');

    const verify = await request(app).post(`/api/trace/public/verify?tid=${A}`).send({ co: code });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.equal(verify.body.demo, true, '试印码验真未标记 demo=true');
    // 落库行必须打上 is_demo 标记（统计与结构锁都靠它排除试印码）
    const row = db.prepare('SELECT is_demo FROM trace_codes WHERE tenant_id = ? AND code = ?').get(A, code);
    assert.equal(Number(row?.is_demo), 1, '试印码落库未打 is_demo 标记');
  });

  it('P1 正式统计口径不含试印码（countTraceCodesGenerated 只算正式码）', async () => {
    // A 租户此刻只做过试印（且扫过 1 个试印码）→ 正式码计数必须为 0
    //    （否则试印码会触发码制结构锁，试印就失去「先试后定」的意义）
    assert.ok(Number(db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND is_demo = 1').get(A).c) >= 1, '试印码没落库');
    assert.equal(countTraceCodesGenerated(db, A), 0, '试印码被算进正式码计数了');
  });

  it('P1 试印模式不支持套标码型（明确拒绝，不静默降级）', async () => {
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 14, codeno: 1, demo: 1 });
    assert.equal(res.status, 400, '套标 + 试印被放行了');
    assert.ok(String(res.body.error).includes('试印'), `错误信息未说明原因：${res.body.error}`);
  });

  /* ══════════════ P0 印刷后锁死密钥 ══════════════ */

  it('P0 正式生成后码制被锁（locked_at 非空），GET /code-rule 回传 locked=true', async () => {
    const created = await authA(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'P0', product: '正式产品', factory: '厂', brand: '牌' });
    const id = Number(created.body.id);
    const gen = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 4 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));

    assert.notEqual(lockOf(A), '', '正式生成后码制没被锁');
    const cur = await authA(request(app).get('/api/customer/trace/code-rule'));
    assert.equal(cur.body.locked, true, 'GET /code-rule 未回传 locked=true');
    assert.ok(cur.body.lockedAt, 'GET /code-rule 未回传 lockedAt');

    // 批次列表也要带上锁定态（前端软引导用）
    const list = await authA(request(app).get('/api/customer/trace/batches'));
    assert.equal(list.body.ruleLocked, true, '批次列表未回传 ruleLocked');
  });

  it('P0 锁定后：改 k1~k4 被拒、改码制结构被拒、只改 zdl 允许', async () => {
    const cur = (await authA(request(app).get('/api/customer/trace/code-rule'))).body.rule;
    const flat = {
      m1: cur.m[1], m2: cur.m[2], m3: cur.m[3], m4: cur.m[4], m5: cur.m[5],
      k1: cur.k[1], k2: cur.k[2], k3: cur.k[3], k4: cur.k[4], k5: cur.k[5],
      zdl: cur.zdl,
    };

    // 换密钥 → 必须被拒（改了已印码校验位全错）
    const keyRes = await authA(request(app).put('/api/customer/trace/code-rule'))
      .send({ ...flat, k1: '9876543210' });
    assert.equal(keyRes.status, 400, '锁定后还能改 k1 —— 已印的码会全部验真失败');
    assert.ok(String(keyRes.body.error).includes('锁定'), `错误信息未说明是锁定态：${keyRes.body.error}`);

    // 改结构 → 必须被拒
    const structRes = await authA(request(app).put('/api/customer/trace/code-rule'))
      .send({ ...flat, m2: 8, m5: 21 });
    assert.equal(structRes.status, 400, '锁定后还能改码制结构');
    assert.ok(String(structRes.body.error).includes('锁定'), `错误信息未说明是锁定态：${structRes.body.error}`);

    // 只改错误次数上限 → 允许（不影响已印码验真）
    const soft = await authA(request(app).put('/api/customer/trace/code-rule')).send({ ...flat, zdl: 20 });
    assert.equal(soft.status, 200, JSON.stringify(soft.body));
  });

  /* ══════════════ P2 激活闸门（先印后绑） ══════════════ */

  it('P2 闸门关闭时正常验真（默认不拦截存量租户）', async () => {
    const created = await authB(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'P2A', product: '闸门产品', factory: '厂', brand: '牌' });
    const id = Number(created.body.id);
    const gen = await authB(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 2 });
    const code = String(gen.body.content).split('\n').map((s) => s.trim()).filter(Boolean)[0];

    const verify = await request(app).post(`/api/trace/public/verify?tid=${B}`).send({ co: code });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
  });

  it('P2 开闸后未激活批次 → 403「尚未激活」；后台激活后放行', async () => {
    const saved = await authB(request(app).put('/api/customer/trace/settings')).send({ settings: { isjihuo: 1 } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const created = await authB(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'P2B', product: '待激活产品', factory: '厂', brand: '牌' });
    const id = Number(created.body.id);
    const gen = await authB(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 2 });
    const code = String(gen.body.content).split('\n').map((s) => s.trim()).filter(Boolean)[0];

    const blocked = await request(app).post(`/api/trace/public/verify?tid=${B}`).send({ co: code });
    assert.equal(blocked.status, 403, `未激活批次未被闸门拦下：${JSON.stringify(blocked.body)}`);
    assert.ok(String(blocked.body.error).includes('未激活'), `提示语未说明未激活：${blocked.body.error}`);
    assert.ok(String(blocked.body.error).includes('经销商'), `提示语未指向经销商：${blocked.body.error}`);
    // 未激活的查询不该写进统计
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ?').get(B).c), 1, '未激活的查询仍被记入统计');

    const act = await authB(request(app).post(`/api/customer/trace/batches/${id}/activation`)).send({ remark: '测试激活' });
    assert.equal(act.status, 200, JSON.stringify(act.body));

    const ok = await request(app).post(`/api/trace/public/verify?tid=${B}`).send({ co: code });
    assert.equal(ok.status, 200, `激活后仍被拦：${JSON.stringify(ok.body)}`);
  });

  it('P2 经销商凭口令自助激活；口令错误 403 且留痕', async () => {
    const created = await authB(request(app).post('/api/customer/trace/batches'))
      .send({ batch: 'P2C', product: '经销商激活产品', factory: '厂', brand: '牌' });
    const id = Number(created.body.id);

    // 批次未设口令 → 拒绝
    const noPin = await request(app).post(`/api/trace/public/batch-activate?tid=${B}`).send({ batch: 'P2C', pin: 'ABCDEFGH' });
    assert.equal(noPin.status, 400, '没设口令却激活成功了');
    assert.ok(String(noPin.body.error).includes('未设置激活口令'), `错误信息未说明：${noPin.body.error}`);

    // 生成口令 → 明文只在本次响应里出现一次
    const pinRes = await authB(request(app).post(`/api/customer/trace/batches/${id}/activation-pin`)).send({});
    assert.equal(pinRes.status, 200, JSON.stringify(pinRes.body));
    const pin = String(pinRes.body.activatePin || '');
    assert.equal(pin.length, 8, `激活口令长度异常：${pin}`);
    // 库里存的是密文，不是明文
    const cipher = String(batchOf(B, id).activate_pin_cipher || '');
    assert.ok(cipher && cipher !== pin, '库里存的是明文口令');
    assert.ok(!cipher.includes(pin), '密文里含明文口令');

    // 回显只给掩码
    const st = await authB(request(app).get(`/api/customer/trace/batches/${id}/activation`));
    assert.equal(st.status, 200, JSON.stringify(st.body));
    assert.ok(st.body.hasPin, 'hasPin 未回传');
    assert.ok(st.body.activatePin.includes('****'), `回显未脱敏：${st.body.activatePin}`);

    // 口令错误 → 403 + 留痕
    const wrong = await request(app).post(`/api/trace/public/batch-activate?tid=${B}`).send({ batch: 'P2C', pin: 'ZZZZZZZZ' });
    assert.equal(wrong.status, 403, '错误口令竟然激活成功了');
    assert.ok(Number(db.prepare('SELECT COUNT(*) AS c FROM trace_wrong_attempts WHERE tenant_id = ? AND code LIKE ?').get(B, '[激活]%').c) >= 1, '错误口令未留痕');

    // 口令正确 → 激活成功
    const right = await request(app).post(`/api/trace/public/batch-activate?tid=${B}`).send({ batch: 'P2C', pin });
    assert.equal(right.status, 200, JSON.stringify(right.body));

    const st2 = await authB(request(app).get(`/api/customer/trace/batches/${id}/activation`));
    assert.equal(st2.body.activated, true, '激活态未回传');
    assert.equal(st2.body.source, 'dealer', `激活来源应为 dealer，实际 ${st2.body.source}`);
  });

  it('P2 撤销激活后闸门重新生效', async () => {
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(B, '经销商激活产品').id);
    const del = await authB(request(app).delete(`/api/customer/trace/batches/${id}/activation`));
    assert.equal(del.status, 200, JSON.stringify(del.body));
    const st = await authB(request(app).get(`/api/customer/trace/batches/${id}/activation`));
    assert.equal(st.body.activated, false, '撤销后仍是激活态');
  });

  /* ══════════════ 公众号带参二维码 48001 提示（路由层） ══════════════ */

  it('路由层：微信出码返回 48001 → HTTP 响应体带中文提示（不是裸 errcode）', async () => {
    // 背景：48001 = 带参二维码（永久码）只对「已认证服务号」开放，订阅号/未认证一律撞墙。
    //   原实现把 errcode 原样抛出（"微信接口失败(48001): api unauthorized"）→ 商户看不懂。
    //   这里从**路由层**钉死：中文提示必须穿透到响应体（服务层测过不够 —— 路由可能吞掉/改写）。
    const C = 943; // 公众号出码租户
    db.prepare("INSERT OR IGNORE INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', '[\"trace\"]')").run(C, '出码租户');
    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, ?, 'active', ?)")
      .run('traceMp', '13800000943', hash, salt, 'tenant_admin', C);
    const tokenC = (await request(app).post('/api/auth/login').send({ username: 'traceMp', password: 'admin123' })).body.token;
    const authC = (r) => r.set('Authorization', `Bearer ${tokenC}`);

    ensureTenantTraceRule(db, C);
    db.prepare('INSERT OR IGNORE INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))').run(C, '{}', '{}', 100);
    // 手动对接模式公众号（填了 app_secret 即视为已配置，出码链路会真的去调微信）
    db.prepare("INSERT OR IGNORE INTO channel_apps (customer_id, channel_type, appid, app_secret, auth_status, enabled) VALUES (?, 'mp', 'wxTESTAPPID0001', 'test-secret', 'none', 1)").run(C);

    // 造一个属于本租户的真实码（走正式生成 → 拿到合法 SN）
    const batchId = Number((await authC(request(app).post('/api/customer/trace/batches')).send({ batch: 'MP1', product: '出码产品' })).body.id);
    const gen = await authC(request(app).post(`/api/customer/trace/batches/${batchId}/generate-codes`)).send({ codetype: 6, codeno: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    const code = String(gen.body.content || '').trim().split(/\s+/)[0];

    // 拦微信接口：token 请求给一个能过的假 token，qrcode/create 返 48001
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/cgi-bin/token')) {
        return new Response(JSON.stringify({ access_token: 'FAKE_TOKEN', expires_in: 7200 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/cgi-bin/qrcode/create')) {
        return new Response(JSON.stringify({ errcode: 48001, errmsg: 'api unauthorized' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return origFetch(url, opts);
    };
    try {
      const res = await authC(request(app).post(`/api/customer/trace/codes/${encodeURIComponent(code)}/mp-qr`)).send({ code });
      assert.equal(res.status, 400, `应回 400，实际 ${res.status}`);
      const msg = String(res.body?.message || res.body?.error || res.body?.msg || '');
      assert.ok(msg, '响应体没有错误消息');
      assert.match(msg, /未授权|48001/, `中文提示未穿透到响应体，实际消息：${msg}`);
      assert.doesNotMatch(msg, /^微信接口失败\(48001\)/, '仍在抛原始 errcode 串，未做中文转译');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  /* ══════════════ 码包 ZIP 导出（对齐对标的 application/zip 交付） ══════════════ */

  it('ZIP 导出：产出标准 zip（可解压、内容与原始文件一致）', async () => {
    // 背景：对标系统的码包下载就是 application/zip（$zip->addFile + Content-Type: application/zip）。
    //   大批量（上万码）时单 txt 在部分 IM/邮件客户端会被截断 → 打包更稳。
    //   本实现零新依赖（services/zip.js 手写 store 模式 zip）→ 不给部署面加风险。
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);

    // ① 路由层：generate-codes?format=zip → 返回 base64 + application/zip
    const gen = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 6, codeno: 3, demo: 1, format: 'zip' });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    assert.equal(gen.body.contentType, 'application/zip');
    assert.equal(gen.body.encoding, 'base64', 'zip 内容未标 base64 编码（前端会当文本存 → 打不开）');
    assert.ok(String(gen.body.filename).endsWith('.zip'), `zip 文件名不对：${gen.body.filename}`);

    const buf = Buffer.from(String(gen.body.content), 'base64');
    assert.equal(buf.subarray(0, 4).toString('hex'), '504b0304', 'zip 魔数不对（不是 PK\\x03\\x04）');

    // ② 结构层：EOCD 存在 → 中央目录完整
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    assert.ok(eocd > 0, '缺 EOCD 记录（zip 中央目录未闭合）');

    // ③ 内容层：用本仓库自己的解包逻辑反解 → 内容与 zip 内声明一致
    const { readZipEntry } = await import('../src/services/zip.js');
    const entry = readZipEntry(buf);
    assert.ok(entry, '解包失败');
    assert.ok(entry.name.startsWith('democode_'), `zip 内文件名不对：${entry.name}`);
    assert.ok(entry.text.includes('【演示·试印】'), 'zip 内内容丢了试印标注');
    assert.equal(entry.text.split('\n').filter((l) => l.trim()).length >= 3, true, 'zip 内码数量不对');
  });

  it('ZIP 导出：/export?format=zip 走真实文件下载（Content-Type + Content-Disposition）', async () => {
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);
    const res = await authA(request(app).get(`/api/customer/trace/batches/${id}/export?format=zip&codetype=6&codeno=2&demo=1`));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(String(res.headers['content-type']), /application\/zip/);
    assert.match(String(res.headers['content-disposition']), /\.zip"/);
    // 🔴 supertest 默认按 utf8 解析 body → 二进制 zip 会被破坏。
    //    必须用 .buffer() 拿到原始字节（binary parser），不能用 res.body。
    const raw = await authA(request(app).get(`/api/customer/trace/batches/${id}/export?format=zip&codetype=6&codeno=2&demo=1`))
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(raw.status, 200);
    assert.equal(raw.body.subarray(0, 4).toString('hex'), '504b0304', '导出内容不是 zip');
    const { readZipEntry } = await import('../src/services/zip.js');
    const entry = readZipEntry(raw.body);
    assert.ok(entry?.crcOk, 'zip 内容 CRC 校验失败');
  });

  /* ══════════════ 印刷链路（交印刷厂前的自检） ══════════════ */

  it('印刷链路：HTML 码包内联 SVG（非外链）+ 印明文码 + 显式写出扫码地址', async () => {
    // 背景：码包是交印刷厂印在包装上的。三个硬要求：
    //   ① 二维码必须是**内联**（data URI）—— 印刷厂的机器不访问我们的服务器，
    //      外链图在对方机器上就是裂图（对标用微擎框架的 url2qr 端点，依赖服务端渲染）。
    //   ② 码面下方要印**明文码** —— 码磨损/反光时消费者还能手输。
    //   ③ 要显式写出**扫码地址** —— URL 配错是印完才发现的事故，页面提示是最便宜的拦截点。
    const id = Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND product = ?').get(A, '试印产品').id);
    const res = await authA(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`))
      .send({ codetype: 2, codeno: 2, demo: 1 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const html = String(res.body.content);

    // ① 内联 SVG，且不含任何外链图片 / PHP 端点
    const inlined = html.match(/data:image\/svg\+xml;base64,/g) || [];
    assert.ok(inlined.length >= 2, `内联二维码数量不对：${inlined.length}`);
    assert.doesNotMatch(html, /index\.php|url2qr/, '码包里残留服务端图片端点（印刷厂机器取不到 → 裂图）');
    assert.doesNotMatch(html, /<img[^>]+src=["']http/i, '码包里存在外链图片（印刷场景必裂）');

    // ② 明文码印在码面下方
    assert.match(html, /class="code"/, '码面下方未印明文码');

    // ③ 扫码地址显式写出，且必须与二维码实际指向同源（同为绝对地址）
    assert.match(html, /class="scan-tip"/, '码包未显式写出扫码地址');
    assert.match(html, /扫码地址/, '扫码地址提示文案缺失');
    // 提示里的基址必须能在二维码内容里找到（同一 origin）
    const tip = html.match(/扫码地址（消费者扫码后打开）：([^<]+)</);
    assert.ok(tip, '未解析到扫码地址');
    const base = String(tip[1]).trim();
    assert.match(base, /^https?:\/\//, `扫码地址不是绝对地址：${base}`);
  });

  /* ══════════════ 扫码地址状态接口（G4） ══════════════ */

  it('GET /scan-url：回传扫码地址与是否绝对（后台生成前给商家看）', async () => {
    // 🔴 URL 配错是「印完才发现」的事故（印 10 万个码扫出来打不开 = 全废）→
    //    必须在生成前把地址摆出来。absolute 必须是布尔，previewUrl 必须是绝对地址。
    const res = await authA(request(app).get('/api/customer/trace/scan-url'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body.absolute, 'boolean', 'absolute 未回传布尔值');
    assert.equal(res.body.absolute, true, '测试环境有 host 头 → 应判定为绝对地址');
    assert.match(String(res.body.previewUrl), /^https?:\/\//, `previewUrl 不是绝对地址：${res.body.previewUrl}`);
    assert.ok(String(res.body.previewUrl).includes('/card/#/pages/trace/index'), 'previewUrl 路径不对');
    assert.ok(String(res.body.hint).length > 0, '未回传提示文案');
  });

  /* ══════════════ 批量激活（G3） ══════════════ */

  it('批量激活：必须 confirm=true；勾选即激活；返回逐个明细', async () => {
    // 🔴 激活 = 放行消费者看溯源详情 → 误激活等于没设防。
    //    故：① 缺 confirm 直接拒（防绕过前端直接调接口）；② 逐个批次返回成功/失败明细。
    const ids = [];
    // 🔴 批次号必须符合码制（normalizeBatchNo 会校验）→ 用纯字母数字，
    //    中文批次号会被服务端拒掉（曾因此拿到 undefined id → ids=[null,null,null]）。
    for (const bn of ['BATCHA', 'BATCHB', 'BATCHC']) {
      const r = await authA(request(app).post('/api/customer/trace/batches')).send({ batch: bn, product: `批量${bn}` });
      assert.equal(r.status, 200, `批次创建失败：${JSON.stringify(r.body)}`);
      assert.ok(Number(r.body.id) > 0, '批次未返回 id');
      ids.push(Number(r.body.id));
    }
    // 闸门打开（否则闸门语义不同，但激活接口本身仍应工作）
    db.prepare("UPDATE trace_settings SET settings_json = ?, updated_at = datetime('now') WHERE tenant_id = ?")
      .run(JSON.stringify({ isjihuo: 1 }), A);

    // 缺 confirm → 拒
    const noConfirm = await authA(request(app).post('/api/customer/trace/batches/activate-batch')).send({ ids });
    assert.equal(noConfirm.status, 400, '缺 confirm 却执行了批量激活（危险）');

    // 空 ids → 拒
    const empty = await authA(request(app).post('/api/customer/trace/batches/activate-batch')).send({ ids: [], confirm: true });
    assert.equal(empty.status, 400, '空 ids 却执行了');

    // 正常批量 → 成功
    const ok = await authA(request(app).post('/api/customer/trace/batches/activate-batch')).send({ ids, confirm: true });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(Number(ok.body.success), 3, `成功数不对：${JSON.stringify(ok.body)}`);
    assert.equal(Number(ok.body.total), 3);
    assert.equal(Array.isArray(ok.body.detail), true, '未回传逐个明细');
    assert.equal(ok.body.detail.filter((d) => d.ok).length, 3);

    // 落库验证：3 个批次都进了 trace_activations
    const cnt = Number(db.prepare('SELECT COUNT(*) AS c FROM trace_activations WHERE tenant_id = ?').get(A).c);
    assert.ok(cnt >= 3, `trace_activations 只落了 ${cnt} 行`);

    // 不存在的 id → 单个失败但不影响其他（部分成功语义）
    const partial = await authA(request(app).post('/api/customer/trace/batches/activate-batch')).send({ ids: [...ids, 999999], confirm: true });
    assert.equal(partial.status, 200);
    assert.equal(Number(partial.body.success), 3, '已存在批次被重复激活统计错');
    assert.equal(Number(partial.body.failed), 1, '不存在的批次未计入失败');
    const badItem = partial.body.detail.find((d) => Number(d.id) === 999999);
    assert.equal(badItem.ok, false);
    assert.ok(String(badItem.reason || '').length > 0, '失败项未给原因');
  });
});
