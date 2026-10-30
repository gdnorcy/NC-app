/**
 * 首页展示位（C 端防伪验真结果页下方的推广位区）。
 *
 * 业务形状：租户在后台配一组展示位（最多 8 个），每个位带
 * 封面图 + 展示条件 + 有效时段 + 标题 + 链接 + 鉴权码 + 接口密钥。
 * C 端按「展示条件 + 有效时段」与本次查询态决定是否渲染该位。
 *
 * 🔴 数量上限（SLOTMAX=8）的真实依据：这是**我们自定的产品上限**（防止把结果页撑成
 *   几十个位的杂货铺），参照的是公众号「上传图文消息素材」一个消息 1~8 条图文的素材口径。
 *   ⚠️ 它**不是**被动回复的上限。微信被动回复的图文条数**按触发场景分层**：
 *     事件消息（扫码推事件/关注事件）最多 8 条，文本消息只能 1 条；
 *     客服接口 cgi-bin/message/custom/send 限 1 条，超出返回 45008。
 *   ⚠️「客服接口 1 条」≠「被动回复 1 条」，这两个口径被混为一谈过一次，
 *   代价是扫码场景合法的多卡片能力被砍掉（2026-10-30）。
 *   展示位在微信通道里会跟着验真卡一起发（扫码场景最多一组），见 wx-mp.js。
 *   🔴 另：2026-10-30 查实「该公众号提供的服务出现故障」的真正根因**不是条数也不是图片**，
 *     而是回包 FromUserName 用了 appid 而非公众号原始ID（见 wx-mp.js#_replyName）。
 *
 * 🔴 接口密钥不归本模块管：它是租户自己的凭据，由路由层走
 *   encryptSecret / mergeSecretInput / maskSecretValue 轮子在库与回显，
 *   本模块只把它当不透明字段透传（不解密、不校验、不打印）。
 *
 * 🔴 接口密钥当前是**预留字段**（用户 2026-10-27 拍板保留、明确标注）：
 *   对标系统用它代理外部接口，但我们**还没有那份外部接口的调用契约**，
 *   所以服务端目前没有任何消费点 —— 按项目「空头权益」判据，这是**有意的预留**，
 *   不是漏做。等契约明确后**只在本模块接入**，不要把解密/调用逻辑散到路由或前端。
 *   ⚠️ 在此之前它只做「安全存储 + 脱敏回显」，租户填了也不会有行为变化。
 */

import crypto from 'node:crypto';

/** 展示位数量上限（我们自定的产品上限，参照素材接口 1~8 条的素材口径；≠ 被动回复上限 1 条） */
export const SLOTMAX = 8;

/**
 * 展示条件（C 端渲染口径）。
 * 0 关闭 / 1 全部 / 2 首次查询 / 4 非首位查询人 / 5 首位查询人每次。
 */
export const SLOTWHEN = {
  OFF: 0,
  ALL: 1,
  FIRST: 2,
  NOT_TOP: 4,
  TOP_EVERY: 5,
};

/**
 * 展位**有效时段**模式（对齐对标站的「时间设置」：不限时间 / 一周内 / 二周内 / 一月内 / 日期范围）。
 *
 * 0 不限时间 / 1 一周内 / 2 二周内 / 3 一月内 / 4 日期范围（startAt ~ endAt）。
 *
 * 🔴 1/2/3 的定位是「相对**当前**时间快速选一段时间」（用户 2026-10-30 拍板）：
 *    即选中后立刻把窗口落成一串具体日期（今天 00:00:00 ~ 今天+N 天 23:59:59）存下来，
 *    而不是「每次渲染都从今天往后滚 7 天」的动态窗口 —— 后者会让后台永远看不到
 *    自己配的是哪一段，也没法微调。**判断时统一只看 startAt/endAt**，模式只用于回显。
 *
 * ⚠️ 日期口径 = 中国本地时间（UTC+8），与后台填表人的日历一致；
 *    判断函数内部自行换算，调用方传什么时区的 Date 都一样。
 */
export const SLOTTIME = {
  OFF: 0,
  WEEK1: 1,
  WEEK2: 2,
  MONTH1: 3,
  RANGE: 4,
};

/** 相对模式各自的天数（用于把「一周内」落成具体窗口） */
export const SLOTTIMEDAYS = { 1: 7, 2: 14, 3: 30 };

const WHENVALUES = new Set(Object.values(SLOTWHEN));
const TIMEVALUES = new Set(Object.values(SLOTTIME));

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 把 Date / 字符串统一成 `YYYY-MM-DD HH:mm:ss`（字典序即可比大小，省一层 Date 解析）。
 *
 * 🔴 为什么 +8h 再取 UTC 字段：后台填的是中国本地日期，而服务器环境多半是 UTC ——
 *    直接用 toISOString() 会差 8 小时，表现为「配了从今天开始的位，今天却不显示」。
 */
