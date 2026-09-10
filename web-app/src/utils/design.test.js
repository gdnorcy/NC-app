// 设计中心 C 端渲染工具测试：规范化/兜底图标/首页映射/缓存读取
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeDesignConfig, normalizeHeader, fallbackTabIcon, resolveHomePath, readDesignConfig, DEFAULT_DESIGN_TABS, HOME_PAGE_MAP, STORAGE_KEY } from './design.js';

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

  it('P7 头部设置 normalizeHeader：空值返回 null', () => {
    expect(normalizeHeader(null)).toBeNull();
    expect(normalizeHeader(undefined)).toBeNull();
  });

  it('P8 头部设置 normalizeHeader：三类型 + 内容项 + 缺字段兜底', () => {
    const h = normalizeHeader({
      type: 'immersive', bgColor: '', bgImage: '', fixed: true, padding: 12, lines: 2,
      titleText: '我的首页', textColor: '#333333',
      content: { left: { type: 'text', text: '返回', link: '/pages/card/myCard', color: '#ff0000' }, center: { type: 'none' }, right: { type: 'image', image: '/uploads/x.png' } },
    });
    expect(h.type).toBe('immersive');
    expect(h.lines).toBe(2);
    expect(h.padding).toBe(12);
    expect(h.content.left.text).toBe('返回');
    expect(h.content.left.color).toBe('#ff0000');
    expect(h.content.center.type).toBe('none');
    expect(h.content.right.image).toBe('/uploads/x.png');
    // 非法类型兜底 custom
    const bad = normalizeHeader({ type: 'hack' });
    expect(bad.type).toBe('custom');
    expect(bad.lines).toBe(1);
    expect(bad.content.left.type).toBe('none');
    expect(bad.bgColor).toBe('#ffffff');
  });

  it('P9 头部两行内容 + 文字加粗/字号 + 中间样式规范化', () => {
    const h = normalizeHeader({
      type: 'custom', lines: 2,
      content: { left: { type: 'text', text: 'A', bold: 1, fontSize: 16 }, center: { type: 'text', text: '标题', bgColor: '#f00', borderColor: '#0f0', width: 200, radius: 12, align: 'left', bold: 1, fontSize: 18 } },
      content2: { left: { type: 'text', text: 'B' }, center: { type: 'none' }, right: { type: 'iconText', text: '更多', bold: 1 } },
    });
    expect(h.lines).toBe(2);
    expect(h.content.left.bold).toBe(1);
    expect(h.content.left.fontSize).toBe(16);
    expect(h.content.center.bgColor).toBe('#f00');
    expect(h.content.center.borderColor).toBe('#0f0');
    expect(h.content.center.width).toBe(200);
    expect(h.content.center.radius).toBe(12);
    expect(h.content.center.align).toBe('left');
    // content2 独立规范化
    expect(h.content2.left.text).toBe('B');
    expect(h.content2.right.type).toBe('iconText');
    expect(h.content2.right.bold).toBe(1);
    // 缺字段兜底
    expect(h.content2.center.type).toBe('none');
    expect(h.content.left.fontSize).toBe(16);
    expect(h.content.center.fontSize).toBe(18);
    const d = normalizeHeader({ content: { center: { type: 'text', text: 'x' } } });
    expect(d.content.center.width).toBe(154);
    expect(d.content.center.radius).toBe(23);
    expect(d.content.center.align).toBe('center');
    expect(d.content.center.bold).toBe(0);
  });
});
