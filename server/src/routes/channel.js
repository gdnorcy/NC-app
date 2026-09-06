import { Router } from 'express';
import { WxComponentService, WxCrypto } from '../services/wx-component.js';
import { requireAuth } from '../auth.js';
import { addOperationLog } from '../db.js';

/**
 * 全端渠道管理路由
 * 支持：第三方平台凭证管理、租户授权、代码发布、渠道初始化、统计
 */
export function createChannelRouter(db) {
  const router = Router();
  const wxService = new WxComponentService(db);

  // ========== 第三方平台凭证管理 ==========

  // 获取第三方平台配置
  router.get('/component', requireAuth, (req, res) => {
    const cfg = wxService.getConfig();
    // 不返回完整的secret和token
    const { component_appsecret, component_access_token, component_verify_ticket, ...safe } = cfg;
    res.json({
      config: {
        ...safe,
        hasAppSecret: !!component_appsecret,
        hasAccessToken: !!component_access_token,
        hasVerifyTicket: !!component_verify_ticket,
        tokenExpiresAt: cfg.token_expires_at,
      },
    });
  });

  // 保存第三方平台配置
  router.put('/component', requireAuth, (req, res) => {
    const cfg = wxService.saveConfig(req.body);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'update_channel_component', targetType: 'system', targetId: 1, detail: '更新第三方平台凭证', ip: req.ip });
    res.json({ success: true });
  });

  // 刷新component_access_token
  router.post('/component/refresh-token', requireAuth, async (req, res) => {
    try {
      const token = await wxService.getComponentAccessToken();
      res.json({ success: true, tokenPreview: token.slice(0, 10) + '...' });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========== 微信回调（授权事件 + 消息转发） ==========

  // 授权事件接收URL（微信推送）
  router.post('/wx-callback', async (req, res) => {
    try {
      const { signature, timestamp, nonce, encrypt_type, msg_signature } = req.query;
      const xmlBody = req.body;

      // 解析XML中的Encrypt字段
      const encryptMatch = xmlBody?.match(/<Encrypt><!\[CDATA\[(.+?)\]\]><\/Encrypt>/);
      if (!encryptMatch) return res.send('success');
      const encrypt = encryptMatch[1];

      const cfg = wxService.getConfig();
      const crypto = new WxCrypto(cfg.message_token, cfg.encoding_aes_key, cfg.component_appid);

      // 验证签名
      if (!crypto.verifySignature(msg_signature || signature, timestamp, nonce, encrypt)) {
        return res.status(403).send('invalid signature');
      }

      // 解密
      const { message } = crypto.decrypt(encrypt);

      // 解析消息类型
      const infoTypeMatch = message.match(/<InfoType><!\[CDATA\[(.+?)\]\]><\/InfoType>/);
      const infoType = infoTypeMatch?.[1];

      if (infoType === 'component_verify_ticket') {
        const ticketMatch = message.match(/<ComponentVerifyTicket><!\[CDATA\[(.+?)\]\]><\/ComponentVerifyTicket>/);
        if (ticketMatch) {
          wxService.saveVerifyTicket(ticketMatch[1]);
        }
      } else if (infoType === 'authorized') {
        // 租户授权成功
        const appidMatch = message.match(/<AuthorizerAppid><!\[CDATA\[(.+?)\]\]><\/AuthorizerAppid>/);
        const authCodeMatch = message.match(/<AuthorizationCode><!\[CDATA\[(.+?)\]\]><\/AuthorizationCode>/);
        if (appidMatch && authCodeMatch) {
          // 记录授权事件，实际token换取在回调页面完成
          console.log(`[Channel] 租户授权: appid=${appidMatch[1]}`);
        }
      } else if (infoType === 'unauthorized') {
        // 租户取消授权
        const appidMatch = message.match(/<AuthorizerAppid><!\[CDATA\[(.+?)\]\]><\/AuthorizerAppid>/);
        if (appidMatch) {
          db.prepare("UPDATE channel_apps SET auth_status = 'revoked', authorizer_access_token = '', authorizer_refresh_token = '' WHERE appid = ?")
            .run(appidMatch[1]);
        }
      }

      res.send('success');
    } catch (e) {
      console.error('[Channel] 微信回调处理失败:', e.message);
      res.send('success'); // 微信要求必须返回success
    }
  });

  // 消息与事件接收URL（租户小程序的用户消息转发）
  router.post('/wx-message/:appid', (req, res) => {
    // 消息转发处理（预留，当前只返回success）
    res.send('success');
  });

  // ========== 租户授权流程 ==========

  // 生成授权链接
  router.get('/auth-url', requireAuth, async (req, res) => {
    try {
      const { redirectUri, customerId, authType = 3 } = req.query;
      if (!redirectUri || !customerId) return res.status(400).json({ error: '缺少参数' });

      // 构造回调地址，带上customerId
      const callbackUrl = `${req.protocol}://${req.get('host')}/api/channel/auth-callback?customer_id=${customerId}`;
      const authUrl = await wxService.getAuthUrl(callbackUrl, Number(authType));
      res.json({ authUrl });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 授权回调（微信跳转回来）
  router.get('/auth-callback', async (req, res) => {
    try {
      const { auth_code, customer_id, expires_in } = req.query;
      if (!auth_code || !customer_id) return res.status(400).send('缺少参数');

      // 用auth_code换取授权信息
      const authInfo = await wxService.exchangeAuthCode(auth_code);
      const { authorizer_appid, authorizer_access_token, authorizer_refresh_token, expires_in: tokenExpires } = authInfo;
      const expiresAt = new Date(Date.now() + tokenExpires * 1000).toISOString();

      // 查找或创建渠道记录
      const existing = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(Number(customer_id), 'mini');
      if (existing) {
        db.prepare(`UPDATE channel_apps SET appid = ?, app_secret = '', auth_status = 'authorized',
          authorizer_access_token = ?, authorizer_refresh_token = ?, token_expires_at = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(authorizer_appid, authorizer_access_token, authorizer_refresh_token, expiresAt, existing.id);
      } else {
        db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, appid, auth_status, authorizer_access_token, authorizer_refresh_token, token_expires_at)
          VALUES (?, 'mini', ?, 'authorized', ?, ?, ?)`)
          .run(Number(customer_id), authorizer_appid, authorizer_access_token, authorizer_refresh_token, expiresAt);
      }

      // 返回成功页面（HTML）
      res.send(`
        <!DOCTYPE html><html><head><meta charset="utf-8"><title>授权成功</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f7fa;}
        .card{background:#fff;padding:40px;border-radius:12px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.08);}
        .icon{font-size:48px;margin-bottom:16px;}h2{color:#165DFF;margin:0 0 8px;}p{color:#909399;margin:0;}</style></head>
        <body><div class="card"><div class="icon">✅</div><h2>授权成功</h2><p>小程序 AppID: ${authorizer_appid}</p><p>可以关闭此页面，返回管理后台查看</p></div></body></html>
      `);
    } catch (e) {
      res.status(400).send(`授权失败: ${e.message}`);
    }
  });

  // ========== 租户渠道管理 ==========

  // 获取租户的所有渠道配置
  router.get('/tenants/:customerId', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? ORDER BY channel_type').all(Number(req.params.customerId));
    res.json({
      channels: rows.map(r => ({
        id: r.id, channelType: r.channel_type, appid: r.appid,
        authStatus: r.auth_status, version: r.version, auditStatus: r.audit_status,
        brandName: r.brand_name, brandLogo: r.brand_logo, primaryColor: r.primary_color,
        customDomain: r.custom_domain, enabled: r.enabled === 1,
        tokenExpiresAt: r.token_expires_at, createdAt: r.created_at,
      })),
    });
  });

  // 更新租户渠道配置（品牌/域名等）
  router.put('/tenants/:customerId/:channelType', requireAuth, (req, res) => {
    const { customerId, channelType } = req.params;
    const { brandName, brandLogo, primaryColor, customDomain, enabled } = req.body;
    const existing = db.prepare('SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = ?').get(Number(customerId), channelType);

    if (existing) {
      db.prepare(`UPDATE channel_apps SET brand_name = ?, brand_logo = ?, primary_color = ?, custom_domain = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(brandName ?? existing.brand_name, brandLogo ?? existing.brand_logo, primaryColor ?? existing.primary_color,
             customDomain ?? existing.custom_domain, enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled, existing.id);
    } else {
      db.prepare(`INSERT INTO channel_apps (customer_id, channel_type, brand_name, brand_logo, primary_color, custom_domain, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(Number(customerId), channelType, brandName || '', brandLogo || '', primaryColor || '#165DFF', customDomain || '', enabled !== false ? 1 : 0);
    }
    res.json({ success: true });
  });

  // 解除授权
  router.delete('/tenants/:customerId/:channelType', requireAuth, (req, res) => {
    db.prepare('DELETE FROM channel_apps WHERE customer_id = ? AND channel_type = ?')
      .run(Number(req.params.customerId), req.params.channelType);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'channel_unbind', targetType: 'customer', targetId: Number(req.params.customerId), detail: `解除渠道: ${req.params.channelType}`, ip: req.ip });
    res.json({ success: true });
  });

  // 刷新租户authorizer_token
  router.post('/tenants/:id/refresh-token', requireAuth, async (req, res) => {
    try {
      await wxService.getAuthorizerAccessToken(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========== 代码发布引擎 ==========

  // 获取模板列表
  router.get('/templates', requireAuth, async (req, res) => {
    try {
      const templates = await wxService.getTemplateList();
      res.json({ templates });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 上传代码（创建草稿）
  router.post('/tenants/:id/upload', requireAuth, async (req, res) => {
    const { templateId, version = '1.0.0', desc = '全景展示' } = req.body;
    if (!templateId) return res.status(400).json({ error: '缺少templateId' });
    try {
      const result = await wxService.uploadCode(Number(req.params.id), templateId, version, desc);
      wxService.logDeploy(Number(req.params.id), 'upload', 'success', templateId, version, '', req.user.id);
      addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'channel_upload', targetType: 'channel_app', targetId: Number(req.params.id), detail: `上传代码 v${version}`, ip: req.ip });
      res.json(result);
    } catch (e) {
      wxService.logDeploy(Number(req.params.id), 'upload', 'failed', templateId, version, e.message, req.user.id);
      res.status(400).json({ error: e.message });
    }
  });

  // 提交审核
  router.post('/tenants/:id/submit-audit', requireAuth, async (req, res) => {
    try {
      const result = await wxService.submitAudit(Number(req.params.id));
      db.prepare("UPDATE channel_apps SET audit_status = 'auditing' WHERE id = ?").run(Number(req.params.id));
      wxService.logDeploy(Number(req.params.id), 'submit_audit', 'success', '', '', '', req.user.id);
      res.json(result);
    } catch (e) {
      wxService.logDeploy(Number(req.params.id), 'submit_audit', 'failed', '', '', e.message, req.user.id);
      res.status(400).json({ error: e.message });
    }
  });

  // 查询审核状态
  router.get('/tenants/:id/audit-status', requireAuth, async (req, res) => {
    try {
      const channel = db.prepare('SELECT * FROM channel_apps WHERE id = ?').get(Number(req.params.id));
      if (!channel?.draft_id) return res.json({ status: 'none' });
      const result = await wxService.getAuditStatus(Number(req.params.id), channel.draft_id);
      const statusMap = { 0: 'approved', 1: 'auditing', 2: 'rejected', 3: 'revoked' };
      const auditStatus = statusMap[result.status] || 'unknown';
      db.prepare('UPDATE channel_apps SET audit_status = ? WHERE id = ?').run(auditStatus, Number(req.params.id));
      res.json({ status: auditStatus, reason: result.reason });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 发布上线
  router.post('/tenants/:id/release', requireAuth, async (req, res) => {
    try {
      await wxService.release(Number(req.params.id));
      db.prepare("UPDATE channel_apps SET audit_status = 'released' WHERE id = ?").run(Number(req.params.id));
      wxService.logDeploy(Number(req.params.id), 'release', 'success', '', '', '', req.user.id);
      addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'channel_release', targetType: 'channel_app', targetId: Number(req.params.id), detail: '发布上线', ip: req.ip });
      res.json({ success: true });
    } catch (e) {
      wxService.logDeploy(Number(req.params.id), 'release', 'failed', '', '', e.message, req.user.id);
      res.status(400).json({ error: e.message });
    }
  });

  // 版本回退
  router.post('/tenants/:id/rollback', requireAuth, async (req, res) => {
    try {
      await wxService.rollback(Number(req.params.id));
      wxService.logDeploy(Number(req.params.id), 'rollback', 'success', '', '', '', req.user.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // 发布日志
  router.get('/tenants/:id/deploy-logs', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM channel_deploy_logs WHERE channel_app_id = ? ORDER BY id DESC LIMIT 50').all(Number(req.params.id));
    res.json({ logs: rows });
  });

  // ========== 渠道初始化（小程序端调用） ==========

  router.get('/init', (req, res) => {
    const { appid } = req.query;
    if (!appid) return res.status(400).json({ error: '缺少appid' });

    const channel = db.prepare('SELECT * FROM channel_apps WHERE appid = ? AND channel_type = ?').get(appid, 'mini');
    if (!channel) return res.status(404).json({ error: '渠道未配置' });
    if (channel.auth_status !== 'authorized') return res.status(403).json({ error: '渠道未授权' });

    const customer = db.prepare('SELECT id, name, logo FROM projects WHERE id = ?').get(channel.customer_id);
    res.json({
      customerId: channel.customer_id,
      customerName: customer?.name || '',
      customerLogo: customer?.logo || '',
      brandName: channel.brand_name || customer?.name || '',
      brandLogo: channel.brand_logo || customer?.logo || '',
      primaryColor: channel.primary_color || '#165DFF',
      apiBase: `${req.protocol}://${req.get('host')}`,
    });
  });

  // 生成小程序码
  router.get('/tenants/:id/wxacode', requireAuth, async (req, res) => {
    try {
      const { scene = '', page = 'pages/index/index' } = req.query;
      const buffer = await wxService.getWxacode(Number(req.params.id), scene, page);
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(buffer);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ========== 渠道统计 ==========

  router.get('/stats', requireAuth, (req, res) => {
    const totalChannels = db.prepare('SELECT COUNT(*) AS n FROM channel_apps').get().n;
    const authorized = db.prepare("SELECT COUNT(*) AS n FROM channel_apps WHERE auth_status = 'authorized'").get().n;
    const byType = db.prepare('SELECT channel_type, COUNT(*) AS n FROM channel_apps GROUP BY channel_type').all();
    const released = db.prepare("SELECT COUNT(*) AS n FROM channel_apps WHERE audit_status = 'released'").get().n;

    res.json({
      totalChannels,
      authorized,
      released,
      byType: byType.map(r => ({ channelType: r.channel_type, count: r.n })),
    });
  });

  return router;
}
