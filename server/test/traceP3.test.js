/**
 * P3 回归：扫码查询方案「按批次冻结」（#520）+ 独立活动广告位（#522）。
 *
 * 覆盖：
 *   1) 默认跟随：批次未冻结 → 验真响应带当前全局档位（保留今天的行为）
 *   2) 冻结生效：scan_mode_follow=0 → 用本批次出码时记录的 print_scan_mode
 *   3) 冻结但无记录（老批次从未出码）→ 回落当前档位（不能一刀切把老批次打死）
 *   4) 出码时把当时方案写进 print_scan_mode（冻结的数据源必须真的被写，否则冻结是空开关）
 *   5) 后台能改冻结开关（PUT /batches/:id 真的落库）
 *   6) 活动位：[FWM]→防伪码、[KEY]→linkKey 变量替换
 *   7) 活动位未启用 → 不下发（防「空头开关」）
 *   8) 活动位展示时机 when 门控（仅首次 / 仅非首次）
 *   9) 活动位独立于首页展示位（不进 slots 数组，不占 8 位上限）
 *
 * 🔴 路由前缀别搞错：公开段挂 /api/trace，后台段挂 /api/customer/trace（对齐 customerApiCall 的 baseURL）。
 * 🔴 同一 openid 对同一码有 21 秒去重窗口 → 「第二次查询」必须换一个 openid（用 oc 凭据模拟不同访客），
 *    否则 num 不递增、first 恒为 true，"仅非首次展示" 这类断言会假绿。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb, hashPassword } from '../src/db.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import { computeTraceCode, DEFAULT_CODESET } from '../src/services/traceCode.js';
import { issueOpenidTicket } from '../src/services/traceOauth.js';

const TID = 89;
const RULE = { m: { 1: 'FW', 2: 7, 3: 6, 4: 5, 5: 20 }, k: { ...DEFAULT_CODESET.k } };
const BATCH_A = '0765432'; // 冻结开关用例
const BATCH_B = '0765433'; // 活动位变量替换 / 独立性用例
const BATCH_C = '0765434'; // 出码记录方案用例
const BATCH_D = '0765435'; // 活动位展示时机用例（必须是全新批次：首查状态会被前面的用例消耗掉）
const codeOf = (batch) => computeTraceCode(`FW${batch}00000100000`, RULE);

describe('P3：扫码方案按批次冻结 + 独立活动广告位', () => {
  let tmpDir, db, app, prevConfig, token;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-p3-'));
    prevConfig = { ...config };
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

    db.prepare('INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, ?, ?)')
      .run(TID, 'P3 测试租户', 'active', '["trace"]');
    db.prepare('INSERT INTO trace_code_rules (tenant_id, m1, rule_json) VALUES (?, ?, ?)')
      .run(TID, 'FW', JSON.stringify(RULE));
    for (const b of [BATCH_A, BATCH_B, BATCH_C, BATCH_D]) {
      db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, is_active, rcon)
        VALUES (?, 'FW', ?, '测试商品', '测试厂', '测试牌', 1, 0)`).run(TID, b);
    }
    db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, cocom) VALUES (?, ?, -888)`)
      .run(TID, JSON.stringify({ scanMode: 'web' }));

    const { hash, salt } = hashPassword('admin123');
    db.prepare("INSERT OR IGNORE INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?, ?, ?, ?, 'tenant_admin', 'active', ?)")
      .run('traceP3', '13800008889', hash, salt, TID);
    const login = await request(app).post('/api/auth/login').send({ username: 'traceP3', password: 'admin123' });
    token = login.body.token;
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    Object.assign(config, prevConfig);
  });

  /** 直接改 settings_json（模拟商户在后台改了全局方案 / 活动配置） */
  const setSettings = (obj) => {
    db.prepare('UPDATE trace_settings SET settings_json = ? WHERE tenant_id = ?').run(JSON.stringify(obj), TID);
  };
  const getSettings = () => JSON.parse(db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(TID).settings_json);
  const authed = (req) => req.set('Authorization', `Bearer ${token}`);
  const batchId = (no) => Number(db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND batch = ?').get(TID, no).id);
  const verify = (code, extra = {}) => request(app).post(`/api/trace/public/verify?tid=${TID}`).send({ co: code, ...extra });
  /** 不同访客（不同 openid）→ 绕开 21 秒去重窗口，num 才会真的递增 */
  const visitor = (openid) => ({ oc: issueOpenidTicket(TID, openid) });

  test('① 默认跟随：未冻结的批次用当前全局档位', async () => {
    setSettings({ scanMode: 'push_dynamic' });
    const res = await verify(codeOf(BATCH_A));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.scanMode, 'push_dynamic');
  });

  test('② 冻结生效：follow=0 时用本批次记录的方案，不受全局改动影响', async () => {
    setSettings({ scanMode: 'web' });
    db.prepare('UPDATE trace_batches SET scan_mode_follow = 0, print_scan_mode = ? WHERE tenant_id = ? AND batch = ?')
      .run('push_permanent', TID, BATCH_A);
    const res = await verify(codeOf(BATCH_A));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.scanMode, 'push_permanent', '冻结后必须用批次记录值，而不是当前全局设置');
  });

  test('③ 冻结但无记录（老批次从未出码）→ 回落当前档位，不把老批次打死', async () => {
    setSettings({ scanMode: 'push_dynamic' });
    db.prepare('UPDATE trace_batches SET scan_mode_follow = 0, print_scan_mode = ? WHERE tenant_id = ? AND batch = ?')
      .run('', TID, BATCH_A);
    const res = await verify(codeOf(BATCH_A));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.scanMode, 'push_dynamic');
  });

  test('④ 出码时把当时方案写进 print_scan_mode（冻结的数据源必须真被写）', async () => {
    setSettings({ scanMode: 'push_dynamic' });
    const id = batchId(BATCH_C);
    const gen = await authed(request(app).post(`/api/customer/trace/batches/${id}/generate-codes`)).send({ codetype: 1, codeno: 1 });
    assert.equal(gen.status, 200, JSON.stringify(gen.body));
    const row = db.prepare('SELECT print_scan_mode FROM trace_batches WHERE id = ?').get(id);
    assert.equal(row.print_scan_mode, 'push_dynamic', '出码时未记录当时方案 → 冻结开关会变成空开关');

    // 记录之后再改全局档位 → 冻结批次仍按记录走
    setSettings({ scanMode: 'web' });
    db.prepare('UPDATE trace_batches SET scan_mode_follow = 0 WHERE id = ?').run(id);
    const res = await verify(codeOf(BATCH_C));
    assert.equal(res.body.scanMode, 'push_dynamic');
  });

  test('⑤ 后台改冻结开关真的落库（PUT /batches/:id）', async () => {
    const id = batchId(BATCH_A);
    const r = await authed(request(app).put(`/api/customer/trace/batches/${id}`)).send({
      product: '测试商品', scanModeFollow: 0, printScanMode: 'web',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = db.prepare('SELECT scan_mode_follow, print_scan_mode FROM trace_batches WHERE id = ?').get(id);
    assert.equal(Number(row.scan_mode_follow), 0);
    assert.equal(row.print_scan_mode, 'web');
  });

  test('⑥ 活动位：[FWM]→防伪码、[KEY]→linkKey 替换', async () => {
    setSettings({
      scanMode: 'web',
      activity: {
        enabled: true,
        cover: 'https://cdn.example.com/act.png',
        title: '活动 [KEY] 码 [FWM]',
        link: 'https://example.com/act?c=[FWM]&k=[KEY]',
        linkKey: 'ANNIV2026',
        when: 0,
      },
    });
    const code = codeOf(BATCH_B);
    const res = await verify(code, visitor('visitor-1'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const act = res.body.activity;
    assert.ok(act, '活动位启用后必须下发');
    assert.equal(act.enabled, true);
    assert.equal(act.cover, 'https://cdn.example.com/act.png');
    assert.ok(act.title.includes('ANNIV2026'), `[KEY] 未替换：${act.title}`);
    assert.ok(act.title.includes(code), `[FWM] 未替换：${act.title}`);
    assert.ok(act.link.includes(code), `链接里的 [FWM] 未替换：${act.link}`);
    assert.ok(act.link.includes('ANNIV2026'), `链接里的 [KEY] 未替换：${act.link}`);
  });

  test('⑦ 活动位未启用 → 不下发（防空头开关）', async () => {
    setSettings({ scanMode: 'web', activity: { enabled: false, title: '不该出现', link: 'x' } });
    const res = await verify(codeOf(BATCH_B), visitor('visitor-2'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.activity, null);
  });

  test('⑧ 活动位展示时机 when：仅首次显示 / 仅非首次显示', async () => {
    // 🔴 必须用全新批次：前面用例已经查过 BATCH_B 的码，它的 num 已 >1，
    //    再拿它断言「首次查询」会假失败（首查状态被前面的用例消耗掉了）。
    const code = codeOf(BATCH_D);
    // 仅首次：首查有 → 换一个访客复访（num 递增 → 非首查）就没有
    setSettings({ scanMode: 'web', activity: { enabled: true, title: '首查活动', link: 'x', when: 1 } });
    const first = await verify(code, visitor('visitor-3'));
    assert.ok(first.body.activity, '首次查询应展示活动位');
    const second = await verify(code, visitor('visitor-4'));
    assert.equal(second.body.activity, null, '非首次查询不应展示（when=1）');
    // 仅非首次：复访才有
    setSettings({ scanMode: 'web', activity: { enabled: true, title: '复访活动', link: 'x', when: 2 } });
    const third = await verify(code, visitor('visitor-5'));
    assert.ok(third.body.activity, '非首次查询应展示活动位（when=2）');
  });

  test('⑨ 活动位独立于首页展示位（不进 slots 数组、不占 8 位上限）', async () => {
    setSettings({
      scanMode: 'web',
      displaySlots: [],
      activity: { enabled: true, title: '独立活动位', link: 'x', when: 0 },
    });
    const res = await verify(codeOf(BATCH_B), visitor('visitor-6'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.slots, [], '活动位不该混进首页展示位数组');
    assert.ok(res.body.activity, '活动位必须独立下发');
  });

  test('⑩ 活动配置能经后台接口存进 settings（泛型 JSON，无需改表结构）', async () => {
    const activity = { enabled: true, cover: '', title: '接口保存的活动', link: 'https://x.com/[FWM]', linkKey: 'K1', when: 1 };
    const r = await authed(request(app).put('/api/customer/trace/settings')).send({ settings: { scanMode: 'web', activity } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(getSettings().activity, activity, '活动位配置没有真的落库');
    const back = await authed(request(app).get('/api/customer/trace/settings'));
    assert.equal(back.status, 200);
    assert.deepEqual(back.body.settings.activity, activity, '回读不到活动位配置 → 后台界面会显示空白');
  });
});
