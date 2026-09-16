// 设计中心 C 端渲染工具：读取租户发布配置（风格/底部导航/首页跳转），带本地缓存与兜底
import { cardApi, API_DOMAIN } from './cardApi.js';

/** 默认底部导航（无配置/未发布时兜底，与首页硬编码 Tab 一致） */
export const DEFAULT_DESIGN_TABS = [
  { text: '首页', icon: '', url: '/pages/cardMain/home' },
  { text: '集市', icon: '', url: '/pages/card/market' },
  { text: '会员', icon: '', url: '/pages/card/member' },
  { text: '我的', icon: '', url: '/pages/card/profile' },
];

/** 首页跳转配置 → C 端页面路径 */
export const HOME_PAGE_MAP = {
  card: '/pages/cardMain/home', // 默认（名片首页）
  market: '/pages/card/market',
  radar: '/pages/card/visitors',
  member: '/pages/card/member',
  distribution: '/pages/card/distribution',
};

export const STORAGE_KEY = 'design_config';
export const JUMP_DONE_KEY = 'design_home_jump_done';
const TTL = 5 * 60 * 1000; // 配置缓存 5 分钟

/** 规范化原始配置（兼容缺字段/非法值） */
export function normalizeDesignConfig(raw) {
  const cfg = raw || {};
  const style = cfg.style || {};
  const tab = cfg.tab;
  const tabItems = Array.isArray(tab?.items) && tab.items.length ? tab.items : DEFAULT_DESIGN_TABS;
  const homePage = HOME_PAGE_MAP[cfg.homePage] ? cfg.homePage : 'card';
  const pageMeta = cfg.pages?.meta || {};
  const globalDefault = pageMeta.global?.headerDefault || {};
  return {
    tenantId: cfg.tenantId || 0,
    style: {
      headColor: style.headColor === '2' ? '2' : '1',
      headText: style.headText === '#000000' ? '#000000' : '#ffffff',
      colorScheme: typeof style.colorScheme === 'number' ? style.colorScheme : 11,
      primaryColor: style.primaryColor || '#FE0137',
      gradientColor: style.gradientColor || '#FF5169',
      secondaryColor: style.secondaryColor || '#FFE5EB',
      textColor: style.textColor || '#FFFFFF',
      subTextColor: style.subTextColor || '#FE0137',
    },
    header: normalizeHeader(cfg.header, globalDefault),
    tabItems: tabItems.map((it, i) => ({
      text: it.text || `导航${i + 1}`,
      icon: typeof it.icon === 'string' ? it.icon : '',
      url: typeof it.url === 'string' && it.url.startsWith('/') ? it.url : `/pages/cardMain/home`,
    })),
    homePage,
    pages: cfg.pages || null,
  };
}

/** 无图标时按文案兜底图标（SIcon name） */
export function fallbackTabIcon(text) {
  const m = {
    '首页': 'dashboard', '集市': 'market', '会员': 'crown', '我的': 'user',
    '名片': 'card', '人脉': 'market', '动态': 'dynamic', '消息': 'sms',
  };
  return m[text] || 'apps';
}

/** 首页配置 → 跳转路径；card（默认）返回 null 表示不跳转 */
export function resolveHomePath(homePage) {
  if (!homePage || homePage === 'card') return null;
  return HOME_PAGE_MAP[homePage] || null;
}

/** 规范化头部设置（custom/immersive/official；缺字段兜底；支持两行内容 content2 与文字加粗/大小/中间样式） */
export function normalizeHeader(raw, globalDefault) {
  const gd = globalDefault || {};
  // 跟随全局默认（followGlobal=true，新建页面默认）：头部整体采用全局默认配置（方案/背景/标题等）；
  // 自定义本页：页面配置优先，未设置字段回退全局默认
  const followGlobal = raw?.followGlobal === true;
  const scheme = followGlobal ? (gd.scheme ?? 1) : (raw?.scheme ?? gd.scheme ?? 1);
  if (scheme === 2) {
    // 方案二（ew）：跟随全局 → 以全局 ew 为准；自定义本页 → 页面 ew 字段覆盖全局默认（全局默认 + 单页覆盖）
    const gEw = gd.ew || {};
    const pEw = followGlobal ? gEw : (raw?.ew || {});
    const mergeLayers = () => {
      const gl = Array.isArray(gEw.layers) ? gEw.layers : [];
      const pl = Array.isArray(pEw.layers) ? pEw.layers : [];
      return [0, 1].map((i) => mergeLayer(gl[i] || {}, pl[i] || {}));
    };
    const ew = {
      funcModule: pEw.funcModule ?? gEw.funcModule ?? 'none',
      textColor: pEw.textColor ?? gEw.textColor ?? 'black',
      headBg: { mode: 'color', color: '#ffffff', image: '', ...(gEw.headBg || {}), ...(pEw.headBg || {}) },
      scrollBg: { mode: 'color', color: 'transparent', image: '', ...(gEw.scrollBg || {}), ...(pEw.scrollBg || {}) },
      layers: mergeLayers(),
      copyright: pEw.copyright ?? gEw.copyright ?? 'default',
    };
    return { scheme: 2, ew };
  }
  if (!raw) return null;
  const normItem = (it) => {
    const x = it || {};
    return {
      type: x.type || 'none', text: x.text || '', image: x.image || '', link: x.link || '', color: x.color || '',
      bold: x.bold ? 1 : 0, fontSize: typeof x.fontSize === 'number' ? x.fontSize : 13,
      bgColor: x.bgColor || '', borderColor: x.borderColor || '',
      width: typeof x.width === 'number' ? x.width : 154,
      radius: typeof x.radius === 'number' ? x.radius : 23,
      align: x.align || 'center',
    };
  };
  const normRow = (row) => {
    const r = row || {};
    return { left: normItem(r.left), center: normItem(r.center), right: normItem(r.right) };
  };
  const base = {
    scheme: 1,
    type: ['custom', 'immersive', 'official'].includes(raw.type) ? raw.type : 'custom',
    bgColor: raw.bgColor || '#ffffff',
    bgImage: raw.bgImage || '',
    fixed: !!raw.fixed,
    padding: typeof raw.padding === 'number' ? raw.padding : 0,
    lines: raw.lines === 2 ? 2 : 1,
    titleText: raw.titleText || '',
    textColor: raw.textColor || '#1d2129',
    content: normRow(raw.content),
    content2: normRow(raw.content2),
  };
  // 跟随全局默认 → 全局方案一默认（s1）覆盖头部核心字段（背景/标题/类型/固定/边距/行数/文字色）
  if (followGlobal) {
    const s1 = gd.s1 || {};
    return { ...base, ...s1 };
  }
  return base;
}

