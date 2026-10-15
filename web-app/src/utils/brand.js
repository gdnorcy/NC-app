// 品牌 5 色加载（web-app 侧单一来源）：本人名片 → 归一化 palette，各页 hero 共用
import { ref, computed } from 'vue';
import { cardApi } from './cardApi.js';
import { brandPalette } from './color.js';
import { brandThemeOverride } from './design.js';

/**
 * 拉取本人名片的品牌 5 色（/cards 列表首张，含 brandColors 出口）。
 * 失败/未登录/无名片返回 null——调用方保持回落态（不抛错、不 toast、不阻断主流程）。
 * 会话级缓存：CardTabBar 等公共组件也会调用（tab 激活色品牌优先），
 * 同一会话只发一次请求；品牌色极少变，跨页共享无副作用。测试用 resetBrandCache() 清。
 */
let _brandCache = null;
let _brandCacheKey = '';
let _brandPromise = null;

export function resetBrandCache() {
  _brandCache = null;
  _brandCacheKey = '';
  _brandPromise = null;
}

export async function fetchBrandPalette(cacheKey = '') {
  // 同 key 命中缓存（含并发去重）；key 变化（如登录态/租户切换）则重新拉
  if (_brandCache && _brandCacheKey === cacheKey) return _brandCache;
  if (_brandPromise && _brandCacheKey === cacheKey) return _brandPromise;
  _brandCacheKey = cacheKey;
  _brandPromise = (async () => {
    try {
      const res = await cardApi.getCardsSafe();
      const c = (res.cards || [])[0];
      _brandCache = c ? brandPalette(c) : null;
      return _brandCache;
    } catch (e) {
      _brandCache = null;
      return null;
    }
  })();
  return _brandPromise;
}

/**
 * 页面级品牌主色覆盖 composable（名片业务域页面统一接入）。
 * - brandVars：合并进页面根 :style 即可让全页 var(--design-primary/-rgb/gradient)
 *   消费点（按钮/链接/数字/激活背景等）跟随品牌色（CSS 变量向下继承）。
 * - brandPrimary：供 SIcon 的 color prop（JS 层取色、不吃 var()）品牌优先使用。
 * 内部走 fetchBrandPalette（会话缓存，并发去重），多页/多组件共享零额外请求。
 * 未设品牌主色时返回空对象/空串，回落设计中心系统主题色，不污染全景域等其他业务。
 */
export function useBrandOverride() {
  const brand = ref(null);
  fetchBrandPalette().then((b) => { if (b) brand.value = b; });
  const brandVars = computed(() => brandThemeOverride(brand.value || {}));
  const brandPrimary = computed(() => (brand.value && brand.value.primary) || '');
  return { brand, brandVars, brandPrimary };
}
