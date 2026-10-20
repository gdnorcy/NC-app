/**
 * 微信小程序配置统一解析（登录 / 支付 / 代码上传 三处共用同一份来源）
 * ============================================================================
 * 配置归属（对标菜鸟云「参数设置」的形态，但比它安全）：
 *
 *   ① **租户自运营小程序**（租户没走第三方平台授权，自己有小程序）
 *      → channel_apps.mini 行的 appid / app_secret / upload_key
 *      → 租户在客户后台「微信参数设置」里填，落库 AES-256-GCM 密文
 *   ② **平台自有小程序**（全平台共用一个 appid，所有租户用同一个）
 *      → 环境变量 WX_APPID + WX_APPSECRET，**只走服务器文件，不入库**
 *      → 因为它是平台级凭据：入库即等于把「能假冒全平台用户登录」的密钥
 *        交给每一个能读数据库的人（含租户管理员的备份导出）
 *
 * 优先级：租户自运营（①）> 平台 env（②）。
 * 判定不靠"哪个填了"，而靠**当前登录请求来自哪个 appid**（card.js 传 appid），
 * 这样同一套服务能同时服务两种模式，不会串号。
 *
 * ⚠️ 租户自运营的 AppSecret 落库是密文，调用方必须经本模块解密，
 *    直接 SELECT 出来送微信会失败（历史代码就是这么错的）。
 */
import { readSecret } from '../crypto.js';

/** 平台级配置（只来自 env，永不入库） */
function platformEnvConfig(env = process.env) {
  return {
    appId: String(env.WX_APPID || '').trim(),
    appSecret: String(env.WX_APPSECRET || '').trim(),
  };
}

/**
 * 读租户自运营小程序配置。
 * @returns {{appId:string, appSecret:string, uploadKey:string, mode:'standalone'|'none'}}
 */
export function readStandaloneMiniConfig(db, { appId = '', customerId = 0 } = {}) {
  let row = null;
  if (appId) {
    row = db.prepare(
      "SELECT * FROM channel_apps WHERE appid = ? AND channel_type = 'mini'"
    ).get(appId);
  } else if (customerId) {
    row = db.prepare(
      "SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mini'"
    ).get(customerId);
  }
  if (!row) return { appId: '', appSecret: '', uploadKey: '', mode: 'none' };
  const appSecret = readSecret(row.app_secret);
  const uploadKey = readSecret(row.upload_key);
  // 第三方授权态的 appid 由授权回调写入，其 secret 平台侧没有（component 通道不需要）
  return {
    appId: row.appid || '',
    appSecret,
    uploadKey,
    customerId: Number(row.customer_id) || 0,
    authStatus: row.auth_status || 'none',
    mode: appSecret ? 'standalone' : 'none',
  };
}

/**
 * 解析「本次登录该用哪套微信凭据」。
 *
 * @param {object} db
 * @param {object} opts
 * @param {string} [opts.appId]      小程序端上报的自身 appid（uni.getAccountInfoSync）
 * @param {number} [opts.customerId] 已知租户时的兜底定位
 * @param {object} [opts.env]
 * @returns {{appId, appSecret, source:'tenant'|'platform'|'none', customerId, uploadKey}}
 */
export function resolveMiniCredential(db, { appId = '', customerId = 0, env = process.env } = {}) {
  // ① 租户自运营：优先按小程序自身 appid 精确定位
  const standalone = readStandaloneMiniConfig(db, { appId, customerId });
  if (standalone.mode === 'standalone') {
    return {
      appId: standalone.appId,
      appSecret: standalone.appSecret,
      uploadKey: standalone.uploadKey,
      customerId: standalone.customerId,
      source: 'tenant',
    };
  }

  // ② 平台自有：env（仅此一处来源）
  const p = platformEnvConfig(env);
  if (p.appId && p.appSecret) {
    return { appId: p.appId, appSecret: p.appSecret, uploadKey: '', customerId: 0, source: 'platform' };
  }

  return { appId: standalone.appId || p.appId, appSecret: '', uploadKey: standalone.uploadKey, customerId: standalone.customerId, source: 'none' };
}

/**
 * 供 wx-login 使用的凭据解析。
 * 与 resolveMiniCredential 的区别：**不过早判定「缺 secret 就回落 mock」**——
 * 回落与否交给调用方决定并打日志，这里只负责「尽力解析出一个候选」。
 * @returns {{appId, appSecret, source, canReal:boolean}}
 */
export function resolveLoginCredential(db, opts = {}) {
  const c = resolveMiniCredential(db, opts);
  return { ...c, canReal: !!(c.appId && c.appSecret) };
}
