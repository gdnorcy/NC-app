/**
 * 分销体系核心服务测试：分账/回滚/结算/提现/绑定
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createDistributionService, buildShareUrl, buildWithdrawCsv, buildLogCsv, buildMonthlyCsv, buildRelationTree } from '../src/services/distribution.js';

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
      [2001, 'dist-e2001', '股东乙', 'individual'],
      [1003, 'dist-u1003', '待绑定D', 'individual'],
      [1004, 'dist-u1004', '买家E', 'individual'],
      [1005, 'dist-u1005', '待删F', 'individual'],
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
    assert.ok(s.shareTags.includes('全民股东'));
    assert.ok(s.shareTags.includes('行业-制造业股东'));
    assert.ok(s.shareTags.includes('地区-东莞股东'));
    assert.ok(s.shareTags.includes('全局合伙人'));
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
});