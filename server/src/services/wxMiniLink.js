/**
 * 微信小程序 URL Link 生成（H5 跳转小程序通道）
 *
 * 🔴 背景：C 端 H5 页（在微信内打开）要跳转到小程序时，MP 端可用 wx.navigateToMiniProgram，
 *    但 H5 没有该 API。微信官方做法是用服务端 generate_urllink 生成「微信内打开即拉起小程序」的链接，
 *    前端 location.href = urlLink 即可。
 *
 * 🔴 凭证约束（关键，决定了本通道的能力边界）：
 *    generate_urllink 需要**目标小程序**的 access_token。本平台只持有「本平台小程序」的
 *    wx_mini 配置（appId/appSecret），所以只能为「跳回本平台小程序」生成 URL Link
 *    （典型场景：批次购买链接指向本平台商城 /pages/mall/detail）。
 *    第三方小程序我们拿不到它的 secret，无法代生成 → 调用方（C 端）须回落到复制 AppID 等兜底，
 *    不能假装能跳。
 *
 * 🔴 每个 URL Link 首次被某用户打开后，仅该用户可再次打开（微信限制），
 *    故不能跨用户缓存同一链接；按点击实时生成。注意微信每日调用配额。
 */

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // 提前 5 分钟刷新

let tokenCache = { appId: null, token: '', expireAt: 0 };

/** 读取全局 wx_mini 配置（与 multi-auth 同口径：settings 表 key='wx_mini'） */
export function getWxMiniConfig(db) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get('wx_mini');
    return row ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

/** 取本平台小程序的 access_token（带进程内缓存，过期前复用） */
export async function getMiniAccessToken(db) {
  const cfg = getWxMiniConfig(db);
  if (!cfg.appId || !cfg.appSecret) throw new Error('wx_mini 未配置');
  const now = Date.now();
  if (tokenCache.appId === cfg.appId && tokenCache.token && tokenCache.expireAt > now) {
    return tokenCache.token;
  }
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.appId)}&secret=${encodeURIComponent(cfg.appSecret)}`,
  );
  const data = await res.json();
  if (data.errcode) throw new Error(data.errmsg || `access_token 获取失败(${data.errcode})`);
  tokenCache = {
    appId: cfg.appId,
    token: data.access_token,
    expireAt: now + (Number(data.expires_in) || 7200) * 1000 - TOKEN_REFRESH_MARGIN_MS,
  };
  return data.access_token;
}

/**
 * 为本平台小程序生成 URL Link。
 * @param {object} opt { path, query, envVersion }
 * @returns {string} url_link
 */
export async function generateMiniUrlLink(db, { path = '', query = '', envVersion = 'release' } = {}) {
  const cfg = getWxMiniConfig(db);
  if (!cfg.appId) throw new Error('wx_mini 未配置');
  const token = await getMiniAccessToken(db);

  // 🔴 generate_urllink 的 path 不能携带 query，query 是独立字段；兼容后台填了带 ? 的路径。
  const [pagePath, pageQuery] = String(path || '').split('?');
  const body = { env_version: envVersion, expire_type: 0 };
  if (pagePath) body.path = pagePath;
  const finalQuery = pageQuery || query;
  if (finalQuery) body.query = finalQuery;
  // 失效时间：30 天内（最长上限）
  body.expire_time = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

  const res = await fetch(
    `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  if (data.errcode) throw new Error(data.errmsg || `URL Link 生成失败(${data.errcode})`);
  return data.url_link;
}
