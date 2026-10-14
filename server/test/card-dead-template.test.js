import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

/**
 * 名片编辑「模板死引用自愈」回归（2026-10-14）
 * 背景：模板库重建/重排后旧模板 id 消失，存量 card_profile 仍挂死 template_id；
 * 编辑向导把该 id 原样 PUT 回来 → 原逻辑一律 400「模板不存在或不可用」→ 名片永远无法保存。
 * 修复：PUT /cards/:id 时若提交的 templateId 与库中存量一致（用户没动模板）但校验失败，
 * 不阻断保存，自动迁移到平台默认模板（is_default=1）；主动改成不可用模板仍拒绝。
 */
let app, db, server, tmpDir, token, cardId, victimTplId, defaultTplId;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadtpl-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);
  app = createApp({ db });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  // 平台默认模板 + 一个普通免费模板（即将被「删掉」的受害者）
  defaultTplId = db.prepare(
    "INSERT INTO card_templates (name, tenant_id, enabled, price, is_default, theme_config) VALUES ('默认模板', 0, 1, 0, 1, '{}')"
  ).run().lastInsertRowid;
  victimTplId = db.prepare(
    "INSERT INTO card_templates (name, tenant_id, enabled, price, is_default, theme_config) VALUES ('旧模板', 0, 1, 0, 0, '{}')"
  ).run().lastInsertRowid;

  // C 端用户 + 挂着 victim 模板的名片
  const uid = db.prepare(
    "INSERT INTO platform_user (openid, nickname, status) VALUES ('o-test-dead', '测试用户', 'active')"
  ).run().lastInsertRowid;
  cardId = db.prepare(
    "INSERT INTO card_profile (user_id, name, template_id) VALUES (?, '旧名片', ?)"
  ).run(uid, victimTplId).lastInsertRowid;

  // 与 C 端 card_token 同构：base64({uid}).signature
  token = 'Bearer ' + Buffer.from(JSON.stringify({ uid })).toString('base64') + '.x';

  // 模拟模板库重建：victim 模板被删（存量名片瞬间变成死引用）
  db.prepare('DELETE FROM card_templates WHERE id = ?').run(victimTplId);
});

after(() => {
  try { server?.close(); } catch {}
  try { db.close(); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('存量死引用：提交与库中一致的已删模板 id → 不阻断保存，自愈迁移到默认模板', async () => {
  const r = await request(app)
    .put(`/api/card/cards/${cardId}`)
    .set('Authorization', token)
    .send({ name: '改名后的名片', templateId: victimTplId, position: '顾问' });
  assert.equal(r.status, 200, `应保存成功，实际: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.card.name, '改名后的名片');
  assert.equal(Number(r.body.card.templateId), Number(defaultTplId), '死引用应自愈为平台默认模板');
});

test('主动改成另一个不存在的模板 → 仍拒绝（400）', async () => {
  const r = await request(app)
    .put(`/api/card/cards/${cardId}`)
    .set('Authorization', token)
    .send({ templateId: 99999 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, '模板不存在或不可用');
});

test('正常免费模板保存不受影响', async () => {
  const okTpl = db.prepare(
    "INSERT INTO card_templates (name, tenant_id, enabled, price, is_default, theme_config) VALUES ('新免费', 0, 1, 0, 0, '{}')"
  ).run().lastInsertRowid;
  const r = await request(app)
    .put(`/api/card/cards/${cardId}`)
    .set('Authorization', token)
    .send({ templateId: okTpl });
  assert.equal(r.status, 200);
  assert.equal(Number(r.body.card.templateId), Number(okTpl));
});
