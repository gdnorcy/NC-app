// 设计中心 C 端渲染工具测试：规范化/兜底图标/首页映射/缓存读取
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeDesignConfig, fallbackTabIcon, resolveHomePath, readDesignConfig, DEFAULT_DESIGN_TABS, HOME_PAGE_MAP, STORAGE_KEY } from './design.js';

const store = {};
const uniMock = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
};
vi.stubGlobal('uni', uniMock);

describe('设计中心 C 端渲染工具', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it('P1 空配置兜底：默认 Tab 4 项 + 默认主色 + home=card', () => {
    const cfg = normalizeDesignConfig(null);
    expect(cfg.tabItems).toHaveLength(4);
    expect(cfg.style.primaryColor).toBe('#165DFF');
    expect(cfg.homePage).toBe('card');
    expect(cfg.tabItems[0].url).toBe('/pages/cardMain/home');
  });

  it('P2 正常配置：Tab 项/主色/首页透传，非法 url 兜底', () => {
    const cfg = normalizeDesignConfig({
      style: { primaryColor: '#00B42A', radius: 12 },
      tab: { items: [{ text: '首页', icon: '/uploads/a.png', url: '/pages/cardMain/home' }, { text: '坏链接', url: 'javascript:alert(1)' }] },
      homePage: 'market',
    });
    expect(cfg.style.primaryColor).toBe('#00B42A');
    expect(cfg.tabItems).toHaveLength(2);
    expect(cfg.tabItems[1].url).toBe('/pages/cardMain/home'); // 非法 url 兜底
    expect(cfg.homePage).toBe('market');
  });

  it('P3 文案兜底图标映射', () => {
    expect(fallbackTabIcon('首页')).toBe('dashboard');
    expect(fallbackTabIcon('集市')).toBe('market');
    expect(fallbackTabIcon('未知')).toBe('apps');
  });

  it('P4 首页跳转路径：card 不跳，其余映射', () => {
    expect(resolveHomePath('card')).toBeNull();
    expect(resolveHomePath('market')).toBe('/pages/card/market');
    expect(resolveHomePath('radar')).toBe('/pages/card/visitors');
    expect(resolveHomePath('distribution')).toBe('/pages/card/distribution');
    expect(resolveHomePath('非法值')).toBeNull();
  });

  it('P5 本地缓存：未过期可读，过期失效', () => {
    const config = normalizeDesignConfig({ style: { primaryColor: '#F53F3F' }, homePage: 'member' });
    uni.setStorageSync(STORAGE_KEY, { ts: Date.now() - 1000, config }); // 1 秒前，未过期
    expect(readDesignConfig()).toBeTruthy();
    expect(readDesignConfig().style.primaryColor).toBe('#F53F3F');
    uni.setStorageSync(STORAGE_KEY, { ts: Date.now() - 10 * 60 * 1000, config }); // 10 分钟前，已过期
    expect(readDesignConfig()).toBeNull();
  });

  it('P6 常量契约：HOME_PAGE_MAP 覆盖 5 个选项', () => {
    expect(Object.keys(HOME_PAGE_MAP).sort()).toEqual(['card', 'distribution', 'market', 'member', 'radar']);
    expect(DEFAULT_DESIGN_TABS.length).toBe(4);
  });
});
