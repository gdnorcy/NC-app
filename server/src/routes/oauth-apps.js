import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../auth.js';
import { addOperationLog } from '../db.js';

/**
 * 第三方应用管理路由（总后台）
 */
export function createOAuthAppsRouter(db) {
  const router = Router();
  router.use(requireAuth);

  // —— 应用列表 ——
  router.get('/apps', (req, res) => {
    const rows = db.prepare('SELECT * FROM oauth_apps ORDER BY id DESC').all();
    res.json({
      apps: rows.map(r => ({
        id: r.id,
        appId: r.app_id,
        appSecret: maskSecret(r.app_secret),
        name: r.name,
        description: r.description,
        icon: r.icon,
        redirectUris: JSON.parse(r.redirect_uris || '[]'),
        ipWhitelist: JSON.parse(r.ip_whitelist || '[]'),
        scopes: JSON.parse(r.scopes || '["read"]'),
        status: r.status,
        rateLimit: r.rate_limit,
        createdAt: r.created_at,
      })),
    });
  });

  // —— 创建应用 ——
  router.post('/apps', (req, res) => {
    const { name, description, icon, redirectUris, ipWhitelist, scopes, rateLimit } = req.body;
    if (!name) return res.status(400).json({ error: '应用名称不能为空' });

    const appId = 'app_' + crypto.randomBytes(16).toString('hex');
    const appSecret = 'sk_' + crypto.randomBytes(32).toString('hex');

    const info = db.prepare(`INSERT INTO oauth_apps (app_id, app_secret, name, description, icon, owner_user_id, redirect_uris, ip_whitelist, scopes, rate_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        appId, appSecret, name, description || '', icon || '',
        req.user.id,
        JSON.stringify(redirectUris || []),
        JSON.stringify(ipWhitelist || []),
        JSON.stringify(scopes || ['read']),
        rateLimit || 100
      );

    const row = db.prepare('SELECT * FROM oauth_apps WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'create_oauth_app', targetType: 'oauth_app', targetId: row.id, detail: `创建应用: ${name}`, ip: req.ip });

    res.status(201).json({
      app: {
        id: row.id, appId: row.app_id, appSecret: row.app_secret,
        name: row.name, description: row.description,
      },
    });
  });

  // —— 更新应用 ——
  router.put('/apps/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM oauth_apps WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '应用不存在' });

    const { name, description, icon, redirectUris, ipWhitelist, scopes, rateLimit, status } = req.body;
    db.prepare(`UPDATE oauth_apps SET name = ?, description = ?, icon = ?, redirect_uris = ?, ip_whitelist = ?, scopes = ?, rate_limit = ?, status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(
        name || row.name,
        description ?? row.description,
        icon ?? row.icon,
        JSON.stringify(redirectUris ?? JSON.parse(row.redirect_uris)),
        JSON.stringify(ipWhitelist ?? JSON.parse(row.ip_whitelist)),
        JSON.stringify(scopes ?? JSON.parse(row.scopes)),
        rateLimit ?? row.rate_limit,
        status || row.status,
        id
      );

    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'update_oauth_app', targetType: 'oauth_app', targetId: id, detail: `更新应用: ${row.name}`, ip: req.ip });
    res.json({ success: true });
  });

  // —— 重置密钥 ——
  router.post('/apps/:id/reset-secret', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM oauth_apps WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '应用不存在' });

    const newSecret = 'sk_' + crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE oauth_apps SET app_secret = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newSecret, id);

    // 撤销该应用所有有效令牌
    db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE app_id = ? AND revoked = 0').run(row.app_id);

    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'reset_oauth_secret', targetType: 'oauth_app', targetId: id, detail: `重置密钥: ${row.name}`, ip: req.ip });
    res.json({ appSecret: newSecret });
  });

  // —— 启用/禁用 ——
  router.post('/apps/:id/toggle', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM oauth_apps WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '应用不存在' });

    const newStatus = row.status === 'active' ? 'disabled' : 'active';
    db.prepare('UPDATE oauth_apps SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, id);

    if (newStatus === 'disabled') {
      db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE app_id = ? AND revoked = 0').run(row.app_id);
    }

    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'toggle_oauth_app', targetType: 'oauth_app', targetId: id, detail: `${newStatus === 'active' ? '启用' : '禁用'}应用: ${row.name}`, ip: req.ip });
    res.json({ status: newStatus });
  });

  // —— API调用日志 ——
  router.get('/api-logs', (req, res) => {
    const { appId, limit = 100, offset = 0 } = req.query;
    let query = 'SELECT * FROM api_logs';
    const params = [];
    if (appId) { query += ' WHERE app_id = ?'; params.push(appId); }
    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) AS n FROM api_logs' + (appId ? ' WHERE app_id = ?' : '')).get(...(appId ? [appId] : [])).n;

    res.json({
      logs: rows.map(r => ({
        id: r.id, appId: r.app_id, userId: r.user_id,
        endpoint: r.endpoint, method: r.method, statusCode: r.status_code,
        ip: r.ip, responseTime: r.response_time, errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
      total,
    });
  });

  // —— 应用统计 ——
  router.get('/stats', (_req, res) => {
    const totalApps = db.prepare('SELECT COUNT(*) AS n FROM oauth_apps').get().n;
    const activeApps = db.prepare('SELECT COUNT(*) AS n FROM oauth_apps WHERE status = ?').get('active').n;
    const totalTokens = db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens WHERE revoked = 0').get().n;
    const totalCalls = db.prepare('SELECT COUNT(*) AS n FROM api_logs').get().n;
    const todayCalls = db.prepare("SELECT COUNT(*) AS n FROM api_logs WHERE date(created_at) = date('now')").get().n;

    res.json({ totalApps, activeApps, totalTokens, totalCalls, todayCalls });
  });

  function maskSecret(secret) {
    if (!secret || secret.length < 8) return '****';
    return secret.slice(0, 6) + '****' + secret.slice(-4);
  }

  return router;
}
