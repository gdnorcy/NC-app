/**
 * 动态时间文案（「我的动态」列表 与 名片详情动态列表 共用一份实现）
 *
 * 🔴 反馈 #312-8：时间显示「9个小时前」但动态其实刚发 1 小时。
 *   根因：服务端 created_at 由 SQLite `datetime('now')` 生成，是 **UTC** 时间串
 *   'YYYY-MM-DD HH:MM:SS'（无时区标记）。原来 `new Date(t.replace(' ','T'))`
 *   会被浏览器按**本地时区**解析 → 东八区凭空多出 8 小时 → 差值恒 +8h。
 *   修法：解析时显式补 'Z'（与 dynamic.vue 的 fillSchedFromUtc 同口径），
 *   显示时再转回本地时区（用户要看的是本地钟点）。
 *
 * 🔴 两端共用的原因：名片详情与我的动态里同一个时间显示不一致，是最容易被
 *   用户当成 bug 的漂移，故只保留一份实现。
 */
const pad = (n) => String(n).padStart(2, '0');

/** 把服务端 UTC 时间串解析成 Date（失败返回 null） */
export function parseUtc(t) {
  if (!t) return null;
  const s = String(t).trim().replace(' ', 'T');
  // 已是 ISO（带 Z 或时区偏移）就别再补，避免二次偏移
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 相对时间 + 绝对时间兜底：
 *   刚刚 / N分钟前 / N小时前 / 昨天 HH:MM / M月D日 / YYYY年M月D日（跨年）
 * 超过两天给绝对日期——「3天前」不如「10月20日」精确，也更显精致。
 */
export function formatDynamicTime(t) {
  const d = parseUtc(t);
  if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 0) return '刚刚'; // 服务端时间略超前于本地时钟（NTP 误差）——别显示「-1分钟前」
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  // 本地钟点（d 已按 UTC 正确解析，getHours 会转本地时区）
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff < 172800) return `昨天 ${hm}`;
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
