/**
 * 首页展示位（C 端防伪验真结果页下方的推广位区）。
 *
 * 业务形状：租户在后台配一组展示位（最多 8 个），每个位带
 * 封面图 + 颜色 + 展示条件 + 标题 + 链接 + 接口密钥。C 端按
 * 「展示条件」与本次查询态决定是否渲染该位。
 *
 * 🔴 数量上限依据：当前公众号「上传图文消息素材」接口限制一个图文消息支持
 *   1 到 8 条图文，每条自带缩略图 + 标题 + 原文链接 —— 与本展示位逐项对映。
 *   对标站的固定 10 位超出当前 8 条上限（它对应的是较早的接口），不跟。
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

/** 展示位数量上限（公众号当前接口口径） */
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
const HEXCOLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

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
    throw new Error(`展示位最多 ${SLOTMAX} 个（公众号当前接口上限），当前提交 ${list.length} 个`);
  }
  return list.map((raw, index) => {
    const slot = raw && typeof raw === 'object' ? raw : {};
    const when = Number(slot.when);
    if (!WHENVALUES.has(when)) {
      throw new Error(`第 ${index + 1} 个展示位的展示条件非法：${String(slot.when)}（允许 0 关闭 / 1 全部 / 2 首次 / 4 非首位 / 5 首位每次）`);
    }
    const color = text(slot.color, 9);
    if (color && !HEXCOLOR.test(color)) {
      throw new Error(`第 ${index + 1} 个展示位的颜色必须是 #rgb 或 #rrggbb，当前：${color}`);
    }
    const out = {
      when,
      title: text(slot.title, 32),
      cover: text(slot.cover, 500),
      link: text(slot.link, 500),
      color,
    };
    // 🔴 接口密钥不透明透传：路由层已加密，本模块不解密/不校验/不打印。
    //    （预留字段，当前无消费点 —— 见文件头说明）
    if (typeof slot.keyCipher === 'string') out.keyCipher = slot.keyCipher;
    return out;
  });
}

/**
 * 按展示条件挑出本次该渲染的展示位（C 端渲染入口）。
 *
 * 🔴 只做「挑」，不做「排序/去重/补默认」——那些是配置层的事，
 * 混进渲染层会让「后台配的和 C 端出来的不一致」无法定位。
 * @param ctx.isFirstQuery 本次是该码首次查询（num <= 1）
 * @param ctx.isTopQueryer 本次访问人是该码的首位查询人
 */
export function pickDisplaySlots(slots, ctx = {}) {
  const list = Array.isArray(slots) ? slots : [];
  const isFirst = Boolean(ctx.isFirstQuery);
  const isTop = Boolean(ctx.isTopQueryer);
  return list.filter((slot) => {
    switch (Number(slot?.when)) {
      case SLOTWHEN.ALL: return true;
      case SLOTWHEN.FIRST: return isFirst;
      case SLOTWHEN.TOP_EVERY: return isTop;
      case SLOTWHEN.NOT_TOP: return !isTop;
      default: return false; // 含 OFF(0) 与任何非法值
    }
  });
}