export function slotStamp(input, endOfDay = false) {
  if (input === undefined || input === null || input === '') return '';
  if (input instanceof Date) {
    const d = new Date(input.getTime() + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} `
      + `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
  const s = String(input).trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) throw new Error(`时间格式非法：${s}（应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm）`);
  if (m[2]) return `${m[1]} ${m[2]}:${m[3] || (endOfDay ? '59' : '00')}`;
  return `${m[1]} ${endOfDay ? '23:59:59' : '00:00:00'}`;
}

/**
 * 相对模式 → 具体窗口（从今天 00:00:00 到 今天+N 天 23:59:59）。
 * 🔴 只在**保存时**调用一次并固化，渲染层不再算 —— 见 SLOTTIME 说明。
 */
export function slotRelativeWindow(timeMode, now = new Date()) {
  const days = SLOTTIMEDAYS[Number(timeMode)];
  if (!days) return { startAt: '', endAt: '' };
  const start = slotStamp(now, false).slice(0, 10);
  const end = slotStamp(new Date(new Date(now).getTime() + days * 86400000), true).slice(0, 10);
  return { startAt: `${start} 00:00:00`, endAt: `${end} 23:59:59` };
}

/**
 * 归一化展示位配置（后台保存入口）。
 * 🔴 越界与非法值一律抛（不做静默截断）——静默截断会让租户以为配上了、
 * 实际渲染出来是另一个结果，排查成本极高。
 *
 * 🔴 鉴权码（authKey）为什么服务端兜底生成：它是要**明文下发给消费者**的
 *    （要拼进跳转链接给外部接口验签），不是凭据，所以走 keyCipher 那套加密存储是错的。
 *    空则生成一串 32 位十六进制随机串并固化，之后每次保存都不再变（幂等），
 *    避免「保存一次换一次码、已印出去的链接全失效」。
 */
export function normalizeDisplaySlots(input, opts = {}) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > SLOTMAX) {
    throw new Error(`展示位最多 ${SLOTMAX} 个（当前上限），当前提交 ${list.length} 个`);
  }
  const now = opts.now instanceof Date ? opts.now : new Date();
  return list.map((raw, index) => {
    const slot = raw && typeof raw === 'object' ? raw : {};
    const when = Number(slot.when);
    if (!WHENVALUES.has(when)) {
      throw new Error(`第 ${index + 1} 个展示位的展示条件非法：${String(slot.when)}（允许 0 关闭 / 1 全部 / 2 首次 / 4 非首位 / 5 首位每次）`);
    }
    const timeMode = slot.timeMode === undefined || slot.timeMode === null || slot.timeMode === ''
      ? SLOTTIME.OFF : Number(slot.timeMode);
    if (!TIMEVALUES.has(timeMode)) {
      throw new Error(`第 ${index + 1} 个展示位的时间设置非法：${String(slot.timeMode)}（允许 0 不限 / 1 一周内 / 2 二周内 / 3 一月内 / 4 日期范围）`);
    }
    const out = {
      when,
      // 🔴 单个位隐藏开关（1=隐藏）。与 when 的语义**不同**：when=0 是「本条件下不展示」
      //    （按查询态挑），hidden 是「这个位整个关掉」（跟查询态无关，配置层就藏起来）。
      //    两者都生效才渲染 → 后台调位时不必删配置，改隐藏即可随时恢复。
      hidden: Number(slot.hidden) === 1 ? 1 : 0,
      title: text(slot.title, 32),
      cover: text(slot.cover, 500),
      link: text(slot.link, 500),
      timeMode,
      startAt: '',
      endAt: '',
    };
    // 有效时段：相对模式在**保存时**落成具体日期；日期范围模式直接用填的。
    // ⚠️ 相对模式若前端已把日期填好（用户选完又手动调过），以填的为准，不覆盖。
    if (timeMode === SLOTTIME.RANGE || timeMode === SLOTTIME.OFF) {
      out.startAt = slotStamp(slot.startAt, false);
      out.endAt = slotStamp(slot.endAt, true);
    } else {
      const win = slotRelativeWindow(timeMode, now);
      out.startAt = slotStamp(slot.startAt, false) || win.startAt;
      out.endAt = slotStamp(slot.endAt, true) || win.endAt;
    }
    if (out.startAt && out.endAt && out.startAt > out.endAt) {
      throw new Error(`第 ${index + 1} 个展示位的开始时间晚于结束时间（${out.startAt} ~ ${out.endAt}）`);
    }
    // 🔴 鉴权码：明文存储、明文下发（要拼进链接给外部接口验签），空则生成并固化。
    out.authKey = text(slot.authKey, 64) || randomKey();
    // 🔴 接口密钥不透明透传：路由层已加密，本模块不解密/不校验/不打印。
    //    （预留字段，当前无消费点 —— 见文件头说明）
    if (typeof slot.keyCipher === 'string') out.keyCipher = slot.keyCipher;
    return out;
  });
}

