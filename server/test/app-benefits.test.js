/**
 * 应用级会员权益解析测试：benefit_catalog 种子 + resolveAppBenefits / defaultBenefits
 * （"平台权益目录 + 租户套餐 × 应用"模型的数据层与解析器，P1a/P1b/P1c）
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createMemberService, resolveAppBenefits, defaultBenefits, castBenefit, effectiveMembership } from '../src/services/member.js';

describe('应用级会员权益解析（平台目录 + 租户套餐 × 应用）', () => {
  let db, member;
  const DB_PATH = path.join(os.tmpdir(), `app-benefits-test-${Date.now()}.db`);
  const TENANT = 99101;

  before(() => {
    db = createDb(DB_PATH);
    member = createMemberService(db);
    db.prepare('INSERT OR IGNORE INTO platform_user (id, openid, customer_id) VALUES (?,?,?)')
      .run(41001, 'ab-u1', TENANT);
    db.prepare('INSERT OR IGNORE INTO platform_user (id, openid, customer_id) VALUES (?,?,?)')
      .run(41002, 'ab-u2', TENANT);
    db.prepare('INSERT OR IGNORE INTO platform_user (id, openid, customer_id) VALUES (?,?,?)')
      .run(41003, 'ab-u3', TENANT);
    db.prepare('INSERT OR IGNORE INTO platform_user (id, openid, customer_id) VALUES (?,?,?)')
      .run(41004, 'ab-u4', TENANT);
    db.prepare('INSERT OR IGNORE INTO platform_user (id, openid, customer_id) VALUES (?,?,?)')
      .run(41005, 'ab-u5', TENANT);
    db.prepare('INSERT OR IGNORE INTO platform_user (id, openid, customer_id) VALUES (?,?,?)')
      .run(41006, 'ab-u6', TENANT);
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  it('benefit_catalog 播种 20 项且字段正确', () => {
    const rows = db.prepare('SELECT * FROM benefit_catalog ORDER BY sort_order').all();
    assert.equal(rows.length, 20);
    const map = Object.fromEntries(rows.map((r) => [r.type, r]));
    assert.equal(map.works_limit.default_value, '3');
    assert.equal(map.works_limit.app_scope, 'card');
    assert.equal(map.discount.unit, '%');
    assert.equal(map.discount.default_value, '0');
    assert.equal(map.lead_quota.app_scope, 'radar');
  });

  it('权益目录带 C 端展示名 display_label（消费感知短词，非后台配置口径）', () => {
    const rows = db.prepare('SELECT type, label, display_label FROM benefit_catalog ORDER BY sort_order').all();
    assert.equal(rows.length, 20);
    for (const r of rows) {
      assert.ok(r.display_label, `${r.type} 应有 C 端展示名`);
      // C 端展示名不得含后台配置口径的说明性括号
      assert.ok(!/[（(].*[)）]/.test(r.display_label), `${r.type} 展示名不应带参数说明：${r.display_label}`);
    }
    const map = Object.fromEntries(rows.map((r) => [r.type, r]));
    assert.equal(map.discount.display_label, '商城会员价');
    assert.equal(map.discount.label, '商城折扣百分比（0=无折扣，10=打9折）');
    assert.equal(map.price_visible.display_label, '会员价公示');
  });

  it('castBenefit 按 kind 还原类型', () => {
    assert.equal(castBenefit('3', 'number'), 3);
    assert.equal(castBenefit('1', 'switch'), true);
    assert.equal(castBenefit('0', 'switch'), false);
    assert.equal(castBenefit('9折', 'text'), '9折');
  });

  it('defaultBenefits 按 app_scope 过滤', () => {
    const card = defaultBenefits(db, 'card');
    assert.equal(card.works_limit, 3);
    assert.equal(card.videos_limit, 0);
    assert.equal(card.voice_enabled, false);
    assert.equal(card.discount, undefined); // discount 属 mall
    const mall = defaultBenefits(db, 'mall');
    assert.equal(mall.discount, 0);
  });

  it('resolveAppBenefits 非会员返回目录默认', () => {
    const b = resolveAppBenefits(db, TENANT, 41001, 'card');
    assert.equal(b.works_limit, 3);
    assert.equal(b.voice_enabled, false);
  });

  it('resolveAppBenefits 会员 + 应用权益覆盖合并', () => {
    const lv = member.addLevel(TENANT, { levelNo: 1, name: '付费档', buyPrice: 1000 });
    db.prepare('INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?,?,?)')
      .run(TENANT, 41002, lv.id, 'active', '2999-12-31 23:59:59');
    db.prepare('INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits) VALUES (?,?,?,?)')
      .run(TENANT, lv.id, 'card', JSON.stringify({ works_limit: 50, voice_enabled: 1 }));
    const b = resolveAppBenefits(db, TENANT, 41002, 'card');
    assert.equal(b.works_limit, 50);      // 套餐覆盖
    assert.equal(b.voice_enabled, true);  // 套餐覆盖
    assert.equal(b.videos_limit, 0);      // 仍取目录默认
  });

  it('resolveAppBenefits 过期会员回落目录默认', () => {
    const lv = member.addLevel(TENANT, { levelNo: 2, name: '过期档', buyPrice: 1000 });
    db.prepare('INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?,?,?)')
      .run(TENANT, 41003, lv.id, 'active', '2020-01-01 00:00:00');
    db.prepare('INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits) VALUES (?,?,?,?)')
      .run(TENANT, lv.id, 'card', JSON.stringify({ works_limit: 99 }));
    const b = resolveAppBenefits(db, TENANT, 41003, 'card');
    assert.equal(b.works_limit, 3); // 过期 → 仅目录默认
  });

  it('resolveAppBenefits 无 tenantId/userId 直接给默认', () => {
    const b = resolveAppBenefits(db, null, null, 'radar');
    assert.equal(b.lead_quota, 0);
    assert.equal(b.push_quota, 0);
  });

  // ---------------------------------------------------------------- 会员身份判据（effectiveMembership）

  it('effectiveMembership：member_user 有效 → 以 member_user 为准（level 取 pkg_level）', () => {
    const lv = member.addLevel(TENANT, { levelNo: 3, name: '身份档', buyPrice: 1000 });
    db.prepare('UPDATE member_levels SET pkg_level = ? WHERE id = ?').run('gold', lv.id);
    db.prepare("UPDATE member_user SET level_id = ?, status = 'active', expire_at = '2999-12-31 23:59:59' WHERE tenant_id = ? AND user_id = ?")
      .run(lv.id, TENANT, 41002);
    const m = effectiveMembership(db, 41002);
    assert.ok(m);
    assert.equal(m.level, 'gold');
    assert.equal(m.source, 'member_user');
  });

  it('effectiveMembership：无 member_user → 回落旧镜像 platform_user.member_level', () => {
    db.prepare("UPDATE platform_user SET member_level = 'silver' WHERE id = ?").run(41004);
    const m = effectiveMembership(db, 41004);
    assert.ok(m, '旧镜像应兜底为有效会员');
    assert.equal(m.level, 'silver');
    assert.equal(m.source, 'legacy_mirror');
  });

  it('effectiveMembership：旧镜像为 free → 非会员', () => {
    db.prepare("UPDATE platform_user SET member_level = 'free' WHERE id = ?").run(41005);
    assert.equal(effectiveMembership(db, 41005), null);
  });

  it('effectiveMembership：member_user 已过期 → 视为非会员（不回落旧镜像）', () => {
    db.prepare("UPDATE platform_user SET member_level = 'gold' WHERE id = ?").run(41003);
    const m = effectiveMembership(db, 41003);
    assert.equal(m, null, '过期会员身份行应覆盖旧镜像（过期卡不再享权）');
    const b = resolveAppBenefits(db, TENANT, 41003, 'card');
    assert.equal(b.works_limit, 3, '过期会员应回落目录默认');
  });

  it('effectiveMembership：自建等级（pkg_level 为空）→ level=custom 但仍算会员', () => {
    const lv = member.addLevel(TENANT, { levelNo: 4, name: '自建档', buyPrice: 1000 });
    db.prepare("INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59')")
      .run(TENANT, 41006, lv.id);
    const m = effectiveMembership(db, 41006);
    assert.ok(m);
    assert.equal(m.level, 'custom');
    assert.equal(m.source, 'member_user');
  });

  it('后台目录接口带 display_label（后台显示名必须 = C 端展示名，防止两端脱节）', () => {
    // 🔴 2026-10-27：后台原来只能靠前端拆 label 的「（…）」取短名，拆出来的是配置口径
    //    （「商城折扣百分比」），与 C 端真实显示的（「商城会员价」）对不上。
    //    现在 display_label 是正式字段，后台目录接口必须带上 → 后台看到的名字 = 用户看到的名字。
    const cat = member.benefitsCatalog();
    assert.ok(Array.isArray(cat.catalog) && cat.catalog.length > 0);
    const map = {};
    for (const row of cat.catalog) {
      assert.ok('display_label' in row, `目录项 ${row.type} 缺 display_label 字段`);
      assert.ok(row.display_label, `${row.type} 的 display_label 不得为空`);
      map[row.type] = row.display_label;
    }
    assert.equal(map.discount, '商城会员价');
    assert.equal(map.price_visible, '会员价公示');
  });
});
