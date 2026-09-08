/**
 * 分销体系端到端演示数据（幂等，可重复执行）
 * 演示租户 tenant1：
 *  - 启用 5 插件（dist/partner/share-all/share-cat/share-area）
 *  - 合伙人 user3（团队模式 ratio 0.3）、全民股东 user4（weight 1）
 *  - 类目股东 user5（互联网/SaaS，ratio 0.1）、区域股东 user6（东莞，ratio 0.1）
 *  - 买家 user2：绑定 pid1=3（合伙人）pid2=4，名片行业=互联网/SaaS、城市=东莞
 *  - 造一笔 100 元会员订单 → 触发 5 插件分账 → 输出分账快照/流水/钱包
 */
import { createDb } from '../server/src/db.js';
import { createDistributionService } from '../server/src/services/distribution.js';
import { PaymentService } from '../server/src/services/payment.js';

const db = createDb('./server/data/panorama.db');
const dist = createDistributionService(db);
const payment = new PaymentService(db);

const TENANT = 1;
const out = (k, v) => console.log(`[${k}]`, typeof v === 'object' ? JSON.stringify(v) : v);

// 1. 启用插件
for (const code of ['dist', 'partner', 'share-all', 'share-cat', 'share-area']) {
  dist.setPlugin(TENANT, code, { install: true, enable: true });
}
dist.setPluginConfig(TENANT, 'partner', { mode: 1, poolRatio: 0.1 });
dist.setPluginConfig(TENANT, 'share-all', { mode: 1, poolRatio: 0.1 });
out('plugins', '5 插件已启用');

// 2. 添加成员（幂等：重复添加返回错误忽略）
const adds = [
  () => dist.addPartner(TENANT, 3, { ratio: 0.3, mode: 1 }),
  () => dist.addShareAll(TENANT, 4, { weight: 1 }),
  () => dist.addShareCat(TENANT, '互联网/SaaS', 5, { ratio: 0.1, weight: 1 }),
  () => dist.addShareArea(TENANT, '东莞', 6, { ratio: 0.1, weight: 1 }),
];
for (const add of adds) { try { add(); } catch (e) { /* 已存在幂等忽略 */ } }
out('members', '合伙人 user3 / 全民股东 user4 / 类目股东 user5 / 区域股东 user6 已配置');

// 3. 买家 user2 绑定上下级 + 行业/城市
dist.bindRelation(TENANT, 2, 'individual', 3, 'qrcode');
db.prepare("UPDATE card_profile SET business_field = '互联网/SaaS', city = '东莞' WHERE user_id = 2").run();
out('bind', 'user2 → pid1=user3(合伙人) pid2=user4，行业=互联网/SaaS，城市=东莞');

// 4. 造一笔 100 元会员订单（幂等：同 order_no 跳过）
const orderNo = 'DEMO-SPLIT-20260908';
const exist = db.prepare('SELECT id FROM payment_orders WHERE order_no = ?').get(orderNo);
let order;
if (!exist) {
  db.prepare(`
    INSERT INTO payment_orders (order_no, customer_id, user_id, buyer_identity_type, solution, product_type, product_name, amount, status, payer_type, created_at, updated_at)
    VALUES (?, ?, 2, 'individual', 'card', 'member', '演示会员', 10000, 'paid', 'tenant', datetime('now'), datetime('now'))
  `).run(orderNo, TENANT);
}
order = db.prepare('SELECT * FROM payment_orders WHERE order_no = ?').get(orderNo);
out('order', `订单 ${orderNo} 100元 已支付`);

// 5. 触发分账（幂等：已分账返回原快照；必须用 toOrder 映射后的 camelCase 订单对象）
order = payment.getOrderByNo(orderNo);
payment.handlePaymentSuccess(order);
const split = db.prepare('SELECT * FROM dist_order_split WHERE tenant_id = ? AND order_id = ?').get(TENANT, order.id);
out('split', split && {
  commission1: split.commission1 / 100, commission2: split.commission2 / 100,
  partner_bonus: split.partner_bonus / 100, share_all_bonus: split.share_all_bonus / 100,
  share_cat_bonus: split.share_cat_bonus / 100, share_area_bonus: split.share_area_bonus / 100,
  total_bonus: split.total_bonus / 100,
});

// 6. 流水与钱包
const logs = db.prepare("SELECT user_id, type, amount, status FROM dist_user_log WHERE tenant_id = ? AND order_id = ? ORDER BY id").all(TENANT, order.id);
out('logs', logs.map(l => ({ user: l.user_id, type: l.type, amount: l.amount / 100, status: l.status })));
const wallets = db.prepare("SELECT user_id, identity_type, wait_settle, available FROM dist_wallet WHERE tenant_id = ? AND user_id IN (2,3,4,5,6) ORDER BY user_id").all(TENANT);
out('wallets', wallets.map(w => ({ user: w.user_id, idt: w.identity_type, wait: w.wait_settle / 100, avail: w.available / 100 })));
console.log('DONE');
