import { readSecret } from '../crypto.js';

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
}
