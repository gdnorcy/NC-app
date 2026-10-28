/**
 * 公众号自定义菜单：UI 语义类型 → 微信 menu/create 真实 type 的映射与校验。
 *
 * 🔴 背景（官方口径，勿凭印象改）：
 * - 微信自定义菜单 API 的 type 枚举只有：click / view / scancode_push / scancode_waitmsg /
 *   pic_sysphoto / pic_photo_or_album / pic_weixin / location_select / media_id /
 *   article_id / article_view_limited / miniprogram。
 *   **没有**「跳转小店 / 跳转商品 / 跳转账号主页」这三个 type —— 它们只存在于微信网页版编辑器 UI。
 * - 因此本平台在草稿层用 UI 语义类型（send / view / miniprogram / shop / goods / home）建模，
 *   发布到微信前由本模块统一转换成微信认识的真实 type：
 *     shop / goods → miniprogram（填小店小程序 AppID + 页面路径）
 *     home         → view（公众号主页链接）
 *     send         → click（文字）或 media_id（图片 / 音频 / 视频）
 * - 一级菜单名称 ≤4 个汉字（≤16 字节），二级菜单 ≤8 个汉字（≤60 字节）；超出微信报 40018。
 *   校验阈值只有本文件是事实来源，接口通过 GET /mp/menu 的 limits 字段下发给前端。
 */

/** UI 语义类型 → 中文名（前端展示用；后端只认 key） */
export const MENU_UI_TYPES = {
  send: '发送消息',
  view: '跳转网页',
  miniprogram: '跳转小程序',
  shop: '跳转小店',
  goods: '跳转商品',
  home: '跳转账号主页',
};

/** 发送消息的子类型 → 微信真实 type */
const SEND_CONTENT_TYPE = {
  text: 'click',
  image: 'media_id',
  voice: 'media_id',
  video: 'media_id',
};

/**
 * 菜单名称长度限制。
 * units：半角计 1、全角（含汉字）计 2 —— 一级 8 units = 4 汉字或 8 字母；二级 16 units = 8 汉字或 16 字母。
 * bytes：UTF-8 字节数硬上限（微信 40018 的实际判定）。
 */
export const MENU_NAME_LIMIT = {
  top: { maxUnits: 8, maxBytes: 16 },
  sub: { maxUnits: 16, maxBytes: 60 },
};

/** 微信 menu/create 支持的真实 type（白名单） */
export const WECHAT_MENU_TYPES = [
  'click', 'view', 'scancode_push', 'scancode_waitmsg', 'pic_sysphoto',
  'pic_photo_or_album', 'pic_weixin', 'location_select', 'media_id',
  'article_id', 'article_view_limited', 'miniprogram',
];

const FULLWIDTH_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/** 半角计量：全角字符算 2，其余算 1 */
export function countNameUnits(name) {
  let units = 0;
  for (const ch of String(name == null ? '' : name)) {
    units += FULLWIDTH_RE.test(ch) ? 2 : 1;
  }
  return units;
}

/** UTF-8 字节数（前后端统一用 TextEncoder，避免 Node Buffer / 浏览器差异） */
export function countUtf8Bytes(name) {
  return new TextEncoder().encode(String(name == null ? '' : name)).length;
}

/**
 * 校验菜单名称。
 * @param {string} name
 * @param {'top'|'sub'} kind
 * @returns {{ok:boolean, msg:string}}
 */
export function checkMenuName(name, kind) {
  const limit = MENU_NAME_LIMIT[kind] || MENU_NAME_LIMIT.top;
  const value = String(name == null ? '' : name).trim();
  if (!value) return { ok: false, msg: '名称不能为空' };
  const units = countNameUnits(value);
  if (units > limit.maxUnits) {
    const maxHan = limit.maxUnits / 2;
    const maxLatin = limit.maxUnits;
    return { ok: false, msg: `名称过长：最多 ${maxHan} 个汉字或 ${maxLatin} 个字母` };
  }
  const bytes = countUtf8Bytes(value);
  if (bytes > limit.maxBytes) return { ok: false, msg: `名称过长：UTF-8 最多 ${limit.maxBytes} 字节` };
  return { ok: true, msg: '' };
}

/**
 * 把草稿库里的菜单（UI 语义格式，兼容历史微信格式）规范化成统一的 UI 语义结构。
 * @param {object} saved 草稿 { button: [...] }
 * @returns {Array} UI 语义格式的一级菜单数组
 */
export function normalizeSavedMenu(saved) {
  const list = saved && Array.isArray(saved.button) ? saved.button : [];
  return list.map((b) => {
    const rawSubs = Array.isArray(b.sub) ? b.sub : (Array.isArray(b.sub_button) ? b.sub_button : null);
    if (rawSubs) {
      return {
        name: b.name || '',
        hasSub: true,
        sub: rawSubs.map(normalizeLeaf),
      };
    }
    const leaf = normalizeLeaf(b);
    leaf.hasSub = false;
    return leaf;
  });
}

