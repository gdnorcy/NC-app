/**
 * 写入侧权益校验（validateAppBenefits）测试
 *
 * 钉死：未知 key 拒绝 / 跨应用 key 拒绝 / 旧字段名拒绝 / HARD_CAPS 超出拒绝 /
 *       switch 仅 0|1 / number 非负有限 / '*' 目录行全应用可用。
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { validateAppBenefits, HARD_CAPS } from '../src/services/member.js';

describe('写入侧权益校验 validateAppBenefits', () => {
  let db;
  const DB_PATH = path.join(os.tmpdir(), `member-benefits-validate-test-${Date.now()}.db`);

  before(() => {
    db = createDb(DB_PATH);
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  it('合法配置通过并规整类型', () => {
    const r = validateAppBenefits(db, 'card', { works_limit: 40, voice_enabled: 1 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { works_limit: 40, voice_enabled: 1 });
  });

  it('未知 key 拒绝', () => {
    const r = validateAppBenefits(db, 'card', { works_limit: 10, no_such_benefit: 1 });
    assert.equal(r.ok, false);
    assert.match(r.error, /no_such_benefit/);
  });

  it('跨应用 key 拒绝（discount 属 mall，不能写进 card）', () => {
    const r = validateAppBenefits(db, 'card', { discount: 10 });
    assert.equal(r.ok, false);
    assert.match(r.error, /discount/);
  });

  it('旧字段名/旧 JSON 形态拒绝（viewPrice、折率 8 的 legacy 思维由迁移负责，写入侧不认）', () => {
    assert.equal(validateAppBenefits(db, 'mall', { viewPrice: { enabled: true } }).ok, false);
    assert.equal(validateAppBenefits(db, 'mall', { discount: 8 }).ok, true, '数值 8 合法（语义=8%），但不再代表八折');
  });

  it('HARD_CAPS 超出拒绝，等于上限放行', () => {
    assert.equal(validateAppBenefits(db, 'card', { works_limit: HARD_CAPS.works_limit + 1 }).ok, false);
    assert.equal(validateAppBenefits(db, 'card', { works_limit: HARD_CAPS.works_limit }).ok, true);
    assert.equal(validateAppBenefits(db, 'radar', { push_quota: HARD_CAPS.push_quota + 1 }).ok, false);
  });

  it('switch 仅接受 0/1', () => {
    assert.equal(validateAppBenefits(db, 'card', { voice_enabled: 2 }).ok, false);
    assert.equal(validateAppBenefits(db, 'card', { voice_enabled: 0 }).ok, true);
  });

  it('number 拒绝负数与非数值', () => {
    assert.equal(validateAppBenefits(db, 'card', { works_limit: -1 }).ok, false);
    assert.equal(validateAppBenefits(db, 'card', { works_limit: 'abc' }).ok, false);
    assert.equal(validateAppBenefits(db, 'card', { works_limit: Infinity }).ok, false);
  });

  it('非对象/数组/空 appCode 拒绝', () => {
    assert.equal(validateAppBenefits(db, 'card', null).ok, false);
    assert.equal(validateAppBenefits(db, 'card', [1, 2]).ok, false);
    assert.equal(validateAppBenefits(db, '', { works_limit: 1 }).ok, false);
  });

  it("app_scope='*' 的目录行对所有应用可用", () => {
    db.prepare("INSERT OR REPLACE INTO benefit_catalog (type, app_scope, kind, unit, default_value, label, sort_order) VALUES ('test_global','*','switch','','0','测试全局项',99)").run();
    assert.equal(validateAppBenefits(db, 'card', { test_global: 1 }).ok, true);
    assert.equal(validateAppBenefits(db, 'radar', { test_global: 1 }).ok, true);
    db.prepare("DELETE FROM benefit_catalog WHERE type = 'test_global'").run();
  });

  it('空对象放行（清空该应用全部覆盖 → 回落目录默认）', () => {
    const r = validateAppBenefits(db, 'card', {});
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, {});
  });
});
