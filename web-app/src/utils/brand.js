// 品牌 5 色加载（web-app 侧单一来源）：本人名片 → 归一化 palette，各页 hero 共用
import { cardApi } from './cardApi.js';
import { brandPalette } from './color.js';

/**
 * 拉取本人名片的品牌 5 色（/cards 列表首张，含 brandColors 出口）。
 * 失败/未登录/无名片返回 null——调用方保持回落态（不抛错、不 toast、不阻断主流程）。
 */
export async function fetchBrandPalette() {
  try {
    const res = await cardApi.getCardsSafe();
    const c = (res.cards || [])[0];
    return c ? brandPalette(c) : null;
  } catch (e) {
    return null;
  }
}
