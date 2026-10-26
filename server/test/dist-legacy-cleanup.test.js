/**
 * 回归锁：2026-09-08 测试期遗留的分销/股东脏数据一次性清理
 * （对应 db.js cleanupLegacyDistributionData）
 *
 * 覆盖三条判据：
 *   1) 脏数据被清：A 类身份行删除 + B 类钱包余额归零 + user2 无源提现清空
 *   2) 真实数据不动：dist_user_relation（上下级绑定）、其他 user 的钱包/股东行不受影响
 *   3) 幂等：schema_marks 留痕，重复调用不重播（重启不重复执行）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDb, cleanupLegacyDistributionData, setMark } from '../src/db.js';

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-cleanup-'));
  const db = createDb(path.join(dir, 'test.db'));
  // createDb 内部 migrate() 已跑过一次清理迁移并留痕 → 测试要自己控制执行时机，
  // 故清掉标记，让每个用例显式触发一次清理。
  db.prepare('DELETE FROM schema_marks WHERE key = ?').run('dist_legacy_cleanup_v1');
  return { db, dir };
}

function insertWallet(db, id, tenantId, userId, available) {
  db.prepare(`INSERT INTO dist_wallet (id, tenant_id, user_id, available, wait_settle, total_income, total_withdraw)
              VALUES (?, ?, ?, ?, 0, ?, 0)`).run(id, tenantId, userId, available, available);
}

test('脏数据被清理：身份行删除 + 钱包归零 + 无源提现清空', () => {
  const { db, dir } = makeDb();
  try {
    // 造脏数据（模拟 09-08 测试期注入）
    db.prepare("INSERT INTO dist_share_all (tenant_id, user_id, weight, status) VALUES (1, 4, 1, 1)").run();
    db.prepare("INSERT INTO dist_share_cat (tenant_id, category_id, user_id, ratio) VALUES (1, '互联网', 5, 0.05)").run();
    db.prepare("INSERT INTO dist_partner (tenant_id, user_id, ratio, mode, status) VALUES (1, 2, 1, 1, 1)").run();
    db.prepare("INSERT INTO dist_partner (tenant_id, user_id, ratio, mode, status) VALUES (1, 3, 1, 2, 1)").run();
    insertWallet(db, 8, 1, 2, 1500);
    insertWallet(db, 9, 1, 3, 4287);
    insertWallet(db, 11, 1, 4, 5600);
    insertWallet(db, 12, 1, 5, 9802);
    insertWallet(db, 13, 1, 6, 12802);
    db.prepare("INSERT INTO dist_withdraw (withdraw_no, tenant_id, user_id, amount, actual_amount, status) VALUES ('W-TEST-1', 1, 2, 500, 500, 'done')").run();

    cleanupLegacyDistributionData(db);

    assert.equal(db.prepare('SELECT count(*) c FROM dist_share_all WHERE user_id = 4 AND tenant_id = 1').get().c, 0, '林平的全民股东身份应被清除');
    assert.equal(db.prepare('SELECT count(*) c FROM dist_share_cat WHERE user_id = 5 AND tenant_id = 1').get().c, 0, '优选大搜罗的类目股东身份应被清除');
    assert.equal(db.prepare('SELECT count(*) c FROM dist_partner WHERE user_id IN (2,3) AND tenant_id = 1').get().c, 0, '林小雨/张明的团队分红身份应被清除');
    assert.equal(db.prepare('SELECT count(*) c FROM dist_withdraw WHERE user_id = 2').get().c, 0, 'user2 的无源提现记录应被清空');

    const wallets = db.prepare('SELECT id, available, wait_settle, total_income, total_withdraw FROM dist_wallet WHERE id IN (8,9,11,12,13)').all();
    assert.equal(wallets.length, 5, '钱包行应保留（只归零，不删行）');
    for (const w of wallets) {
      assert.equal(w.available, 0, `wallet ${w.id} 可提现应归零`);
      assert.equal(w.wait_settle, 0, `wallet ${w.id} 待结算应归零`);
      assert.equal(w.total_income, 0, `wallet ${w.id} 总收入应归零`);
      assert.equal(w.total_withdraw, 0, `wallet ${w.id} 总提现应归零`);
    }
    // 林平的 56 元必须归零（用户报修的核心诉求）
    const lin = db.prepare('SELECT available FROM dist_wallet WHERE id = 11').get();
    assert.equal(lin.available, 0, '林平钱包（id=11）的 56 元可提现应归零');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('真实数据不受影响：其他用户的钱包/股东行、dist_user_relation 保留', () => {
  const { db, dir } = makeDb();
  try {
    // 非目标用户的钱包（id 不在清理名单内）
    insertWallet(db, 20, 1, 99, 8888);
    // 其他租户（tenant_id != 1）的股东身份
    db.prepare("INSERT INTO dist_share_all (tenant_id, user_id, weight, status) VALUES (2, 4, 1, 1)").run();
    // 其他租户的同类目标钱包（不在名单内，不应动）
    insertWallet(db, 21, 2, 4, 6666);
    // 真实上下级绑定
    db.prepare('INSERT INTO dist_user_relation (tenant_id, user_id, identity_type, pid1, source_type) VALUES (1, 5, \'individual\', 4, \'qrcode\')').run();

    cleanupLegacyDistributionData(db);

    const w20 = db.prepare('SELECT available FROM dist_wallet WHERE id = 20').get();
    assert.equal(w20.available, 8888, '非目标钱包余额不应被动');
    const w21 = db.prepare('SELECT available FROM dist_wallet WHERE id = 21').get();
    assert.equal(w21.available, 6666, '其他租户的目标 id 钱包不应被动（清理限定 tenant 语义）');
    assert.equal(db.prepare('SELECT count(*) c FROM dist_share_all WHERE user_id = 4 AND tenant_id = 2').get().c, 1, '其他租户的股东身份不应被清');
    assert.equal(db.prepare('SELECT count(*) c FROM dist_user_relation WHERE user_id = 5').get().c, 1, '真实上下级绑定必须保留');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('幂等：schema_marks 留痕，重复调用不重播', () => {
  const { db, dir } = makeDb();
  try {
    db.prepare("INSERT INTO dist_share_all (tenant_id, user_id, weight, status) VALUES (1, 4, 1, 1)").run();
    insertWallet(db, 11, 1, 4, 5600);

    cleanupLegacyDistributionData(db);
    assert.equal(db.prepare('SELECT count(*) c FROM schema_marks WHERE key = ?').get('dist_legacy_cleanup_v1').c, 1, '应留下清理标记');

    // 模拟「管理员重新打开」后重启重播：数据被再次写入后再次调用迁移
    db.prepare("INSERT INTO dist_share_all (tenant_id, user_id, weight, status) VALUES (1, 4, 1, 1)").run();
    db.prepare('UPDATE dist_wallet SET available = 5600, total_income = 5600 WHERE id = 11').run();
    cleanupLegacyDistributionData(db);

    assert.equal(db.prepare('SELECT count(*) c FROM dist_share_all WHERE user_id = 4 AND tenant_id = 1').get().c, 1, '已留痕后不应重播清理（数据保持原样）');
    assert.equal(db.prepare('SELECT available FROM dist_wallet WHERE id = 11').get().available, 5600, '已留痕后不应重播归零');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('表缺失时安全跳过（不抛异常）', () => {
  const { db, dir } = makeDb();
  try {
    // 手工清掉标记 + 表，验证 tableExists 守卫
    db.exec('DROP TABLE IF EXISTS dist_share_all');
    db.exec('DROP TABLE IF EXISTS dist_share_cat');
    db.exec('DROP TABLE IF EXISTS dist_partner');
    db.exec('DROP TABLE IF EXISTS dist_withdraw');
    db.prepare('DELETE FROM schema_marks WHERE key = ?').run('dist_legacy_cleanup_v1');

    assert.doesNotThrow(() => cleanupLegacyDistributionData(db), '表缺失时不应抛异常');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