/** 单个叶子节点 → UI 语义格式 */
export function normalizeLeaf(x) {
  const t = x.type || 'view';
  const out = {
    name: x.name || '',
    type: 'view',
    contentType: 'text',
    key: '',
    mediaId: '',
    url: '',
    appid: '',
    pagepath: '',
    hasSub: false,
    sub: [],
  };
  if (t === 'click') {
    out.type = 'send';
    out.contentType = 'text';
    out.key = x.key || '';
  } else if (t === 'media_id') {
    // 微信回传的 media_id 不带素材类型，按图片落地，用户可在界面上改选音频 / 视频
    out.type = 'send';
    out.contentType = 'image';
    out.mediaId = x.media_id || '';
  } else if (t === 'view') {
    out.type = 'view';
    out.url = x.url || '';
  } else if (t === 'miniprogram') {
    out.type = 'miniprogram';
    out.appid = x.appid || '';
    out.pagepath = x.pagepath || '';
    out.url = x.url || '';
  } else if (MENU_UI_TYPES[t]) {
    // 已经是 UI 语义类型（新版草稿）
    out.type = t;
    out.contentType = x.contentType || 'text';
    out.key = x.key || '';
    out.mediaId = x.mediaId || '';
    out.url = x.url || '';
    out.appid = x.appid || '';
    out.pagepath = x.pagepath || '';
  }
  return out;
}

function wxError(msg) {
  const e = new Error(msg);
  e.wxMenuError = true;
  return e;
}

/** UI 语义叶子 → 微信真实按钮对象 */
function leafToWx(leaf, parentName) {
  const name = String(leaf.name || '').trim();
  const where = parentName ? `菜单「${parentName}」` : '菜单';
  const nameCheck = checkMenuName(name, 'sub');
  if (!nameCheck.ok) throw wxError(`${where}${nameCheck.msg}`);

  const t = leaf.type;
  if (t === 'send') {
    const ct = leaf.contentType || 'text';
    const wxType = SEND_CONTENT_TYPE[ct];
    if (!wxType) throw wxError(`${where}的发送内容类型不受支持`);
    if (wxType === 'click') {
      const key = String(leaf.key || '').trim();
      if (!key) throw wxError(`${where}缺少事件 Key`);
      return { type: 'click', name, key };
    }
    const mediaId = String(leaf.mediaId || '').trim();
    if (!mediaId) throw wxError(`${where}缺少素材 media_id`);
    return { type: 'media_id', name, media_id: mediaId };
  }
  if (t === 'view' || t === 'home') {
    const url = String(leaf.url || '').trim();
    if (!url) throw wxError(t === 'home' ? `${where}缺少公众号主页链接` : `${where}缺少跳转链接`);
    return { type: 'view', name, url };
  }
  if (t === 'miniprogram' || t === 'shop' || t === 'goods') {
    const appid = String(leaf.appid || '').trim();
    const pagepath = String(leaf.pagepath || '').trim();
    if (!appid) throw wxError(`${where}缺少小程序 AppID`);
    if (!pagepath) throw wxError(`${where}缺少小程序页面路径`);
    const btn = { type: 'miniprogram', name, appid, pagepath };
    const url = String(leaf.url || '').trim();
    if (url) btn.url = url;
    return btn;
  }
  throw wxError(`${where}的菜单类型「${t}」无法下发到微信`);
}

/**
 * 草稿（UI 语义格式）→ 微信 menu/create 请求体。
 * @param {object} saved 草稿 { button: [...] }
 * @returns {{button: Array}} 微信格式
 */
export function toWechatMenu(saved) {
  const buttons = normalizeSavedMenu(saved);
  if (!buttons.length) throw wxError('菜单为空，至少需要一个一级菜单');
  if (buttons.length > 3) throw wxError('一级菜单最多 3 个');

  const out = [];
  for (const b of buttons) {
    const name = String(b.name || '').trim();
    const nameCheck = checkMenuName(name, 'top');
    if (!nameCheck.ok) throw wxError(`一级菜单${nameCheck.msg}`);
    if (b.hasSub) {
      const subs = Array.isArray(b.sub) ? b.sub : [];
      if (!subs.length) throw wxError(`菜单「${name}」的子菜单为空`);
      if (subs.length > 5) throw wxError(`菜单「${name}」的子菜单最多 5 个`);
      out.push({ name, sub_button: subs.map((s) => leafToWx(s, name)) });
    } else {
      out.push(leafToWx(b, name));
    }
  }
  return { button: out };
}
