import crypto from 'node:crypto';
import { readSecret } from '../crypto.js';
import { WxCrypto } from './wx-component.js';
import { pickDisplaySlots } from './traceSlots.js';
import { canonicalBatchSegment, cleanTraceCode, DEFAULT_CODESET, parseTraceCode, parseTraceRule, verifyTraceCode } from './traceCode.js';
import { checkQueryQuota, registerTraceQuery } from './traceQuery.js';

// 溯源带参二维码 SCAN 回复所需的局部工具（不污染 wx-mp 通用服务）
function safeJsonLocal(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}
function absUrl(base, url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u; // 已是绝对地址（含 http/https）
  if (!base) return u;
  return `${base.replace(/\/+$/, '')}/${u.replace(/^\/+/, '')}`;
}
function substitute(tpl, code, tenantId) {
  return String(tpl || '')
    .replace(/\{CODE\}/g, code)
    .replace(/\{TID\}/g, String(tenantId));
}

/**
 * 「ticket 换二维码图片」的取图地址 —— 🔴 全项目唯一出处，别处不许再拼这个 URL。
 *
 * 坑（真机验证过，2026-10-30）：这个接口的域名是 **mp.weixin.qq.com**，不是 api.weixin.qq.com。
 * api.weixin.qq.com 是拿 access_token / 调业务 CGI 的网关，它上面**没有 showqrcode 这条路由**，
 * 打过去一律返回 **404**（而 404 又正好是微信表示"ticket 非法"的状态码 → 极易误判成 ticket 过期，
 * 往"是不是 ticket 被截断了 / 是不是服务器出网失败"方向白查半天）。
 * 同一张 ticket 实测：api.* → 404；mp.* → 200 image/jpg 430×430。
 */
export function showQrImageUrl(ticket) {
  return `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(String(ticket || ''))}`;
}

// 公众号 access_token（手动对接模式）内存缓存：微信 cgi-bin/token 每日限 2000 次且有效期 7200s，
// 同进程内按 appid 复用，避免菜单「拉取/发布」连续调用时反复换 token。
// 🔴 仅缓存手动对接模式（开放平台授权 token 由 WxComponentService 自己缓存，不走这里）。
const mpTokenCache = new Map(); // appid -> { token, expireAt }

/**
 * 微信公众号服务（与小程序共用 WxComponentService 的开放平台能力）。
 * 两种接入形态共用同一套菜单接口：
 *  - 开放平台授权（auth_status='authorized'）：access_token 取自 authorizer_access_token；
 *  - 手动对接（auth_status='none' 且 app_secret 非空）：appid + AppSecret 走 cgi-bin/token。
 * 账号类型（service/subscription）决定能否用自定义菜单等接口（订阅号返回 48001）。
 */
export class WxMpService {
  constructor(db, componentService) {
    this.db = db;
    this.component = componentService;
  }

  /** 取租户的公众号渠道行（channel_type='mp'）。 */
  getChannel(customerId) {
    return this.db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp'").get(customerId);
  }

