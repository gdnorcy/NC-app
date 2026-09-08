/**
 * 分销体系核心服务测试：分账/回滚/结算/提现/绑定
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createDistributionService } from '../src/services/distribution.js';

describe('分销体系（二级推广分销底座）', () => {
  let db, dist;
  const DB_PATH = path.join(os.tmpdir(), `dist-test-${Date.now()}.db`);

  before(() => {
    db = createDb(DB_PATH);
    dist = createDistributionService(db);
    // 种子：平台用户（上级/中间/买家/企业上级）
    const ins = db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, identity_type) VALUES (?, ?, ?, ?)");
    for (const [id, openid, name, idt] of [
      [1000, 'dist-u1000', '上级A', 'individual'],
      [1001, 'dist-u1001', '中间B', 'individual'],
      [1002, 'dist-u1002', '买家C', 'individual'],
      [2000, 'dist-e2000', '企业上级', 'employee'],
      [1003, 'dist-u1003', '待绑定D', 'individual'],
    ]) {
      ins.run(id, openid, name, idt);
    }
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  const TENANT = 99901;

  function makeOrder(overrides = {}) {
    return {
      id: overrides.id || 90001,
      orderNo: overrides.orderNo || 'TEST90001',
      status: 'paid',
      payerType: 'tenant',
      customerId: TENANT,
      userId: overrides.userId || 1001,
      buyerIdentityType: overrides.identityType || 'individual',
      amount: overrides.amount || 10000, // 分（100元）
      originalAmount: overrides.amount || 10000,
      solution: 'card',
      productType: 'member',
    };
  }

  it('插件未安装时订单不分账', () => {
    const r = dist.computeOrderSplit(makeOrder({ id: 90001 }));
    assert.equal(r, null);
  });

  it('启用插件 + 绑定上下级后分账正确（一级20% 二级5%）', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    // 链：u1000(上级) ← u1001(中间) ← u1002(买家)；买家 u1002
    dist.bindRelation(TENANT, 1001, 'individual', 1000, 'card');
    const mid = dist.getRelation(TENANT, 1001, 'individual');
    assert.equal(mid.pid1, 1000);
    assert.equal(mid.pid2, null);
    dist.bindRelation(TENANT, 1002, 'individual', 1001, 'card');
    const buyer = dist.getRelation(TENANT, 1002, 'individual');
    assert.equal(buyer.pid1, 1001);
    assert.equal(buyer.pid2, 1000);

    const split = dist.computeOrderSplit(makeOrder({ id: 90002, userId: 1002 }));
    assert.ok(split);
    assert.equal(split.commission1, 2000); // 100元 * 20%
    assert.equal(split.commission2, 500);  // 100元 * 5%
    assert.equal(split.total_bonus, 2500);

    // 钱包：上级 + 中间人各得
    const w1 = dist.getWallet(TENANT, 1000, 'individual');
    const w2 = dist.getWallet(TENANT, 1001, 'individual');
    assert.equal(w1.wait_settle, 500);
    assert.equal(w2.wait_settle, 2000);

    // 流水
    const logs = dist.getLogs(TENANT, 1001, 'individual');
    assert.equal(logs.total, 1);
    assert.equal(logs.list[0].type, 'level1');
    assert.equal(logs.list[0].amount, 2000);
    assert.equal(logs.list[0].status, 'pending');
  });

  it('分账幂等：同一订单重复计算只产生一条快照', () => {
    const split1 = dist.computeOrderSplit(makeOrder({ id: 90002, userId: 1002 }));
    const splits = db.prepare('SELECT COUNT(*) n FROM dist_order_split WHERE tenant_id = ? AND order_id = ?').get(TENANT, 90002).n;
    assert.equal(splits, 1);
    assert.equal(split1.commission1, 2000);
  });

  it('绑定永久锁定：再次绑定不同上级不生效', () => {
    const r = dist.bindRelation(TENANT, 1002, 'individual', 9999, 'card');
    assert.ok(r.ok);
    const rel = dist.getRelation(TENANT, 1002, 'individual');
    assert.equal(rel.pid1, 1001);
  });

  it('绑定防环：不能绑定自己的下级', () => {
    // 1002 是 1001 的下级；尝试把 1000 绑定到 1002（其二级下级）
    const r = dist.bindRelation(TENANT, 1000, 'individual', 1002, 'card');
    assert.equal(r.ok, false);
  });

  it('退款回滚：待结算收益扣回 wait_settle，流水置已扣回', () => {
    console.log('DBG pre-rollback split:', db.prepare('SELECT id, settle_status FROM dist_order_split WHERE tenant_id=? AND order_id=?').get(TENANT, 90002));
    const wBefore = dist.getWallet(TENANT, 1001, 'individual');
    assert.equal(wBefore.wait_settle, 2000);
    const split = dist.rollbackOrderSplit(makeOrder({ id: 90002, userId: 1002 }));
    assert.equal(split.settle_status, 'refunded');
    const wAfter = dist.getWallet(TENANT, 1001, 'individual');
    assert.equal(wAfter.wait_settle, 0);
    const logs = dist.getLogs(TENANT, 1001, 'individual');
    assert.equal(logs.list[0].status, 'charged_back');
    // 二次回滚幂等
    const again = dist.rollbackOrderSplit(makeOrder({ id: 90002, userId: 1002 }));
    assert.equal(again.settle_status, 'refunded');
  });

  it('结算：T+N 到期待结算 → 可提现', () => {
    // 手工把快照时间改到 8 天前（settle_day=7）
    db.prepare("UPDATE dist_order_split SET created_at = datetime('now', '-8 days') WHERE tenant_id = ? AND order_id = ?").run(TENANT, 90003);
    // 构造一笔已结算前的新订单并直接置老时间
    const split = dist.computeOrderSplit(makeOrder({ id: 90003, userId: 1002, amount: 10000 }));
    assert.ok(split);
    db.prepare("UPDATE dist_order_split SET created_at = datetime('now', '-8 days') WHERE id = ?").run(split.id);
    const n = dist.settleDueOrders();
    assert.ok(n >= 2); // 1000/1001 各一条
    const w1 = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(w1.available, 500);
    assert.equal(w1.wait_settle, 0);
    const log = db.prepare("SELECT * FROM dist_user_log WHERE tenant_id = ? AND split_id = ? AND user_id = 1000").get(TENANT, split.id);
    assert.equal(log.status, 'settled');
  });

  it('提现：余额门槛校验 + 手续费 + 冻结', () => {
    const w = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(w.available, 500);
    // 最低门槛设为 1 元（低于则失败）
    dist.saveConfig(TENANT, { min_withdraw: 1 });
    // 低于最低门槛（0.5元=50分 < 1元）
    const tooSmall = dist.applyWithdraw(TENANT, 1000, 'individual', 0.5);
    assert.equal(tooSmall.ok, false);
    // 超额
    const tooBig = dist.applyWithdraw(TENANT, 1000, 'individual', 100);
    assert.equal(tooBig.ok, false);
    // 成功：5元
    const ok = dist.applyWithdraw(TENANT, 1000, 'individual', 5);
    assert.ok(ok.ok);
    const wAfter = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(wAfter.available, 0); // 500分全部冻结
    const wd = db.prepare("SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 ORDER BY id DESC LIMIT 1").get(TENANT);
    assert.equal(wd.amount, 500);
    assert.equal(wd.status, 'pending');
    // 驳回退余额
    const rj = dist.reviewWithdraw(wd.id, 'reject', '测试驳回');
    assert.ok(rj.ok);
    const wFinal = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(wFinal.available, 500);
  });

  it('双身份隔离：employee 身份钱包独立', () => {
    dist.bindRelation(TENANT, 1001, 'employee', 2000, 'card');
    const rel = dist.getRelation(TENANT, 1001, 'employee');
    assert.equal(rel.pid1, 2000);
    const wInd = dist.getWallet(TENANT, 1001, 'individual');
    const wEmp = dist.getWallet(TENANT, 1001, 'employee');
    // 同一用户两种身份两个钱包（individual 已有待结算记录）
    assert.notEqual(wInd.id, wEmp.id);
    assert.equal(wEmp.wait_settle, 0);
  });

  it('配置保存与读取', () => {
    const cfg = dist.saveConfig(TENANT, { ratio1: 0.3, ratio2: 0.1, settle_day: 15, min_withdraw: 50 });
    assert.equal(cfg.ratio1, 0.3);
    assert.equal(cfg.ratio2, 0.1);
    assert.equal(cfg.settle_day, 15);
    assert.equal(cfg.min_withdraw, 50);
    const read = dist.getConfig(TENANT);
    assert.equal(read.ratio1, 0.3);
  });

  it('插件开关停用后新订单不再分账', () => {
    dist.setPlugin(TENANT, 'dist', { enable: false });
    const r = dist.computeOrderSplit(makeOrder({ id: 90004, userId: 1002 }));
    assert.equal(r, null);
  });

  it('数据大盘统计', async (t) => {
    // stats 由路由层提供，这里验证核心计数查询可用
    const cnt = db.prepare('SELECT COUNT(*) n FROM dist_order_split WHERE tenant_id = ?').get(TENANT).n;
    assert.ok(cnt >= 1);
  });
});
