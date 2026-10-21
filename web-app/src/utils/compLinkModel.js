/**
 * 装修组件链接模型（🔴 2026-10-21 反馈 #321 后的唯一口径）
 *
 * ## 变更：内部页面**恢复为一种类型**（#321 明确推翻 #301 的做法）
 * #301 我把 internal 从类型里删掉，理由是「内部页面= 链接框填 /pages/xxx」。
 * 但用户反馈点是：① 点链接框会**弹出内部链接选择器**（要去掉，手填即可）；
 * ②「类型那里还是增加一个内部链接吧」。即用户要的是**内联手填**，
 * 不是**取消这一类型** —— 两者不冲突：
 *   ① 去掉弹窗选择器（CardLinkPicker 不再被调用）；
 *   ② 类型里显式列出「内部链接」，不再靠「不选」隐式表达；
 *   ③ 链接框改成**可直接输入**（外链类型时不再置灰）。
 *
 * 当前模型：
 *   linkType: 'internal'（内部页面）| 'miniapp' | 'web' | 'phone'
 *   url:        内部页面路径 / 网页地址 / 电话号码（按 linkType 复用同一字段）
 *   miniAppId:  外部小程序 AppID
 *   miniAppPath:外部小程序页面路径（可空 = 首页）
 *   miniAppEnv: 'release'（默认）| 'trial' | 'develop'（**折叠进高级选项**，日常不用改）
 *
 * ⚠️ 向后兼容（存量数据是线上真实数据，归一化错了 = 已配好的链接全跳不动）：
 *   - 没有 linkType → 'internal'（行为不变）；
 *   - linkType=''（#301 期间新建的）→ 同样 'internal'；
 *   - linkType='internal' → 保持 'internal'。
 *   🔴 **归一化必须吸收 '' 与 'internal' 两个写法**：两者语义相同，
 *     若让 '' 继续存在，UI「当前选中哪个类型」会分裂（值为空时四个选项都不亮）。
 *
 * ⚠️ 「空链接」语义：url 为空且非外链类型 → 组件是纯展示按钮，点击不跳任何地方
 *   （execCompLink 返回 false → 调用方不做任何处理，不是报错）。
 *
 * ⚠️ 本文件是**纯函数、无端依赖**，admin 与移动端共用同一套判定（防两端漂移）。
 */

/** 内部链接的类型值（多处复用，避免手写字符串漂移） */
export const LINK_INTERNAL = 'internal';

/** 链接类型选项（UI 展示用；「内部链接」是一等类型，不再靠「不选」隐式表达） */
export const LINK_TYPES = [
  { value: 'internal', label: '内部链接' },
  { value: 'miniapp', label: '外部小程序' },
  { value: 'web', label: '网页链接' },
  { value: 'phone', label: '拨打电话' },
];

/** 跳转版本选项（折叠在「高级选项」里） */
export const LINK_ENVS = [
  { value: 'release', label: '正式版' },
  { value: 'trial', label: '体验版' },
  { value: 'develop', label: '开发版' },
];

/**
 * 归一化 linkType。
 * 🔴 吸收两个「内部页面」写法：''（未设 / #301 期间新建）与 'internal'（原始值）。
 * 未设/未知值一律降级为 internal（不崩、不产生无效跳转）。
 */
export function normalizeLinkType(type) {
  const t = String(type || '').trim();
  if (!t || t === LINK_INTERNAL) return LINK_INTERNAL;
  if (t === 'miniapp' || t === 'web' || t === 'phone') return t;
  return LINK_INTERNAL;
}

/** 是否为「外链类型」（填 AppID / 网页地址 / 电话，而不是内部路径） */
export function isExternalType(type) {
  return normalizeLinkType(type) !== LINK_INTERNAL;
}

/**
 * 归一化整个链接配置（把 props 里的链接字段收敛成标准形状）。
 * @param {object} p 组件 props（或按钮组里的单个按钮对象）
 */
export function normalizeLink(p) {
  const o = p || {};
  return {
    url: String(o.url || '').trim(),
    linkType: normalizeLinkType(o.linkType),
    miniAppId: String(o.miniAppId || '').trim(),
    miniAppPath: String(o.miniAppPath || '').trim(),
    miniAppEnv: LINK_ENVS.some((e) => e.value === o.miniAppEnv) ? o.miniAppEnv : 'release',
  };
}

/**
 * 链接是否有效（能真正跳走）。
 * - 内部页面：必须有 url（且是 /pages 开头或相对路径）
 * - 外部小程序：必须有 AppID
 * - 网页：必须有 http(s) 地址
 * - 电话：必须有号码
 */
export function isValidLink(link) {
  const l = normalizeLink(link);
  if (!isExternalType(l.linkType)) return !!l.url;
  if (l.linkType === 'miniapp') return /^wx[0-9a-f]{16}$/i.test(l.miniAppId);
  if (l.linkType === 'web') return /^https?:\/\//i.test(l.url);
  if (l.linkType === 'phone') return /^[\d\-+\s]{5,20}$/.test(l.url);
  return false;
}

/**
 * 链接缺失时的原因（用于给用户提示，null = 无问题）
 */
export function linkIssue(link) {
  const l = normalizeLink(link);
  if (!isExternalType(l.linkType)) {
    return l.url ? null : '未设置跳转目标';
  }
  if (l.linkType === 'miniapp') {
    if (!l.miniAppId) return '未填写小程序 AppID';
    if (!/^wx[0-9a-f]{16}$/i.test(l.miniAppId)) return 'AppID 格式不正确';
    return null;
  }
  if (l.linkType === 'web') {
    if (!l.url) return '未填写网页地址';
    if (!/^https?:\/\//i.test(l.url)) return '网页地址须以 http:// 或 https:// 开头';
    return null;
  }
  if (l.linkType === 'phone') {
    if (!l.url) return '未填写电话号码';
    if (!/^[\d\-+\s]{5,20}$/.test(l.url)) return '电话号码格式不正确';
    return null;
  }
  return null;
}

/**
 * 链接的可读描述（用于「我的名片」等处的回显）
 */
export function describeLink(link) {
  const l = normalizeLink(link);
  if (l.linkType === 'miniapp') {
    const name = l.miniAppPath || '首页';
    return `小程序 ${l.miniAppId}${l.miniAppPath ? ' · ' + l.miniAppPath : ''}（${name}）`;
  }
  if (l.linkType === 'phone') return `电话 ${l.url}`;
  if (l.linkType === 'web') return l.url;
  return l.url;
}
