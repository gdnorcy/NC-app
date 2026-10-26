import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { levelBenefitsPreview, mallDiscountText } from '../src/services/member.js';
import { issueToken } from '../src/auth.js';

/**
 * 档位权益预览回归锁（🔴 2026-10-27 用户报修「切换档位卡片看不到其他级别的权益」）：
 *   权益区此前只显示当前档实况（appBenefits 含已用量），点黄金/钻石档看不到升级能解锁什么。
 *   修复 = /member/status 一并下发 levelBenefits（全档位 × 应用预览），C 端切档即时切换。
 * 这里钉死：
 *   ① levelBenefitsPreview：每启用档一份按应用分组快照，矩阵覆盖生效、无 used 字段
 *   ② 预览与矩阵配置逐项一致（读矩阵行 → 预览值必须等于配置值）
 *   ③ 高档位比低档位的权益在预览中可区分（切档对比有信息量）
 *   ④ /member/status 下发 levelBenefits（按档位 id 键控）
 *   ⑤ 无租户 / 无档位 → null；mallDiscountText 折扣文案口径（两处共用，防漂移）
 */

let app;
let tmpDir;
let db;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-lvlprev-test-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
  db = createDb(config.dbPath);

  const { hash, salt } = hashPassword('Test@123');
  const info = db.prepare(
    "INSERT INTO users (username, phone, password_hash, password_salt, role, status) VALUES (?,?,?,?,?,?)"
  ).run('lvlprev_adm', '13800000090', hash, salt, 'admin', 'active');
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  globalThis.__lvlprevAdminToken = issueToken(admin);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function login(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  db.prepare('UPDATE platform_user SET customer_id = 1 WHERE id = ?').run(
    JSON.parse(Buffer.from(res.body.token.split('.')[0], 'base64').toString()).uid
  );
  return res.body.token;
}

test('mallDiscountText：折扣文案口径（appBenefits 实况与档位预览共用，防两处漂移）', () => {
  assert.equal(mallDiscountText(0), '无折扣');
  assert.equal(mallDiscountText(10), '9 折');
  assert.equal(mallDiscountText(80), '2 折');
  assert.equal(mallDiscountText(15), '8.5 折');
  assert.equal(mallDiscountText(100), '无折扣');
});

test('levelBenefitsPreview：每启用档一份按应用分组快照，预览项无已用量字段', () => {
  const prev = levelBenefitsPreview(db, 1);
  assert.ok(prev && typeof prev === 'object', '租户 1（播种标准档）应出预览');
  const ids = Object.keys(prev);
  assert.ok(ids.length >= 4, `标准播种应有 ≥4 档，实际 ${ids.length}`);
  for (const id of ids) {
    const apps = prev[id];
    assert.ok(Array.isArray(apps) && apps.length >= 4, '每档应按应用分组（至少 card/member/mall/radar）');
    for (const a of apps) {
      assert.ok(a.stats && a.stats.total > 0, '应有分组统计');
      for (const it of a.items) {
        assert.ok(!('used' in it), '预览项不应带已用量（used 无意义）');
        assert.ok(it.displayLabel, '应有 C 端展示名');
        assert.equal(typeof it.valueText, 'string', '应有服务端算好的展示值');
      }
    }
  }
});

test('levelBenefitsPreview：预览值与矩阵配置逐项一致（读矩阵行 → 预览必须兑现）', () => {
  const prev = levelBenefitsPreview(db, 1);
  const levels = db.prepare("SELECT id, pkg_level FROM member_levels WHERE tenant_id = 1 AND status = 1").all();
  assert.ok(levels.length >= 4);
  for (const lv of levels) {
    const apps = prev[lv.id];
    assert.ok(apps, `档位 ${lv.pkg_level || lv.id} 应有预览`);
    const rows = db.prepare('SELECT app_code, benefits FROM member_level_app_benefits WHERE tenant_id = 1 AND level_id = ?').all(lv.id);
    for (const row of rows) {
      const app = apps.find((a) => a.code === row.app_code);
      assert.ok(app, `档位 ${lv.pkg_level} 的 ${row.app_code} 应用应有预览分组`);
      const cfg = JSON.parse(row.benefits || '{}');
      for (const [type, val] of Object.entries(cfg)) {
        const item = app.items.find((i) => i.type === type);
        assert.ok(item, `档位 ${lv.pkg_level} 的 ${type} 应在预览中`);
        // 🔴 矩阵原始值经 castBenefit 按 kind 还原（switch: 0→false），与实况 appBenefits 同口径，
        //    断言按 kind 归一后再比
        const expected = item.kind === 'switch' ? !!val : val;
        assert.equal(item.value, expected, `档位 ${lv.pkg_level}.${type} 预览值应等于矩阵配置`);
      }
    }
  }
});

test('levelBenefitsPreview：高档位权益在预览中可区分（切档对比有信息量）', () => {
  const prev = levelBenefitsPreview(db, 1);
  const byPkg = {};
  for (const lv of db.prepare("SELECT id, pkg_level FROM member_levels WHERE tenant_id = 1 AND status = 1 AND pkg_level IS NOT NULL").all()) {
    byPkg[lv.pkg_level] = prev[lv.id];
  }
  assert.ok(byPkg.free && byPkg.diamond, '标准档 free/diamond 应已播种');
  const freeWorks = byPkg.free.find((a) => a.code === 'card').items.find((i) => i.type === 'works_limit');
  const diaWorks = byPkg.diamond.find((a) => a.code === 'card').items.find((i) => i.type === 'works_limit');
  assert.ok(diaWorks.value > freeWorks.value, `钻石作品上限(${diaWorks.value})应高于免费版(${freeWorks.value})`);
  const diaVoice = byPkg.diamond.find((a) => a.code === 'card').items.find((i) => i.type === 'voice_enabled');
  assert.equal(diaVoice.value, true, '钻石语音应开');
  assert.equal(diaVoice.valueText, '已开通');
});

test('/member/status 下发 levelBenefits（按档位 id 键控，与 appBenefits 同响应）', async () => {
  const token = await login('lvlprev_status_1');
  const res = await request(app).get('/api/card/member/status').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.appBenefits && res.body.appBenefits.length >= 4, '实况快照应在');
  const prev = res.body.levelBenefits;
  assert.ok(prev && typeof prev === 'object', '应下发档位预览');
  const ids = Object.keys(prev);
  assert.ok(ids.length >= 4, '应含全部启用档位');
  // 预览与实况同 code 集合（前端按 code 合并应用名/图标的契约）
  const prevCodes = new Set(prev[ids[0]].map((a) => a.code));
  const liveCodes = new Set(res.body.appBenefits.map((a) => a.code));
  assert.deepEqual([...prevCodes].sort(), [...liveCodes].sort(), '预览与实况的应用分组应一致');
});

test('levelBenefitsPreview：无租户 / 无档位 → null', () => {
  assert.equal(levelBenefitsPreview(db, 0), null);
  assert.equal(levelBenefitsPreview(db, null), null);
  assert.equal(levelBenefitsPreview(db, 999999), null, '不存在租户无档位 → null');
});
