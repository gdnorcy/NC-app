// 设计中心 C 端渲染工具测试：规范化/兜底图标/首页映射/缓存读取
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeDesignConfig, normalizeHeader, fallbackTabIcon, resolveHomePath, readDesignConfig, buildShareCard, shouldShowShareBack, resolveAssetUrl, DEFAULT_DESIGN_TABS, HOME_PAGE_MAP, STORAGE_KEY } from './design.js';

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

  it('P10 头部方案二（ew）：scheme=2 返回 ew 字段块，页面覆盖全局默认', () => {
    const gd = {
      scheme: 2,
      ew: {
        funcModule: 'single', textColor: 'black',
        headBg: { mode: 'color', color: '#ffffff', image: '' },
        scrollBg: { mode: 'color', color: 'transparent', image: '' },
        layers: [
          { left: { type: 'image', image: '/uploads/global-l.png' }, middle: { type: 'search', search: { fillBg: '#eee', placeholder: '全局占位' } }, right: { type: 'none' } },
          {},
        ],
        copyright: 'default',
      },
    };
    const page = {
      scheme: 2,
      ew: { funcModule: 'double', layers: [{ left: { type: 'icon', icon: 'user' } }, { middle: { type: 'image', image: '/uploads/p-m.png' } }] },
    };
    const h = normalizeHeader(page, gd);
    expect(h.scheme).toBe(2);
    expect(h.ew.funcModule).toBe('double');
    expect(h.ew.layers[0].left.type).toBe('icon'); // 页面覆盖
    expect(h.ew.layers[0].left.icon).toBe('user');
    expect(h.ew.layers[0].middle.type).toBe('search'); // 该层中间未覆盖 → 继承全局
    expect(h.ew.layers[0].middle.search.fillBg).toBe('#eee');
    expect(h.ew.layers[0].middle.search.placeholder).toBe('全局占位');
    expect(h.ew.layers[1].middle.type).toBe('image'); // 第二层页面覆盖
    expect(h.ew.layers[1].middle.image).toBe('/uploads/p-m.png');
    expect(h.ew.layers[1].left.type).toBe('none'); // 第二层左侧未覆盖 → 兜底
  });

  it('P11 头部方案二：全局默认 scheme=2 且页面无 header 时生效', () => {
    const h = normalizeHeader(null, { scheme: 2, ew: { funcModule: 'none', textColor: 'white' } });
    expect(h.scheme).toBe(2);
    expect(h.ew.funcModule).toBe('none');
    expect(h.ew.textColor).toBe('white');
    expect(h.ew.layers.length).toBe(2);
    expect(h.ew.layers[0].left.type).toBe('none');
  });

  it('P12 方案一跟随全局默认：followGlobal=true 用全局 s1 覆盖头部核心字段', () => {
    const gd = { scheme: 1, s1: { type: 'custom', bgColor: '#9ce108', bgImage: '', fixed: true, padding: 8, lines: 1, titleText: '全局标题', textColor: '#123456' } };
    const page = { followGlobal: true, scheme: 1, type: 'custom', bgColor: '#ffffff', titleText: '', textColor: '#1d2129', padding: 0, lines: 1, content: { left: { type: 'none' }, center: { type: 'none' }, right: { type: 'none' } } };
    const h = normalizeHeader(page, gd);
    expect(h.scheme).toBe(1);
    expect(h.bgColor).toBe('#9ce108');
    expect(h.titleText).toBe('全局标题');
    expect(h.textColor).toBe('#123456');
    expect(h.padding).toBe(8);
    expect(h.content.left.type).toBe('none'); // 内容行保留页面结构
  });

  it('P13 方案二跟随全局默认：followGlobal=true 以全局 ew 为准，页面 ew 默认不覆盖', () => {
    const gd = { scheme: 2, ew: { funcModule: 'single', textColor: 'black', layers: [{ left: { type: 'image', image: '/uploads/g.png' }, middle: { type: 'search', search: { placeholder: '全局' } }, right: { type: 'none' } }, {}] } };
    const page = { followGlobal: true, scheme: 2, ew: { funcModule: 'double', layers: [{ left: { type: 'icon', icon: 'user' } }, { middle: { type: 'image', image: '/uploads/p.png' } }] } };
    const h = normalizeHeader(page, gd);
    expect(h.scheme).toBe(2);
    expect(h.ew.funcModule).toBe('single'); // 跟随全局 → 页面默认不覆盖
    expect(h.ew.layers[0].left.type).toBe('image');
    expect(h.ew.layers[0].left.image).toBe('/uploads/g.png');
  });

  it('P14 存量页面（无 followGlobal）保持页面级优先：全局 s1 不覆盖页面已配置字段', () => {
    const gd = { scheme: 1, s1: { bgColor: '#9ce108', titleText: '全局标题' } };
    const page = { scheme: 1, type: 'custom', bgColor: '#ff0000', titleText: '本页标题', textColor: '#1d2129', padding: 0, lines: 1, content: {} };
    const h = normalizeHeader(page, gd);
    expect(h.scheme).toBe(1);
    expect(h.bgColor).toBe('#ff0000');
    expect(h.titleText).toBe('本页标题');
  });

  it('P15 buildShareCard：标题取分享标题（默认页面名）、配图取分享图片、path 可传', () => {
    expect(buildShareCard({ shareTitle: '商会欢迎您', shareImage: '/uploads/s.png' }, '首页', '/pages/cardMain/home?tid=1'))
      .toEqual({ title: '商会欢迎您', imageUrl: '/uploads/s.png', path: '/pages/cardMain/home?tid=1' });
    expect(buildShareCard({}, '首页', '').title).toBe('首页');
    expect(buildShareCard(null, '', '').title).toBe('智能名片');
    expect(buildShareCard({}, '', '').imageUrl).toBe('');
  });

  it('P16 shouldShowShareBack：仅分享进入且开启返回上页时为 true', () => {
    expect(shouldShowShareBack({ from: 'share' }, { backHome: true })).toBe(true);
    expect(shouldShowShareBack({ from: 'share' }, { backHome: false })).toBe(false);
    expect(shouldShowShareBack({ from: 'share' }, {})).toBe(false);
    expect(shouldShowShareBack({}, { backHome: true })).toBe(false);
    expect(shouldShowShareBack(null, { backHome: true })).toBe(false);
  });

  it('P17 resolveAssetUrl：http/data/blob 原样返回，相对路径拼 origin，空值返回空', () => {
    expect(resolveAssetUrl('https://a.com/x.png')).toBe('https://a.com/x.png');
    expect(resolveAssetUrl('data:image/png;base64,xx')).toBe('data:image/png;base64,xx');
    expect(resolveAssetUrl('')).toBe('');
    expect(resolveAssetUrl(null)).toBe('');
  });
});