/** 32 位十六进制随机串（对标站鉴权码同款形状，带「刷新」按钮可重生成） */
function randomKey() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 展示位总开关（settings.slotsEnabled）。
 * 🔴 缺省 = 开：老租户库里根本没有这个字段，若按 Number(undefined)→NaN→false 判，
 *    上线即把所有租户的展示位全关掉（静默功能消失，比报错更难查）。
 * @returns {boolean} 是否下发展示位
 */
export function slotsEnabled(settings) {
  const raw = settings?.slotsEnabled;
  if (raw === undefined || raw === null || raw === '') return true;
  return Number(raw) !== 0;
}

/**
 * 展示位占位符替换（标题与链接都走它）。
 *
 * 两套语法都认（大小写不敏感）：
 *   · 花括号：{CODE} → 本次防伪码，{TID} → 租户 id（历史语法，兼容已配置的租户）；
 *   · 方括号：[FWM] → 本次防伪码，[KEY] → 本展位的鉴权码（对标站语法，与「全局活动位」一致）。
 * 🔴 为什么要同时认 [FWM]/[KEY]：活动位早就是这套写法，展示位却是 {CODE}/{TID}，
 *    租户在两边切换时要记两套 → 必然写错。现在展示位也认方括号，老配置不受影响。
 *
 * 🔴 为什么必须在**服务端**替换（而不是前端）：
 *    商户在后台写 `.../pages/trace/index?co={CODE}&tid={TID}`，想要的是「每个码扫出来
 *    跳到自己的溯源页」。这个替换以前只在微信图文侧做过，C 端（H5）拿到的链接里
 *    还带着字面量 `{CODE}` → 点进去必然 404/参数为空。
 *    现在两条通道都走服务端替换，前端不再做这件事（前端也不需要知道码值）。
 */
export function substituteSlotPlaceholders(text, { code = '', tenantId = 0, authKey = '' } = {}) {
  const c = String(code || '');
  return String(text || '')
    .replace(/\{CODE\}/g, c)
    .replace(/\{TID\}/g, String(tenantId || 0))
    .replace(/\[FWM\]/gi, c)
    .replace(/\[KEY\]/gi, String(authKey || ''));
}

/**
 * 按展示条件挑出本次该渲染的展示位（C 端渲染入口）。
 *
 * 🔴 只做「挑」，不做「排序/去重/补默认」——那些是配置层的事，
 * 混进渲染层会让「后台配的和 C 端出来的不一致」无法定位。
 *
 * 🔴 三道闸门都在这里收口，调用方不必各判一次：
 *   ① 单个位 hidden=1 → 永久隐藏（与查询态无关）；
 *   ② 有效时段（startAt ~ endAt）→ 当前时刻不落在窗口内就不展示（空 = 不限）；
 *   ③ when 展示条件 → 按本次查询态挑（0 关闭 / 1 全部 / 2 首次 / 4 非首位 / 5 首位每次）。
 * @param ctx.isFirstQuery 本次是该码首次查询（num <= 1）
 * @param ctx.isTopQueryer 本次访问人是该码的首位查询人
 * @param ctx.now 当前时刻（默认 new Date()；单测可注入固定时间）
 */
export function pickDisplaySlots(slots, ctx = {}) {
  const list = Array.isArray(slots) ? slots : [];
  const isFirst = Boolean(ctx.isFirstQuery);
  const isTop = Boolean(ctx.isTopQueryer);
  const nowStr = slotStamp(ctx.now instanceof Date ? ctx.now : new Date());
  return list.filter((slot) => {
    if (Number(slot?.hidden) === 1) return false; // 该位被后台隐藏
    if (!inSlotWindow(slot, nowStr)) return false; // 不在有效时段内
    switch (Number(slot?.when)) {
      case SLOTWHEN.ALL: return true;
      case SLOTWHEN.FIRST: return isFirst;
      case SLOTWHEN.TOP_EVERY: return isTop;
      case SLOTWHEN.NOT_TOP: return !isTop;
      default: return false; // 含 OFF(0) 与任何非法值
    }
  });
}

/**
 * 有效时段闸门：startAt/endAt 都为空 = 不限时间。
 * 🔴 只比字符串（格式统一为 YYYY-MM-DD HH:mm:ss，字典序即时间序）——
 *    不用 Date.parse，避免再引入一层时区解释。
 */
export function inSlotWindow(slot, nowStr) {
  const start = String(slot?.startAt || '').trim();
  const end = String(slot?.endAt || '').trim();
  if (start && nowStr < start) return false;
  if (end && nowStr > end) return false;
  return true;
}
