import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// 品牌 5 色加载工具（utils/brand.js）回归：
// ① fetchBrandPalette 会话级缓存（CardTabBar 等公共组件也调用，同会话只发一次请求）
// ② home / CardTabBar 的品牌主色跟随锁（2026-10-15「首页还是蓝」报修）

const here = import.meta.url;
const { cardApiMock } = vi.hoisted(() => ({ cardApiMock: { getCardsSafe: vi.fn() } }));
vi.mock('./cardApi.js', () => ({ cardApi: cardApiMock }));

import { fetchBrandPalette, resetBrandCache } from './brand.js';

function src(rel) {
  return readFileSync(fileURLToPath(new URL(rel, here)), 'utf8');
}

describe('fetchBrandPalette 会话级缓存', () => {
  beforeEach(() => {
    resetBrandCache();
    cardApiMock.getCardsSafe.mockReset();
  });

  test('正常拉取：/cards 首张归一化为 palette', async () => {
    cardApiMock.getCardsSafe.mockResolvedValue({ cards: [{ brandColors: { primary: '#FCB801', gradient: '#FCC601' } }] });
    const b = await fetchBrandPalette();
    expect(b.primary).toBe('#FCB801');
    expect(b.gradient).toBe('#FCC601');
  });

  test('缓存命中：第二次调用不再发请求', async () => {
    cardApiMock.getCardsSafe.mockResolvedValue({ cards: [{ brandColors: { primary: '#FCB801' } }] });
    await fetchBrandPalette();
    const b2 = await fetchBrandPalette();
    expect(cardApiMock.getCardsSafe).toHaveBeenCalledTimes(1);
    expect(b2.primary).toBe('#FCB801');
  });

  test('并发去重：同时多次调用只发一次请求', async () => {
    cardApiMock.getCardsSafe.mockImplementation(() => new Promise((r) => setTimeout(() => r({ cards: [{ brandColors: { primary: '#FCB801' } }] }), 5)));
    const [a, b] = await Promise.all([fetchBrandPalette(), fetchBrandPalette(), fetchBrandPalette()]);
    expect(cardApiMock.getCardsSafe).toHaveBeenCalledTimes(1);
    expect(a.primary).toBe('#FCB801');
    expect(b.primary).toBe('#FCB801');
  });

  test('失败/无名片返回 null 且不抛错；null 也进缓存（不重复打失败请求）', async () => {
    cardApiMock.getCardsSafe.mockRejectedValue(new Error('network'));
    expect(await fetchBrandPalette()).toBe(null);
    expect(await fetchBrandPalette()).toBe(null);
    expect(cardApiMock.getCardsSafe).toHaveBeenCalledTimes(1);
  });

  test('resetBrandCache 后重新拉取', async () => {
    cardApiMock.getCardsSafe.mockResolvedValue({ cards: [{ brandColors: { primary: '#FCB801' } }] });
    await fetchBrandPalette();
    resetBrandCache();
    await fetchBrandPalette();
    expect(cardApiMock.getCardsSafe).toHaveBeenCalledTimes(2);
  });
});

describe('品牌主色跟随锁（home 首页 / CardTabBar 底部导航）', () => {
  test('home.vue：根视图合并 [pageBgStyle, themeStyle, brandVars]', () => {
    const s = src('../pages/cardMain/home.vue');
    expect(s).toContain(':style="[pageBgStyle, themeStyle, brandVars]"');
    expect(s).toContain('const brandVars = computed(() => brandThemeOverride(brandPalette(myCard.value || {})));');
  });

  test('CardTabBar.vue：themeColor 品牌主色优先（SIcon 不吃 var()，tab 激活态跟随品牌）', () => {
    const s = src('../components/CardTabBar.vue');
    // 🔴 反例（曾踩）：只覆盖页面 CSS var，CardTabBar 的激活色是 JS 层 designConfig.primaryColor
    //   → tab 图标/文字仍蓝。组件内须品牌优先喂真实 hex。
    expect(s).toContain("import { fetchBrandPalette } from '../utils/brand.js';");
    expect(s).toContain('const brandPrimary = ref(\'\');');
    expect(s).toContain("const themeColor = computed(() => brandPrimary.value || designConfig.value?.style?.primaryColor || '#07c160');");
  });
});
