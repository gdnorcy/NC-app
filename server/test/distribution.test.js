/**
 * 分销体系核心服务测试：分账/回滚/结算/提现/绑定
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createDistributionService, buildShareUrl, buildWithdrawCsv, buildLogCsv, buildMonthlyCsv, buildStatementCsv, buildStatementHtml, buildRelationTree } from '../src/services/distribution.js';

describe('分销体系（分销裂变底座）', () => {
  let db, dist;
  const DB_PATH = path.join(os.tmpdir(), `dist-test-${Date.now()}.db`);
  const TENANT = 99901;

  before(() => {
    db = createDb(DB_PATH);
    dist = createDistributionService(db);
    // 种子：平台用户（上级/中间/买家/企业上级）；customer_id 统一为本测试租户（贴合「上级须同租户」语义）
    const ins = db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?, ?, ?, ?, ?)");
    for (const [id, openid, name, idt] of [
      [1000, 'dist-u1000', '上级A', 'individual'],
      [1001, 'dist-u1001', '中间B', 'individual'],
      [1002, 'dist-u1002', '买家C', 'individual'],
      [2000, 'dist-e2000', '企业上级', 'employee'],
      [2001, 'dist-e2001', '股东乙', 'individual'],
      [1003, 'dist-u1003', '待绑定D', 'individual'],
      [1004, 'dist-u1004', '买家E', 'individual'],
      [1005, 'dist-u1005', '待删F', 'individual'],
    ]) {
      ins.run(id, openid, name, idt, TENANT);
    }
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

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

  it('P2 打款登记：approved→done 记录流水号，缺流水号拒绝', () => {
    dist.saveConfig(TENANT, { min_withdraw: 1 });
    const ok = dist.applyWithdraw(TENANT, 1000, 'individual', 2);
    assert.ok(ok.ok);
    const wd = db.prepare("SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 ORDER BY id DESC LIMIT 1").get(TENANT);
    assert.equal(wd.status, 'pending');
    // 通过待打款
    const ap = dist.reviewWithdraw(wd.id, 'approve');
    assert.ok(ap.ok);
    // 缺流水号拒绝
    const noPay = dist.reviewWithdraw(wd.id, 'done');
    assert.equal(noPay.ok, false);
    // 登记打款完成
    const done = dist.reviewWithdraw(wd.id, 'done', '', 'ALIPAY-20260908-001', '对公转账');
    assert.ok(done.ok);
    const final = db.prepare('SELECT * FROM dist_withdraw WHERE id = ?').get(wd.id);
    assert.equal(final.status, 'done');
    assert.equal(final.pay_no, 'ALIPAY-20260908-001');
    assert.equal(final.pay_remark, '对公转账');
    assert.ok(final.paid_at);
    // 已完成后不可重复打款
    const again = dist.reviewWithdraw(wd.id, 'done', '', 'XXX');
    assert.equal(again.ok, false);
  });

  it('P5 累计提现口径：申请/驳回不累计，打款完成按实际到账累计', () => {
    dist.saveConfig(TENANT, { min_withdraw: 1 });
    const base = dist.getWallet(TENANT, 1000, 'individual').total_withdraw;
    // 申请 3 元：仅冻结，不累计
    const ok = dist.applyWithdraw(TENANT, 1000, 'individual', 3);
    assert.ok(ok.ok);
    let w = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(w.total_withdraw, base, '申请阶段不累计提现');
    const wd = db.prepare("SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 ORDER BY id DESC LIMIT 1").get(TENANT);
    // 驳回：解冻余额，不累计
    assert.ok(dist.reviewWithdraw(wd.id, 'reject', '测试驳回').ok);
    w = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(w.total_withdraw, base, '驳回不累计提现');
    // 通过并打款：按实际到账金额累计
    assert.ok(dist.applyWithdraw(TENANT, 1000, 'individual', 3).ok);
    const wd2 = db.prepare("SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 ORDER BY id DESC LIMIT 1").get(TENANT);
    assert.ok(dist.reviewWithdraw(wd2.id, 'approve').ok);
    assert.ok(dist.reviewWithdraw(wd2.id, 'done', '', 'PAY-20260909-001').ok);
    w = dist.getWallet(TENANT, 1000, 'individual');
    assert.equal(w.total_withdraw, base + wd2.actual_amount, '打款完成按实际到账累计');
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

  it('基本设置与分销参数保存/读取/默认值', () => {
    // 默认值
    let c = dist.getConfig(TENANT);
    assert.equal(c.dist_name, '推广员');
    assert.equal(c.sub_name, '下级');
    assert.equal(c.default_level, '默认等级');
    assert.equal(c.zero_order, 0);
    assert.equal(c.show_parent, 0);
    assert.equal(c.show_phone, 0);
    // 保存新字段
    c = dist.saveConfig(TENANT, {
      dist_name: '推广大使', sub_name: '伙伴', apply_top_img: '/u/a.png', promote_img: '/u/b.png',
      apply_tip: '欢迎加入推广', zero_order: 1, show_parent: 1, show_phone: 1, default_level: '黄金',
    });
    assert.equal(c.dist_name, '推广大使');
    assert.equal(c.sub_name, '伙伴');
    assert.equal(c.apply_top_img, '/u/a.png');
    assert.equal(c.promote_img, '/u/b.png');
    assert.equal(c.apply_tip, '欢迎加入推广');
    assert.equal(c.zero_order, 1);
    assert.equal(c.show_parent, 1);
    assert.equal(c.show_phone, 1);
    assert.equal(c.default_level, '黄金');
    // 空白字符串回退默认；布尔 false 关闭
    c = dist.saveConfig(TENANT, { dist_name: '  ', show_parent: 0, zero_order: 0 });
    assert.equal(c.dist_name, '推广大使');
    assert.equal(c.show_parent, 0);
    assert.equal(c.zero_order, 0);
    // 恢复默认，避免影响后续用例
    dist.saveConfig(TENANT, { dist_name: '推广员', sub_name: '下级', default_level: '默认等级', zero_order: 0, show_parent: 0, show_phone: 0 });
  });

  it('getSummary 透传基本设置/分销参数 + 上级信息', () => {
    dist.saveConfig(TENANT, { dist_name: '推广大使', sub_name: '伙伴', show_parent: 1 });
    const s = dist.getSummary(TENANT, 1002, 'individual');
    assert.equal(s.distName, '推广大使');
    assert.equal(s.subName, '伙伴');
    assert.equal(s.showParent, true);
    assert.equal(s.defaultLevel, '默认等级');
    assert.equal(typeof s.parent, 'object'); // 1002 有 pid1 上级
    dist.saveConfig(TENANT, { dist_name: '推广员', sub_name: '下级', show_parent: 0 });
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

  // ============================================================
  // P1：池式分红（合伙人/全民/类目/区域）
  // ============================================================

  it('P1 合伙人团队分红：全局模式按权重分配', () => {
    // 启用 partner 插件（dist 可停用，互不耦合）
    dist.setPlugin(TENANT, 'partner', { install: true, enable: true });
    dist.setPluginConfig(TENANT, 'partner', { mode: 2, poolRatio: 0.05 });
    dist.addPartner(TENANT, 2000, { ratio: 2, mode: 2 });
    dist.addPartner(TENANT, 2001, { ratio: 1, mode: 2 });
    const r = dist.computeOrderSplit(makeOrder({ id: 91001, userId: 1002 }));
    assert.ok(r, 'partner 插件启用即可分账');
    assert.ok(r.partner_bonus > 0, '合伙人分红 > 0');
    // 权重 2:1，2000 分得 2/3，2001 分得 1/3
    const logs = db.prepare("SELECT user_id, amount FROM dist_user_log WHERE split_id = ? AND type = 'partner' ORDER BY user_id").all(r.id);
    assert.equal(logs.length, 2);
    const w2000 = logs.find((l) => l.user_id === 2000);
    const w2001 = logs.find((l) => l.user_id === 2001);
    assert.ok(Math.abs(w2000.amount - w2001.amount * 2) <= 2, '权重分配近似 2:1');
  });

  it('P1 合伙人团队流水模式：仅团队订单参与', () => {
    dist.setPluginConfig(TENANT, 'partner', { mode: 1, poolRatio: 0.05 });
    // 1003 绑定 2000 为上级 → 属于 2000 团队；1004 无绑定 → 不属于任何团队
    dist.bindRelation(TENANT, 1003, 'individual', 2000, 'card');
    const rIn = dist.computeOrderSplit(makeOrder({ id: 91002, userId: 1003 }));
    assert.ok(rIn.partner_bonus > 0, '团队成员订单产生合伙人分红');
    const rOut = dist.computeOrderSplit(makeOrder({ id: 91003, userId: 1004 }));
    assert.ok(!rOut || rOut.partner_bonus === 0, '非团队成员订单不分（无任何收益时不分账）');
  });

  it('P1 全民股东：均等/权重分配', () => {
    dist.setPlugin(TENANT, 'share-all', { install: true, enable: true });
    dist.setPluginConfig(TENANT, 'share-all', { mode: 1, poolRatio: 0.02 });
    dist.addShareAll(TENANT, 2000, { weight: 1 });
    dist.addShareAll(TENANT, 2001, { weight: 3 });
    const rEq = dist.computeOrderSplit(makeOrder({ id: 91004, userId: 1004 }));
    assert.ok(rEq.share_all_bonus > 0);
    const logsEq = db.prepare("SELECT user_id, amount FROM dist_user_log WHERE split_id = ? AND type = 'share_all'").all(rEq.id);
    assert.equal(logsEq.length, 2);
    assert.equal(logsEq[0].amount, logsEq[1].amount, '均等模式两人等额');
    // 切权重模式
    dist.setPluginConfig(TENANT, 'share-all', { mode: 2 });
    const rW = dist.computeOrderSplit(makeOrder({ id: 91005, userId: 1004 }));
    const logsW = db.prepare("SELECT user_id, amount FROM dist_user_log WHERE split_id = ? AND type = 'share_all' ORDER BY user_id").all(rW.id);
    const w0 = logsW.find((l) => l.user_id === 2000).amount;
    const w1 = logsW.find((l) => l.user_id === 2001).amount;
    assert.ok(w1 > w0 && w1 >= w0 * 2, '权重模式按 1:3 分配');
  });

  it('P1 类目股东：按买家行业匹配', () => {
    dist.setPlugin(TENANT, 'share-cat', { install: true, enable: true });
    dist.addShareCat(TENANT, '制造业', 2000, { ratio: 0.04, weight: 1 });
    dist.addShareCat(TENANT, '制造业', 2001, { ratio: 0.04, weight: 1 });
    dist.addShareCat(TENANT, '服务业', 2000, { ratio: 0.04, weight: 1 });
    // 给 1004 建 card_profile 行业=制造业
    db.prepare("INSERT OR REPLACE INTO card_profile (user_id, name, business_field, city) VALUES (?, ?, ?, ?)").run(1004, '买家E', '制造业', '东莞');
    const r = dist.computeOrderSplit(makeOrder({ id: 91006, userId: 1004 }));
    assert.ok(r.share_cat_bonus > 0, '制造业股东分到红利');
    const logs = db.prepare("SELECT user_id FROM dist_user_log WHERE split_id = ? AND type = 'share_cat'").all(r.id);
    assert.equal(logs.length, 2, '仅制造业类目两名股东');
  });

  it('P1 区域股东：按买家地区匹配', () => {
    dist.setPlugin(TENANT, 'share-area', { install: true, enable: true });
    dist.addShareArea(TENANT, '东莞', 2000, { ratio: 0.03, weight: 1 });
    dist.addShareArea(TENANT, '广州', 2001, { ratio: 0.03, weight: 1 });
    const r = dist.computeOrderSplit(makeOrder({ id: 91007, userId: 1004 })); // city=东莞
    assert.ok(r.share_area_bonus > 0, '东莞区域股东分到红利');
    const logs = db.prepare("SELECT user_id FROM dist_user_log WHERE split_id = ? AND type = 'share_area'").all(r.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].user_id, 2000, '仅东莞股东');
  });

  it('P1 五重收益叠加 + 总让利上限裁剪', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.setPluginConfig(TENANT, 'dist', {});
    dist.saveConfig(TENANT, { ratio1: 0.2, ratio2: 0.1, max_total_ratio: 0.1 }); // 上限 10%
    const r = dist.computeOrderSplit(makeOrder({ id: 91008, userId: 1004 }));
    assert.ok(r, '可分账');
    // 1004 有绑定（1003 绑定 2000，但 1004 自身无 rel → 无佣金；总让利只约束实际收益）
    const bonusTotal = r.commission1 + r.commission2 + r.partner_bonus + r.share_all_bonus + r.share_cat_bonus + r.share_area_bonus;
    assert.ok(bonusTotal <= Math.floor(10000 * 0.1) + 4, '总收益不超过让利上限（+4 允许裁剪取整误差）');
    dist.saveConfig(TENANT, { max_total_ratio: 0.3 }); // 恢复
  });

  it('P1 成员管理：增删合伙人/股东', () => {
    const rAdd = dist.addPartner(TENANT, 1005, { ratio: 1, mode: 1 });
    assert.equal(rAdd.ok, true);
    const dup = dist.addPartner(TENANT, 1005, { ratio: 1, mode: 1 });
    assert.equal(dup.ok, false, '重复添加拒绝');
    dist.removePartner(TENANT, 1005);
    const list = dist.listPartners(TENANT);
    assert.ok(!list.some((p) => p.user_id === 1005), '移除后不在列表');

    const sa = dist.addShareCat(TENANT, '农业', 1005, { ratio: 0.05, weight: 1 });
    assert.equal(sa.ok, true);
    dist.removeShareCat(TENANT, '农业', 1005);
    assert.ok(!dist.listShareCat(TENANT, '农业').some((m) => m.user_id === 1005));

    const ar = dist.addShareArea(TENANT, '深圳', 1005, { ratio: 0.05, weight: 1 });
    assert.equal(ar.ok, true);
    dist.removeShareArea(TENANT, '深圳', 1005);
    assert.ok(!dist.listShareArea(TENANT, '深圳').some((m) => m.user_id === 1005));
  });

  it('P1 身份标签：getSummary 返回合伙人/股东标签', () => {
    dist.addPartner(TENANT, 2000, { ratio: 1, mode: 2 });
    dist.addShareAll(TENANT, 2000, { weight: 1 });
    dist.addShareCat(TENANT, '制造业', 2000, { ratio: 0.04, weight: 1 });
    dist.addShareArea(TENANT, '东莞', 2000, { ratio: 0.03, weight: 1 });
    const s = dist.getSummary(TENANT, 2000, 'individual');
    assert.equal(s.isPartner, true);
    assert.equal(s.partnerMode, 2, '合伙人模式透传（全局流水）');
    assert.ok(s.shareTags.includes('全民股东'));
    assert.ok(s.shareTags.includes('行业-制造业股东'));
    assert.ok(s.shareTags.includes('地区-东莞股东'));
    assert.ok(s.shareTags.includes('全局合伙人'));
  });

  it('P5 壳页字段：插件启用开关 + 累计业绩', () => {
    // 显式关停 dist → 开关反映 false
    dist.setPlugin(TENANT, 'dist', { enable: false });
    const s = dist.getSummary(TENANT, 2000, 'individual');
    assert.equal(s.isEnableDist, false, 'dist 停用');
    assert.equal(s.isEnablePartner, true, 'partner 插件开启');
    assert.equal(s.isEnableShareAll, true, '全民股东开启');
    assert.equal(s.isEnableShareCat, true, '类目股东开启');
    assert.equal(s.isEnableShareArea, true, '区域股东开启');
    // 恢复 dist；给 1001（1002 的上级）造一笔带佣金订单 → 累计佣金/订单
    dist.setPlugin(TENANT, 'dist', { enable: true });
    const sp = dist.computeOrderSplit(makeOrder({ id: 91098, orderNo: 'T91098', userId: 1002 }));
    assert.ok(sp && sp.commission1 > 0, '1001 获得一级佣金');
    const s2 = dist.getSummary(TENANT, 1001, 'individual');
    assert.equal(s2.isEnableDist, true, 'dist 恢复启用');
    assert.ok(s2.totalCommission > 0, '累计佣金 > 0');
    assert.ok(s2.totalOrders > 0, '累计带来订单 > 0');
  });

  it('P5 getLogs 来源字段：订单号 + 来源行业/地区（类目/区域股东明细标注）', () => {
    // 自造订单：买家1004（profile 制造业/东莞）+ 2000 已为类目/区域股东 → 生成带来源的流水
    // 注意：分红流水身份 = 股东自身身份（platform_user.identity_type），2000 为 employee
    const split = dist.computeOrderSplit(makeOrder({ id: 91099, orderNo: 'T91099', userId: 1004 }));
    assert.ok(split, '分账生成');
    const cat = dist.getLogs(TENANT, 2000, 'employee', { type: 'share_cat', pageSize: 50 });
    const row = cat.list.find((l) => l.orderId === 91099);
    assert.ok(row, '类目分红明细存在');
    assert.equal(row.typeLabel, '类目股东分红');
    assert.ok(row.orderNo, '带订单号');
    assert.equal(row.sourceCategory, '制造业', '来源行业标注');
    const area = dist.getLogs(TENANT, 2000, 'employee', { type: 'share_area', pageSize: 50 });
    const row2 = area.list.find((l) => l.orderId === 91099);
    assert.ok(row2, '区域分红明细存在');
    assert.equal(row2.sourceArea, '东莞', '来源地区标注');
    assert.equal(row2.statusLabel, '待结算');
    // 清理
    db.prepare('DELETE FROM dist_user_log WHERE split_id = ?').run(split.id);
    db.prepare('DELETE FROM dist_order_split WHERE id = ?').run(split.id);
  });

  it('P1 退款回滚覆盖分红流水', () => {
    const r = dist.computeOrderSplit(makeOrder({ id: 91009, userId: 1004 }));
    assert.ok(r.share_all_bonus > 0, '含全民分红');
    const back = dist.rollbackOrderSplit(makeOrder({ id: 91009, userId: 1004 }));
    assert.equal(back.settle_status, 'refunded');
    const logs = db.prepare("SELECT COUNT(*) n FROM dist_user_log WHERE split_id = ? AND status = 'charged_back'").get(r.id).n;
    assert.equal(logs, 5, '全民2+类目2+区域1 共5条分红流水全部回滚');
  });

  it('P2 推广分享链接：含名片ID与推广人参数，去尾斜杠', () => {
    const url = buildShareUrl(7, 'http://localhost:3000/');
    assert.ok(url.includes('id=7&inviter=7'), `链接应带 id/inviter: ${url}`);
    assert.ok(!url.includes('3000//card'), 'origin 尾部斜杠应去除');
    assert.ok(url.includes('/card/#/pages/card/cardDetail'), '落地页应为名片详情');
  });

  it('P3 提现对账CSV：BOM/表头/金额分转元/引号转义/状态中文化', () => {
    const rows = [
      { withdraw_no: 'WD1', nickname: '张三', identity_type: 'individual', amount: 1234, service_fee: 34, actual_amount: 1200, status: 'done', created_at: '2026-09-08 09:00:00', paid_at: '2026-09-08 10:00:00', pay_no: 'ALI"001', pay_remark: '对公', reject_reason: '' },
      { withdraw_no: 'WD2', nickname: '李四', identity_type: 'employee', amount: 500, service_fee: 0, actual_amount: 500, status: 'rejected', created_at: '2026-09-08 11:00:00', paid_at: null, pay_no: '', pay_remark: '', reject_reason: '信息有误' },
    ];
    const csv = buildWithdrawCsv(rows);
    assert.ok(csv.startsWith('\uFEFF'), '应带 BOM');
    assert.ok(csv.includes('"提现单号","用户","身份","提现金额(元)","手续费(元)","实际到账(元)"'), '表头完整');
    assert.ok(csv.includes('12.34') && csv.includes('12.00'), '金额应分转元两位小数');
    assert.ok(csv.includes('已完成') && csv.includes('已驳回'), '状态应中文化');
    assert.ok(csv.includes('"ALI""001"'), '含引号字段应转义');
    assert.ok(csv.includes('企业员工') && csv.includes('入驻个人'), '身份应中文化');
  });

  it('P3 批量审核：approve 多笔通过 / reject 需原因', () => {
    dist.saveConfig(TENANT, { min_withdraw: 1 });
    // 充足余额（避免被前序用例耗尽）
    db.prepare("UPDATE dist_wallet SET available = 10000, total_income = total_income + 10000 WHERE tenant_id = ? AND user_id = 1000 AND identity_type = 'individual'").run(TENANT);
    const u1 = db.prepare('SELECT id FROM platform_user WHERE id = 1000').get();
    assert.ok(u1);
    dist.applyWithdraw(TENANT, 1000, 'individual', 2);
    dist.applyWithdraw(TENANT, 1000, 'individual', 3);
    const wds = db.prepare("SELECT id FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 AND status = 'pending' ORDER BY id").all(TENANT);
    assert.equal(wds.length, 2);
    // 模拟路由批量 approve（服务层循环）
    let okCount = 0;
    for (const w of wds) { const r = dist.reviewWithdraw(w.id, 'approve'); if (r.ok) okCount++; }
    assert.equal(okCount, 2);
    const after = db.prepare("SELECT count(*) n FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 AND status = 'approved'").get(TENANT).n;
    assert.equal(after, 2);
  });

  it('P3 佣金明细CSV：类型/状态中文化 + 订单号可对账', () => {
    const rows = [
      { nickname: '张三', identity_type: 'individual', type: 'level1', amount: 1234, status: 'settled', order_no: 'PAY-DEMO-1', created_at: '2026-09-08 10:00:00' },
      { nickname: '李四', identity_type: 'employee', type: 'share_area', amount: -500, status: 'charged_back', order_no: 'PAY-DEMO-2', created_at: '2026-09-08 11:00:00' },
    ];
    const csv = buildLogCsv(rows);
    assert.ok(csv.startsWith('\uFEFF'), '应带 BOM');
    assert.ok(csv.includes('"用户","身份","收益类型","金额(元)","状态","订单号","时间"'), '表头完整');
    assert.ok(csv.includes('一级佣金') && csv.includes('区域股东'), '类型应中文化');
    assert.ok(csv.includes('已结算') && csv.includes('已扣回'), '状态应中文化');
    assert.ok(csv.includes('PAY-DEMO-1') && csv.includes('-5.00'), '订单号可追溯、负数金额保留');
  });

  it('P4 关系树：按 pid1 展开层级 + 根节点判定 + 身份标签', () => {
    // 根 user1000 无上级；user1001 上级=1000；user1002 上级=1001（两层）
    const relations = [
      { userId: 1000, pid1: null, nickname: '上级A', identity_type: 'individual' },
      { userId: 1001, pid1: 1000, nickname: '中间B', identity_type: 'individual' },
      { userId: 1002, pid1: 1001, nickname: '买家C', identity_type: 'individual' },
    ];
    const tagMap = new Map([[1000, ['合伙人']]]);
    const tree = buildRelationTree(relations, tagMap);
    assert.equal(tree.length, 1, '只有 1 个根');
    assert.equal(tree[0].userId, 1000);
    assert.deepEqual(tree[0].tags, ['合伙人'], '根带合伙人标签');
    assert.equal(tree[0].children[0].userId, 1001, '第二层');
    assert.equal(tree[0].children[0].children[0].userId, 1002, '第三层');
    // 防环：pid1 指向自己形成环，不无限递归
    const cyclic = buildRelationTree([{ userId: 1000, pid1: 1000, nickname: '环', identity_type: 'individual' }]);
    assert.equal(cyclic.length, 0, '自环应被防环剪枝');
  });

  it('P4 月度汇总：byType/合计/结算状态 + 汇总CSV', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.bindRelation(TENANT, 1000, 'individual', null);
    dist.bindRelation(TENANT, 1001, 'individual', 1000);
    // 造一笔 100 元订单走分账（佣金入账）
    const order = { id: 99999, orderNo: 'DEMO-MONTH-1', payerType: 'tenant', customerId: TENANT, userId: 1001, buyerIdentityType: 'individual', amount: 10000, status: 'paid' };
    dist.computeOrderSplit(order);
    const summary = dist.monthlySummary(TENANT, new Date().toISOString().slice(0, 7));
    assert.ok(summary.total >= 1000, `当月佣金总额 >= 10元（实际 ${summary.total / 100}）`);
    assert.ok(summary.byType.level1 >= 1000, '一级佣金入账');
    assert.ok(summary.byUser.length >= 1, '按用户分组有数据');
    const csv = buildMonthlyCsv(summary);
    assert.ok(csv.startsWith('\uFEFF'), '带 BOM');
    assert.ok(csv.includes('"用户","一级佣金(元)"'), '表头含类型列');
    assert.ok(csv.includes('合计') && csv.includes('10.00'), '末行合计与类型金额');
  });

  it('P4 累计收益：分账入账即计入 total_income（待结算也算累计）', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.setPlugin(TENANT, 'partner', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-all', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-cat', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-area', { install: false, enable: false });
    const buyerId = 1002;
    dist.bindRelation(TENANT, buyerId, 'individual', 1000);
    db.prepare("UPDATE dist_wallet SET total_income = 0 WHERE tenant_id = ? AND user_id = 1000 AND identity_type = 'individual'").run(TENANT);
    const order = { id: 88881, orderNo: 'DEMO-INCOME-1', payerType: 'tenant', customerId: TENANT, userId: buyerId, buyerIdentityType: 'individual', amount: 10000, status: 'paid' };
    dist.computeOrderSplit(order);
    const w = db.prepare("SELECT wait_settle, total_income, available FROM dist_wallet WHERE tenant_id = ? AND user_id = 1000 AND identity_type = 'individual'").get(TENANT);
    assert.equal(w.total_income, 1000, `分账入账即累计收益（实际 ${w.total_income / 100} 元）`);
    assert.ok(w.wait_settle >= w.total_income, '待结算期间：累计收益不超过待结算总额（历史待结算留存）');
  });

  it('P4 下级客户列表：直推/间推 + 是否付费标记', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.setPlugin(TENANT, 'partner', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-all', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-cat', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-area', { install: false, enable: false });
    // user1005 新用户（此前未被绑定），直推绑定 1002
    dist.bindRelation(TENANT, 1005, 'individual', 1002, 'qrcode');
    const direct = dist.getSubs(TENANT, 1002, 'individual', { level: 1 });
    assert.ok(direct.list.some((r) => r.userId === 1005), '直推列表含 user1005');
    assert.ok(direct.list.every((r) => typeof r.paid === 'boolean'), 'paid 布尔标记');
    assert.ok(typeof direct.total === 'number', '总数');
    // user1005 的 pid2 = 1002 的 pid1 = 1001 → 1001 间推含 1005
    const indirect = dist.getSubs(TENANT, 1001, 'individual', { level: 2 });
    assert.ok(indirect.list.some((r) => r.userId === 1005), '1001 的间推列表含 user1005（1005 的 pid2=1001）');
  });

  it('P4 分账快照：逐笔订单分账明细 + 结算状态筛选', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.setPlugin(TENANT, 'partner', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-all', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-cat', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-area', { install: false, enable: false });
    // user1004 已存在且未被绑定，直推绑定 1000
    const buyerId = 1004;
    dist.bindRelation(TENANT, buyerId, 'individual', 1000);
    const order = { id: 88882, orderNo: 'DEMO-SPLIT-SNAP', payerType: 'tenant', customerId: TENANT, userId: buyerId, buyerIdentityType: 'individual', amount: 10000, status: 'paid' };
    dist.computeOrderSplit(order);
    const all = dist.getSplits(TENANT, { page: 1, pageSize: 50 });
    const snap = all.list.find((s) => s.orderNo === 'DEMO-SPLIT-SNAP');
    assert.ok(snap, '快照存在');
    assert.equal(snap.orderAmount, 10000, '订单金额（分）');
    assert.equal(snap.settleStatus, 'pending', '初始待结算');
    assert.ok(snap.commission1 >= 1000, '一级佣金分账');
    const pend = dist.getSplits(TENANT, { settleStatus: 'pending' });
    assert.ok(pend.list.some((s) => s.orderNo === 'DEMO-SPLIT-SNAP'), '按状态筛选命中');
    const settled = dist.getSplits(TENANT, { settleStatus: 'settled' });
    assert.ok(!settled.list.some((s) => s.orderNo === 'DEMO-SPLIT-SNAP'), '未结算不出现在已结算筛选');
  });

  it('P4 分销商开通门槛：付费用户门槛 / 指定名单门槛', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.setPlugin(TENANT, 'partner', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-all', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-cat', { install: false, enable: false });
    dist.setPlugin(TENANT, 'share-area', { install: false, enable: false });
    const buyerId = 1001; // 1001 已绑定 pid1=1000（1002 的 pid1 是 1001）
    // 造已支付订单的辅助
    const paid = (uid) => db.prepare("INSERT INTO payment_orders (order_no, payer_type, customer_id, user_id, solution, product_type, amount, status) VALUES (?, 'tenant', ?, ?, 'card', 'member', 3000, 'paid')")
      .run(`PAID-GATE-${Date.now()}-${uid}`, TENANT, uid);
    dist.saveConfig(TENANT, { distributor_gate: 1 }); // 付费用户门槛
    const cfg = dist.getConfig(TENANT);
    assert.equal(cfg.distributor_gate, 1, '门槛落库');
    // 1000 无付费订单 → 不返佣（无收益不产生快照）
    let r = dist.computeOrderSplit(makeOrder({ id: 92001, userId: buyerId }));
    assert.equal(r, null, 'gate=1 无付费订单不返佣');
    // 给 1000 造一笔已支付订单 → 恢复返佣
    paid(1000);
    r = dist.computeOrderSplit(makeOrder({ id: 92002, userId: buyerId }));
    assert.ok(r.commission1 >= 600, 'gate=1 付费后返佣');
    // 指定名单门槛：不在名单不返佣；加入名单恢复
    dist.saveConfig(TENANT, { distributor_gate: 2 });
    r = dist.computeOrderSplit(makeOrder({ id: 92003, userId: buyerId }));
    assert.equal(r, null, 'gate=2 名单外不返佣');
    const add = dist.addDistributor(TENANT, 1000, 'individual');
    assert.ok(add.ok, '白名单添加成功');
    assert.ok(!dist.addDistributor(TENANT, 1000, 'individual').ok, '重复添加拒绝');
    r = dist.computeOrderSplit(makeOrder({ id: 92004, userId: buyerId }));
    assert.ok(r.commission1 >= 600, 'gate=2 名单内返佣');
    dist.removeDistributor(TENANT, 1000, 'individual');
    dist.saveConfig(TENANT, { distributor_gate: 0 }); // 还原无门槛
  });

  it('P4 提现审核通知：审核/驳回/打款写站内消息', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.saveConfig(TENANT, { min_withdraw: 1 });
    // 1000 有余额（前面用例已恢复 500 分）
    const w = dist.applyWithdraw(TENANT, 1000, 'individual', 2);
    assert.ok(w.ok, '提现申请成功');
    const row = db.prepare("SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 ORDER BY id DESC LIMIT 1").get(TENANT);
    const approved = dist.reviewWithdraw(row.id, 'approve');
    assert.ok(approved.ok, '审核通过');
    let msgs = db.prepare('SELECT * FROM card_message WHERE customer_id = ? AND user_id = ? ORDER BY id DESC').all(TENANT, 1000);
    assert.ok(msgs.some((m) => m.title === '提现审核通过'), '审核通过通知已写入');
    const done = dist.reviewWithdraw(row.id, 'done', '', 'ALIPAY-TEST-001');
    assert.ok(done.ok, '打款完成');
    msgs = db.prepare('SELECT * FROM card_message WHERE customer_id = ? AND user_id = ? ORDER BY id DESC').all(TENANT, 1000);
    assert.ok(msgs.some((m) => m.title === '提现打款完成' && m.content.includes('ALIPAY-TEST-001')), '打款完成通知含流水号');
    const w2 = dist.applyWithdraw(TENANT, 1000, 'individual', 1);
    assert.ok(w2.ok, '第二笔提现申请成功');
    const row2 = db.prepare("SELECT * FROM dist_withdraw WHERE tenant_id = ? AND user_id = 1000 ORDER BY id DESC LIMIT 1").get(TENANT);
    dist.reviewWithdraw(row2.id, 'reject', '资料不完整');
    msgs = db.prepare('SELECT * FROM card_message WHERE customer_id = ? AND user_id = ? ORDER BY id DESC').all(TENANT, 1000);
    assert.ok(msgs.some((m) => m.title === '提现审核驳回' && m.content.includes('资料不完整')), '驳回通知含原因');
  });

  it('P4 分销商排行：按累计收益降序 + 直推人数 + 身份标签', () => {
    // user1000 已有收益（前面用例累计入账），user1002 无收益
    const list = dist.ranking(TENANT, 10);
    assert.ok(Array.isArray(list) && list.length >= 1, '有排行数据');
    // 降序校验
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].totalIncome >= list[i].totalIncome, '按累计收益降序');
    assert.ok(list[0].rank === 1 && list[0].nickname, 'rank 与昵称');
    assert.ok(typeof list[0].directCount === 'number', '直推人数');
    assert.ok(Array.isArray(list[0].tags), '身份标签数组');
  });

  it('P4 分销商申请链路：提交申请 → 租户后台审核通过 → 自动入白名单', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.saveConfig(TENANT, { distributor_gate: 2 }); // 指定名单门槛
    // 新用户（前面用例未占用）：1006
    const uid = 1006;
    // 未申请前：可申请
    let st = dist.getApplyStatus(TENANT, uid, 'individual');
    assert.equal(st.gate, 2, '门槛=2');
    assert.equal(st.inWhitelist, false, '非白名单');
    assert.equal(st.canApply, true, '可申请');
    // 提交申请
    const apply = dist.applyDistributor(TENANT, uid, 'individual');
    assert.ok(apply.ok, '提交申请成功');
    // 重复提交拒绝
    const again = dist.applyDistributor(TENANT, uid, 'individual');
    assert.ok(!again.ok, '重复提交拒绝');
    // 后台申请列表
    let list = dist.getApplies(TENANT, 'pending');
    const row = list.find((a) => a.user_id === uid);
    assert.ok(row && row.status === 'pending', '申请出现在待审核列表');
    // 审核通过 → 自动入白名单
    const rv = dist.reviewApply(TENANT, row.id, 'approve');
    assert.ok(rv.ok, '审核通过');
    st = dist.getApplyStatus(TENANT, uid, 'individual');
    assert.equal(st.inWhitelist, true, '自动入白名单');
    assert.equal(st.applyStatus, 'approved', '申请状态=已通过');
    assert.equal(st.canApply, false, '已通过不可再申请');
    // 已入白名单再提交 → 拒绝
    assert.ok(!dist.applyDistributor(TENANT, uid, 'individual').ok, '已是分销商不可再申请');
    // 已处理申请不可重复审核
    assert.ok(!dist.reviewApply(TENANT, row.id, 'approve').ok, '已处理不可重复审核');
    dist.saveConfig(TENANT, { distributor_gate: 0 }); // 还原无门槛
  });

  it('P4 分销商申请驳回：带原因落库 + 可重新申请', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.saveConfig(TENANT, { distributor_gate: 2 });
    const uid = 1007; // 新用户
    dist.applyDistributor(TENANT, uid, 'individual');
    const row = dist.getApplies(TENANT, 'pending').find((a) => a.user_id === uid);
    assert.ok(row, '申请存在');
    const rv = dist.reviewApply(TENANT, row.id, 'reject', '行业不符合');
    assert.ok(rv.ok, '驳回成功');
    const st = dist.getApplyStatus(TENANT, uid, 'individual');
    assert.equal(st.applyStatus, 'rejected', '申请状态=已驳回');
    assert.equal(st.rejectReason, '行业不符合', '驳回原因落库');
    assert.equal(st.canApply, true, '驳回后可重新申请');
    // 重新申请成功
    assert.ok(dist.applyDistributor(TENANT, uid, 'individual').ok, '驳回后重新提交成功');
    dist.saveConfig(TENANT, { distributor_gate: 0 }); // 还原无门槛
  });

  it('P5 关系设置+分享设置+申请协议+分销须知：保存/读取/默认值/清空', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    let c = dist.saveConfig(TENANT, {
      bind_rule: 1, become_rule: 5, become_amount: 0, become_products: '会员套餐,增值包',
      share_title: '来我的名片看看', share_img: 'https://x.com/share.png',
      apply_agreement: '<p>分销协议内容</p>', dist_notice: '<p>分销须知内容</p>',
    });
    assert.equal(c.bind_rule, 1, '成为下线=首次下单');
    assert.equal(c.become_rule, 5, '成为分销商=指定商品');
    assert.equal(c.become_products, '会员套餐,增值包', '指定商品落库');
    assert.equal(c.share_title, '来我的名片看看', '分享标题');
    assert.equal(c.share_img, 'https://x.com/share.png', '分享图');
    assert.equal(c.apply_agreement, '<p>分销协议内容</p>', '申请协议');
    assert.equal(c.dist_notice, '<p>分销须知内容</p>', '分销须知');
    // 非法值回退
    c = dist.saveConfig(TENANT, { bind_rule: 9, become_rule: -1 });
    assert.equal(c.bind_rule, 1, '非法 bind_rule 保留旧值');
    assert.equal(c.become_rule, 5, '非法 become_rule 保留旧值');
    // 允许清空（富文本/标题）
    c = dist.saveConfig(TENANT, { share_title: '', apply_agreement: '', dist_notice: '' });
    assert.equal(c.share_title, '', '分享标题可清空');
    assert.equal(c.apply_agreement, '', '申请协议可清空');
    assert.equal(c.dist_notice, '', '分销须知可清空');
    // 还原
    dist.saveConfig(TENANT, { bind_rule: 0, become_rule: 0, become_amount: 0, become_products: '', share_title: '', share_img: '', apply_agreement: '', dist_notice: '' });
  });

  it('P5 成为分销商资格判定：无条件/申请制/总消费/购买商品/指定商品', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    // 用全新用户验证（无上级绑定、初始不在白名单），开启自购返佣便于验证资格开关
    const uid = 1011;
    db.prepare("INSERT INTO platform_user (id, openid, nickname, identity_type) VALUES (?, ?, ?, 'individual')").run(uid, 'dist-u1011', '资格判定用户');
    // 无条件
    dist.saveConfig(TENANT, { become_rule: 0, is_self_buy: 1 });
    assert.ok(dist.computeOrderSplit(makeOrder({ id: 90220, orderNo: 'T90220', userId: uid })), '无条件直接分账');
    // 申请制（白名单）
    dist.saveConfig(TENANT, { become_rule: 2 });
    assert.equal(dist.computeOrderSplit(makeOrder({ id: 90221, orderNo: 'T90221', userId: uid })), null, '申请制名单外不分账');
    dist.addDistributor(TENANT, uid, 'individual');
    assert.ok(dist.computeOrderSplit(makeOrder({ id: 90222, orderNo: 'T90222', userId: uid })), '名单内自购返佣分账');
    dist.removeDistributor(TENANT, uid, 'individual');
    // 总消费金额（100 元 = 10000 分）：买家累计 0 → 不分账；造一笔 paid 订单后再分账
    dist.saveConfig(TENANT, { become_rule: 3, become_amount: 100 });
    assert.equal(dist.computeOrderSplit(makeOrder({ id: 90223, orderNo: 'T90223', userId: uid })), null, '累计消费不足不分账');
    db.prepare("INSERT INTO payment_orders (order_no, payer_type, customer_id, user_id, solution, product_type, product_name, amount, status) VALUES ('T90224', 'tenant', ?, ?, 'card', 'member', '会员套餐', 12000, 'paid')").run(TENANT, uid);
    assert.ok(dist.computeOrderSplit(makeOrder({ id: 90225, orderNo: 'T90225', userId: uid })), '累计消费达标分账');
    // 购买商品（有 paid 订单即可）
    dist.saveConfig(TENANT, { become_rule: 4, become_amount: 0 });
    assert.ok(dist.computeOrderSplit(makeOrder({ id: 90226, orderNo: 'T90226', userId: uid })), '购买商品=有付费订单分账');
    // 指定商品：订单含「会员套餐」→ 分账；含「其他商品」→ 不分账
    dist.saveConfig(TENANT, { become_rule: 5, become_amount: 0, become_products: '会员套餐' });
    assert.ok(dist.computeOrderSplit(makeOrder({ id: 90227, orderNo: 'T90227', userId: uid })), '指定商品命中分账');
    dist.saveConfig(TENANT, { become_rule: 5, become_products: '不存在的商品' });
    assert.equal(dist.computeOrderSplit(makeOrder({ id: 90228, orderNo: 'T90228', userId: uid })), null, '指定商品未命中不分账');
    // 还原
    dist.saveConfig(TENANT, { become_rule: 0, become_amount: 0, become_products: '', is_self_buy: 0 });
  });

  it('P5 成为下线规则：首次下单 pending→支付结算 / 仅分销商海报限制来源', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    // 首次下单：未付费 → pending；付费后绑定 → bound；支付成功后 pending 结算
    dist.saveConfig(TENANT, { bind_rule: 1 });
    let r = dist.bindRelation(TENANT, 1008, 'individual', 1001, 'qrcode');
    assert.ok(r.ok, '首次下单规则：先写意向');
    assert.equal(r.relation.status, 'pending', '未付费写 pending');
    assert.equal(dist.getSummary(TENANT, 1008, 'individual').directCount, 0, 'pending 不计入直推');
    // 造一笔 paid 订单触发结算
    db.prepare("INSERT INTO payment_orders (order_no, payer_type, customer_id, user_id, solution, product_type, product_name, amount, status) VALUES ('T90229', 'tenant', ?, 1008, 'card', 'member', '会员套餐', 10000, 'paid')").run(TENANT);
    dist.settlePendingRelations({ customerId: TENANT, userId: 1008 });
    r = dist.getRelation(TENANT, 1008, 'individual');
    assert.equal(r.status, 'bound', '支付后结算为 bound');
    assert.equal(dist.getSummary(TENANT, 1001, 'individual').directCount >= 1, true, '结算后计入直推');
    // 仅分销商海报：card 来源忽略，qrcode 来源绑定
    dist.saveConfig(TENANT, { bind_rule: 2 });
    const u2 = 1009;
    r = dist.bindRelation(TENANT, u2, 'individual', 1001, 'card');
    assert.ok(r.ok && r.ignored === true, '非海报来源静默忽略');
    assert.equal(dist.getRelation(TENANT, u2, 'individual'), null, '未建立关系');
    r = dist.bindRelation(TENANT, u2, 'individual', 1001, 'qrcode');
    assert.ok(r.ok && r.relation.status === 'bound', '海报来源正常绑定');
    // 还原
    dist.saveConfig(TENANT, { bind_rule: 0 });
  });

  it('P5 申请即通过（become_rule=1）：提交自动入白名单 + getSummary 透传新字段', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.saveConfig(TENANT, { become_rule: 1, share_title: '来名片', dist_notice: '<p>须知</p>', apply_agreement: '<p>协议</p>' });
    const uid = 1010;
    assert.ok(dist.applyDistributor(TENANT, uid, 'individual').ok, '申请即通过：提交成功');
    const st = dist.getApplyStatus(TENANT, uid, 'individual');
    assert.equal(st.applyStatus, 'approved', '自动通过');
    assert.equal(st.inWhitelist, true, '自动入白名单');
    assert.equal(st.canApply, false, '已通过不可再申请');
    const s = dist.getSummary(TENANT, 1001, 'individual');
    assert.equal(s.bindRule, 0, 'summary 透传 bindRule');
    assert.equal(s.becomeRule, 1, 'summary 透传 becomeRule');
    assert.equal(s.shareTitle, '来名片', 'summary 透传 shareTitle');
    assert.equal(s.distNotice, '<p>须知</p>', 'summary 透传 distNotice');
    assert.equal(s.applyAgreement, '<p>协议</p>', 'summary 透传 applyAgreement');
    // 还原
    dist.saveConfig(TENANT, { become_rule: 0, share_title: '', dist_notice: '', apply_agreement: '' });
  });

  it('P5 自购返佣不重复入账（有上级绑定 + 自购返佣开启 → 仅一条自购流水）', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    dist.saveConfig(TENANT, { become_rule: 0, is_self_buy: 1, ratio1: 0.2, max_total_ratio: 0.3, is_open_level2: 1 });
    const uid = 1012;
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, ?, ?, 'individual')")
      .run(uid, 'dist-u1012', '自购复测用户', TENANT);
    // 上级：同租户用户 1001（已入驻）
    const r = dist.bindRelation(TENANT, uid, 'individual', 1001, 'qrcode');
    assert.ok(r.ok, '绑定上级成功');
    const split = dist.computeOrderSplit(makeOrder({ id: 90230, orderNo: 'T90230', userId: uid }));
    assert.ok(split, '分账生成');
    const logs = db.prepare('SELECT type, amount, remark FROM dist_user_log WHERE split_id = ?').all(split.id);
    const selfLogs = logs.filter((l) => l.remark === '自购返佣');
    assert.equal(selfLogs.length, 1, '自购返佣只入账一条');
    assert.equal(split.commission1, selfLogs.reduce((s, l) => s + l.amount, 0), '快照 commission1 与自购流水一致');
    // 清理
    db.prepare('DELETE FROM dist_user_log WHERE split_id = ?').run(split.id);
    db.prepare('DELETE FROM dist_order_split WHERE id = ?').run(split.id);
    db.prepare('DELETE FROM dist_user_relation WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM dist_wallet WHERE user_id = ? AND tenant_id = ?').run(uid, TENANT);
    db.prepare('DELETE FROM platform_user WHERE id = ?').run(uid);
    dist.saveConfig(TENANT, { is_self_buy: 0 });
  });

  it('P5 跨租户绑定拦截：未入驻用户/其它租户用户不能成为上级，同租户可绑定', () => {
    dist.setPlugin(TENANT, 'dist', { install: true, enable: true });
    const buyer = 1013;
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, ?, ?, 'individual')")
      .run(buyer, 'dist-u1013', '绑定买家', TENANT);
    // 未入驻用户（customer_id NULL）
    const stranger = 1014;
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id) VALUES (?, ?, ?, NULL)").run(stranger, 'dist-u1014', '未入驻路人');
    let r = dist.bindRelation(TENANT, buyer, 'individual', stranger, 'qrcode');
    assert.equal(r.ok, false, '未入驻用户不能成为上级');
    assert.match(r.error || '', /客户项目/, '报错提示上级不在当前客户项目');
    // 其它租户用户
    const other = 1015;
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id) VALUES (?, ?, ?, 9999)").run(other, 'dist-u1015', '其它租户用户');
    r = dist.bindRelation(TENANT, buyer, 'individual', other, 'qrcode');
    assert.equal(r.ok, false, '其它租户用户不能成为上级');
    // 同租户用户可绑定
    const same = 1016;
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, ?, ?, 'individual')")
      .run(same, 'dist-u1016', '同租户上级', TENANT);
    r = dist.bindRelation(TENANT, buyer, 'individual', same, 'qrcode');
    assert.ok(r.ok, '同租户用户可绑定');
    assert.equal(r.relation.pid1, same, 'pid1 落库正确');
    // 清理
    db.prepare('DELETE FROM dist_user_relation WHERE user_id IN (?, ?)').run(buyer, same);
    db.prepare('DELETE FROM platform_user WHERE id IN (?, ?, ?, ?)').run(buyer, stranger, other, same);
  });

  it('P6 分销等级：门槛判定 + 默认种子 + CRUD 幂等', () => {
    // 租户无等级配置时回退默认模板（tenant 0 种子）
    const levels = dist.getLevels(TENANT);
    assert.ok(levels.length >= 3, '默认等级种子 ≥3');
    assert.equal(levels[0].name, '默认等级');
    // 判定：0 收益 → 1 级
    let r = dist.resolveLevel(TENANT, 0, 0);
    assert.equal(r.currentLevel.no, 1);
    assert.equal(r.currentLevel.name, '默认等级');
    assert.ok(r.nextLevel && r.nextLevel.no > 1, '有下一等级');
    // 判定：累计收益 200000 分（¥2000）且直推 20 人 → 命中白银（≥10 万/≥10 人）
    r = dist.resolveLevel(TENANT, 200000, 20);
    assert.equal(r.currentLevel.no, 2);
    assert.equal(r.currentLevel.name, '白银推广员');
    // 判定：累计收益 600000（¥6000）→ 黄金
    r = dist.resolveLevel(TENANT, 600000, 0);
    assert.equal(r.currentLevel.no, 3);
    assert.equal(r.currentLevel.name, '黄金推广员');
    // 保存新等级（upsert 按 level_no）
    const lv = dist.saveLevel(TENANT, { levelNo: 2, name: '青铜推广员', minTotalIncome: 50000, minDirect: 5 });
    assert.equal(lv.name, '青铜推广员');
    // 同名 level_no 再保存 = 更新不重复插入
    const lv2 = dist.saveLevel(TENANT, { levelNo: 2, name: '青铜推广员V2', minTotalIncome: 80000, minDirect: 8 });
    assert.equal(lv2.id, lv.id, '同 level_no 更新不新增');
    const after = dist.getLevels(TENANT);
    assert.equal(after.filter((x) => x.level_no === 2).length, 1);
    // 删除：至少保留一级（删除后序号顺延补位）
    const del = dist.deleteLevel(TENANT, lv.id);
    assert.ok(del.ok);
    const afterDel = dist.getLevels(TENANT);
    assert.equal(afterDel.filter((x) => x.name === '青铜推广员V2').length, 0, '被删等级已移除');
    assert.ok(afterDel.length >= 2, '删除后等级仍 ≥2');
    // 等级判定与 getSummary 联动
    const g = dist.getSummary(TENANT, 1001, 'individual');
    assert.ok(g.currentLevelName && g.currentLevelNo >= 1, 'summary 返回等级');
    // 恢复白银默认名，避免影响其它用例
    dist.saveLevel(TENANT, { levelNo: 2, name: '白银推广员', minTotalIncome: 100000, minDirect: 10 });
  });

  it('P7 微信订阅消息：payload 构造 + 未配置跳过 + 可发分支（注入 _sendSub）+ 结算聚合', () => {
    // payload 构造（模块级 svc.buildSubscribePayload）
    const p1 = dist.buildSubscribePayload('withdraw_review', { result: '提现审核通过', amount: 12345, reason: '等待打款' });
    assert.equal(p1.thing1, '提现审核通过');
    assert.equal(p1.amount2, '¥123.45');
    const p2 = dist.buildSubscribePayload('withdraw_done', { amount: 10000, payNo: 'WX2026' });
    assert.match(p2.thing3, /WX2026/);
    const p3 = dist.buildSubscribePayload('settle', { amount: 5000, note: '共 2 笔收益已结算' });
    assert.equal(p3.thing1, '分销收益到账');
    // 未配置 → skipped
    let r = dist.sendSubscribe(TENANT, 1001, 'settle', { amount: 100 });
    assert.ok(r.skipped, '未配置订阅模板时跳过');
    // 配置 + openid + mp 渠道 → 走发送（stub _sendSub 收集）
    const sent = [];
    dist.setPluginConfig(TENANT, 'dist', { subscribe: { enabled: true, tmplReview: 'TMPL_REV', tmplSettle: 'TMPL_SET', tmplDone: 'TMPL_DONE' } });
    db.prepare("INSERT OR IGNORE INTO channel_apps (customer_id, channel_type, appid, auth_status) VALUES (?, 'mp', 'wx-test-appid', 'authorized')")
      .run(TENANT);
    const orig = dist._sendSub;
    dist._sendSub = async (payload) => { sent.push(payload); };
    try {
      r = dist.sendSubscribe(TENANT, 1001, 'settle', { amount: 8888 });
      assert.ok(r.ok, '配置齐备应可发送');
      r = dist.sendSubscribe(TENANT, 1001, 'withdraw_done', { amount: 2000, payNo: 'NO1' });
      assert.ok(r.ok);
      // 无 openid 用户 → skipped
      db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, '', ?, ?, 'individual')")
        .run(9017, '无openid用户', TENANT);
      r = dist.sendSubscribe(TENANT, 9017, 'settle', { amount: 100 });
      assert.equal(r.skipped, 'no-openid');
    } finally {
      dist._sendSub = orig;
      db.prepare("DELETE FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND appid = 'wx-test-appid'").run(TENANT);
      db.prepare('DELETE FROM platform_user WHERE id = ?').run(9017);
    }
    assert.equal(sent.length, 2, '两次发送均被捕获');
    assert.equal(sent[0].templateId, 'TMPL_SET');
    assert.equal(sent[0].openid.length > 0, true);
    assert.equal(sent[0].data.amount2, '¥88.88');
    // 结算聚合：notifySettled 按租户+用户聚合（stub sendSubscribe）
    const calls = [];
    const orig2 = dist.sendSubscribe;
    dist.sendSubscribe = (tenantId, userId, type, extra) => { calls.push({ tenantId, userId, type, extra }); return { ok: true }; };
    try {
      dist.notifySettled([
        { tenant_id: TENANT, user_id: 1001, identity_type: 'individual', amount: 1000 },
        { tenant_id: TENANT, user_id: 1001, identity_type: 'individual', amount: 2000 },
        { tenant_id: TENANT, user_id: 1002, identity_type: 'individual', amount: 5000 },
      ]);
    } finally {
      dist.sendSubscribe = orig2;
    }
    assert.equal(calls.length, 2, '两个用户各一条聚合消息');
    assert.equal(calls[0].extra.amount, 3000, '同用户金额聚合');
    assert.match(calls[0].extra.note, /2 笔/);
  });

  it('P8 合伙人团队递归（buildTeam 防环/层级）+ summary 类目/区域分组字段', () => {
    // 造链：9018 → 9019 → 9020（三层）
    const uid = (id) => db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, ?, ?, 'individual')")
      .run(id, `openid_${id}`, `用户${id}`, TENANT);
    [9018, 9019, 9020].forEach(uid);
    db.prepare("INSERT OR IGNORE INTO dist_user_relation (tenant_id, user_id, pid1, pid2, identity_type, source_type, status, bind_time) VALUES (?, ?, ?, NULL, 'individual', 'qrcode', 'bound', datetime('now'))")
      .run(TENANT, 9019, 9018);
    db.prepare("INSERT OR IGNORE INTO dist_user_relation (tenant_id, user_id, pid1, pid2, identity_type, source_type, status, bind_time) VALUES (?, ?, ?, ?, 'individual', 'qrcode', 'bound', datetime('now'))")
      .run(TENANT, 9020, 9019, 9018);
    try {
      const t = dist.buildTeam(TENANT, 9018, 'individual');
      assert.equal(t.total, 2, '团队含两层下级');
      assert.equal(t.team[0].level, 1);
      assert.equal(t.team[1].level, 2);
      assert.ok(t.team.find((m) => m.id === 9019));
      assert.ok(t.team.find((m) => m.id === 9020));
      // 无团队用户返回空
      const empty = dist.buildTeam(TENANT, 9020, 'individual');
      assert.equal(empty.total, 0);
      // summary 分组字段（空数组存在，避免前端 undefined）
      const s = dist.getSummary(TENANT, 9018, 'individual');
      assert.ok(Array.isArray(s.shareCatGroups));
      assert.ok(Array.isArray(s.shareAreaGroups));
    } finally {
      db.prepare('DELETE FROM dist_user_relation WHERE tenant_id = ? AND user_id IN (9018,9019,9020)').run(TENANT);
      db.prepare('DELETE FROM platform_user WHERE id IN (9018,9019,9020)').run();
    }
  });

  it('P9 海报模板库：数组存 JSON、空 URL 过滤、getSummary 透传', () => {
    try {
      dist.saveConfig(TENANT, { poster_templates: [{ id: 'a', url: 'https://img.example/a.png' }, { id: 'b', url: '' }, { id: 'c', url: 'https://img.example/c.png' }] });
      const cfg = dist.getConfig(TENANT);
      const arr = JSON.parse(cfg.poster_templates || '[]');
      assert.equal(arr.length, 2, '空 URL 模板被过滤');
      assert.equal(arr[0].url, 'https://img.example/a.png');
      const s = dist.getSummary(TENANT, 1001, 'individual');
      assert.ok(Array.isArray(s.posterTemplates));
      assert.equal(s.posterTemplates.length, 2);
      assert.equal(s.posterTemplates[1].id, 'c');
    } finally {
      dist.saveConfig(TENANT, { poster_templates: [] });
    }
  });

  it('P10 合伙人团队流水：成员订单明细 + 空团队返回空', () => {
    [9021, 9022].forEach((id) => db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, ?, ?, 'individual')")
      .run(id, `openid_${id}`, `用户${id}`, TENANT));
    db.prepare("INSERT OR IGNORE INTO dist_user_relation (tenant_id, user_id, pid1, pid2, identity_type, source_type, status, bind_time) VALUES (?, ?, ?, NULL, 'individual', 'qrcode', 'bound', datetime('now'))")
      .run(TENANT, 9022, 9021);
    db.prepare("INSERT OR IGNORE INTO dist_order_split (tenant_id, order_id, order_no, order_amount, buyer_user_id, buyer_identity_type, partner_bonus, total_bonus, settle_status) VALUES (?, ?, 'TEAM-ORDER-1', 10000, 9022, 'individual', 500, 500, 'pending')")
      .run(TENANT, 99021);
    try {
      const t = dist.getTeamOrders(TENANT, 9021, 'individual');
      assert.equal(t.total, 1);
      assert.equal(t.list[0].orderNo, 'TEAM-ORDER-1');
      assert.equal(t.list[0].partnerBonus, 500);
      assert.equal(t.list[0].nickname, '用户9022');
      // 无成员 → 空
      const e = dist.getTeamOrders(TENANT, 9022, 'individual');
      assert.equal(e.total, 0);
      assert.deepEqual(e.list, []);
    } finally {
      db.prepare('DELETE FROM dist_order_split WHERE tenant_id = ? AND order_id = 99021').run(TENANT);
      db.prepare('DELETE FROM dist_user_relation WHERE tenant_id = ? AND user_id IN (9021,9022)').run(TENANT);
      db.prepare('DELETE FROM platform_user WHERE id IN (9021,9022)').run();
    }
  });

  it('P11 推广效果统计：来源分布/付费转化/带来的佣金', () => {
    const beforeStats = dist.getPromoStats(TENANT);
    [9033, 9034].forEach((id) => db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, ?, ?, 'individual')")
      .run(id, `openid_${id}`, `用户${id}`, TENANT));
    db.prepare("INSERT OR IGNORE INTO dist_user_relation (tenant_id, user_id, pid1, pid2, identity_type, source_type, status, bind_time) VALUES (?, ?, NULL, NULL, 'individual', 'qrcode', 'bound', datetime('now'))").run(TENANT, 9033);
    db.prepare("INSERT OR IGNORE INTO dist_user_relation (tenant_id, user_id, pid1, pid2, identity_type, source_type, status, bind_time) VALUES (?, ?, NULL, NULL, 'individual', 'card', 'bound', datetime('now'))").run(TENANT, 9034);
    db.prepare("INSERT OR IGNORE INTO payment_orders (order_no, payer_type, customer_id, user_id, product_type, amount, status) VALUES ('PROMO-PAY-1', 'tenant', ?, 9033, 'member', 10000, 'paid')").run(TENANT);
    db.prepare("INSERT OR IGNORE INTO dist_order_split (tenant_id, order_id, order_no, order_amount, buyer_user_id, buyer_identity_type, total_bonus, settle_status) VALUES (?, 99022, 'PROMO-SPLIT-1', 10000, 9033, 'individual', 300, 'pending')").run(TENANT);
    try {
      const p = dist.getPromoStats(TENANT);
      assert.equal(p.boundTotal, beforeStats.boundTotal + 2, '新增 2 个绑定用户');
      assert.ok(p.paidTotal >= 1, '至少 1 个付费用户');
      assert.ok(p.promoOrders >= 1, '至少 1 笔带来的订单');
      assert.ok(p.commissionByPromo >= 300, '带来的佣金 >= 300 分');
      const qr = p.srcList.find((s) => s.key === 'qrcode');
      assert.ok(qr && qr.count >= 1, 'qrcode 来源至少 1 人');
    } finally {
      db.prepare('DELETE FROM dist_order_split WHERE tenant_id = ? AND order_id = 99022').run(TENANT);
      db.prepare("DELETE FROM payment_orders WHERE order_no = 'PROMO-PAY-1'").run();
      db.prepare('DELETE FROM dist_user_relation WHERE tenant_id = ? AND user_id IN (9033,9034)').run(TENANT);
      db.prepare('DELETE FROM platform_user WHERE id IN (9033,9034)').run();
    }
  });

  it('P12 提现收款账户：JSON 落库 + 对账 CSV 收款列', () => {
    const UID = 9025;
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '收款测试', ?, 'individual')").run(UID, `openid_${UID}`, TENANT);
    db.prepare('INSERT OR IGNORE INTO dist_wallet (tenant_id, user_id, identity_type, wait_settle, available, total_income, total_withdraw) VALUES (?, ?, ?, 0, 20000, 20000, 0)')
      .run(TENANT, UID, 'individual');
    try {
      const r = dist.applyWithdraw(TENANT, UID, 'individual', 100, { type: 'bank', value: '6222 0000 1111', name: '张三' });
      assert.equal(r.ok, true);
      const row = db.prepare('SELECT * FROM dist_withdraw WHERE withdraw_no = ?').get(r.withdrawNo);
      const acct = JSON.parse(row.pay_account);
      assert.equal(acct.type, 'bank');
      assert.equal(acct.name, '张三');
      assert.equal(acct.value, '6222 0000 1111');
      const csv = buildWithdrawCsv([{ ...row, nickname: '收款测试' }]);
      assert.ok(csv.includes('银行卡·张三:6222 0000 1111'), 'CSV 应含收款方式');
    } finally {
      db.prepare("DELETE FROM dist_withdraw WHERE withdraw_no LIKE 'WD%' AND user_id = ?").run(UID);
      db.prepare('DELETE FROM dist_wallet WHERE tenant_id = ? AND user_id = ?').run(TENANT, UID);
      db.prepare('DELETE FROM platform_user WHERE id = ?').run(UID);
    }
  });

  it('P13 等级权益描述：benefits 落库 + getLevels/upgrade 透传', () => {
    try {
      const lv = dist.saveLevel(TENANT, { levelNo: 9, name: '测试等级', minTotalIncome: 500, minDirect: 2, benefits: '解锁专属海报角标；优先参与活动' });
      assert.equal(lv.benefits, '解锁专属海报角标；优先参与活动', 'benefits 落库');
      const levels = dist.getLevels(TENANT);
      const lv9 = levels.find((l) => l.level_no === 9);
      assert.ok(lv9 && lv9.benefits.includes('海报角标'), 'getLevels 透传 benefits');
      // 更新（PUT 路径：带 id）
      const lv2 = dist.saveLevel(TENANT, { id: lv.id, levelNo: 9, name: '测试等级', minTotalIncome: 500, minDirect: 2, benefits: '新权益文案' });
      assert.equal(lv2.benefits, '新权益文案', '更新 benefits');
      // 空字符串兜底
      const lv3 = dist.saveLevel(TENANT, { id: lv.id, levelNo: 9, name: '测试等级', minTotalIncome: 500, minDirect: 2, benefits: '   ' });
      assert.equal(lv3.benefits, '', '空白描述存空串');
    } finally {
      db.prepare('DELETE FROM dist_level WHERE tenant_id = ? AND level_no = 9').run(TENANT);
    }
  });

  it('P15 分销漏斗：埋点去重 + 统计逐层单调（share/view/bind/pay）', () => {
    const UID = 9041;   // 推广人
    const VK = 'visitor-p15-001';
    const NOW = new Date().toISOString().slice(0, 7);
    const before = dist.getFunnel(TENANT, NOW);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '漏斗推广', ?, 'individual')").run(UID, `openid_${UID}`, TENANT);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '漏斗买家', ?, 'individual')").run(9042, 'openid_9042', TENANT);
    try {
      // share 埋点（可重复）
      assert.equal(dist.trackFunnel(TENANT, UID, 'share', ''), true, 'share 埋点成功');
      assert.equal(dist.trackFunnel(TENANT, UID, 'share', ''), true, 'share 可重复');
      // view 埋点（同访客同推广人去重）
      assert.equal(dist.trackFunnel(TENANT, UID, 'view', VK), true, 'view 首次成功');
      assert.equal(dist.trackFunnel(TENANT, UID, 'view', VK), false, '同访客重复 view 去重');
      // 参数校验
      assert.equal(dist.trackFunnel(0, UID, 'share', ''), false, '无租户拒绝');
      assert.equal(dist.trackFunnel(TENANT, 0, 'share', ''), false, '无推广人 share 拒绝');
      assert.equal(dist.trackFunnel(TENANT, UID, 'view', ''), false, '无访客键 view 拒绝');
      // 绑定（派生）
      dist.bindRelation(TENANT, 9042, 'individual', UID);
      // 统计
      const s = dist.getFunnel(TENANT, NOW);
      assert.equal(s.shareCount - before.shareCount, 2, '分享 2 次');
      assert.equal(s.viewCount - before.viewCount, 1, '曝光访客 1（去重）');
      assert.ok(s.bindCount >= before.bindCount + 1, '绑定 +1（派生自 dist_user_relation）');
      assert.ok(s.trend.length === 6 && s.trend[s.trend.length - 1].month === NOW, '近 6 月趋势');
      assert.ok(typeof s.viewToBind === 'number' && typeof s.bindToPay === 'number', '转化率字段');
    } finally {
      db.prepare("DELETE FROM dist_funnel_events WHERE tenant_id = ? AND user_id = ?").run(TENANT, UID);
      db.prepare("DELETE FROM dist_user_relation WHERE tenant_id = ? AND user_id = 9042").run(TENANT);
      db.prepare('DELETE FROM platform_user WHERE id IN (?, ?)').run(UID, 9042);
    }
  });

  it('P16 分销商健康度：活跃/转化评分 + 流失预警排序 + 身份数据', () => {
    const A = 9051, B = 9052;   // 两个推广人
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '活跃分销', ?, 'individual')").run(A, `openid_${A}`, TENANT);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '沉默分销', ?, 'individual')").run(B, `openid_${B}`, TENANT);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '买家甲', ?, 'individual')").run(9053, 'openid_9053', TENANT);
    try {
      // A 活跃：近7天分享 + 近30天曝光 + 有直推且付费
      for (let i = 0; i < 3; i++) dist.trackFunnel(TENANT, A, 'share', '');
      dist.trackFunnel(TENANT, A, 'view', 'visitor-health-1');
      dist.bindRelation(TENANT, 9053, 'individual', A);
      // B 沉默：仅历史 share（30 天前），无直推无曝光
      db.prepare("INSERT INTO dist_funnel_events (tenant_id, user_id, event_type, created_at) VALUES (?, ?, 'share', datetime('now', '-40 days'))").run(TENANT, B);
      const h = dist.getHealth(TENANT);
      const a = h.list.find((x) => x.userId === A);
      const b = h.list.find((x) => x.userId === B);
      assert.ok(a, '活跃分销商在列表');
      assert.equal(a.direct, 1, '直推 1');
      assert.ok(a.share7 >= 3 && a.view30 >= 1, '近7天分享/近30天曝光统计');
      assert.ok(a.score >= 60, '活跃分销商评分 >= 60');
      assert.equal(a.status, 'healthy', '健康状态');
      if (b) {
        assert.ok(b.score < 30, '沉默分销商评分 < 30');
        assert.equal(b.status, 'churn', '流失预警');
        assert.ok(a.score > b.score, '预警排序：健康分低的在前');
      }
      // 空租户
      assert.deepEqual(dist.getHealth(0).list, [], '无数据租户返回空');
    } finally {
      db.prepare('DELETE FROM dist_funnel_events WHERE tenant_id = ? AND user_id IN (?, ?)').run(TENANT, A, B);
      db.prepare('DELETE FROM dist_user_relation WHERE tenant_id = ? AND user_id = 9053').run(TENANT);
      db.prepare('DELETE FROM platform_user WHERE id IN (?, ?, ?)').run(A, B, 9053);
    }
  });

  it('P14 月度对账单：扣回负计/欠款解析/提现实得 + CSV/HTML 构建', () => {
    const UID = 9036;
    const NOW = new Date().toISOString().slice(0, 7);
    const before = dist.monthlySummary(TENANT, NOW);
    db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, customer_id, identity_type) VALUES (?, ?, '对账测试', ?, 'individual')").run(UID, `openid_${UID}`, TENANT);
    db.prepare("INSERT INTO dist_user_log (tenant_id, user_id, identity_type, order_id, split_id, type, amount, status, remark, created_at) VALUES (?, ?, 'individual', 99031, 99031, 'level1', 1000, 'pending', '订单佣金', datetime('now'))").run(TENANT, UID);
    db.prepare("INSERT INTO dist_user_log (tenant_id, user_id, identity_type, order_id, split_id, type, amount, status, remark, created_at) VALUES (?, ?, 'individual', 99032, 99032, 'level1', 400, 'charged_back', '订单退款回滚（余额不足，欠款 400 分待追缴）', datetime('now'))").run(TENANT, UID);
    db.prepare("INSERT INTO dist_withdraw (withdraw_no, tenant_id, user_id, identity_type, amount, service_fee, status, pay_no, created_at) VALUES ('WD-STATEMENT-1', ?, ?, 'individual', 600, 20, 'done', 'ALIPAY-STATEMENT', datetime('now'))").run(TENANT, UID);
    try {
      const s = dist.monthlySummary(TENANT, NOW);
      assert.equal(s.total, before.total + 600, '扣回按负计入（增量 +1000-400=+600）');
      assert.equal(s.chargedBack - before.chargedBack, 400, '扣回总额增量');
      assert.equal(s.debtAmount - before.debtAmount, 400, '欠款解析增量');
      const u = s.byUser.find((x) => x.userId === UID);
      assert.ok(u && u.total === 600 && u.chargedBack === 400, '用户级净额/扣回');
      assert.equal(u.withdraw, 580, '提现实得 = 600-20');
      assert.equal(s.withdrawTotal - before.withdrawTotal, 580, '提现合计增量');
      const csv = buildStatementCsv(s);
      assert.ok(csv.startsWith('\uFEFF') && csv.includes('扣回(元)') && csv.includes('实得(元)') && csv.includes('提现(元)'), 'CSV 表头');
      assert.ok(csv.includes('4.00') && csv.includes('5.80'), 'CSV 金额（扣回4/提现5.8）');
      const html = buildStatementHtml(s, { tenantName: '对账租户' });
      assert.ok(html.includes('分销佣金月度对账单') && html.includes('对账租户') && html.includes('待追缴欠款'), 'HTML 含标题/租户/欠款提示');
      assert.ok(html.includes('<table>') && html.includes('合计'), 'HTML 含明细表与合计');
    } finally {
      db.prepare("DELETE FROM dist_user_log WHERE tenant_id = ? AND split_id IN (99031, 99032)").run(TENANT);
      db.prepare("DELETE FROM dist_withdraw WHERE withdraw_no = 'WD-STATEMENT-1'").run();
      db.prepare('DELETE FROM platform_user WHERE id = ?').run(UID);
    }
  });
});
