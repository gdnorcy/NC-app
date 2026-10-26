/**
 * 商城价格统一算价服务（列表 / 详情 / 下单 共用同一口径）。
 *
 * 🔴 背景：此前商城价格有三套并行配置，但**只有价格本身被消费**：
 *   ① goods.member_price       —— 商品级会员价（传统商城标准结构：按会员等级逐级定价）
 *                                {mode:'none'|'default'|'custom', priceType:'percent'|'amount', priceMap:{levelId:value}}
 *                                后台 GoodsEdit.vue 可配，但 C 端 mall 列表/详情与下单链路**零消费**（空头）。
 *   ② mall.discount 权益       —— 套餐级折扣百分比（benefit_catalog，百分比口径：0=无折扣，10=打9折）
 *                                现已在本服务兑现（套餐矩阵 → resolveAppBenefits）。
 *   ③ goods_setting.showVipPrice —— 租户级「价格展示」三态（传统商城标准）：
 *                                0=非会员不可见会员价 / 1=非会员可见最低等级会员价 / 2=非会员不可见价格
 *                                后台 GoodsSettings.vue 可配，C 端**零消费**（空头）。
 *
 * 本服务确立的优先级（传统商城惯例）：
 *   最终成交价 = 商品级会员价（custom 命中当前等级）> 套餐折扣（mall.discount）> 商品原价
 *
 * 口径说明（避免各处漂移）：
 *   - 所有对外返回的金额单位是**分**（整数），列表/详情的商品 `price` 字段本身是**元**（历史口径，不动）。
 *   - 商品级会员价 percent：后台提示「9.8 表示 98 折」→ 折扣率 = value / 10（乘算，非减）。
 *   - 商品级会员价 amount：直接是**元**的固定会员价。
 *   - 先折后取整到分（Math.round），避免多次相乘的浮点误差。
 */
import { resolveAppBenefits, tenantOfUser } from './member.js';

