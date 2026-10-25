/**
 * 租户个人入驻模式（第20轮三层身份·双模开关）
 *
 * 单一事实来源：/api/channel/init 下发的 individualJoinMode（App.vue 冷启动时
 * 整包存入 channel_config）。未取到（H5 直开/渠道未配置）时回落 'code'——
 * 保守默认：兑换码+审核是存量行为，不允许因读不到模式就改走购买引导。
 *
 *   'code'     = 兑换码+审核入驻（默认）：拿到码 → 提交申请 → 管理员审核通过后成为认证个人
 *   'purchase' = 购买会员套餐自动获得场席和认证（无需兑换码）
 *
 * 两条路的终点一致：tenant_individuals.status='active'（同时获得集市场席与个人身份），
 * 差异只在「如何成为认证成员」的入口。
 */

/** 当前渠道租户的入驻模式；取不到一律 'code' */
export function getIndividualJoinMode() {
  try {
    const cfg = uni.getStorageSync('channel_config');
    const m = cfg && cfg.individualJoinMode;
    return m === 'purchase' ? m : 'code';
  } catch {
    return 'code';
  }
}

/** 渠道租户展示名（购买赠席/引导文案用）；取不到回空串 */
export function getChannelTenantName() {
  try {
    const cfg = uni.getStorageSync('channel_config');
    return (cfg && (cfg.brandName || cfg.customerName)) || '';
  } catch {
    return '';
  }
}
