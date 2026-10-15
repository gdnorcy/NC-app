import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb, hashPassword } from '../src/db.js';
import { issueToken } from '../src/auth.js';

/**
 * 品牌主色回归（2026-10-15 真机报修：「品牌主色设置无效」）：
 * 1. 后台 PUT /config 保存 5 色 + 空串清除（与设计中心 STYLE_SCHEMES 语义对应）；
 * 2. 名片出口 toCard 输出 brandColors 5 键；
 * 3. join 经 card_profile.customer_id 命中租户配置（无 tenant_individuals/employees 行也能拿到）；
 * 4. 模板兜底「让位」品牌色：配了品牌色时 templateTheme 不套默认模板（否则 brandColor 成死代码）；
 * 5. 无品牌色时兜底默认模板仍生效（旧名片不落空白默认）；
 * 6. 🔴 join 落空兜底：完全无租户关联（card_profile.customer_id=null、无 tenant 行、platform_user.customer_id=null）
 *    的孤儿名片，也必须回落默认项目品牌色，否则 brandColors 全空 → C 端回落设计中心主题色（真机报修「设了品牌仍跟随系统配色」）。
 */

let app;
let tmpDir;
let db;

function bearer(token) { return { Authorization: `Bearer ${token}` }; }
function makeJwt(user) { return issueToken(user); }

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}
function adminToken() {
  const u = db.prepare("SELECT * FROM users WHERE role = 'tenant_admin' AND customer_id = 1").get();
  return makeJwt(u);
}
function setProjectConfig(obj) {
  db.prepare("UPDATE projects SET config = ? WHERE id = 1").run(JSON.stringify(obj));
}
function getProjectConfig() {
  const row = db.prepare('SELECT config FROM projects WHERE id = 1').get();
  return JSON.parse(row.config || '{}');
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-brand-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  db = createDb(config.dbPath);
  app = createApp({ db });
  const { hash, salt } = hashPassword('Test@123');
  db.prepare('INSERT INTO users (username, phone, password_hash, password_salt, role, status, customer_id) VALUES (?,?,?,?,?,?,?)')
    .run('brand_adm', '13800000041', hash, salt, 'tenant_admin', 'active', 1);
  // 播种平台默认模板（生产库由种子脚本写入；测试库需自建，否则 toCard 兜底无对象）
  db.prepare("INSERT INTO card_templates (tenant_id, name, theme_config, is_default, enabled) VALUES (0, '默认模板', ?, 1, 1)")
    .run(JSON.stringify({ bgStart: '#222222', textColor: '#ffffff' }));
  // 确保 project 1 存在且默认无品牌色
  setProjectConfig({ brand_color: '' });
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('PUT /config 保存品牌 5 色 + 空串清除', async () => {
  const brand = { brand_color: '#FA8C16', brand_gradient: '#FFD8A8', brand_secondary: '#FFE8D6', brand_text: '#3a2a1a', brand_subtext: '#7a5c3a' };
  const put = await request(app).put('/api/customer/config').set(bearer(adminToken())).send(brand);
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const cfg = getProjectConfig();
  assert.equal(cfg.brand_color, '#FA8C16');
  assert.equal(cfg.brand_gradient, '#FFD8A8');
  assert.equal(cfg.brand_subtext, '#7a5c3a');

  const put2 = await request(app).put('/api/customer/config').set(bearer(adminToken())).send({ brand_color: '' });
  assert.equal(put2.status, 200);
  assert.equal(getProjectConfig().brand_color, '');
});

// 建一个无 tenant_individuals/employees 行、但 card_profile.customer_id=1 的名片用户
async function makeCustomerIdUser(openid) {
  const token = await wxLogin(openid);
  const u = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('mock_' + openid);
  // 清掉可能自动建的租户行，制造「仅靠 card_profile.customer_id 命中」场景
  db.prepare('DELETE FROM tenant_individuals WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM tenant_enterprise_employees WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM card_profile WHERE user_id = ?').run(u.id);
  db.prepare('INSERT INTO card_profile (user_id, name, customer_id) VALUES (?, ?, 1)').run(u.id, '品牌卡用户');
  return token;
}

test('join 经 card_profile.customer_id 命中租户品牌色（无 tenant 行也能拿到）', async () => {
  setProjectConfig({ brand_color: '#FA8C16', brand_gradient: '#FFD8A8', brand_secondary: '#FFE8D6', brand_text: '#3a2a1a', brand_subtext: '#7a5c3a' });
  const token = await makeCustomerIdUser('cust_cid');
  const res = await request(app).get('/api/card/user/profile').set(bearer(token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const c = res.body.card;
  assert.ok(c, '应有名片');
  assert.equal(c.brandColor, '#FA8C16', 'brandColor 应来自 project 1 配置');
  assert.equal(c.brandColors.primary, '#FA8C16');
  assert.equal(c.brandColors.gradient, '#FFD8A8');
  assert.equal(c.brandColors.secondary, '#FFE8D6');
  assert.equal(c.brandColors.text, '#3a2a1a');
  assert.equal(c.brandColors.subText, '#7a5c3a');
});

test('模板兜底「让位」品牌色：配了品牌色时 templateTheme 不套默认模板', async () => {
  setProjectConfig({ brand_color: '#FA8C16', brand_gradient: '#FFD8A8' });
  const token = await makeCustomerIdUser('cust_yield');
  const res = await request(app).get('/api/card/user/profile').set(bearer(token));
  const c = res.body.card;
  // 品牌色已配且未自选模板 → 兜底默认模板必须让位，C 端 hero 才能走品牌色
  assert.equal(c.brandColor, '#FA8C16');
  assert.equal(c.templateTheme, null, '品牌色接管时 templateTheme 应为 null（否则 brandColor 成死代码）');
});

test('无品牌色时兜底默认模板仍生效（旧名片不落空白默认）', async () => {
  setProjectConfig({ brand_color: '' });
  const token = await makeCustomerIdUser('cust_nobrand');
  const res = await request(app).get('/api/card/user/profile').set(bearer(token));
  const c = res.body.card;
  assert.equal(c.brandColor, '');
  assert.ok(c.templateTheme, '无品牌色时应回退平台默认模板（templateTheme 非空）');
});

// 建一个「完全无租户关联」的孤儿名片：card_profile.customer_id=NULL、无 tenant 行、
// platform_user.customer_id=NULL —— 复刻真机「新名片/未绑定租户」场景，join 解析会落到 0。
async function makeOrphanUser(openid) {
  const token = await wxLogin(openid);
  const u = db.prepare('SELECT id FROM platform_user WHERE openid = ?').get('mock_' + openid);
  // 清掉可能自动建的租户行与名片，制造「零关联」场景
  db.prepare('DELETE FROM tenant_individuals WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM tenant_enterprise_employees WHERE user_id = ?').run(u.id);
  db.prepare('DELETE FROM card_profile WHERE user_id = ?').run(u.id);
  db.prepare('UPDATE platform_user SET customer_id = NULL WHERE id = ?').run(u.id);
  db.prepare("INSERT INTO card_profile (user_id, name, status) VALUES (?, ?, 'active')").run(u.id, '孤儿名片用户');
  return { token, uid: u.id };
}

test('孤儿名片（零租户关联）仍回落默认项目品牌色：/user/profile', async () => {
  setProjectConfig({ brand_color: '#FA8C16', brand_gradient: '#FFD8A8', brand_secondary: '#FFE8D6', brand_text: '#3a2a1a', brand_subtext: '#7a5c3a' });
  const { token, uid } = await makeOrphanUser('orphan_profile');
  const res = await request(app).get('/api/card/user/profile').set(bearer(token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const c = res.body.card;
  assert.ok(c, '应有名片');
  assert.equal(c.brandColor, '#FA8C16', '孤儿名片 brandColor 应回落默认项目品牌色（join 落空兜底）');
  assert.equal(c.brandColors.primary, '#FA8C16');
  assert.equal(c.brandColors.gradient, '#FFD8A8');
  assert.equal(c.brandColors.text, '#3a2a1a');
});

test('孤儿名片（零租户关联）仍回落默认项目品牌色：/cards/:id（名片详情）', async () => {
  setProjectConfig({ brand_color: '#FA8C16', brand_gradient: '#FFD8A8', brand_secondary: '#FFE8D6', brand_text: '#3a2a1a', brand_subtext: '#7a5c3a' });
  const { uid } = await makeOrphanUser('orphan_detail');
  const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ?').get(uid);
  const res = await request(app).get('/api/card/cards/' + card.id);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.card.brandColor, '#FA8C16', '名片详情 brandColor 应回落默认项目品牌色（join 落空兜底）');
  assert.equal(res.body.card.brandColors.primary, '#FA8C16');
  assert.equal(res.body.card.brandColors.gradient, '#FFD8A8');
  assert.equal(res.body.card.brandColors.subText, '#7a5c3a');
});
