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
 * 🔴 失败不进缓存：冷启动时 card_token 可能尚未就绪（/cards 401），
 *    若把 null 缓存住，登录成功后也不再重试 → 全域品牌色卡死整个会话（真机已踩）。
 */
let _brandCache = null;
let _brandCacheKey = '';
let _brandPromise = null;

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
      // 失败（未登录 401 / 网络抖动）→ 只清并发去重标记，不写 _brandCache，下次调用重试
      _brandPromise = null;
      _brandCacheKey = '';
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
 * 状态是模块级共享 ref：所有页面/组件同一份，任一处拿到品牌色全部响应式更新。
 * 首次调用触发加载；未登录等失败场景按 RETRY_DELAYS 退避重试（登录完成后自愈），
 * 成功即停。未设品牌主色时返回空对象/空串，回落设计中心系统主题色。
 */
const RETRY_DELAYS = [2000, 5000, 10000];
const _brandRef = ref(null);
let _brandStarted = false;
let _retryCount = 0;
let _retryTimer = null;

function ensureBrandLoaded() {
  fetchBrandPalette().then((b) => {
    if (b) {
      _brandRef.value = b;
      _retryCount = 0;
      return;
    }
    if (_retryCount < RETRY_DELAYS.length) {
      if (_retryTimer) clearTimeout(_retryTimer);
      const delay = RETRY_DELAYS[_retryCount++];
      // 诊断日志：真机排查「品牌色没生效」时，控制台看到此条 = 拉取失败（未登录 401 / 网络异常）
      console.warn(`[brand] 品牌色拉取失败（未登录或网络异常），${delay}ms 后重试（第 ${_retryCount}/${RETRY_DELAYS.length} 次）`);
      _retryTimer = setTimeout(ensureBrandLoaded, delay);
    }
  });
}

export function useBrandOverride() {
  if (!_brandStarted) {
    _brandStarted = true;
    ensureBrandLoaded();
  }
  const brandVars = computed(() => brandThemeOverride(_brandRef.value || {}));
  const brandPrimary = computed(() => (_brandRef.value && _brandRef.value.primary) || '');
  return { brand: _brandRef, brandVars, brandPrimary };
}

/** 清空会话缓存与共享状态（测试用；登录成功后调用可强制下次重新拉取） */
export function resetBrandCache() {
  _brandCache = null;
  _brandCacheKey = '';
  _brandPromise = null;
  _brandStarted = false;
  _retryCount = 0;
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  _brandRef.value = null;
}