  /** 解析 access_token：开放平台授权走 authorizer token；手动对接走 cgi-bin/token（带内存缓存）。 */
  async resolveToken(channel) {
    if (!channel || !channel.appid) throw new Error('公众号未配置');
    if (channel.auth_status === 'authorized') {
      return this.component.getAuthorizerAccessToken(channel.id);
    }
    if (channel.app_secret) {
      const cached = mpTokenCache.get(channel.appid);
      if (cached && cached.expireAt > Date.now() + 5 * 60 * 1000) return cached.token;
      const secret = readSecret(channel.app_secret);
      const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(channel.appid)}&secret=${encodeURIComponent(secret)}`);
      const data = await res.json();
      if (data.errcode) throw Object.assign(new Error(`获取 access_token 失败(${data.errcode}): ${data.errmsg}`), { wxErrcode: data.errcode });
      mpTokenCache.set(channel.appid, { token: data.access_token, expireAt: Date.now() + (data.expires_in - 300) * 1000 });
      return data.access_token;
    }
    throw new Error('公众号未授权且未配置 AppSecret');
  }

  /**
   * 探测账号类型（手动对接时）：用 menu/get 的返回码判定。
   * - 48001（api 无权限）=> subscription（订阅号）
   * - 其它（含 46003 菜单未创建）=> service（服务号）
   * 凭据错误时 resolveToken 抛错，由调用方拦截提示。
   */
  async detectAccountType(channel) {
    const token = await this.resolveToken(channel);
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/menu/get?access_token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.errcode === 48001) return 'subscription';
    return 'service';
  }

  /** 拉取公众号当前菜单：46003=未创建返回 null；48001=无权限抛错。 */
  async getMenu(channel) {
    const token = await this.resolveToken(channel);
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/menu/get?access_token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.errcode === 46003) return null;
    if (data.errcode === 48001) {
      const err = new Error('当前账号不支持自定义菜单（订阅号或未认证服务号）');
      err.wxErrcode = 48001;
      throw err;
    }
    if (data.errcode) throw new Error(`获取菜单失败(${data.errcode}): ${data.errmsg}`);
    return data;
  }

  /** 发布菜单：body 为 { button: [...] } 结构。订阅号等无权账号微信返回 48001。 */
  async createMenu(channel, menuObj) {
    const token = await this.resolveToken(channel);
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(menuObj),
    });
    const data = await res.json();
    if (data.errcode) {
      const err = new Error(`发布菜单失败(${data.errcode}): ${data.errmsg}`);
      err.wxErrcode = data.errcode;
      throw err;
    }
    return data;
  }

  // ============================================================
  // 公众号消息服务器配置（租户在微信后台填的 Token/AESKey，用于校验/解密回调）
  // ============================================================

  /** 取消息服务器配置（按 channel_apps_id）。 */
  getMessageConfig(channelAppsId) {
    return this.db.prepare('SELECT * FROM mp_message_config WHERE channel_apps_id = ?').get(channelAppsId);
  }

  /** 保存/更新消息服务器配置（幂等：同渠道只有一条）。 */
  saveMessageConfig({ channelAppsId, customerId, msgToken, encodingAESKey, urlEnabled }) {
    const existing = this.getMessageConfig(channelAppsId);
    if (existing) {
      this.db.prepare(`UPDATE mp_message_config SET msg_token = ?, encoding_aes_key = ?, url_enabled = ?, updated_at = datetime('now') WHERE channel_apps_id = ?`)
        .run(msgToken || '', encodingAESKey || '', urlEnabled ? 1 : 0, channelAppsId);
      return existing.id;
    }
    const info = this.db.prepare(`INSERT INTO mp_message_config (channel_apps_id, customer_id, msg_token, encoding_aes_key, url_enabled) VALUES (?, ?, ?, ?, ?)`)
      .run(channelAppsId, customerId, msgToken || '', encodingAESKey || '', urlEnabled ? 1 : 0);
    return Number(info.lastInsertRowid);
  }

  // ============================================================
  // 自动回复 / 关键字规则（本地草稿 + 匹配，不依赖微信接口）
  // ============================================================

  listReplyRules(customerId) {
    return this.db.prepare(`SELECT * FROM mp_reply_rules WHERE customer_id = ? ORDER BY priority ASC, id ASC`).all(customerId);
  }

  getReplyRule(id, customerId) {
    return this.db.prepare('SELECT * FROM mp_reply_rules WHERE id = ? AND customer_id = ?').get(id, customerId);
  }

  createReplyRule({ customerId, channelAppsId, matchType = 'exact', keyword = '', replyType = 'text', content = '', mediaJson = '[]', priority = 0, enabled = 1 }) {
    const info = this.db.prepare(`INSERT INTO mp_reply_rules (channel_apps_id, customer_id, match_type, keyword, reply_type, content, media_json, priority, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(channelAppsId, customerId, matchType, keyword || '', replyType, content || '', mediaJson || '[]', priority ? Number(priority) : 0, enabled ? 1 : 0);
    return Number(info.lastInsertRowid);
  }

  updateReplyRule(id, customerId, patch) {
    const existing = this.getReplyRule(id, customerId);
    if (!existing) return null;
    const matchType = patch.matchType ?? existing.match_type;
    const keyword = patch.keyword ?? existing.keyword;
    const replyType = patch.replyType ?? existing.reply_type;
    const content = patch.content ?? existing.content;
    const mediaJson = patch.mediaJson ?? existing.media_json;
    const priority = patch.priority != null ? Number(patch.priority) : existing.priority;
    const enabled = patch.enabled != null ? (patch.enabled ? 1 : 0) : existing.enabled;
    this.db.prepare(`UPDATE mp_reply_rules SET match_type = ?, keyword = ?, reply_type = ?, content = ?, media_json = ?, priority = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(matchType, keyword, replyType, content, mediaJson, priority, enabled, id);
    return id;
  }

  deleteReplyRule(id, customerId) {
    return this.db.prepare('DELETE FROM mp_reply_rules WHERE id = ? AND customer_id = ?').run(id, customerId);
  }

  /** 文本命中匹配：返回按 priority 升序的命中规则数组（不含 subscribe/default，它们由事件/兜底触发）。 */
  matchReplyRules(channelAppsId, content) {
    const rules = this.db.prepare(`SELECT * FROM mp_reply_rules WHERE channel_apps_id = ? AND enabled = 1`).all(channelAppsId);
    const hits = [];
    const text = (content || '').trim();
    for (const r of rules) {
      if (r.match_type === 'subscribe' || r.match_type === 'default') continue;
      if (r.match_type === 'exact' && text === (r.keyword || '')) hits.push(r);
      else if (r.match_type === 'fuzzy' && r.keyword && (content || '').includes(r.keyword)) hits.push(r);
    }
    hits.sort((a, b) => a.priority - b.priority);
    return hits;
  }

  getSubscribeRule(channelAppsId) {
    return this.db.prepare(`SELECT * FROM mp_reply_rules WHERE channel_apps_id = ? AND match_type = 'subscribe' AND enabled = 1 LIMIT 1`).get(channelAppsId);
  }

  getDefaultRule(channelAppsId) {
    return this.db.prepare(`SELECT * FROM mp_reply_rules WHERE channel_apps_id = ? AND match_type = 'default' AND enabled = 1 LIMIT 1`).get(channelAppsId);
  }

  // ============================================================
  // 微信通用调用助手
  // ============================================================

  async _wxGet(token, apiPath) {
    const res = await fetch(`https://api.weixin.qq.com${apiPath}?access_token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (data.errcode) {
      const err = new Error(`微信接口失败(${data.errcode}): ${data.errmsg}`);
      err.wxErrcode = data.errcode;
      throw err;
    }
    return data;
  }

  async _wxJson(token, apiPath, bodyObj) {
    const res = await fetch(`https://api.weixin.qq.com${apiPath}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    });
    const data = await res.json();
    if (data.errcode) {
      const err = new Error(`微信接口失败(${data.errcode}): ${data.errmsg}`);
      err.wxErrcode = data.errcode;
      throw err;
    }
    return data;
  }

  // ============================================================
  // 素材管理（认证服务号）：图片上传、图文新增、批量镜像落库
  // ============================================================

  /** 上传图片素材（buffer 来自 multer 内存存储），返回 { media_id, url }。 */
  async addMaterialImage(channel, buffer, filename) {
    const token = await this.resolveToken(channel);
    const ext = (filename || 'image.jpg').split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const form = new FormData();
    form.append('media', new Blob([buffer], { type: mime }), filename || 'image.jpg');
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (data.errcode) {
      const err = new Error(`上传图片素材失败(${data.errcode}): ${data.errmsg}`);
      err.wxErrcode = data.errcode;
      throw err;
    }
    return data;
  }

  /** 新增永久图文素材，返回 { media_id }。articles: [{ title, thumb_media_id, author, digest, show_cover_pic, content, content_source_url }]。 */
  async addNews(channel, articles) {
    const token = await this.resolveToken(channel);
    return this._wxJson(token, '/cgi-bin/material/add_news', { articles });
  }

  /**
   * 生成公众号带参二维码（永久字符串码，scene_str 编码防伪码）。
   * 返回 ticket 与可直接展示的二维码图片地址（showUrl），后台可 <img src> 展示或自行换图。
   * 🔴 scene_str 限 64 字节；防伪码约 20 位 ASCII，绰绰有余。固定用 QR_LIMIT_STR_SCENE（永久、无过期）。
   *
   * 🔴 微信侧硬规则：`QR_LIMIT_STR_SCENE`（永久字符串码）**只对「已认证服务号」开放**；
   *    订阅号 / 未认证服务号 / 未开通该接口权限的账号一律返回 **48001（api unauthorized）**。
   *    原实现走 _wxJson 的通用错误（"微信接口失败(48001): api unauthorized"），
   *    商户看不懂 → 这里翻译成人话，并保留 wxErrcode 供上层分支。
   */
  async createParamQr(channel, sceneStr) {
    const token = await this.resolveToken(channel);
    const body = {
      action_name: 'QR_LIMIT_STR_SCENE',
      action_info: { scene: { scene_str: String(sceneStr || '').slice(0, 64) } },
    };
    let data;
    try {
      data = await this._wxJson(token, '/cgi-bin/qrcode/create', body);
    } catch (e) {
      if (Number(e?.wxErrcode) === 48001) {
        const err = new Error('访问公众平台接口失败，api 功能未授权：带参二维码（永久码）只对「已认证服务号」开放，当前公众号没有这个权限（微信错误码 48001）。请改用已认证服务号，或改走「普通二维码 + C 端溯源页」方案。');
        err.wxErrcode = 48001;
        throw err;
      }
      throw e;
    }
    const ticket = data.ticket;
    if (!ticket) throw new Error('生成二维码失败：微信未返回 ticket');
    return {
      ticket,
      url: data.url || '',
      showUrl: showQrImageUrl(ticket),
    };
  }

  /**
   * 生成「动态场景码」—— **临时**场景二维码（数字 scene_id），用于验真引导。
   *
   * 🔴 与 createParamQr（永久字符串码）的关键差别（也是为什么要改造）：
   *    ① 不必为每个防伪码预先出图 → 印刷码仍是普通网址码，**不受永久码配额上限约束，可支撑大批量**；
   *    ② 查询时现场生成、短时效 + 一次有效 → 天然防截图转发/重放；
   *    ③ 临时码对公众号资质要求更低（永久字符串码要求已认证服务号）。
   *
   * 🔴 安全性：这里**不接受**调用方口头声明的身份，openid 由上层（网页授权后）注入；
   *    留空表示当前拿不到 openid，则退化为「仅靠 时效 + 一次有效 兜底」。
   */
  async createTraceSceneQr(channel, code, openid = '', ttlSeconds = 1800) {
    const tenantId = Number(channel?.customer_id || 0);
    if (!tenantId) throw new Error('渠道未绑定租户');
    const trimmed = String(code || '').trim();
    if (!trimmed) throw new Error('防伪码不能为空');
    const rule = this.getTraceRule(tenantId);
    if (!verifyTraceCode(trimmed, rule)) throw new Error('防伪码不合法（校验位未通过）');
    const parsed = parseTraceCode(trimmed, rule);
    if (!this.findTraceBatch(tenantId, parsed.batch, rule)) throw new Error('防伪码不属于本租户批次');
    const ttl = Math.min(Math.max(Number(ttlSeconds) || 1800, 60), 2592000);
    const insert = this.db
      .prepare('INSERT INTO trace_mp_scenes (tenant_id, code, scene_id, openid, ticket, expires_at) VALUES (?, ?, 0, ?, ?, ?)')
      .run(tenantId, trimmed, String(openid || ''), '', this._utcAfterSeconds(ttl));
    const rowId = Number(insert.lastInsertRowid);
    if (!rowId) throw new Error('生成场景码失败：本地记录未写入');
    // scene_id 取「100000 + 自增 id」：正整数且远离小数值，避免与其它自定义场景撞号。
    const sceneId = 100000 + rowId;
    const token = await this.resolveToken(channel);
    const data = await this._wxJson(token, '/cgi-bin/qrcode/create', {
      expire_seconds: ttl,
      action_name: 'QR_SCENE',
      action_info: { scene: { scene_id: sceneId } },
    });
    if (!data.ticket) throw new Error('生成场景码失败：微信未返回 ticket');
    this.db.prepare('UPDATE trace_mp_scenes SET scene_id = ?, ticket = ? WHERE id = ?').run(sceneId, data.ticket, rowId);
    return {
      sceneId,
      code: trimmed,
      ticket: data.ticket,
      showUrl: showQrImageUrl(data.ticket),
      expiresAt: this._utcAfterSeconds(ttl),
      ttl,
    };
  }

  /**
   * 网页授权跳转地址（snsapi_base：静默授权，只拿 openid，不弹授权页）。
   *
   * 🔴 两个接入形态的**授权接口不是同一个**（踩过才知道）：
   *    - 自运营（自己填的 AppSecret）：/connect/oauth2/authorize?appid=...
   *      这里不传 component_appid —— 传了微信反而按第三方模式校验（容易 400/redirect_uri 不匹配）。
   *    - 第三方平台代授权：授权页地址相同，但**换 code 的接口不同**（见 exchangeOauthOpenid）。
   */
  buildOauthUrl({ channel, redirectUri, state, scope = 'snsapi_base' }) {
    const appid = encodeURIComponent(channel?.appid || '');
    const uri = encodeURIComponent(String(redirectUri || ''));
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${uri}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}#wechat_redirect`;
  }

  /**
   * 用授权 code 换 openid。
   *
   * 🔴 第三方平台代授权必须用 `/sns/oauth2/component/access_token`（带 component_appid +
   *    component_access_token）—— 用普通 sns 接口会因为拿不到授权方的 AppSecret 而失败。
   *    自运营形态才有 AppSecret，走普通 `/sns/oauth2/access_token`。
   *
   * 🔴 失败必须说人话：40029（code 无效/已用）与 40163 是这套流程最常见的两个码，
   *    翻译成能排查的中文，别让商户只看到 "errcode 40029"。
   */
  async exchangeOauthOpenid(channel, code) {
    const appid = String(channel?.appid || '').trim();
    const c = String(code || '').trim();
    if (!appid) throw new Error('公众号未配置');
    if (!c) throw new Error('缺少授权 code');

    let url;
    if (channel.auth_status === 'authorized') {
      const cfg = this.component?.getConfig ? this.component.getConfig() : {};
      const componentAppid = String(cfg.component_appid || '').trim();
      if (!componentAppid || !this.component) throw new Error('第三方平台未配置，无法完成网页授权');
      const componentToken = await this.component.getComponentAccessToken();
      url = `https://api.weixin.qq.com/sns/oauth2/component/access_token?appid=${encodeURIComponent(appid)}&code=${encodeURIComponent(c)}&grant_type=authorization_code&component_appid=${encodeURIComponent(componentAppid)}&component_access_token=${encodeURIComponent(componentToken)}`;
    } else {
      const secret = readSecret(channel.app_secret);
      if (!secret) throw new Error('公众号未配置 AppSecret，无法完成网页授权');
      url = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(c)}&grant_type=authorization_code`;
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.errcode) {
      const known = {
        40029: '授权 code 无效（通常是一次性 code 被重复使用，或已过期）',
        40163: 'code 已被使用',
        40125: 'AppSecret 无效',
        41008: '缺少 code',
      };
      const err = new Error(known[data.errcode] || `网页授权失败(${data.errcode}): ${data.errmsg || ''}`);
      err.wxErrcode = data.errcode;
      throw err;
    }
    if (!data.openid) throw new Error('网页授权未返回 openid');
    return String(data.openid);
  }

  /** 生成与库内 datetime('now') 同口径的时间串（UTC，'YYYY-MM-DD HH:MM:SS'），便于直接做字符串比较。 */
  _utcAfterSeconds(seconds) {
    return new Date(Date.now() + (Number(seconds) || 0) * 1000).toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * SCAN 事件里按数字 scene_id 反查动态场景码（**只校验，不落用量**）。
   * @returns { row } 命中可用；{ reject } 明确不可用（含引导语）；{} 不是本表管辖，交回上层走旧路径。
   */
  peekTraceScene(channel, sceneRaw, fromUser) {
    const sceneId = Number(String(sceneRaw || '').trim());
    if (!Number.isInteger(sceneId) || sceneId <= 0) return {};
    const tenantId = Number(channel?.customer_id || 0);
    const row = this.db.prepare('SELECT * FROM trace_mp_scenes WHERE scene_id = ? AND tenant_id = ?').get(sceneId, tenantId);
    if (!row) return {};
    const toUser = channel?.appid || '';
    const reject = (content) => ({ reject: this.buildTextReply({ toUser, fromUser, content }) });
    if (row.used_at) return reject('该二维码已被使用，请重新扫码查询。');
    const nowStr = this._utcAfterSeconds(0);
    if (row.expires_at && row.expires_at <= nowStr) return reject('该二维码已过期，请重新扫码查询。');
    if (row.openid && row.openid !== String(fromUser || '').trim()) {
      return reject('此二维码与当前微信号不匹配，请重新扫码查询。');
    }
    return { row };
  }

  /** 标记动态场景码已用（一次有效）。 */
  markTraceSceneUsed(id) {
    this.db.prepare('UPDATE trace_mp_scenes SET used_at = ? WHERE id = ?').run(this._utcAfterSeconds(0), id);
  }

  /**
   * 带参二维码能力预检（回答「这个公众号能不能出带参二维码」）。
   *
   * 🔴 开放平台授权模式能查认证状态：`get_authorizer_info.authorization_status`
   *    （0=未认证 / 1=已认证 / 2=已过期）+ `service_type_info.id`（0/1=订阅号 / 2/3=服务号）。
   * 🔴 手动对接模式（只填了 app_secret）**微信没有开放查询认证状态的接口** → 返回 supported=null，
   *    只能以实际出码时的返回为准（撞 48001 即无权限）。不猜、不编。
   */
  async checkParamQrCapability(channel) {
    const out = {
      supported: null,
      authStatus: null,
      accountType: '',
      mode: channel?.auth_status === 'authorized' ? 'open' : 'manual',
      reason: '',
    };
    if (!channel?.appid) {
      out.reason = '该租户未配置公众号';
      return out;
    }
    if (channel.auth_status === 'authorized') {
      try {
        const info = await this.component.getAuthorizerInfo(channel.appid);
        const authStatus = Number(info?.authorization_status ?? -1);
        const sid = Number(info?.service_type_info?.id ?? -1);
        out.authStatus = authStatus;
        out.accountType = sid === 2 || sid === 3 ? '服务号' : (sid === 0 || sid === 1 ? '订阅号' : '未知');
        const isService = sid === 2 || sid === 3;
        const isVerified = authStatus === 1;
        out.supported = isService && isVerified;
        if (!isVerified) out.reason = '该公众号未完成微信认证，带参二维码（永久码）只对已认证服务号开放';
        else if (!isService) out.reason = '该公众号是订阅号，带参二维码（永久码）只对已认证服务号开放';
      } catch (e) {
        out.reason = `查询公众号认证状态失败：${e.message || e}`;
      }
    } else {
      out.reason = '手动对接模式无法查询认证状态（微信未开放该接口）；出码时若返回 48001 即表示该公众号无带参二维码权限';
    }
    return out;
  }

  /** 素材总数（按类型）。 */
  async getMaterialCount(channel) {
    const token = await this.resolveToken(channel);
    return this._wxGet(token, '/cgi-bin/material/get_materialcount');
  }

  /** 批量拉取素材并 upsert 到本地镜像表（type: image/voice/video/news）。 */
  async syncMaterials(channel, customerId, type = 'image', limit = 50) {
    const token = await this.resolveToken(channel);
    const countData = await this._wxGet(token, '/cgi-bin/material/get_materialcount');
    const total = countData[`${type}_count`] || 0;
    let offset = 0;
    let fetched = 0;
    let upserted = 0;
    const batch = 20;
    while (offset < total && fetched < limit) {
      const data = await this._wxJson(token, '/cgi-bin/material/batchget_material', { type, offset, count: Math.min(batch, limit - fetched) });
      const items = data.item || [];
      if (items.length === 0) break;
      for (const it of items) {
        let title = '';
        let url = '';
        let newsJson = '[]';
        let wxCreated = it.update_time || it.create_time || 0;
        if (type === 'news') {
          const newsItem = it.content?.news_item || [];
          newsJson = JSON.stringify(newsItem);
          title = newsItem[0]?.title || '';
        } else {
          url = it.url || '';
        }
        this.upsertMaterial(channel.id, customerId, { mediaId: it.media_id, type, title, url, newsJson, wxCreated });
        upserted += 1;
      }
      fetched += items.length;
      offset += items.length;
    }
    return { total, upserted };
  }

  upsertMaterial(channelAppsId, customerId, { mediaId, type, title = '', url = '', newsJson = '[]', wxCreated = 0 }) {
    const existing = this.db.prepare('SELECT id FROM mp_material WHERE channel_apps_id = ? AND media_id = ?').get(channelAppsId, mediaId);
    if (existing) {
      this.db.prepare(`UPDATE mp_material SET title = ?, url = ?, news_json = ?, wx_created_at = ? WHERE id = ?`)
        .run(title, url, newsJson, wxCreated, existing.id);
    } else {
      this.db.prepare(`INSERT INTO mp_material (channel_apps_id, customer_id, media_id, media_type, title, url, news_json, wx_created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(channelAppsId, customerId, mediaId, type, title, url, newsJson, wxCreated);
    }
  }

  // ============================================================
  // 粉丝管理（认证服务号）：全量拉取落库（非实时快照）
  // ============================================================

  async syncFans(channel, customerId) {
    const token = await this.resolveToken(channel);
    let nextOpenid = '';
    let total = 0;
    let fetched = 0;
    let upserted = 0;
    let guard = 0;
    do {
      const listUrl = `/cgi-bin/user/get${nextOpenid ? `?next_openid=${encodeURIComponent(nextOpenid)}` : ''}`;
      const listData = await this._wxGet(token, listUrl);
      total = listData.total || 0;
      const openids = (listData.data && listData.data.openid) || [];
      if (openids.length === 0) break;
      for (let i = 0; i < openids.length; i += 100) {
        const chunk = openids.slice(i, i + 100);
        const infoData = await this._wxJson(token, '/cgi-bin/user/info/batchget', { user_list: chunk.map((o) => ({ openid: o })) });
        const list = infoData.user_info_list || [];
        for (const f of list) {
          this.upsertFan(channel.id, customerId, f);
          upserted += 1;
        }
        fetched += list.length;
      }
      nextOpenid = listData.next_openid || '';
      if (++guard > 1000) break; // 防御：异常时避免死循环
    } while (nextOpenid && fetched < total);
    return { total, upserted };
  }

  upsertFan(channelAppsId, customerId, f) {
    const existing = this.db.prepare('SELECT id FROM mp_fans WHERE channel_apps_id = ? AND openid = ?').get(channelAppsId, f.openid);
    const now = new Date().toISOString();
    const tagidList = Array.isArray(f.tagid_list) ? JSON.stringify(f.tagid_list) : (f.tagid_list || '');
    if (existing) {
      this.db.prepare(`UPDATE mp_fans SET nickname = ?, sex = ?, language = ?, city = ?, province = ?, country = ?, headimgurl = ?, subscribe = ?, subscribe_time = ?, remark = ?, groupid = ?, tagid_list = ?, synced_at = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(f.nickname || '', f.sex || 0, f.language || '', f.city || '', f.province || '', f.country || '', f.headimgurl || '', f.subscribe ? 1 : 0, f.subscribe_time || 0, f.remark || '', f.groupid || 0, tagidList, now, existing.id);
    } else {
      this.db.prepare(`INSERT INTO mp_fans (channel_apps_id, customer_id, openid, nickname, sex, language, city, province, country, headimgurl, subscribe, subscribe_time, remark, groupid, tagid_list, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(channelAppsId, customerId, f.openid, f.nickname || '', f.sex || 0, f.language || '', f.city || '', f.province || '', f.country || '', f.headimgurl || '', f.subscribe ? 1 : 0, f.subscribe_time || 0, f.remark || '', f.groupid || 0, tagidList, now);
    }
  }

  // ============================================================
  // 图文群发 / 预览（认证服务号）：articleMediaId 来自 mp_material（news）
  // ============================================================

  async massSendAll(channel, mediaId, { tagId } = {}) {
    const token = await this.resolveToken(channel);
    const filter = tagId != null ? { is_to_all: false, tag_id: tagId } : { is_to_all: true };
    return this._wxJson(token, '/cgi-bin/message/mass/sendall', { filter, mpnews: { media_id: mediaId }, msgtype: 'mpnews' });
  }

  async massSendOpenids(channel, openids, mediaId) {
    const token = await this.resolveToken(channel);
    return this._wxJson(token, '/cgi-bin/message/mass/send', { touser: openids, mpnews: { media_id: mediaId }, msgtype: 'mpnews' });
  }

  async massPreview(channel, openid, mediaId) {
    const token = await this.resolveToken(channel);
    return this._wxJson(token, '/cgi-bin/message/mass/preview', { touser: openid, mpnews: { media_id: mediaId }, msgtype: 'mpnews' });
  }

  // ============================================================
  // 基础数据统计（认证服务号 + 接口分析权限）
  // ============================================================

  async getUserSummary(channel, begin, end) {
    const token = await this.resolveToken(channel);
    return this._wxJson(token, '/cgi-bin/datacube/getusersummary', { begin_date: begin, end_date: end });
  }

  async getUserCumulate(channel, begin, end) {
    const token = await this.resolveToken(channel);
    return this._wxJson(token, '/cgi-bin/datacube/getusercumulate', { begin_date: begin, end_date: end });
  }

  async getArticleSummary(channel, begin, end) {
    const token = await this.resolveToken(channel);
    return this._wxJson(token, '/cgi-bin/datacube/getarticlesummary', { begin_date: begin, end_date: end });
  }

  // ============================================================
  // 消息接收 / 被动回复（解密 + 规则匹配 + 构造被动回复 XML）
  // ============================================================

  /** 解析微信推送的 XML 消息。 */
  parseMessageXml(xml) {
    const get = (tag) => {
      const cdata = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
      if (cdata) return cdata[1];
      const plain = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return plain ? plain[1] : '';
    };
    return {
      toUser: get('ToUserName'),
      fromUser: get('FromUserName'),
      createTime: get('CreateTime'),
      msgType: get('MsgType'),
      content: get('Content'),
      event: get('Event'),
      eventKey: get('EventKey'),
      msgId: get('MsgId'),
    };
  }

  escapeCdata(s) {
    return String(s == null ? '' : s).replace(/\]\]>/g, ']]]]><![CDATA[>');
  }

  buildTextReply({ toUser, fromUser, content }) {
    const t = Math.floor(Date.now() / 1000);
    return `<xml><ToUserName><![CDATA[${this.escapeCdata(fromUser)}]]></ToUserName><FromUserName><![CDATA[${this.escapeCdata(toUser)}]]></FromUserName><CreateTime>${t}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${this.escapeCdata(content)}]]></Content></xml>`;
  }

  buildNewsReply({ toUser, fromUser, articles }) {
    const items = (articles || []).map((a) => `<item><Title><![CDATA[${this.escapeCdata(a.title)}]]></Title><Description><![CDATA[${this.escapeCdata(a.description || a.digest || '')}]]></Description><PicUrl><![CDATA[${this.escapeCdata(a.picurl || a.thumb_url || '')}]]></PicUrl><Url><![CDATA[${this.escapeCdata(a.url || '')}]]></Url></item>`).join('');
    const t = Math.floor(Date.now() / 1000);
    return `<xml><ToUserName><![CDATA[${this.escapeCdata(fromUser)}]]></ToUserName><FromUserName><![CDATA[${this.escapeCdata(toUser)}]]></FromUserName><CreateTime>${t}</CreateTime><MsgType><![CDATA[news]]></MsgType><ArticleCount>${articles.length}</ArticleCount><Articles>${items}</Articles></xml>`;
  }

  buildMediaReply({ toUser, fromUser, type, mediaId }) {
    const t = Math.floor(Date.now() / 1000);
    const inner = type === 'image' ? `<Image><MediaId><![CDATA[${mediaId}]]></MediaId></Image>`
      : type === 'voice' ? `<Voice><MediaId><![CDATA[${mediaId}]]></MediaId></Voice>`
        : `<Video><MediaId><![CDATA[${mediaId}]]></MediaId><Title><![CDATA[]]></Title><Description><![CDATA[]]></Description></Video>`;
    return `<xml><ToUserName><![CDATA[${this.escapeCdata(fromUser)}]]></ToUserName><FromUserName><![CDATA[${this.escapeCdata(toUser)}]]></FromUserName><CreateTime>${t}</CreateTime><MsgType><![CDATA[${type}]]></MsgType>${inner}</xml>`;
  }

  /**
   * 取租户的防伪码制（与 routes/trace.js 的 getRule 同口径）。
   * 🔴 k 逐格回落默认值，**绝不整表替换**（整表替换会把租户自定义的 k 冲掉 →
   *    已印出去的码全部验真失败）。空 k 会让校验位退化成常量 → 防伪码可伪造。
   */
  getTraceRule(tenantId) {
    const row = this.db.prepare('SELECT rule_json FROM trace_code_rules WHERE tenant_id = ?').get(Number(tenantId));
    const rule = parseTraceRule(row?.rule_json);
    const m = rule.m || {};
    const k = rule.k || {};
    const kk = {};
    for (let i = 1; i <= 5; i += 1) {
      kk[i] = String(k[i] ?? '') || String(DEFAULT_CODESET.k[i] ?? '');
    }
    return {
      m: { 1: String(m[1] ?? 'FW'), 2: Number(m[2] ?? 7), 3: Number(m[3] ?? 6), 4: Number(m[4] ?? 5), 5: Number(m[5] ?? 20) },
      k: kk,
      zdl: Number(rule.zdl ?? 10) || 10,
    };
  }

  /**
   * 按码里切出的批次段反查批次（与 routes/trace.js 的 findBatchBySegment 同口径）：
   * 精确匹配 → 回落 canonicalBatchSegment 比对（兼容库里存原始串的历史批次）。
   */
  findTraceBatch(tenantId, segment, rule) {
    const seg = String(segment || '');
    if (!seg) return null;
    const exact = this.db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND batch = ?').get(Number(tenantId), seg);
    if (exact) return exact;
    const rows = this.db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ?').all(Number(tenantId));
    for (const row of rows) {
      if (canonicalBatchSegment(row.batch, rule) === seg) return row;
    }
    return null;
  }

  /**
   * 溯源带参二维码 SCAN/扫码关注 → 弹图文卡片。
   *
   * 🔴 scene 直接编码防伪码（用户拍板「绑单码」）：EventKey 去掉 qrscene_ 前缀后即是码值。
   *
   * 🔴 判定「是不是溯源码」**不能**靠 trace_codes 里有没有这一行：
   *    那张表只在消费者首次扫码查询时才 INSERT —— 刚印出来、还没人扫过的码
   *    在库里根本没有行 → 原实现直接 return null → 消费者第一次扫这张二维码
   *    什么都看不到（最该弹卡片的时候不弹）。
   *    正确判据 = ① 校验位通过 + ② 能反查到本租户的批次。
   *
   * 🔴 SCAN 不登记查询（登记发生在用户点开 H5 溯源页时），所以弹卡片时按「扫码前」的查询态挑展示位：
   *    isFirstQuery = 该码查询次数 <= 1；isTopQueryer = 当前 openid 是该码首位查询人。
   * 🔴 图文 URL 支持占位符 {CODE}/{TID}：租户在展示位 link 里填
   *    `https://域名/card/#/pages/trace/index?co={CODE}&tid={TID}` 即可让每张码扫出的卡片跳到「自己的」溯源页；
   *    link 留空则回落到 H5 溯源页绝对地址。
   * 🔴 PicUrl 必须是绝对地址（微信要求），封面若是 /uploads/... 相对路径在此补齐 baseUrl。
   */
  resolveTraceScanReply(channel, scene, fromUser, baseUrl = '') {
    const tenantId = Number(channel.customer_id || 0);
    if (!tenantId) return null;
    const code = String(scene || '').trim();
    if (!code) return null;
    const rule = this.getTraceRule(tenantId);
    if (!verifyTraceCode(code, rule)) return null; // 校验位不过 → 不是本租户的防伪码
    const parsed = parseTraceCode(code, rule);
    const batch = this.findTraceBatch(tenantId, parsed.batch, rule);
    if (!batch) return null; // 批次不属于本租户 → 非溯源场景，回落其它回复规则
    const rec = this.db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND code = ?').get(tenantId, code);
    const row = this.db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(tenantId);
    const settings = safeJsonLocal(row?.settings_json, {});
    // 🔴 P2 激活闸门（先印后绑）：批次未激活时不给溯源卡片，只回一句引导语 ——
    //    公众号卡片是消费者看得见的入口，卡片一弹就等于「这批货已到经销商」被提前说破。
    if (Number(settings.isjihuo || 0) === 1) {
      const act = this.db.prepare('SELECT id FROM trace_activations WHERE tenant_id = ? AND batch_id = ?').get(tenantId, Number(batch.id));
      if (!act) {
        return this.buildTextReply({ toUser: channel.appid, fromUser, content: '该批次尚未激活，请联系经销商扫码激活后再查询溯源信息。' });
      }
    }
    const slots = Array.isArray(settings.displaySlots) ? settings.displaySlots : [];
    const isFirstQuery = Number(rec?.num || 0) <= 1;
    const isTopQueryer = Boolean(rec?.openid) && rec.openid === fromUser;
    const h5Fallback = `${String(baseUrl || '').replace(/\/+$/, '')}/card/#/pages/trace/index?co=${encodeURIComponent(code)}&tid=${tenantId}`;
    const picked = slots.length ? pickDisplaySlots(slots, { isFirstQuery, isTopQueryer }) : [];
    // 🔴 展示位没配（或本次全被条件过滤掉）时**不能回 null**：
    //    消费者长按识别了却一句话没有 = 「公众号推送」这个方案当场变成哑开关，
    //    商户还会以为是微信没配好。兜底给一张「验真结果卡」，跳溯源页。
    const articles = picked.length
      ? picked.map((s) => ({
        title: substitute(s.title || '溯源信息', code, tenantId),
        description: '',
        picurl: absUrl(baseUrl, s.cover),
        url: substitute(s.link || h5Fallback, code, tenantId),
      }))
      : [this._traceResultArticle({ code, batch, num: Number(rec?.num || 0) || 1, first: isFirstQuery, queriedAt: rec?.queried_at, baseUrl, tenantId, settings })];
    if (!baseUrl) return this.buildTextReply({ toUser: channel.appid, fromUser, content: articles[0].description });
    return this.buildNewsReply({ toUser: channel.appid, fromUser, articles });
  }

  /**
   * 「验真结果卡」的单篇构造。
   * 🔴 扫码（SCAN）与会话回复两条通道共用它 —— 两边文案若各自写一份，
   *    消费者从两条路看到的结果口径会漂移（一边说通过、一边说已被查询）。
   */
  _traceResultArticle({ code, batch, num, first, queriedAt, baseUrl, tenantId, settings = {} }) {
    const lines = [];
    lines.push(first ? '✅ 防伪码验证通过' : '⚠️ 防伪码有效，但已被多次查询');
    if (batch.product) lines.push(`商品：${batch.product}`);
    if (batch.brand) lines.push(`品牌：${batch.brand}`);
    if (batch.factory) lines.push(`生产企业：${batch.factory}`);
    lines.push(`防伪码：${code}`);
    lines.push(`本码查询次数：第 ${Number(num || 0)} 次`);
    const firstAt = this._fmtBeijing(queriedAt);
    if (firstAt) lines.push(`首次查询时间：${firstAt}`);
    if (!first) lines.push('如非您本人查询，请谨防假冒，并联系商家核实。');
    if (settings.ftel) lines.push(`客服电话：${settings.ftel}`);
    return {
      title: first
        ? `${batch.product || batch.brand || '产品'} · 验真通过`
        : `${batch.product || batch.brand || '产品'} · 已被查询 ${Number(num || 0)} 次`,
      description: lines.join('\n'),
      picurl: absUrl(baseUrl, batch.banner || ''),
      url: `${String(baseUrl || '').replace(/\/+$/, '')}/card/#/pages/trace/index?co=${encodeURIComponent(code)}&tid=${tenantId}`,
    };
  }

  /** 把库里的 UTC 时间串显示成北京时间（datetime('now') 落的是 UTC 裸串，直接印会把 UTC 当本地时间）。 */
  _fmtBeijing(utcStr) {
    const s = String(utcStr || '').trim();
    if (!s) return '';
    const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d);
    } catch { return s; }
  }