/** 方案二（ew）单层 merge：左/中/右三段字段兜底合并 */
function mergeLayer(g, p) {
  const gL = g?.left || {}; const pL = p?.left || {};
  const gM = g?.middle || {}; const pM = p?.middle || {};
  const gR = g?.right || {}; const pR = p?.right || {};
  return {
    left: {
      type: pL.type ?? gL.type ?? 'none', image: pL.image ?? gL.image ?? '', icon: pL.icon ?? gL.icon ?? '',
      color: pL.color ?? gL.color ?? '#ffffff', link: pL.link ?? gL.link ?? '',
      store: { info: '', province: '', city: '', district: '', address: '', name: '', color: '#ffffff', ...(gL.store || {}), ...(pL.store || {}) },
    },
    middle: {
      type: pM.type ?? gM.type ?? 'none', image: pM.image ?? gM.image ?? '', link: pM.link ?? gM.link ?? '',
      search: { fillBg: '#f2f2f2', borderBg: '#ffffff', iconColor: '#3d404d', textColor: '#ffffff', placeholder: '', placeholderLen: 0, placeholderMax: 10, hotword: false, showBtn: true, ...(gM.search || {}), ...(pM.search || {}) },
    },
    right: {
      type: pR.type ?? gR.type ?? 'none', image: pR.image ?? gR.image ?? '', icon: pR.icon ?? gR.icon ?? '',
      color: pR.color ?? gR.color ?? '#ffffff', link: pR.link ?? gR.link ?? '',
    },
  };
}

/** 读取本地缓存（未过期才有效） */
export function readDesignConfig() {
  try {
    const cached = uni.getStorageSync(STORAGE_KEY);
    if (cached && cached.ts && Date.now() - cached.ts < TTL) return cached.config || null;
  } catch { /* 忽略 */ }
  return null;
}

/** 拉取并缓存设计配置；force=true 强制刷新（发布后生效）；preview=true 拉取首页草稿用于「保存并预览」 */
export async function fetchDesignConfig(force = false, preview = false) {
  if (preview) {
    const raw = await cardApi.designConfig(true);
    return normalizeDesignConfig(raw);
  }
  const cached = readDesignConfig();
  if (cached && !force) return cached;
  const raw = await cardApi.designConfig(false);
  const config = normalizeDesignConfig(raw);
  try {
    uni.setStorageSync(STORAGE_KEY, { ts: Date.now(), config });
  } catch { /* 存储失败不阻塞 */ }
  return config;
}

/** H5 端把系统风格主题注入 CSS 变量（--design-primary 等），页面 var() 兜底；字段语义与菜鸟云 1:1 */
export function applyDesignStyle(config, scope) {
  const style = config?.style;
  if (!style) return;
  const root = scope || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
  root.style.setProperty('--design-primary', style.primaryColor || '#FE0137');
  root.style.setProperty('--design-gradient', style.gradientColor || '#FF5169');
  root.style.setProperty('--design-secondary', style.secondaryColor || '#FFE5EB');
  root.style.setProperty('--design-text', style.textColor || '#FFFFFF');
  root.style.setProperty('--design-subtext', style.subTextColor || '#FE0137');
  root.style.setProperty('--design-headcolor', style.headColor === '2' ? '#FFFFFF' : (style.primaryColor || '#FE0137'));
  root.style.setProperty('--design-headtext', style.headColor === '2' ? '#000000' : (style.headText || '#ffffff'));
}

/** 小程序分享卡片：标题取分享标题（默认页面名），配图取分享图片（空则微信默认截屏） */
export function buildShareCard(theme, pageName, path) {
  const t = theme || {};
  return {
    title: t.shareTitle || pageName || '智能名片',
    imageUrl: t.shareImage || '',
    path: path || '/pages/cardMain/home',
  };
}

/** 分享进入且开启「返回上页」→ 显示返回首页语义（供页面渲染返回按钮/行为） */
export function shouldShowShareBack(options, theme) {
  if (!options || options.from !== 'share') return false;
  return !!(theme && theme.backHome);
}

/** 资源路径解析：H5 拼 window.origin / 小程序拼 API_DOMAIN（与 DesignPage.resolveUrl 同构） */
export function resolveAssetUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  // #ifdef H5
  if (typeof window !== 'undefined') return u.startsWith('/') ? window.location.origin + u : window.location.origin + '/' + u;
  // #endif
  return u.startsWith('/') ? API_DOMAIN + u : API_DOMAIN + '/' + u;
}
