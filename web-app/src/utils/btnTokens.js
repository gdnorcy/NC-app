/**
 * 装修中心「按钮尺寸」单一事实来源（web-app C 端渲染 与 web-admin 装修画布 共用同一份）
 *
 * 取值对齐微信官方控件库 WeUI，详见 docs/规范/08-装修中心按钮规范.md。
 * 微信《小程序设计指南》3.2 要求"推荐使用或模仿标准控件尺寸"，故以 WeUI 为准：
 *   --weui-BTN-HEIGHT: 48 / -MEDIUM: 40 / -SMALL: 32，
 *   .weui-btn radius 8px、mini radius 6px、xmini radius 4px。
 *
 * 单位一律 rpx（微信官方设计稿基准 375px = 750rpx，1px = 2rpx）。
 * admin 画布是普通 DOM，用 pxOf() 换算后使用 —— 画布尺寸此前是手抄 C 端的，
 * 已发生过抄漏（.r-follow-btn 字号/圆角/内距均与 C 端不符），故收敛到本文件。
 *
 * 注意：改这里的数值，C 端渲染与装修画布预览会同时变化。
 */

/** 375px 基准下 1px = 2rpx */
export const RPX_PER_PX = 2;

/**
 * 四档尺寸（单位 rpx）
 * height 锁死 + line-height 同值，左右内距由 padX 控制，不设上下 padding。
 */
export const BTN = {
  // L 主操作 = WeUI default：48px 高 / 8px 圆角 / 17px 字号 / 24px 左右内距
  l: { height: 96, padX: 48, radius: 16, fontSize: 34, weight: 500 },
  // M 标准 = WeUI medium：40px 高 / 8px 圆角 / 14px 字号 / 24px 左右内距
  m: { height: 80, padX: 48, radius: 16, fontSize: 28, weight: 500 },
  // S 紧凑 = WeUI mini：32px 高 / 6px 圆角 / 14px 字号 / 12px 左右内距
  s: { height: 64, padX: 24, radius: 12, fontSize: 28, weight: 400 },
  // XS 迷你 = WeUI xmini：28px 高 / 4px 圆角 / 14px 字号 / 12px 左右内距
  xs: { height: 56, padX: 24, radius: 8, fontSize: 28, weight: 500 },
};

/** 圆形特例（直径 rpx）：形状由功能决定，不归入四档 */
export const BTN_ROUND = {
  countdown: 96, // 倒计时 48px
  float: 104, // 悬浮圆形 52px
  videoPlay: 104, // 视频播放 52px
};

/** 悬浮胶囊特例：沿用 L 档高度，圆角取胶囊（高度一半）以保留悬浮感 */
export const BTN_FLOAT = { height: 96, radius: 48, fontSize: 28 };

/** 圆角允许区间（rpx）：面板自定义不得超过，见规范 2.8 */
export const RADIUS_RANGE = { min: 8, max: 32 };

/** 触控约束（rpx）：独立可点按钮最小热区、相邻可点元素最小间距 */
export const TOUCH = { minHit: 88, minGap: 16 };

/** rpx → px（admin 画布用） */
export function pxOf(rpx) {
  return rpx / RPX_PER_PX;
}

/** 取某档的 CSS 声明（C 端内联样式用，单位 rpx） */
export function btnVars(tier) {
  const t = BTN[tier] || BTN.m;
  return {
    height: t.height + 'rpx',
    lineHeight: t.height + 'rpx',
    paddingLeft: t.padX + 'rpx',
    paddingRight: t.padX + 'rpx',
    borderRadius: t.radius + 'rpx',
    fontSize: t.fontSize + 'rpx',
    fontWeight: t.weight,
  };
}

/** 取某档的 CSS 声明（admin 画布内联样式用，单位 px） */
export function btnVarsPx(tier) {
  const t = BTN[tier] || BTN.m;
  return {
    height: pxOf(t.height) + 'px',
    lineHeight: pxOf(t.height) + 'px',
    paddingLeft: pxOf(t.padX) + 'px',
    paddingRight: pxOf(t.padX) + 'px',
    borderRadius: pxOf(t.radius) + 'px',
    fontSize: pxOf(t.fontSize) + 'px',
    fontWeight: t.weight,
  };
}
