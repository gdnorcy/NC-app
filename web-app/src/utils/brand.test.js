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
import { contrastOn } from './color.js';

/** 对比度（供 inkOnLightBg 断言用；非法色返回 null） */
function contrastOf(fg, bg) { return contrastOn(fg, bg); }

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

  test('失败/无名片返回 null 且不抛错；🔴 失败不进缓存（下次调用重试）', async () => {
    // 🔴 反例（真机已踩 2026-10-15）：把 null 也缓存 → 冷启动 401 后登录成功也永远蓝
    cardApiMock.getCardsSafe.mockRejectedValueOnce(new Error('未登录'));
    expect(await fetchBrandPalette()).toBe(null);
    cardApiMock.getCardsSafe.mockResolvedValue({ cards: [{ brandColors: { primary: '#FCB801' } }] });
    const b = await fetchBrandPalette();
    expect(b.primary).toBe('#FCB801');
    expect(cardApiMock.getCardsSafe).toHaveBeenCalledTimes(2);
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
    // 🔴 反例（真机已踩）：组件内一次性 fetchBrandPalette → 冷启动 401 后永远蓝；
    //   必须走 useBrandOverride（共享状态 + 退避重试），登录后响应式自愈。
    expect(s).toContain("import { useBrandOverride } from '../utils/brand.js';");
    expect(s).toContain('const { brandPrimary } = useBrandOverride();');
    expect(s).toContain("const themeColor = computed(() => brandPrimary.value || designConfig.value?.style?.primaryColor || '#07c160');");
  });

  test('useBrandOverride 自愈三件套：失败不缓存 + 退避重试 + 登录后清缓存', () => {
    const s = src('./brand.js');
    // ① fetchBrandPalette 失败路径不得写 _brandCache
    expect(s).toMatch(/catch \(e\) \{[\s\S]*?_brandPromise = null;[\s\S]*?_brandCacheKey = '';[\s\S]*?return null;/);
    // ② 未拿到 palette 时按退避延迟重试（登录晚于首次挂载也能自愈）
    expect(s).toContain('const RETRY_DELAYS = [2000, 5000, 10000];');
    expect(s).toContain('_retryTimer = setTimeout(ensureBrandLoaded, delay);');
    // ③ 共享模块级状态：所有页面/组件同一份 ref，任一处成功全站响应式更新
    expect(s).toContain('const _brandRef = ref(null);');
    expect(s).toContain('return { brand: _brandRef, brandVars, brandPrimary, brandInkVars };');
  });

  test('brandInkVars：白底可读主色 + 主色淡底（亮黄主色白底不可读的根治口）', () => {
    const s = src('./brand.js');
    expect(s).toContain("import { brandPalette, inkOnLightBg, hexA } from './color.js';");
    expect(s).toContain("'--brand-ink': inkOnLightBg(p)");
    expect(s).toContain("'--brand-tint': hexA(p, 0.1)");
    // 坐在品牌渐变上的前景（占位头像白字/渐变徽章）：与 cardDetail hero 同源裁决
    expect(s).toContain("'--brand-hero-ink': heroForeground(p, g || p, { text: '#ffffff' }).text");
    expect(s).toContain("import { heroForeground } from './templateTheme.js';");
    // 未设品牌色 → 空对象，消费点各自 var() 兜底，不污染回落链路
    expect(s).toMatch(/const p = brandPrimary\.value;[\s\S]*?if \(!p\) return \{\};/);
  });

  test('inkOnLightBg：亮黄主色压暗到可读，深色主色原样保留', () => {
    const { inkOnLightBg } = require('./color.js');
    // #FCB801 在白底仅 1.75:1 → 必须被压暗
    const yellow = inkOnLightBg('#FCB801');
    expect(yellow).not.toBe('#FCB801');
    expect(contrastOf(yellow, '#ffffff')).toBeGreaterThanOrEqual(3);
    // 深蓝在白底 5.19:1 → 原样保留，不许乱改
    expect(inkOnLightBg('#165dff')).toBe('#165dff');
    // 非法输入回落兜底蓝
    expect(inkOnLightBg('')).toBe('#165dff');
    expect(inkOnLightBg('rgba(0,0,0,.5)')).toBe('#165dff');
  });

  // 🔴 #312-18：登录实现收敛到 utils/inlineLogin.js（登录页与页面内浮层共用），
  // 这里钉的是**语义**（登录成功必须清缓存），不再钉它在哪个文件里 import。
  test('登录成功后 resetBrandCache（登录页与页面内浮层共用同一份实现）', () => {
    const s = src('./inlineLogin.js');
    expect(s).toContain("import { resetBrandCache } from './brand.js';");
    expect(s).toContain('  resetBrandCache();');
    // 两条登录入口都必须走它，不能自己再写一份 wxLogin
    expect(src('../pages/cardMain/login.vue')).toContain('performWxLogin');
    expect(src('../components/LoginGate.vue')).toContain('performWxLogin');
    expect(src('../pages/cardMain/login.vue')).not.toContain('cardApi.wxLogin(');
  });
});
