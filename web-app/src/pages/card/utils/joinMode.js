/**
 * 租户个人入驻模式（第20轮三层身份·双模开关；第26轮起三值）
 *
 * 单一事实来源：/api/channel/init 下发的 individualJoinMode（App.vue 冷启动时
 * 整包存入 channel_config）。未取到（H5 直开/渠道未配置）时回落 'code'——
 * 保守默认：口令+审核是存量行为，不允许因读不到模式就改走购买引导。
 *
 *   'code'     = 兑换码+审核入驻（默认）
 *   'apply'    = 自助申请认证（免兑换码，提交后仍走管理员审核）
 *   'purchase' = 购买会员套餐自助获得集市场席
 */

/** 当前渠道租户的入驻模式；取不到一律 'code' */
export function getIndividualJoinMode() {
  try {
    const cfg = uni.getStorageSync('channel_config');
    const m = cfg && cfg.individualJoinMode;
    return m === 'purchase' || m === 'apply' ? m : 'code';
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
