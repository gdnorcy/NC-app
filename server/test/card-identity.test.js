import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import {
  IDENTITY_LABEL, IDENTITY_HINT, CARD_IDENTITY_SQL, cardIdentityParams,
  subjectTypeOf, getUserSubjects, isCertifiedUser, cardCapabilities,
} from '../src/services/cardIdentity.js';

/**
 * 身份模型重构（2026-10-20，方案 A+B）单元测试
 * 病根：identity 五值枚举把主体类型/归属通道/认证能力三件变化频率不同的事
 * 混在一个字段里，「挂靠成员」是影子企业 bug 的遗产类别。
 * 新模型：identity 四值（employee/individual/enterprise/personal）纯展示派生；
 * 能力判据只读名册 active，收口在 cardCapabilities。
 */
let db;
let tmpDir;
let uFree, uInd, uIndPend, uEmp, uLeft;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-identity-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'identity.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = createDb(config.dbPath);

  db.prepare("INSERT INTO projects (customer_name, description, status, invite_code, solutions) VALUES ('身份测试租户', '', 'active', '9001', '[\"card\"]')").run();
  const mk = (openid) => db.prepare("INSERT INTO platform_user (openid, nickname, status) VALUES (?, ?, 'active')").run(openid, openid).lastInsertRowid;
  uFree = mk('idt_free');     // 未认证
  uInd = mk('idt_ind');       // 入驻个人 active
  uIndPend = mk('idt_indp');  // 入驻个人 pending
  uEmp = mk('idt_emp');       // 企业员工 active
  uLeft = mk('idt_left');     // 离职员工

  db.prepare("INSERT INTO tenant_individuals (customer_id, user_id, name, status) VALUES (1, ?, '入驻甲', 'active')").run(uInd);
  db.prepare("INSERT INTO tenant_individuals (customer_id, user_id, name, status) VALUES (1, ?, '入驻待审', 'pending')").run(uIndPend);
  const ent = db.prepare("INSERT INTO tenant_enterprises (customer_id, name, status) VALUES (1, '身份测试企业', 'active')").run().lastInsertRowid;
  db.prepare("INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status) VALUES (?, 1, ?, '员工乙', 'member', 'active')").run(ent, uEmp);
  db.prepare("INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, role, status) VALUES (?, 1, ?, '离职丙', 'member', 'left')").run(ent, uLeft);
});

after(() => {
  try { db?.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('identity 枚举四值：挂靠成员/租户名片两个遗产类别已取消', () => {
  assert.deepEqual(Object.keys(IDENTITY_LABEL).sort(), ['employee', 'enterprise', 'individual', 'personal']);
  assert.ok(!('ent_member' in IDENTITY_LABEL), 'ent_member 不得再作为身份');
  assert.ok(!('tenant' in IDENTITY_LABEL), 'tenant 不得再作为身份');
  // 每个身份都有可解释文案（为什么 + 怎么升级）
  for (const k of Object.keys(IDENTITY_LABEL)) {
    assert.ok(IDENTITY_HINT[k] && IDENTITY_HINT[k].length > 8, `${k} 缺少 identityHint`);
  }
});

test('身份 SQL 三个占位符（与四值 CASE 对应）', () => {
  assert.equal(cardIdentityParams(1).length, 3);
  assert.equal((CARD_IDENTITY_SQL.match(/\?/g) || []).length, 3);
  assert.ok(!/ent_member|'tenant'/.test(CARD_IDENTITY_SQL), 'SQL 里不得再出现遗产分支');
});

test('subjectTypeOf：企业名片→enterprise，其余→person', () => {
  assert.equal(subjectTypeOf('enterprise'), 'enterprise');
  assert.equal(subjectTypeOf('employee'), 'person');
  assert.equal(subjectTypeOf('individual'), 'person');
  assert.equal(subjectTypeOf('personal'), 'person');
});

test('名册主体：全量返回 + certified 只认 active', () => {
  const free = getUserSubjects(db, 1, uFree);
  assert.deepEqual(free.subjects, []);
  assert.equal(free.certified, false);

  const ind = getUserSubjects(db, 1, uInd);
  assert.equal(ind.subjects.length, 1);
  assert.equal(ind.certified, true);

  // pending 入驻：主体在（供 UI 展示审核中），但不算已认证
  const pend = getUserSubjects(db, 1, uIndPend);
  assert.equal(pend.subjects.length, 1);
  assert.equal(pend.subjects[0].status, 'pending');
  assert.equal(pend.certified, false);

  // 离职员工：left 不算认证
  assert.equal(isCertifiedUser(db, 1, uLeft), false);
  assert.equal(isCertifiedUser(db, 1, uEmp), true);
});

test('能力矩阵收口：上架看认证，交换对所有人开放', () => {
  const free = cardCapabilities(db, { customerId: 1, userId: uFree });
  assert.equal(free.canListMarket, false, '未认证不得上架集市');
  assert.equal(free.canExchange, true, '交换是通讯基础功能，不按身份禁');

  const cert = cardCapabilities(db, { customerId: 1, userId: uEmp });
  assert.equal(cert.canListMarket, true);
  assert.equal(cert.canExchange, true);
});
