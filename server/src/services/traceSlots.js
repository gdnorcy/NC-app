/**
 * 首页展示位（C 端防伪验真结果页下方的推广位区）。
 *
 * 业务形状：租户在后台配一组展示位（最多 8 个），每个位带
 * 封面图 + 展示条件 + 有效时段 + 标题 + 链接 + 鉴权码。
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
 * 🔴 密钥只有一个字段 `authKey`（鉴权码，2026-10-31 收敛 #532 偏差3）：
 *   原先还并存一个 `keyCipher`/`accessKey`（接口密钥），它是预留且无任何消费点的影子字段
 *   （对标系统用它代理外部接口，但我们没有那份调用契约），属「空头权益」已移除。
 *   现在展示位只认 authKey：要在后台明文复制给对接方，链接里只带它的 md5 签名（见 slotAuthSign）。
 */

import crypto from 'node:crypto';

/** 展示位数量上限（我们自定的产品上限，参照素材接口 1~8 条的素材口径；≠ 被动回复上限 1 条） */
export const SLOTMAX = 8;

/**
 * 展示条件（C 端渲染口径）。
 * 0 关闭 / 1 全部 / 2 首次查询 / 3 非首次查询 / 4 非首位查询人 / 5 首位查询人每次。
 *
 * 🔴 2026-10-31 补 `NOT_FIRST(3)`：原先展示位缺「仅非首次查询显示」档，
 *    而活动位（buildTraceActivity）早就有「仅非首次查询」—— 同一个语义两套口径，
 *    租户在两边切来切去必然踩。现在展示位也对齐活动位，补上这一档：
 *    · 2 首次查询  → 该码第 1 次被查时显示（isFirstQuery）；
 *    · 3 非首次查询 → 该码第 2 次起被查时显示（!isFirstQuery）；
 *    注意它和 4/5（按**查询人**是不是首位区分）是两回事：2/3 看「这个码被查了几次」，
 *    4/5 看「当前这个人是不是头一个查的」。活动位的「仅非首次」就是 2/3 这个轴。
 */
export const SLOTWHEN = {
  OFF: 0,
  ALL: 1,
  FIRST: 2,
  NOT_FIRST: 3,
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
 * 🔴 鉴权码（authKey）为什么服务端兜底生成且**固化**：它是给对接方验签用的共享密钥，
 *    要在后台明文可见地复制给别人（所以不能走 keyCipher 那套加密存储 —— 加密了就没人看得见），
 *    但它**绝不直接下发给消费者**：链接里只携带 md5(防伪码 + 本码) 的签名，见 slotAuthSign。
 *    空则生成一串 32 位十六进制随机串，之后每次保存都不再变（幂等），
 *    避免「保存一次换一次码、已印出去的资料全失效」。
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
      throw new Error(`第 ${index + 1} 个展示位的展示条件非法：${String(slot.when)}（允许 0 关闭 / 1 全部 / 2 首次 / 3 非首次 / 4 非首位 / 5 首位每次）`);
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
    // 🔴 鉴权码：明文存储（要在后台复制给对接方）、但**不明文下发**（链接里只带签名）。
    out.authKey = text(slot.authKey, 64) || randomKey();
    // ⚠️ 2026-10-31 收敛（#532 偏差3）：不再接收/透传 `keyCipher`（接口密钥）影子字段。
    //    旧数据残留的 keyCipher 在此被自然丢弃（归一化只输出白名单字段），下次保存即清掉，不主动崩溃。
    return out;
  });
}

/**
 * 展位链接里的 `[KEY]` 取值：**md5(防伪码 + 本展位鉴权码)**，不吐密钥明文。
 *
 * 🔴 为什么必须是签名而不是明文（对标站就是这么做的，2026-10-31 核对源码确认）：
 *    `[KEY]` 的用途是「让外部系统相信这个链接是我们发的、且对应这一个码」。
 *    若直接把 authKey 明文拼进链接，任何人拿到一个已传播的链接就拿到了密钥本体，
 *    可以拿它为**任意防伪码**伪造合法请求 —— 那鉴权码就退化成一个公开的常量，形同虚设。
 *    签名后：外部系统持有 authKey（后台复制给对方），收到链接时自己重算 md5(code+authKey)
 *    比对即可验真；而链接本身不泄漏密钥，也换不出别的码的签名。
 *
 * ⚠️ authKey 本体仍需在后台可复制（要给对接方），所以**只改替换值，不改存储形态**。
 *
 * @returns {string} 32 位小写十六进制 md5
 */
export function slotAuthSign(code, authKey) {
  return crypto.createHash('md5').update(String(code || '') + String(authKey || ''), 'utf8').digest('hex');
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
 * 查询页展示位闸门：在「展示位总开关 slotsEnabled」之上叠加的一层。
 * 🔴 默认 = 关：这是**新加的**默认关闭开关，老租户 settings 里没有该字段，必须按「关」处理。
 *    与 slotsEnabled 的「默认开」相反 —— 那里是为了不破坏老功能，这里是新功能，默认不显示才符合需求。
 * 🔴 优先级：批次级 show_slots_query(-1 继承 / 0 关 / 1 开) 高于全局 showSlotsOnQuery。
 *    只有「总闸开」且「查询页闸门开」时才下发；批次显式设 0 可压制全局开。
 * ⚠️ 公众号推送里的展示位推广卡只由 slotsEnabled 总闸控，不受此函数影响（需求明确分开两条通道）。
 * @param {object} settings 租户设置（读 showSlotsOnQuery）
 * @param {object} [batch] 批次行（读 show_slots_query 列）
 * @returns {boolean} 查询页是否下发展示位
 */
export function showSlotsOnQuery(settings, batch) {
  const bRaw = batch?.show_slots_query;
  if (bRaw !== undefined && bRaw !== null && Number(bRaw) !== -1) {
    return Number(bRaw) === 1;
  }
  const gRaw = settings?.showSlotsOnQuery;
  return Number(gRaw || 0) === 1;
}

/**
 * 展示位占位符替换（标题与链接都走它）。
 *
 * 两套语法都认（大小写不敏感）：
 *   · 花括号：{CODE} → 本次防伪码，{TID} → 租户 id（历史语法，兼容已配置的租户）；
 *   · 方括号：[FWM] → 本次防伪码，[KEY] → 本展位的链接签名（对标站语法，与「全局活动位」同写法）。
 * 🔴 为什么要同时认 [FWM]/[KEY]：活动位早就是这套写法，展示位却是 {CODE}/{TID}，
 *    租户在两边切换时要记两套 → 必然写错。现在展示位也认方括号，老配置不受影响。
 * ⚠️ 两边 `[KEY]` 的**取值不同**，别当成同一个东西：
 *    展示位 = md5(防伪码 + 展位鉴权码) 的签名（密钥不外泄，见 slotAuthSign）；
 *    活动位 = 后台手填的活动标识/渠道参数（如 anniv2026，本来就是明文渠道码，不是密钥）。
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
    // 🔴 不是 `authKey` 本体：链接会被消费者转发出去，吐明文等于把密钥公开。见 slotAuthSign 注释。
    .replace(/\[KEY\]/gi, slotAuthSign(c, authKey));
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
      case SLOTWHEN.NOT_FIRST: return !isFirst;
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
