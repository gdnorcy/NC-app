/**
 * 会员体系服务测试：等级/设置/标签/开卡/列表/统计/申请审核/签到/流水/导出
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createMemberService } from '../src/services/member.js';

describe('会员体系（租户级会员，1:1 复刻菜鸟云）', () => {
  let db, member;
  const DB_PATH = path.join(os.tmpdir(), `member-test-${Date.now()}.db`);
  const TENANT = 99902;

  before(() => {
    db = createDb(DB_PATH);
    member = createMemberService(db);
    const ins = db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, phone, identity_type, customer_id) VALUES (?, ?, ?, ?, ?, ?)");
    for (const [id, openid, name, phone, idt] of [
      [3000, 'm-u3000', '会员甲', '13800000001', 'individual'],
      [3001, 'm-u3001', '会员乙', '13800000002', 'employee'],
      [3002, 'm-u3002', '普通丙', '13800000003', 'individual'],
      [3003, 'm-u3003', '普通丁', '', 'individual'],
    ]) {
      ins.run(id, openid, name, phone, idt, TENANT);
    }
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  it('等级：新增/列表/更新/默认值', () => {
    const lv = member.addLevel(TENANT, { levelNo: 1, name: '一级会员', buyPrice: 1000, consumeAmount: 0 });
    assert.ok(lv.id);
    assert.equal(lv.name, '一级会员');
    assert.equal(lv.status, 1);
    assert.equal(lv.upgrade_mode, 'consume');
    assert.deepEqual(lv.benefits, {});
    const lv2 = member.addLevel(TENANT, { levelNo: 2, name: '二级会员', upgradeMode: 'apply', benefits: { discount: 9 } });
    assert.equal(lv2.benefits.discount, 9);
    const list = member.listLevels(TENANT);
    assert.equal(list.length, 2);
    assert.equal(list[0].level_no, 1);
    const upd = member.updateLevel(TENANT, lv.id, { name: '一级会员V2', buyPrice: 2000, status: 0 });
    assert.equal(upd.name, '一级会员V2');
    assert.equal(upd.buy_price, 2000);
    assert.equal(upd.status, 0);
  });

  it('等级：有会员使用时禁止删除', () => {
    member.openCard(TENANT, 3000, 1, 'auto');
    const r = member.deleteLevel(TENANT, 1);
    assert.equal(r.ok, false);
    assert.match(r.error, /禁止删除/);
  });

  it('设置：默认值/保存', () => {
    const def = member.getSettings(TENANT);
    assert.equal(def.card_enabled, 1);
    assert.equal(def.expire_remind_days, 7);
    const saved = member.saveSettings(TENANT, { cardEnabled: 0, expireRemindDays: 3, permissions: { score_sign: 'member' } });
    assert.equal(saved.card_enabled, 0);
    assert.equal(saved.expire_remind_days, 3);
    assert.equal(saved.permissions.score_sign, 'member');
    // 恢复会员卡开关（后续开卡用例需要）
    member.saveSettings(TENANT, { cardEnabled: 1 });
  });

  it('标签：新增/重复拒绝/删除/打标', () => {
    const r1 = member.addLabel(TENANT, 'VIP');
    assert.ok(r1.ok);
    const r2 = member.addLabel(TENANT, 'VIP');
    assert.equal(r2.ok, false);
    const r3 = member.addLabel(TENANT, '  ');
    assert.equal(r3.ok, false);
    const labels = member.listLabels(TENANT);
    assert.equal(labels.length, 1);
    member.setUserLabels(TENANT, 3000, [r1.id]);
    const ul = member.userLabels(TENANT, 3000);
    assert.equal(ul.length, 1);
    assert.equal(ul[0].name, 'VIP');
    member.deleteLabel(TENANT, r1.id);
    assert.equal(member.listLabels(TENANT).length, 0);
    assert.equal(member.userLabels(TENANT, 3000).length, 0);
  });

  it('开卡：生成卡号/写开卡记录/等级更新', () => {
    const r = member.openCard(TENANT, 3001, 2, 'buy');
    assert.ok(r.ok);
    assert.ok(r.cardNo.length >= 10);
    const mu = member.getMemberUser(TENANT, 3001);
    assert.equal(mu.level_id, 2);
    assert.ok(mu.card_no);
    const cards = member.listCards(TENANT, {});
    assert.ok(cards.total >= 1);
  });

  it('列表：身份筛选（全部/会员/非会员/指定等级）+ 关键词 + 标签', () => {
    // 3000 已是一级会员(1)，3001 二级会员(2)，3002/3003 非会员
    const all = member.listUsers(TENANT, { page: 1, pageSize: 20 });
    assert.equal(all.total, 4);
    const members = member.listUsers(TENANT, { identity: 'member' });
    assert.equal(members.total, 2);
    const non = member.listUsers(TENANT, { identity: 'nonmember' });
    assert.equal(non.total, 2);
    const lv1 = member.listUsers(TENANT, { identity: '1' });
    assert.equal(lv1.total, 1);
    assert.equal(lv1.users[0].id, 3000);
    const kw = member.listUsers(TENANT, { keyword: '13800000001' });
    assert.equal(kw.total, 1);
    // 来源=企业员工
    const emp = member.listUsers(TENANT, { source: 'employee' });
    assert.equal(emp.total, 1);
    assert.equal(emp.users[0].id, 3001);
    // 标签筛选
    const lbl = member.addLabel(TENANT, '贵宾');
    member.setUserLabels(TENANT, 3000, [lbl.id]);
    const byLabel = member.listUsers(TENANT, { label: lbl.id });
    assert.equal(byLabel.total, 1);
    assert.equal(byLabel.users[0].id, 3000);
  });

  it('统计：总数/等级用户/新增用户/等级人数', () => {
    const s = member.summary(TENANT);
    assert.equal(s.totalUsers, 4);
    assert.equal(s.levelUsers, 2);
    assert.equal(s.monthBirthday, 0);
    assert.ok(s.newUsers && typeof s.newUsers.d7 === 'number');
    assert.ok(s.newUsers.d7 >= 4);
    const lv = s.levelCounts.find((l) => l.levelNo === 1);
    assert.ok(lv && lv.count >= 1);
  });

  it('申请：提交/重复拒绝/审核通过开卡/驳回必填原因', () => {
    const ap = member.apply(TENANT, 3002, { name: '普通丙', phone: '13800000003', levelId: 2 });
    assert.ok(ap.ok);
    const dup = member.apply(TENANT, 3002, { name: '普通丙', levelId: 2 });
    assert.equal(dup.ok, false);
    // 驳回缺原因
    const rj = member.reviewApply(TENANT, ap.id, 'reject', '');
    assert.equal(rj.ok, false);
    // 通过
    const rv = member.reviewApply(TENANT, ap.id, 'approve');
    assert.ok(rv.ok);
    const mu = member.getMemberUser(TENANT, 3002);
    assert.equal(mu.level_id, 2);
    // 再次提交应拒绝（已通过）
    const again = member.apply(TENANT, 3002, { name: '普通丙', levelId: 2 });
    assert.equal(again.ok, false);
  });

  it('签到：积分累加/每日一次/仅会员限制', () => {
    const r1 = member.sign(TENANT, 3001);
    assert.ok(r1.ok);
    assert.equal(r1.score, 2);
    const mu = member.getMemberUser(TENANT, 3001);
    assert.equal(mu.score, 2);
    const r2 = member.sign(TENANT, 3001);
    assert.equal(r2.ok, false);
    assert.match(r2.error, /已签到/);
    // 仅会员限制：普通丁非会员，设置后不可签到
    member.saveSettings(TENANT, { permissions: { score_sign: 'member' } });
    const r3 = member.sign(TENANT, 3003);
    assert.equal(r3.ok, false);
    assert.match(r3.error, /仅会员/);
    member.saveSettings(TENANT, { permissions: { score_sign: 'all' } });
  });

  it('流水：消费/积分流水查询与导出', () => {
    const logs = member.listLogs(TENANT, {});
    assert.ok(logs.total >= 0);
    const csv = member.buildLogsCsv([{ nickname: '会员甲', amount: -1000, type: 'consume', note: '购买会员', order_no: 'PAY1', created_at: '2026-09-11 10:00:00' }]);
    assert.ok(csv.startsWith('\ufeff'));
    assert.match(csv, /会员甲/);
    assert.match(csv, /消费/);
    const scsv = member.buildScoreLogsCsv([{ nickname: '会员乙', score: 2, type: 'get', note: '签到', order_no: '', created_at: '2026-09-11 10:00:00' }]);
    assert.ok(scsv.startsWith('\ufeff'));
    assert.match(scsv, /获得/);
    const usvcsv = member.buildUsersCsv([{ id: 3000, nickname: '会员甲', phone: '13800000001', identityType: 'individual', createdAt: '2026-09-01', expireAt: '', cardNo: '123', levelName: '一级会员', score: 0, balance: 0, status: 'active' }]);
    assert.ok(usvcsv.startsWith('\ufeff'));
    assert.match(usvcsv, /永久有效/);
  });

  it('支付回调开卡：openCardByOrder 写入会员+消费流水', () => {
    const r = member.openCardByOrder({ status: 'paid', customerId: TENANT, userId: 3003, productId: 1, amount: 2000, productName: '一级会员', orderNo: 'PAYM001' });
    assert.ok(r && r.ok);
    const mu = member.getMemberUser(TENANT, 3003);
    assert.equal(mu.level_id, 1);
    const logs = member.listLogs(TENANT, { keyword: 'PAYM001' });
    assert.equal(logs.total, 1);
    assert.equal(logs.logs[0].amount, -2000);
  });
});
