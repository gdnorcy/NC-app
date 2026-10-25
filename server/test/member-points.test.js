/**
 * 消费送积分测试（积分倍率真兑现：point_rate 倍率 + rebate 返比）
 *
 * 钉死：积分公式 ⌊元×rate⌋+⌊元×rebate%⌋ / free 默认倍率 1 / 租户矩阵覆盖生效 /
 *       幂等（重复 markPaid 与重复 award 不重发）/ 退款收回且不重复扣 /
 *       异常不阻断（无租户用户静默跳过）。
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { PaymentService } from '../src/services/payment.js';
import { grantTier } from './helpers/member-grant.js';

describe('消费送积分（point_rate + rebate）', () => {
  let db, payment;
  const DB_PATH = path.join(os.tmpdir(), `member-points-test-${Date.now()}.db`);
  const T = 88401;

  before(() => {
    db = createDb(DB_PATH);
    payment = new PaymentService(db);
    const ins = db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)');
    ins.run(9001, 'pt-u1', T); // free 用户
    ins.run(9002, 'pt-u2', T); // 将配成倍率档
    ins.run(9003, 'pt-u3', 0); // 无租户用户
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  const scoreOf = (uid) => db.prepare('SELECT score FROM member_user WHERE tenant_id = ? AND user_id = ?').get(T, uid)?.score ?? 0;
  const logsOf = (uid) => db.prepare('SELECT * FROM member_score_logs WHERE tenant_id = ? AND user_id = ?').all(T, uid);
  const buy = (uid, amount, productType = 'member_card', productId = '1') => {
    const order = payment.createOrder({ payerType: 'customer', customerId: T, userId: uid, solution: 'card', productType, productId, productName: '测试商品', amount, channel: 'wechat' });
    return payment.markPaid(order.orderNo, 'TX' + order.orderNo);
  };

  it('free 用户：默认倍率 1、返比 0 → ¥99 得 99 分', () => {
    buy(9001, 9900);
    assert.equal(scoreOf(9001), 99);
    const log = logsOf(9001).find((l) => l.type === 'get' && l.note.includes('消费送积分'));
    assert.ok(log, '应写积分流水');
    assert.equal(log.score, 99);
  });

  it('幂等：markPaid 已守卫；直接重复 award 不重发', () => {
    const before = scoreOf(9001);
    payment.awardOrderPoints({ status: 'paid', userId: 9001, customerId: T, orderNo: 'PAY-DUP-1', amount: 9900 });
    assert.equal(scoreOf(9001), before + 99, '首次发放应生效');
    payment.awardOrderPoints({ status: 'paid', userId: 9001, customerId: T, orderNo: 'PAY-DUP-1', amount: 9900 });
    assert.equal(scoreOf(9001), before + 99, '同一订单号不得重复发积分');
  });

  it('租户矩阵覆盖：point_rate=2、rebate=5 → ¥99 得 ⌊99×2⌋+⌊99×5%⌋=202', () => {
    // 把 9002 开成 gold 档并覆盖 member 权益（倍率 2 + 返比 5%）
    const lvl = grantTier(db, 9002, T, 'gold');
    db.prepare(
      `INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits) VALUES (?,?,?,?)
       ON CONFLICT(tenant_id, level_id, app_code) DO UPDATE SET benefits = excluded.benefits`
    ).run(T, lvl, 'member', JSON.stringify({ point_rate: 2, rebate: 5 }));
    buy(9002, 9900);
    assert.equal(scoreOf(9002), 202);
    const log = logsOf(9002).find((l) => l.type === 'get' && l.note.includes('消费送积分'));
    assert.match(log.note, /倍率2/);
    assert.match(log.note, /返比5%/);
  });

  it('非 member_card 订单同样送积分（goods 走同一漏斗）', () => {
    buy(9001, 5000, 'goods', '7');
    assert.equal(scoreOf(9001), 99 + 99 + 50, '幂等用例的 PAY-DUP-1(¥99×1) + 本单 ¥50×1');
  });

  it('退款收回：扣回已发积分 + 负向流水；重复退款不重复扣', () => {
    const before = scoreOf(9001);
    const order = db.prepare('SELECT * FROM payment_orders WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(9001);
    payment.refundOrder(order.order_no);
    assert.equal(scoreOf(9001), before - 50, '应扣回该订单发的 50 分');
    const back = logsOf(9001).filter((l) => l.note.includes('退款，积分收回'));
    assert.equal(back.length, 1, '应有一条收回流水');
    assert.equal(back[0].score, -50);
    payment.refundOrder(order.order_no); // 已 refunded → 直接返回，不会二次扣
    assert.equal(scoreOf(9001), before - 50);
  });

  it('无租户用户：静默跳过不炸', () => {
    assert.doesNotThrow(() => payment.awardOrderPoints({ status: 'paid', userId: 9003, customerId: 0, orderNo: 'PAY-NOTENANT', amount: 9900 }));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM member_score_logs WHERE user_id = 9003').get().n, 0);
  });

  it('金额不足 1 元 / 倍率 0：不发积分', () => {
    payment.awardOrderPoints({ status: 'paid', userId: 9001, customerId: T, orderNo: 'PAY-SMALL', amount: 50 });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM member_score_logs WHERE user_id = 9001 AND note LIKE '消费送积分（订单PAY-SMALL%'").get().n, 0);
  });
});
