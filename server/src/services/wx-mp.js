import crypto from 'node:crypto';
import { readSecret } from '../crypto.js';
import { WxCrypto } from './wx-component.js';

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

  /** 按消息匹配回复规则并构造被动回复 XML（toUser/fromUser 已按被动回复语义交换）。 */
  resolveReply(channel, msg) {
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
    if (msg.msgType === 'event' && (msg.event || '').toLowerCase() === 'subscribe') {
      const rule = this.getSubscribeRule(channel.id);
      return rule ? make(rule) : null;
    }
    if (msg.msgType === 'text') {
      const hits = this.matchReplyRules(channel.id, msg.content || '');
      if (hits.length) return make(hits[0]);
      const def = this.getDefaultRule(channel.id);
      if (def) return make(def);
    }
    return null;
  }

  /** GET 验签回显：微信消息服务器配置时的地址校验。成功返回 echostr，失败返回 null。 */
  verifyEcho({ appid, signature, timestamp, nonce, echostr }) {
    const channel = this.db.prepare("SELECT * FROM channel_apps WHERE appid = ?").get(appid);
    if (!channel) return null;
    const cfg = this.getMessageConfig(channel.id);
    const token = cfg?.msg_token || '';
    if (!token) return null;
    const arr = [token, timestamp, nonce].sort();
    const sha = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    if (sha !== signature) return null;
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
  async handleInboundMessage({ appid, query, body }) {
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
    const reply = this.resolveReply(channel, msg);
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
