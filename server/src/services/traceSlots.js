/**
 * 首页展示位（C 端防伪验真结果页下方的推广位区）。
 *
 * 业务形状：租户在后台配一组展示位（最多 8 个），每个位带
 * 封面图 + 展示条件 + 标题 + 链接 + 接口密钥。C 端按
 * 「展示条件」与本次查询态决定是否渲染该位。
 *
 * 🔴 数量上限（SLOTMAX=8）的真实依据：这是**我们自定的产品上限**（防止把结果页撑成
 *   几十个位的杂货铺），参照的是公众号「上传图文消息素材」一个消息 1~8 条图文的素材口径。
 *   ⚠️ 它**不是**被动回复的上限 —— 微信被动回复 / 客服消息接口的图文消息**只能 1 条**
 *   （微信 2018-10-12 规则调整后）。两者被混为一谈过一次，代价是线上「该公众号提供的
 *   服务出现故障」整整一个下午（2026-10-30 事故：配了 2 个展示位 → 发了 2 条图文 → 被拒收）。
 *   展示位现在只影响 C 端 H5 的广告位区，微信通道最多取第 1 条（见 wx-mp.js）。
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

const WHENVALUES = new Set(Object.values(SLOTWHEN));

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * 归一化展示位配置（后台保存入口）。
 * 🔴 越界与非法值一律抛（不做静默截断）——静默截断会让租户以为配上了、
 * 实际渲染出来是另一个结果，排查成本极高。
 */
export function normalizeDisplaySlots(input) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > SLOTMAX) {
    throw new Error(`展示位最多 ${SLOTMAX} 个（当前上限），当前提交 ${list.length} 个`);
  }
  return list.map((raw, index) => {
    const slot = raw && typeof raw === 'object' ? raw : {};
    const when = Number(slot.when);
    if (!WHENVALUES.has(when)) {
      throw new Error(`第 ${index + 1} 个展示位的展示条件非法：${String(slot.when)}（允许 0 关闭 / 1 全部 / 2 首次 / 4 非首位 / 5 首位每次）`);
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
    };
    // 🔴 接口密钥不透明透传：路由层已加密，本模块不解密/不校验/不打印。
    //    （预留字段，当前无消费点 —— 见文件头说明）
    if (typeof slot.keyCipher === 'string') out.keyCipher = slot.keyCipher;
    return out;
  });
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
 * 展示位占位符替换：{CODE} → 本次防伪码，{TID} → 租户 id。
 * 标题与链接都用它（商户可能把码写进标题，也可能写进链接）。
 *
 * 🔴 为什么必须在**服务端**替换（而不是前端）：
 *    商户在后台写 `.../pages/trace/index?co={CODE}&tid={TID}`，想要的是「每个码扫出来
 *    跳到自己的溯源页」。这个替换以前只在微信图文侧做过，C 端（H5）拿到的链接里
 *    还带着字面量 `{CODE}` → 点进去必然 404/参数为空。
 *    现在两条通道都走服务端替换，前端不再做这件事（前端也不需要知道码值）。
 */
export function substituteSlotPlaceholders(text, { code = '', tenantId = 0 } = {}) {
  return String(text || '')
    .replace(/\{CODE\}/g, String(code || ''))
    .replace(/\{TID\}/g, String(tenantId || 0));
}

/**
 * 按展示条件挑出本次该渲染的展示位（C 端渲染入口）。
 *
 * 🔴 只做「挑」，不做「排序/去重/补默认」——那些是配置层的事，
 * 混进渲染层会让「后台配的和 C 端出来的不一致」无法定位。
 *
 * 🔴 两道闸门都在这里收口，调用方不必各判一次：
 *   ① 单个位 hidden=1 → 永久隐藏（与查询态无关）；
 *   ② when 展示条件 → 按本次查询态挑（0 关闭 / 1 全部 / 2 首次 / 4 非首位 / 5 首位每次）。
 * @param ctx.isFirstQuery 本次是该码首次查询（num <= 1）
 * @param ctx.isTopQueryer 本次访问人是该码的首位查询人
 */
export function pickDisplaySlots(slots, ctx = {}) {
  const list = Array.isArray(slots) ? slots : [];
  const isFirst = Boolean(ctx.isFirstQuery);
  const isTop = Boolean(ctx.isTopQueryer);
  return list.filter((slot) => {
    if (Number(slot?.hidden) === 1) return false; // 该位被后台隐藏
    switch (Number(slot?.when)) {
      case SLOTWHEN.ALL: return true;
      case SLOTWHEN.FIRST: return isFirst;
      case SLOTWHEN.TOP_EVERY: return isTop;
      case SLOTWHEN.NOT_TOP: return !isTop;
      default: return false; // 含 OFF(0) 与任何非法值
    }
  });
}