export function createGoodsPriceService(db) {
  /** 商品级会员价是否命中当前用户等级 → 返回 { type:'percent'|'amount', value:Number } 或 null */
  function matchGoodsMemberPrice(memberPrice, levelId) {
    if (!memberPrice || typeof memberPrice !== 'object') return null;
    const mode = String(memberPrice.mode || 'none');
    if (mode !== 'custom') return null;
    const map = memberPrice.priceMap && typeof memberPrice.priceMap === 'object' ? memberPrice.priceMap : null;
    if (!map || !levelId) return null;
    const raw = map[levelId];
    if (raw === undefined || raw === null || raw === '') return null;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return null;
    const type = memberPrice.priceType === 'amount' ? 'amount' : 'percent';
    return { type, value: v };
  }

  /**
   * 当前用户在该租户的有效会员等级 id（member_levels.id）。
   * 优先 member_user（租户级新模型）→ 旧 platform_user.member_level 镜像兜底（过渡期）。
   * 返回 0 = 无有效会员（非会员）。
   */
  function currentLevelId(tenantId, userId) {
    if (!userId) return 0;
    if (tenantId) {
      const mu = db.prepare(
        'SELECT level_id, status, expire_at FROM member_user WHERE tenant_id = ? AND user_id = ?'
      ).get(tenantId, userId);
      if (mu && mu.level_id) {
        const exp = mu.expire_at ? new Date(String(mu.expire_at).replace(' ', 'T')) : null;
        const expired = exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now();
        if (mu.status === 'active' && !expired) return mu.level_id;
        return 0; // 有会员身份行但已过期/停用 → 无会员
      }
    }
    // 旧镜像兜底：platform_user.member_level（pkg_level）→ member_levels.id
    const u = db.prepare('SELECT member_level, member_expire_at FROM platform_user WHERE id = ?').get(userId);
    if (u && u.member_level && u.member_level !== 'free') {
      const exp = u.member_expire_at ? new Date(String(u.member_expire_at).replace(' ', 'T')) : null;
      const expired = exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now();
      if (!expired) {
        const lv = db.prepare('SELECT id FROM member_levels WHERE pkg_level = ? AND tenant_id = ? ORDER BY level_no ASC LIMIT 1')
          .get(u.member_level, tenantId || 0);
        if (lv) return lv.id;
        const lv2 = db.prepare('SELECT id FROM member_levels WHERE pkg_level = ? ORDER BY level_no ASC LIMIT 1').get(u.member_level);
        if (lv2) return lv2.id;
      }
    }
    return 0;
  }

  /** 套餐级商城折扣百分比（mall.discount，百分比口径：0=无折扣，10=打9折） */
  function discountPctOf(userId, tenantId) {
    if (!userId) return 0;
    try {
      const tid = tenantId || tenantOfUser(db, userId);
      const pct = Number(resolveAppBenefits(db, tid, userId, 'mall').discount) || 0;
      return pct > 0 && pct <= 100 ? Math.round(pct) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 会员价是否对全部访客公开展示（mall.price_visible 权益，1=公开）。
   * 语义 = 传统商城常见的「会员价标签对所有人可见，结算按身份区分」。
   * 注意：**不**承担「非会员整体看不到价格」的语义 —— 那由租户级 goods_setting.showVipPrice=2 承担
   *（否则目录默认值 0 会被解读成"所有人都看不到价格"，是灾难性回归）。
   */
  function memberPricePublic(userId, tenantId) {
    if (!userId) return false;
    try {
      const tid = tenantId || tenantOfUser(db, userId);
      return resolveAppBenefits(db, tid, userId, 'mall').price_visible === true;
    } catch {
      return false;
    }
  }

  /** 折扣后价格（单位：分）。先折后取整到分，避免 1 分误差。 */
  function applyDiscount(fen, pct) {
    if (!fen || !(pct > 0)) return fen;
    return Math.round(fen * (1 - pct / 100));
  }

  /**
   * 计算某商品（可含 SKU 基准价）的会员价。
   *
   * @param {object} goods        goods 行（含 member_price / price）
   * @param {object} opts
   *   basePriceFen  基准价（分）：SKU 价或商品价（元 × 100），已含新人价/门店价等最终成交价
   *   userId        当前用户（0 = 游客）
   *   tenantId      租户 id
   *   levelId       当前用户会员等级 id（0 = 非会员），不传则内部查
   *   discountPct   套餐折扣百分比，不传则内部查
   * @returns {{ priceFen:number, originFen:number, hasMemberPrice:boolean, discountPct:number,
   *             levelId:number, source:'goods'|'package'|'none' }}
   */
  function resolveMemberPrice(goods, opts = {}) {
    const baseFen = Math.max(0, Math.round(Number(opts.basePriceFen) || 0));
    const userId = Number(opts.userId) || 0;
    const tenantId = Number(opts.tenantId) || 0;
    const levelId = opts.levelId !== undefined ? Number(opts.levelId) || 0 : currentLevelId(tenantId, userId);
    const pct = opts.discountPct !== undefined ? Number(opts.discountPct) || 0 : discountPctOf(userId, tenantId);

    const originFen = baseFen;

    // ① 商品级会员价优先（商品活动价 > 套餐权益折扣，传统商城惯例）
    const hit = levelId ? matchGoodsMemberPrice(parseJsonLoose(goods?.member_price), levelId) : null;
    if (hit) {
      let fen;
      if (hit.type === 'amount') {
        fen = Math.round(hit.value * 100);           // 固定会员价（元）→ 分
      } else {
        const rate = hit.value / 10;                   // 9.8 → 0.98
        fen = Math.round(originFen * rate);
      }
      if (fen > 0 && fen < originFen) {
        return { priceFen: fen, originFen, hasMemberPrice: true, discountPct: pct, levelId, source: 'goods' };
      }
    }

    // ② 套餐级折扣（mall.discount）
    if (pct > 0) {
      const fen = applyDiscount(originFen, pct);
      if (fen > 0 && fen < originFen) {
        return { priceFen: fen, originFen, hasMemberPrice: true, discountPct: pct, levelId, source: 'package' };
      }
    }

    return { priceFen: originFen, originFen, hasMemberPrice: false, discountPct: pct, levelId, source: 'none' };
  }

  /**
   * 租户级「价格展示」策略（goods_setting.showVipPrice，传统商城三态）：
   *   0 = 非会员不可见会员价（看到原价，会员看到会员价）
   *   1 = 非会员可见最低等级会员价
   *   2 = 非会员不可见价格（整体隐藏 → C 端显示「登录查看价格」）
   * @returns { mode:number, priceHidden:boolean } priceHidden=true 表示该访客看不到价格
   */
  function priceShowPolicy(tenantId, userId, levelId) {
    let mode = 0;
    try {
      const row = db.prepare('SELECT config FROM goods_setting WHERE customer_id = ?').get(tenantId);
      const cfg = parseJsonLoose(row?.config) || {};
      mode = Number(cfg.showVipPrice) || 0;
    } catch {
      mode = 0;
    }
    const isMember = !!levelId;
    // 只有 mode=2（非会员不可见价格）才整体隐藏；会员永远可见
    const priceHidden = mode === 2 && !isMember;
    return { mode, priceHidden };
  }

  return {
    currentLevelId,
    discountPctOf,
    memberPricePublic,
    applyDiscount,
    resolveMemberPrice,
    priceShowPolicy,
  };
}

function parseJsonLoose(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}
