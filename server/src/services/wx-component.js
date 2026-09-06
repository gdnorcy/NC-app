import crypto from 'node:crypto';

/**
 * 微信第三方平台服务
 * 处理 component_access_token 管理、租户授权、代码发布等
 */
export class WxComponentService {
  constructor(db) {
    this.db = db;
  }

  // —— 获取第三方平台配置 ——
  getConfig() {
    const row = this.db.prepare('SELECT * FROM channel_component WHERE id = 1').get();
    return row || {};
  }

  // —— 保存第三方平台配置 ——
  saveConfig(data) {
    const cfg = this.getConfig();
    this.db.prepare(`UPDATE channel_component SET
      component_appid = ?, component_appsecret = ?, message_token = ?, encoding_aes_key = ?,
      updated_at = datetime('now') WHERE id = 1`)
      .run(
        data.component_appid ?? cfg.component_appid,
        data.component_appsecret ?? cfg.component_appsecret,
        data.message_token ?? cfg.message_token,
        data.encoding_aes_key ?? cfg.encoding_aes_key
      );
    return this.getConfig();
  }

  // —— 获取 component_access_token（自动刷新） ——
  async getComponentAccessToken() {
    const cfg = this.getConfig();
    if (!cfg.component_appid || !cfg.component_appsecret) {
      throw new Error('第三方平台未配置');
    }

    // 检查缓存是否有效（提前5分钟刷新）
    if (cfg.component_access_token && cfg.token_expires_at) {
      const expireTime = new Date(cfg.token_expires_at).getTime();
      if (expireTime > Date.now() + 5 * 60 * 1000) {
        return cfg.component_access_token;
      }
    }

    // 从微信获取新token
    // 注意：微信第三方平台的 component_access_token 需要 component_verify_ticket
    // 这是微信每10分钟推送到授权事件接收URL的
    // 这里先实现基础版本，实际需要存储 component_verify_ticket
    const ticket = this.getVerifyTicket();
    if (!ticket) {
      throw new Error('未收到微信推送的 component_verify_ticket，请检查授权事件接收URL配置');
    }

    const res = await fetch('https://api.weixin.qq.com/cgi-bin/component/api_component_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        component_appid: cfg.component_appid,
        component_appsecret: cfg.component_appsecret,
        component_verify_ticket: ticket,
      }),
    });
    const data = await res.json();
    if (data.errcode) {
      throw new Error(`获取component_access_token失败: ${data.errmsg}`);
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    this.db.prepare('UPDATE channel_component SET component_access_token = ?, token_expires_at = ? WHERE id = 1')
      .run(data.component_access_token, expiresAt);

    return data.component_access_token;
  }

  // —— component_verify_ticket 存储（微信每10分钟推送） ——
  saveVerifyTicket(ticket) {
    this.db.prepare('UPDATE channel_component SET component_verify_ticket = ? WHERE id = 1').run(ticket);
  }

  getVerifyTicket() {
    const row = this.db.prepare('SELECT component_verify_ticket FROM channel_component WHERE id = 1').get();
    return row?.component_verify_ticket || '';
  }

  // —— 获取预授权码 pre_auth_code ——
  async getPreAuthCode() {
    const token = await this.getComponentAccessToken();
    const cfg = this.getConfig();
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/component/api_create_preauthcode?component_access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ component_appid: cfg.component_appid }),
    });
    const data = await res.json();
    if (data.errcode) throw new Error(`获取预授权码失败: ${data.errmsg}`);
    return data.pre_auth_code;
  }

  // —— 生成授权链接 ——
  async getAuthUrl(redirectUri, authType = 3) {
    const preAuthCode = await this.getPreAuthCode();
    const cfg = this.getConfig();
    // authType: 1=公众号, 2=小程序, 3=公众号+小程序
    return `https://mp.weixin.qq.com/cgi-bin/componentloginpage?component_appid=${cfg.component_appid}&pre_auth_code=${preAuthCode}&redirect_uri=${encodeURIComponent(redirectUri)}&auth_type=${authType}`;
  }

  // —— 用授权码换取 authorizer_access_token ——
  async exchangeAuthCode(authCode) {
    const token = await this.getComponentAccessToken();
    const cfg = this.getConfig();
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/component/api_query_auth?component_access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        component_appid: cfg.component_appid,
        authorization_code: authCode,
      }),
    });
    const data = await res.json();
    if (data.errcode) throw new Error(`换取授权信息失败: ${data.errmsg}`);
    return data.authorization_info;
  }

  // —— 刷新 authorizer_access_token ——
  async refreshAuthorizerToken(appid, refreshToken) {
    const token = await this.getComponentAccessToken();
    const cfg = this.getConfig();
    const res = await fetch(`https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token?component_access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        component_appid: cfg.component_appid,
        component_appsecret: cfg.component_appsecret,
        authorizer_appid: appid,
        authorizer_refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (data.errcode) throw new Error(`刷新authorizer_token失败: ${data.errmsg}`);
    return data;
  }

  // —— 获取租户 authorizer_access_token（自动刷新） ——
  async getAuthorizerAccessToken(channelAppId) {
    const channel = this.db.prepare('SELECT * FROM channel_apps WHERE id = ?').get(channelAppId);
    if (!channel) throw new Error('渠道配置不存在');
    if (channel.auth_status !== 'authorized') throw new Error('渠道未授权');

    // 检查缓存
    if (channel.authorizer_access_token && channel.token_expires_at) {
      const expireTime = new Date(channel.token_expires_at).getTime();
      if (expireTime > Date.now() + 5 * 60 * 1000) {
        return channel.authorizer_access_token;
      }
    }

    // 刷新
    const data = await this.refreshAuthorizerToken(channel.appid, channel.authorizer_refresh_token);
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    this.db.prepare(`UPDATE channel_apps SET authorizer_access_token = ?, authorizer_refresh_token = ?, token_expires_at = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(data.authorizer_access_token, data.authorizer_refresh_token, expiresAt, channelAppId);

    return data.authorizer_access_token;
  }

  // —— 获取模板列表 ——
  async getTemplateList() {
    const token = await this.getComponentAccessToken();
    const res = await fetch(`https://api.weixin.qq.com/wxa/gettemplatelist?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: 0, count: 20 }),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) throw new Error(`获取模板列表失败: ${data.errmsg}`);
    return data.template_list || [];
  }

  // —— 为租户上传代码（从模板创建草稿） ——
  async uploadCode(channelAppId, templateId, userVersion = '1.0.0', userDesc = '全景展示') {
    const token = await this.getAuthorizerAccessToken(channelAppId);
    // 从模板创建草稿
    const res = await fetch(`https://api.weixin.qq.com/wxa/component/template/draft/add?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: Number(templateId) }),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) throw new Error(`创建草稿失败: ${data.errmsg}`);
    // 获取最新草稿的draft_id
    const draftRes = await fetch(`https://api.weixin.qq.com/wxa/gettemplatedraftlist?access_token=${token}`, {
      method: 'POST', body: JSON.stringify({ offset: 0, count: 1 }),
    });
    const draftData = await draftRes.json();
    const draftId = draftData.draft_list?.[0]?.draft_id;
    this.db.prepare('UPDATE channel_apps SET draft_id = ?, template_id = ?, version = ?, audit_status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(draftId || null, templateId, userVersion, 'draft', channelAppId);
    return { success: true, draftId };
  }

  // —— 提交审核 ——
  async submitAudit(channelAppId) {
    const token = await this.getAuthorizerAccessToken(channelAppId);
    // 先获取草稿列表，找到最新的draft_id
    const draftRes = await fetch(`https://api.weixin.qq.com/wxa/gettemplatedraftlist?access_token=${token}`, {
      method: 'POST', body: JSON.stringify({ offset: 0, count: 1 }),
    });
    const draftData = await draftRes.json();
    const draftId = draftData.draft_list?.[0]?.draft_id;
    if (!draftId) throw new Error('没有可用的草稿，请先上传代码');

    const res = await fetch(`https://api.weixin.qq.com/wxa/submit_audit?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_list: [{
          address: 'pages/index/index',
          tag: '全景展示',
          first_class: '工具',
          second_class: '效率',
          title: '360全景展示',
        }],
      }),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) throw new Error(`提交审核失败: ${data.errmsg}`);
    return { auditId: data.auditid, draftId };
  }

  // —— 查询审核状态 ——
  async getAuditStatus(channelAppId, auditId) {
    const token = await this.getAuthorizerAccessToken(channelAppId);
    const res = await fetch(`https://api.weixin.qq.com/wxa/get_auditstatus?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditid: Number(auditId) }),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) throw new Error(`查询审核状态失败: ${data.errmsg}`);
    return { status: data.status, reason: data.reason || '' };
    // status: 0=审核成功, 1=审核中, 2=审核失败, 3=已撤回
  }

  // —— 发布上线 ——
  async release(channelAppId) {
    const token = await this.getAuthorizerAccessToken(channelAppId);
    const res = await fetch(`https://api.weixin.qq.com/wxa/release?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) throw new Error(`发布失败: ${data.errmsg}`);
    return { success: true };
  }

  // —— 版本回退 ——
  async rollback(channelAppId) {
    const token = await this.getAuthorizerAccessToken(channelAppId);
    const res = await fetch(`https://api.weixin.qq.com/wxa/revertcoderelease?access_token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.errcode && data.errcode !== 0) throw new Error(`回退失败: ${data.errmsg}`);
    return { success: true };
  }

  // —— 生成小程序码 ——
  async getWxacode(channelAppId, scene = '', page = 'pages/index/index') {
    const token = await this.getAuthorizerAccessToken(channelAppId);
    const res = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, page, width: 430, auto_color: false, line_color: { r: 0, g: 0, b: 0 } }),
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    // 检查是否返回错误JSON
    try {
      const text = buffer.toString('utf8');
      const json = JSON.parse(text);
      if (json.errcode) throw new Error(`生成小程序码失败: ${json.errmsg}`);
    } catch (e) {
      if (e.message.includes('生成小程序码失败')) throw e;
      // 不是JSON，说明是图片数据
    }
    return buffer;
  }

  // —— 记录发布日志 ——
  logDeploy(channelAppId, action, status, templateId = '', version = '', errorMessage = '', operatorId = null) {
    this.db.prepare(`INSERT INTO channel_deploy_logs (channel_app_id, action, template_id, version, status, error_message, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(channelAppId, action, templateId, version, status, errorMessage, operatorId);
  }
}

/**
 * 微信消息加解密（用于授权事件接收URL的消息解密）
 */
export class WxCrypto {
  constructor(token, encodingAESKey, appid) {
    this.token = token;
    this.key = Buffer.from(encodingAESKey + '=', 'base64');
    this.iv = this.key.slice(0, 16);
    this.appid = appid;
  }

  decrypt(encryptedMsg) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([decipher.update(encryptedMsg, 'base64'), decipher.final()]);
    // 去除PKCS#7填充
    const pad = decrypted[decrypted.length - 1];
    decrypted = decrypted.slice(0, decrypted.length - pad);
    // 前16字节是随机字符串，4字节是消息长度，然后是消息内容，最后是appid
    const content = decrypted.slice(16);
    const msgLen = content.readUInt32BE(0);
    const message = content.slice(4, 4 + msgLen).toString('utf8');
    const fromAppid = content.slice(4 + msgLen).toString('utf8');
    return { message, fromAppid };
  }

  verifySignature(signature, timestamp, nonce, encrypt) {
    const arr = [this.token, timestamp, nonce, encrypt].sort();
    const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    return sha1 === signature;
  }
}
