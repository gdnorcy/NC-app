/**
 * 旧 benefits JSON → 权益矩阵 存量迁移测试（migrateLegacyLevelBenefits）
 *
 * 钉死规则：
 *   - discount 折率 → 百分比 ×10（8=八折 → 80=打八折），并 clamp [0,100]
 *   - scoreMultiple → point_rate（原值，保留至多 2 位小数）
 *   - pointBack → rebate（原值，clamp [0,100]）
 *   - viewPrice → mall.price_visible
 *   - 全 disabled 不建行；与种子矩阵键级合并；幂等；坏 JSON 不炸
 *   - 迁移后 resolveAppBenefits 真兑现（自定义档成员拿到折扣）
 */
import { test, describe, before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb, migrateLegacyLevelBenefits, ensureTenantDefaultLevels } from '../src/db.js';
import { resolveAppBenefits } from '../src/services/member.js';

describe('旧 benefits JSON 迁移到权益矩阵', () => {
  let db;
  const DB_PATH = path.join(os.tmpdir(), `member-benefits-migrate-test-${Date.now()}.db`);

  before(() => {
    db = createDb(DB_PATH);
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  const MARK = 'member_level_benefits_migrate_v1';
  const resetMark = () => db.prepare('DELETE FROM schema_marks WHERE key = ?').run(MARK);
  const matrix = (tid, levelId, app) => {
    const r = db.prepare('SELECT benefits FROM member_level_app_benefits WHERE tenant_id = ? AND level_id = ? AND app_code = ?')
      .get(tid, levelId, app);
    return r ? JSON.parse(r.benefits) : null;
  };
  const addLevel = (tid, name, benefitsJson) => db.prepare(
    `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
     VALUES (?,1,?,1,'consume',0,0,?,1,'manual',0)`
  ).run(tid, name, benefitsJson).lastInsertRowid;

  // createDb 的种子流水线已含迁移并打了 mark；每个用例前重置，模拟「尚未迁移」的存量库
  beforeEach(() => resetMark());

  it('启用项迁移：discount 折率×10 换百分比，其余原值映射', () => {
    const T = 88201;
    const lv = addLevel(T, '测试档A', JSON.stringify({
      discount: { enabled: true, value: 8 },        // 八折 → 80%
      scoreMultiple: { enabled: true, value: 2 },   // 2 倍 → point_rate 2
      pointBack: { enabled: true, value: 5 },       // 5% → rebate 5
      viewPrice: { enabled: true },
    }));
    migrateLegacyLevelBenefits(db);
    assert.deepEqual(matrix(T, lv, 'mall'), { discount: 80, price_visible: 1 });
    assert.deepEqual(matrix(T, lv, 'member'), { point_rate: 2, rebate: 5 });
  });

  it('换算后 clamp：旧 UI 允许填 100 折，×10 不得爆 100', () => {
    const T = 88202;
    const lv = addLevel(T, '测试档B', JSON.stringify({
      discount: { enabled: true, value: 100 },
      pointBack: { enabled: true, value: 100 },
      scoreMultiple: { enabled: true, value: 1.5 }, // 小数倍率保留 2 位
    }));
    resetMark();
    migrateLegacyLevelBenefits(db);
    assert.equal(matrix(T, lv, 'mall').discount, 100, '100 折 ×10=1000 应 clamp 到 100');
    assert.equal(matrix(T, lv, 'member').rebate, 100);
    assert.equal(matrix(T, lv, 'member').point_rate, 1.5);
  });

  it('全 disabled / 空 JSON / 坏 JSON：不建行、不炸', () => {
    const T = 88203;
    const lv1 = addLevel(T, '测试档C', JSON.stringify({
      discount: { enabled: false, value: 0 }, scoreMultiple: { enabled: false, value: 0 },
      pointBack: { enabled: false, value: 0 }, viewPrice: { enabled: false },
    }));
    const lv2 = addLevel(T, '测试档D', '{}');
    const lv3 = addLevel(T, '测试档E', '{oops-not-json');
    resetMark();
    assert.doesNotThrow(() => migrateLegacyLevelBenefits(db));
    assert.equal(matrix(T, lv1, 'mall'), null);
    assert.equal(matrix(T, lv2, 'mall'), null);
    assert.equal(matrix(T, lv3, 'mall'), null);
  });

  it('标准档键级合并：自定义档旧配置只覆盖同键，种子矩阵不被污染', () => {
    const T = 88204;
    // 存量自定义「黄金会员」带七折（生产形态：同名且启用了权益 → 不认领，另建标准档）
    const customId = addLevel(T, '黄金会员', JSON.stringify({ discount: { enabled: true, value: 7 } }));
    ensureTenantDefaultLevels(db, T);
    resetMark();
    migrateLegacyLevelBenefits(db);

    const stdGold = db.prepare('SELECT id FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(T, 'gold');
    assert.ok(stdGold, '应另建 gold 标准档');
    assert.notEqual(stdGold.id, customId, '自定义档不得被认领');
    // 自定义档：mall 行只有 discount（无 price_visible 等其他键被塞入）
    assert.deepEqual(matrix(T, customId, 'mall'), { discount: 70 });
    assert.equal(matrix(T, customId, 'member'), null, '未配置积分类权益不建 member 行');
    // 标准档 mall 行保持种子值（discount=0, price_visible=0），不被迁移污染
    assert.deepEqual(matrix(T, stdGold.id, 'mall'), { discount: 0, price_visible: 0 });
  });

  it('迁移后 resolveAppBenefits 真兑现：自定义档成员拿到商城折扣', () => {
    const T = 88205;
    const customId = addLevel(T, '专属折扣档', JSON.stringify({ discount: { enabled: true, value: 8.5 } }));
    resetMark();
    migrateLegacyLevelBenefits(db);
    db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)').run(88251, 'mig-u1', T);
    db.prepare("INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59')")
      .run(T, 88251, customId);
    const b = resolveAppBenefits(db, T, 88251, 'mall');
    assert.equal(b.discount, 85, '8.5 折 → 85%（打八五折）');
  });

  it('幂等：mark 守卫下二次调用 no-op；重置 mark 重放结果一致', () => {
    const T = 88206;
    const lv = addLevel(T, '测试档F', JSON.stringify({
      discount: { enabled: true, value: 9 }, viewPrice: { enabled: true },
    }));
    migrateLegacyLevelBenefits(db); // 首次（本 describe 前面用例已重置过 mark）
    const first = matrix(T, lv, 'mall');
    migrateLegacyLevelBenefits(db); // 二次：mark 守卫 → 直接返回
    assert.deepEqual(matrix(T, lv, 'mall'), first, '守卫下二次调用不得改变数据');
    resetMark();
    migrateLegacyLevelBenefits(db); // 强制重放
    assert.deepEqual(matrix(T, lv, 'mall'), first, '重放结果必须一致');
  });

  it('mark 留痕：迁移后 schema_marks 有记录', () => {
    migrateLegacyLevelBenefits(db); // 跑一次即打 mark
    const marked = db.prepare('SELECT key FROM schema_marks WHERE key = ?').get(MARK);
    assert.ok(marked, '应写入 schema_marks 防重启重播');
  });
});
