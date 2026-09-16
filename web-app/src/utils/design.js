// 设计中心 C 端渲染工具：读取租户发布配置（风格/底部导航/首页跳转），带本地缓存与兜底
import { cardApi } from './cardApi.js';

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
    style: { primaryColor: style.primaryColor || '#165DFF', radius: style.radius ?? 8 },
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
  const scheme = raw?.scheme ?? gd.scheme ?? 1;
  if (scheme === 2) {
    // 方案二（ew）：页面 ew 字段覆盖全局默认（全局默认 + 单页覆盖）
    const gEw = gd.ew || {};
    const pEw = raw?.ew || {};
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
  return {
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

/** H5 端把主题色注入 CSS 变量（--design-primary 等），页面 var() 兜底 */
export function applyDesignStyle(config, scope) {
  const style = config?.style;
  if (!style) return;
  const root = scope || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
  root.style.setProperty('--design-primary', style.primaryColor || '#165DFF');
  root.style.setProperty('--design-radius', `${style.radius ?? 8}px`);
}
