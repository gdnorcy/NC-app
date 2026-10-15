/**
 * 底部导航条占位回归（2026-10-16 新增）
 *
 * 病根：CardTabBar 是 fixed 定位，高度随设计中心方案在 110~190rpx 间浮动（还要加安全区），
 * 而 12 个页面各自写死 padding-bottom: 120/140/160rpx → 会员中心最后一个套餐卡被导航条压住。
 *
 * 锁三件事：
 *  ① 占位高度由 CardTabBar **实测**后广播（windowHeight - rect.top，含悬浮偏移与安全区）
 *  ② 页面不再写死：凡挂 CardTabBar 的页面，根 :style 必须带 tabBarPad
 *  ③ 兜底值与呼吸间隙合理（太小=贴住，太大=空一屏）
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect, beforeEach } from 'vitest';
import {
  tabBarSpaceRpx, setTabBarSpace, tabBarPaddingStyle,
  DEFAULT_TAB_SPACE_RPX, TAB_BAR_GAP_RPX,
} from './cardTabBarSpace.js';

const here = import.meta.url;
const src = (rel) => readFileSync(fileURLToPath(new URL(rel, here)), 'utf8');

describe('setTabBarSpace 取值护栏', () => {
  beforeEach(() => { tabBarSpaceRpx.value = DEFAULT_TAB_SPACE_RPX; });

  test('合理测量值写入（凸起 190rpx / 普通 140rpx）', () => {
    setTabBarSpace(190); expect(tabBarSpaceRpx.value).toBe(190);
    setTabBarSpace(140.6); expect(tabBarSpaceRpx.value).toBe(141); // 四舍五入
  });

  test('非法/异常值一律拒绝，保留上一个可用值（测量失败不许把占位算成整屏）', () => {
    setTabBarSpace(150);
    for (const bad of [0, -10, NaN, undefined, null, '', 'abc', 79, 401, Infinity]) {
      setTabBarSpace(bad);
      expect(tabBarSpaceRpx.value, `非法值 ${String(bad)} 应被拒绝`).toBe(150);
    }
  });

  test('padding = 实测高度 + 呼吸间隙（+ 调用方额外值）', () => {
    setTabBarSpace(190);
    expect(tabBarPaddingStyle()).toEqual({ paddingBottom: `${190 + TAB_BAR_GAP_RPX}rpx` });
    expect(tabBarPaddingStyle(20)).toEqual({ paddingBottom: `${190 + TAB_BAR_GAP_RPX + 20}rpx` });
    expect(TAB_BAR_GAP_RPX, '用户明确要求「有间隙」，不得为 0').toBeGreaterThan(0);
  });
});

describe('CardTabBar 实测广播', () => {
  const s = src('../components/CardTabBar.vue');
  test('用 windowHeight - rect.top 而非 rect.height（后者不含悬浮 bottom 偏移）', () => {
    expect(s).toContain('sys.windowHeight - rect.top');
    expect(s).not.toMatch(/setTabBarSpace\(\s*rect\.height/);
  });
  test('rect.top=0 视为测量失败并跳过（未布局时会把占位算成整屏）', () => {
    expect(s).toMatch(/if \(!rect \|\| !rect\.top \|\| !rect\.height\) return;/);
  });
  test('配置异步到位/样式切换后重测（挂载一次测不准）', () => {
    expect(s).toContain('const instance = getCurrentInstance();');
    expect(s).toMatch(/watch\(\[tabType, tabStyle, tabCorner, \(\) => designItems\.value\.length\], scheduleMeasure\)/);
    expect(s).toMatch(/watch\(\(\) => localCfg\.value, scheduleMeasure\)/);
  });
});

describe('12 个挂 CardTabBar 的页面全部接入 tabBarPad', () => {
  const DIR = '../pages/card/';
  const PAGES = [
    'member.vue', 'profile.vue', 'market.vue', 'visitors.vue', 'myCard.vue', 'cardDetail.vue',
    'distribution.vue', 'distPartner.vue', 'distShareCat.vue', 'distShareArea.vue',
    'distWallet.vue', 'distShareAll.vue',
  ];
  for (const f of PAGES) {
    test(`${f} 根视图带 tabBarPad + 引入 useTabBarPadding`, () => {
      const t = src(DIR + f);
      expect(t).toContain("import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';");
      expect(t).toContain('const tabBarPad = useTabBarPadding();');
      expect(t).toMatch(/:style="\[[^\]]*tabBarPad[^\]]*\]">/);
      // 页面里必须真的挂了 CardTabBar，否则不该吃这个占位
      expect(t).toMatch(/<CardTabBar[\s/>]/);
    });
  }
  test('CardTabBar.vue 自身不被误加占位（它才是 fixed 的那一方）', () => {
    const t = src('../components/CardTabBar.vue');
    expect(t).not.toContain('useTabBarPadding');
  });
});
