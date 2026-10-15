/**
 * 底部导航条占位（2026-10-16 新增，单一事实来源）
 *
 * 🔴 病根：CardTabBar 是 `position: fixed`，其高度随设计中心配置在 **110~190rpx** 之间浮动
 *    （普通/滑块/居中/扇形/凸起/嵌入 × 平铺/悬浮，见 CardTabBar 的 BTN_BG_METRIC），
 *    还要再加安全区；而各页把 `padding-bottom` 写死成 120/140/160rpx →
 *    配置一换（尤其「凸起 + 安全区」），最后一个卡片就被导航条压住（真机报修：
 *    「会员中心最后一个套餐跟底部菜单中间没有间隙」）。
 *
 * ✅ 正解：由 CardTabBar 自己 **实测**「视口底部被它占掉多高」（= windowHeight - rect.top，
 *    天然含悬浮型的 bottom 偏移与安全区），写进这里的共享 ref；页面读它算 padding-bottom。
 *    —— 不再让每个页面抄一份高度常量（抄必然漂移，这是本项目反复踩过的坑）。
 */
import { ref, computed } from 'vue';

/** 兜底值：普通平铺导航条 ≈ 112rpx + 上下 14rpx，未测量完成时先用它 */
export const DEFAULT_TAB_SPACE_RPX = 160;
/** 内容底与导航条之间的呼吸间隙（用户明确要「有间隙」） */
export const TAB_BAR_GAP_RPX = 24;

export const tabBarSpaceRpx = ref(DEFAULT_TAB_SPACE_RPX);

/** CardTabBar 调用：写入实测占用高度（rpx） */
export function setTabBarSpace(rpx) {
  const n = Number(rpx);
  // 只接受合理值：太小/太大都是测量失败或异常布局，保留兜底
  if (Number.isFinite(n) && n >= 80 && n <= 400) tabBarSpaceRpx.value = Math.round(n);
}

/**
 * 页面根 :style 用：底部留出「导航条实高 + 呼吸间隙」。
 * @param {number} extra 页面自身还想多加的 rpx（如悬浮按钮区）
 */
export function tabBarPaddingStyle(extra = 0) {
  return { paddingBottom: `${tabBarSpaceRpx.value + TAB_BAR_GAP_RPX + extra}rpx` };
}

/** 响应式版本（页面用 computed 包一层即可） */
export function useTabBarPadding(extra = 0) {
  return computed(() => tabBarPaddingStyle(extra));
}
