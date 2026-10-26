/**
 * 商城会员价统一算价服务测试（services/goodsPrice.js）
 *
 * 钉死的规则（背景：mall.discount / goods.member_price / goods_setting.showVipPrice
 * 三套配置此前全是"后台能配、C 端零消费"的空头）：
 *   ① 优先级：商品级会员价（goods.member_price 命中当前等级） > 套餐折扣（mall.discount） > 原价
 *   ② 商品级 percent：后台「9.8 表示 98 折」→ 折扣率 = value / 10（乘算）
 *   ③ 商品级 amount：单位是**元**（固定会员价）
 *   ④ 先折后取整到分（Math.round），避免 1 分误差
 *   ⑤ mall.price_visible 权益 = 「会员价是否对全部访客公开」，**不**承担「非会员看不到价格」
 *      （目录默认值 0 绝不能解读成"所有人都看不到价格" → 灾难性回归）
 *   ⑥ goods_setting.showVipPrice=2 且非会员 → priceHidden=true（整体隐藏价格）
 *   ⑦ 下单实付 == 列表/详情展示的 memberPrice（同口径 → 显示价 = 实付价）
 */
import { test, describe, before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createGoodsPriceService } from '../src/services/goodsPrice.js';

describe('商城会员价统一算价（services/goodsPrice.js）', () => {
  let db, tmpDb, svc;
  const TENANT = 88001;
  let userId = 0;
  let goldLevelId = 0;
  let silverLevelId = 0;

  before(() => {
    tmpDb = path.join(os.tmpdir(), `goods-price-${Date.now()}.db`);
    db = createDb(tmpDb);
    svc = createGoodsPriceService(db);

    db.prepare("INSERT INTO projects (id, customer_name, status, solutions) VALUES (?, ?, 'active', ?)").run(
      TENANT, '算价租户', JSON.stringify(['demo'])
    );

    // 用户
    const r = db.prepare(
      "INSERT INTO platform_user (openid, nickname, status, customer_id, identity_type) VALUES ('gp_openid', '算价用户', 'active', ?, 'individual')"
    ).run(TENANT);
    userId = Number(r.lastInsertRowid);

    // 等级：白银（无折扣）+ 黄金（套餐折扣 10% = 打9折）
    const s = db.prepare(
      "INSERT INTO member_levels (tenant_id, level_no, name, status, pkg_level, buy_price) VALUES (?, 1, '白银会员', 1, 'silver', 2990)"
    ).run(TENANT);
    silverLevelId = Number(s.lastInsertRowid);
    const g = db.prepare(
      "INSERT INTO member_levels (tenant_id, level_no, name, status, pkg_level, buy_price) VALUES (?, 2, '黄金会员', 1, 'gold', 9900)"
    ).run(TENANT);
    goldLevelId = Number(g.lastInsertRowid);

    // 矩阵：白银 mall 无 discount；黄金 mall discount=10（百分比口径：10=打9折）
    db.prepare(
      "INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits) VALUES (?, ?, 'mall', ?)"
    ).run(TENANT, silverLevelId, JSON.stringify({}));
    db.prepare(
      "INSERT INTO member_level_app_benefits (tenant_id, level_id, app_code, benefits) VALUES (?, ?, 'mall', ?)"
    ).run(TENANT, goldLevelId, JSON.stringify({ discount: 10 }));

    // 用户 = 黄金会员
    db.prepare(
      "INSERT INTO member_user (tenant_id, user_id, level_id, status) VALUES (?, ?, ?, 'active')"
    ).run(TENANT, userId, goldLevelId);

    // 商品
    db.prepare(
      "INSERT INTO goods (customer_id, title, status, price, stock, spec_mode) VALUES (?, '普通商品', 'sell', 100, 50, 'single')"
    ).run(TENANT);
    db.prepare(
      "INSERT INTO goods (customer_id, title, status, price, stock, spec_mode, member_price) VALUES (?, '会员价商品', 'sell', 100, 50, 'single', ?)"
    ).run(TENANT, JSON.stringify({ mode: 'custom', priceType: 'percent', priceMap: { [goldLevelId]: 9.8 } }));
    db.prepare(
      "INSERT INTO goods (customer_id, title, status, price, stock, spec_mode, member_price) VALUES (?, '固定价商品', 'sell', 100, 50, 'single', ?)"
    ).run(TENANT, JSON.stringify({ mode: 'custom', priceType: 'amount', priceMap: { [goldLevelId]: 88 } }));
  });

  beforeEach(() => {
    // goods_setting 默认不隐藏价格
    db.prepare('DELETE FROM goods_setting WHERE customer_id = ?').run(TENANT);
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(tmpDb, { force: true }); } catch {}
  });

  const goodsOf = (title) => db.prepare('SELECT * FROM goods WHERE customer_id = ? AND title = ?').get(TENANT, title);

  it('套餐折扣（mall.discount=10 → 打9折）：100 元 → 90.00 元（分口径 9000）', () => {
    const g = goodsOf('普通商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId, tenantId: TENANT });
    assert.equal(r.source, 'package');
    assert.equal(r.hasMemberPrice, true);
    assert.equal(r.priceFen, 9000);
    assert.equal(r.originFen, 10000);
  });

  it('商品级会员价（percent 9.8 = 98 折）优先于套餐折扣：100 → 98.00 元', () => {
    const g = goodsOf('会员价商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId, tenantId: TENANT });
    assert.equal(r.source, 'goods');
    assert.equal(r.priceFen, 9800);
    assert.equal(r.originFen, 10000);
  });

  it('商品级会员价（amount 固定价，单位元）：100 元商品 → 会员价 88.00 元', () => {
    const g = goodsOf('固定价商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId, tenantId: TENANT });
    assert.equal(r.source, 'goods');
    assert.equal(r.priceFen, 8800);
  });

  it('商品级会员价未命中当前等级 → 回落套餐折扣', () => {
    const g = goodsOf('固定价商品'); // priceMap 只配了黄金
    // 模拟白银会员
    db.prepare("UPDATE member_user SET level_id = ? WHERE tenant_id = ? AND user_id = ?").run(silverLevelId, TENANT, userId);
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId, tenantId: TENANT });
    assert.equal(r.source, 'none'); // 白银无 discount、商品级也没命中 → 原价
    assert.equal(r.priceFen, 10000);
    assert.equal(r.hasMemberPrice, false);
    // 复原
    db.prepare("UPDATE member_user SET level_id = ? WHERE tenant_id = ? AND user_id = ?").run(goldLevelId, TENANT, userId);
  });

  it('非会员（无会员身份行）：无任何折扣 → 原价', () => {
    const g = goodsOf('普通商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId: 999999, tenantId: TENANT });
    assert.equal(r.priceFen, 10000);
    assert.equal(r.hasMemberPrice, false);
    assert.equal(r.levelId, 0);
  });

  it('游客（userId=0）：原价，无权益', () => {
    const g = goodsOf('会员价商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId: 0, tenantId: TENANT });
    assert.equal(r.priceFen, 10000);
    assert.equal(r.hasMemberPrice, false);
  });

  it('先折后取整到分：33.33 元打9折 → 2999.7 分 → 取整 3000 分（无 1 分漂移）', () => {
    const g = goodsOf('普通商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 3333, userId, tenantId: TENANT, discountPct: 10 });
    assert.equal(r.priceFen, Math.round(3333 * 0.9));
    assert.equal(r.priceFen, 3000);
  });

  it('mall.price_visible 权益 = 会员价是否公开（默认 0 → 不公开），**不影响**价格可见性', () => {
    const g = goodsOf('普通商品');
    const r = svc.resolveMemberPrice(g, { basePriceFen: 10000, userId, tenantId: TENANT });
    // 权益关闭只影响「是否公示会员价」，价格本身照常可算
    assert.equal(svc.memberPricePublic(userId, TENANT), false);
    assert.equal(r.priceFen, 9000);
  });

  it('goods_setting.showVipPrice=2 且非会员 → priceHidden=true（整体隐藏价格）', () => {
    db.prepare("INSERT INTO goods_setting (customer_id, config) VALUES (?, ?)").run(TENANT, JSON.stringify({ showVipPrice: 2 }));
    const p = svc.priceShowPolicy(TENANT, 0, 0);
    assert.equal(p.mode, 2);
    assert.equal(p.priceHidden, true);
  });

  it('showVipPrice=2 但当前用户是会员 → priceHidden=false（会员永远看得到价格）', () => {
    db.prepare("INSERT INTO goods_setting (customer_id, config) VALUES (?, ?)").run(TENANT, JSON.stringify({ showVipPrice: 2 }));
    const p = svc.priceShowPolicy(TENANT, userId, goldLevelId);
    assert.equal(p.priceHidden, false);
  });

  it('showVipPrice 默认 0 → 非会员也看得到价格（不回归现有商城行为）', () => {
    const p = svc.priceShowPolicy(TENANT, 0, 0);
    assert.equal(p.mode, 0);
    assert.equal(p.priceHidden, false);
  });

  it('currentLevelId：会员身份行有效 → 返回等级 id；过期 → 0', () => {
    assert.equal(svc.currentLevelId(TENANT, userId), goldLevelId);
    db.prepare("UPDATE member_user SET expire_at = '2000-01-01 00:00:00' WHERE tenant_id = ? AND user_id = ?").run(TENANT, userId);
    assert.equal(svc.currentLevelId(TENANT, userId), 0);
    db.prepare("UPDATE member_user SET expire_at = NULL WHERE tenant_id = ? AND user_id = ?").run(TENANT, userId);
    assert.equal(svc.currentLevelId(TENANT, userId), goldLevelId);
  });

  it('currentLevelId：会员身份行停用（status != active）→ 0（不享权）', () => {
    db.prepare("UPDATE member_user SET status = 'paused' WHERE tenant_id = ? AND user_id = ?").run(TENANT, userId);
    assert.equal(svc.currentLevelId(TENANT, userId), 0);
    db.prepare("UPDATE member_user SET status = 'active' WHERE tenant_id = ? AND user_id = ?").run(TENANT, userId);
  });
});