  /**
   * 公众号会话里**直接发送防伪码** → 被动回复验真结果。
   *
   * 🔴 这是消费者最朴素的一条查询通路：标签上的码印得很小 / 微信扫码识别不出来 /
   *    已经把码抄在纸上时，手动打一串发过来比什么都快。没有它，我们等于只有
   *    「扫码」一条腿 —— 而竞品的完整形态本来就包含「打字查」。
   *
   * 🔴 三道形状闸门缺一不可（长度 / 纯大写字母数字 / 本租户码前缀）：
   *    少了前缀这一条，用户发一句 20 个字的中文投诉也会被当成「错码」，
   *    攒够上限后连正常咨询都被「错误次数过多」挡掉（错码频控被打成误伤正常对话）。
   *
   * 🔴 必须登记查询（走 registerTraceQuery 的唯一实现）：
   *    不登记的话，消费者看完公众号回复再点开溯源页，会被判成「首次查询」→
   *    「仅首次查询可见」的展示位与首查奖励被同一个人拿两次。
   *    反之亦然：登记口径若与网页通道漂移，`first` 语义就错。
   *
   * @returns {string|null} null = 这条输入不是防伪码，交给关键词/默认回复继续处理。
   */
  resolveTraceTextReply(channel, text, fromUser, baseUrl = '') {
    const tenantId = Number(channel.customer_id || 0);
    if (!tenantId) return null;
    // 🔴 没初始化过防伪码制的租户不该被这条路打扰：它的 getTraceRule 会退回默认值，
    //    默认前缀 + 默认长度可能命中别人格式相近的串。
    const hasRule = this.db.prepare('SELECT id FROM trace_code_rules WHERE tenant_id = ?').get(tenantId);
    if (!hasRule) return null;

    const rule = this.getTraceRule(tenantId);
    const code = cleanTraceCode(text || '');
    const totalLen = Number(rule.m[5] || 20);
    if (!code || code.length !== totalLen) return null;
    if (!/^[0-9A-Z]+$/.test(code)) return null;
    if (!String(rule.m[1] || '') || !code.startsWith(String(rule.m[1]))) return null;

    const row = this.db.prepare('SELECT settings_json FROM trace_settings WHERE tenant_id = ?').get(tenantId);
    const settings = safeJsonLocal(row?.settings_json, {});
    // 🔴 商户可关（默认开）。关掉时整条路退化为「这不是防伪码」→ 原对话逻辑不受任何影响。
    if (Number(settings.wxReply ?? 1) !== 1) return null;

    const say = (content) => this.buildTextReply({ toUser: channel.appid, fromUser, content });
    const ip = ''; // 微信推送报文里没有客户端 IP

    if (!verifyTraceCode(code, rule)) {
      this.db.prepare('INSERT INTO trace_wrong_attempts (tenant_id, openid, ip, code, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
        .run(tenantId, fromUser, ip, code);
      // 🔴 错码频控必须与网页通道同判据（规则里的 zdl 上限），否则公众号对话成了
      //    不限次爆破校验位的通道（校验位空间比序列号小得多，撞库成本很低）。
      //    本通道没有 IP，只能按 openid 计数 —— 不能把空 IP 塞进 `OR ip = ?`，
      //    那会把所有历史空 IP 行一起算上 → 立刻误伤。
      const where = ip ? 'openid = ? OR ip = ?' : 'openid = ?';
      const params = ip ? [tenantId, fromUser, ip] : [tenantId, fromUser];
      const wrong = this.db.prepare(`SELECT COUNT(*) AS c FROM trace_wrong_attempts
        WHERE tenant_id = ? AND (${where}) AND created_at > datetime('now', '-1 day')`).get(...params);
      if (Number(wrong.c) > rule.zdl) return say('错误次数过多，请稍后再试');
      return say('防伪码不存在或已失效，请核对后重新发送');
    }

    const parsed = parseTraceCode(code, rule);
    const batch = this.findTraceBatch(tenantId, parsed.batch, rule);
    if (!batch || Number(batch.is_active) !== 1) return say('防伪码不存在或已失效，请核对后重新发送');

    // P2 激活闸门（先印后绑）：与 SCAN 卡片 / C 端验真同一口径，别让这条旁路提前说破到货情况。
    if (Number(settings.isjihuo || 0) === 1) {
      const act = this.db.prepare('SELECT id FROM trace_activations WHERE tenant_id = ? AND batch_id = ?').get(tenantId, Number(batch.id));
      if (!act) return say('该批次尚未激活，请联系经销商扫码激活后再查询溯源信息。');
    }

    let record = this.db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND code = ?').get(tenantId, code);
    const quotaMsg = checkQueryQuota({ settings, batch, record });
    if (quotaMsg) return say(quotaMsg);

    const reg = registerTraceQuery({
      db: this.db,
      tenantId,
      code,
      batch,
      record,
      openid: fromUser,
      userId: 0,
      ip,
      // entry_type 7 = 公众号会话查询（与网页 6 / 带验证码 9 区分，便于后台统计来源）
      entryType: '7',
      rule,
      serial: parsed.serial,
    });
    record = reg.record;

    // 🔴 与 SCAN 卡片共用同一张结果卡：两条通道文案一致，
    //    否则消费者「扫码查」和「打字查」看到的两套说法会互相打架。
    const article = this._traceResultArticle({
      code,
      batch,
      num: Number(record.num || 0),
      first: reg.first,
      queriedAt: record.queried_at,
      baseUrl,
      tenantId,
      settings,
    });
    // 🔴 没有可用绝对路径时不发图文：微信图文 Url 必须是绝对地址，
    //    相对路径发出去消费者点了打不开，还不如给纯文字（信息都在）。
    if (!baseUrl) return say(article.description);
    return this.buildNewsReply({ toUser: channel.appid, fromUser, articles: [article] });
  }

  /** 按消息匹配回复规则并构造被动回复 XML（toUser/fromUser 已按被动回复语义交换）。 */
  resolveReply(channel, msg, ctx = {}) {
    const fromUser = msg.fromUser; // 粉丝 openid
    const toUser = msg.toUser; // 公众号 appid
    const make = (rule) => {
      if (rule.reply_type === 'text') return this.buildTextReply({ toUser, fromUser, content: rule.content });
      if (rule.reply_type === 'news') {
        let articles = [];
        try { articles = JSON.parse(rule.media_json || '[]'); } catch { /* 解析失败视为空 */ }
        return this.buildNewsReply({ toUser, fromUser, articles });
      }
      if (rule.reply_type === 'transfer') {
        const t = Math.floor(Date.now() / 1000);
        return `<xml><ToUserName><![CDATA[${this.escapeCdata(fromUser)}]]></ToUserName><FromUserName><![CDATA[${this.escapeCdata(toUser)}]]></FromUserName><CreateTime>${t}</CreateTime><MsgType><![CDATA[transfer_customer_service]]></MsgType></xml>`;
      }
      if (['image', 'voice', 'video'].includes(rule.reply_type)) {
        let m = {};
        try { m = JSON.parse(rule.media_json || '{}'); } catch { /* ignore */ }
        if (m && m.media_id) return this.buildMediaReply({ toUser, fromUser, type: rule.reply_type, mediaId: m.media_id });
      }
      return null;
    };
    // 溯源带参二维码：SCAN/扫码关注 → 弹图文卡片（无命中则回落通用规则）
    // ① 动态场景码：纯数字 scene_id → 先按映射表换成防伪码，再走同一套卡片逻辑；
    // ② 旧路径（兼容小批量绑单码）：scene 本身就是防伪码。
    // 两条路并存而非替换，避免已印刷在外的永久码失效。
    const tryTraceScan = (eventKey) => {
      const scene = (eventKey || '').replace(/^qrscene_/, '');
      if (!scene) return null;
      if (/^\d+$/.test(scene)) {
        const hit = this.peekTraceScene(channel, scene, fromUser);
        if (hit.reject) return hit.reject; // 过期/已用/换人 → 明确告知，而不是静默无响应
        if (hit.row) {
          const card = this.resolveTraceScanReply(channel, hit.row.code, fromUser, ctx.baseUrl);
          // 🔴 只在真的要发卡片时才落用量：微信超时会重投 SCAN，提前标记会把合法重试挡掉。
          if (card) this.markTraceSceneUsed(hit.row.id);
          return card || null;
        }
      }
      return this.resolveTraceScanReply(channel, scene, fromUser, ctx.baseUrl);
    };
    if (msg.msgType === 'event') {
      const ev = (msg.event || '').toLowerCase();
      if (ev === 'scan') {
        const r = tryTraceScan(msg.eventKey);
        if (r) return r;
        return null; // SCAN 非溯源场景：不回复（微信允许无应答）
      }
      if (ev === 'subscribe') {
        // 扫码关注：EventKey = qrscene_<scene>；非溯源场景回落通用关注回复
        if ((msg.eventKey || '').startsWith('qrscene_')) {
          const r = tryTraceScan(msg.eventKey);
          if (r) return r;
        }
        const rule = this.getSubscribeRule(channel.id);
        return rule ? make(rule) : null;
      }
      return null;
    }
    if (msg.msgType === 'text') {
      // ① 先看是不是防伪码（发码即查）：形状不符返回 null，不会打扰关键词/默认回复。
      const trace = this.resolveTraceTextReply(channel, msg.content, fromUser, ctx.baseUrl);
      if (trace) return trace;
      const hits = this.matchReplyRules(channel.id, msg.content || '');
      if (hits.length) return make(hits[0]);
      const def = this.getDefaultRule(channel.id);
      if (def) return make(def);
    }
    return null;
  }

  /**
   * GET 验签回显：微信消息服务器配置时的地址校验。成功返回 echostr，失败返回 null。
   * 🔴 失败必须出声：公众号后台只会笼统提示「请求失败，HTTP 返回非 200」，
   *    真正原因（渠道不存在 / 没配 Token / Token 与后台填写的不一致）只能在我们这边的日志里看到。
   */
  verifyEcho({ appid, signature, timestamp, nonce, echostr }) {
    const channel = this.db.prepare("SELECT * FROM channel_apps WHERE appid = ?").get(appid);
    if (!channel) {
      console.warn('[wx-mp] 地址校验失败：不存在该 appid 对应的渠道', { appid });
      return null;
    }
    const cfg = this.getMessageConfig(channel.id);
    const token = cfg?.msg_token || '';
    if (!token) {
      console.warn('[wx-mp] 地址校验失败：渠道未配置 Token', { appid });
      return null;
    }
    const arr = [token, timestamp, nonce].sort();
    const sha = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    if (sha !== signature) {
      console.warn('[wx-mp] 地址校验失败：本系统 Token 与公众号后台填写的不一致', { appid });
      return null;
    }
    return echostr;
  }

  /**
   * 明文模式下的 URL 签名校验：把 token/timestamp/nonce 字典序排序后 sha1，与 signature 比对。
   * 用于挡住"拿到回调 URL 就能伪造粉丝消息"的攻击面。
   * 🔴 只在三个参数都齐时才校验：微信明文模式下这些参数可能为空（官方未承诺必带），
   *    空值直接放行是为了不误杀合法请求，参数一旦带了就必须对得上。
   * @returns true=通过或无法校验（缺参数），false=签名不匹配
   */
  verifyPlainSignature(token, { signature, timestamp, nonce } = {}) {
    if (!token || !signature || !timestamp || !nonce) return true;
    const sha = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
    return sha === signature;
  }

  /**
   * 处理来自微信的 inbound 消息（GET 验签由路由层做，这里处理 POST 正文）。
   * 🔴 加密模式不在这里选——加解密方式是填在微信公众平台后台（基本配置 → 服务器配置）的，
   *    这里按请求体有没有 Encrypt 节点自动识别（明文 / 兼容 / 安全三种都会走到正确分支），
   *    避免"微信后台选A、我们这配成B"的两份真相。
   * 返回 { reply }：reply 为回复 XML 字符串（可能已加密）；无匹配返回 { reply: null }。
   */
  async handleInboundMessage({ appid, query, body, baseUrl = '' }) {
    const channel = this.db.prepare("SELECT * FROM channel_apps WHERE appid = ?").get(appid);
    if (!channel) return { reply: null };
    const cfg = this.getMessageConfig(channel.id);
    if (!cfg || !cfg.url_enabled) return { reply: null };

    let xml = body;
    let encrypted = false;
    const encMatch = (body || '').match(/<Encrypt><!\[CDATA\[([\s\S]+?)\]\]><\/Encrypt>/);
    if (encMatch) {
      encrypted = true;
      // 🔴 公众号后台选了安全/兼容模式、这里却没配 EncodingAESKey：消息会被整条丢弃且毫无征兆
      // （微信侧也不报错，表现为"粉丝发消息公众号没反应"），必须出声。
      if (!cfg.encoding_aes_key) {
        console.error('[wx-mp] 收到加密消息但未配置 EncodingAESKey，已丢弃：请在「消息服务器」补全密钥，或把公众号后台的加解密方式改回明文模式', { appid });
        return { reply: null };
      }
      const encrypt = encMatch[1];
      const wxc = new WxCrypto(cfg.msg_token, cfg.encoding_aes_key, appid);
      if (!wxc.verifySignature(query.msg_signature || query.signature, query.timestamp, query.nonce, encrypt)) {
        return { reply: null };
      }
      try {
        xml = wxc.decrypt(encrypt).message;
      } catch (e) {
        console.error('[wx-mp] 消息解密失败（EncodingAESKey 与公众号后台不一致？）:', e.message, { appid });
        return { reply: null };
      }
    } else if (!this.verifyPlainSignature(cfg.msg_token, query)) {
      // 明文模式：回调 URL 里带 appid，一旦泄漏，任何人都能伪造粉丝消息/关注事件
      console.warn('[wx-mp] 明文消息签名校验失败，已丢弃', { appid });
      return { reply: null };
    }

    const msg = this.parseMessageXml(xml);
    const reply = this.resolveReply(channel, msg, { baseUrl });
    if (!reply) return { reply: null };

    if (encrypted) {
      const wxc = new WxCrypto(cfg.msg_token, cfg.encoding_aes_key, appid);
      const ts = String(Math.floor(Date.now() / 1000));
      const nonce = String(Math.floor(Math.random() * 1e9));
      return { reply: wxc.encrypt(reply, nonce, ts), encrypted: true };
    }
    return { reply, encrypted: false };
  }
}
