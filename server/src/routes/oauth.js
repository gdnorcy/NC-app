import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../auth.js';
import { addOperationLog } from '../db.js';

/**
 * OAuth2.0 授权路由
 * 支持授权码模式（authorization_code）和刷新令牌（refresh_token）
 */
export function createOAuthRouter(db) {
  const router = Router();

  // —— 授权页面（GET）——
  router.get('/authorize', requireAuth, (req, res) => {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    if (!client_id || !redirect_uri || response_type !== 'code') {
      return res.status(400).json({ error: 'invalid_request', error_description: '缺少必要参数' });
    }

    const app = db.prepare('SELECT * FROM oauth_apps WHERE app_id = ? AND status = ?').get(client_id, 'active');
    if (!app) return res.status(400).json({ error: 'invalid_client', error_description: '应用不存在或已禁用' });

    // 校验回调地址
    const allowedUris = JSON.parse(app.redirect_uris || '[]');
    const uriValid = allowedUris.length === 0 || allowedUris.some(u => redirect_uri.startsWith(u));
    if (!uriValid) return res.status(400).json({ error: 'invalid_redirect_uri', error_description: '回调地址不在白名单中' });

    // 返回授权页面信息（前端渲染授权页）
    res.json({
      app: { id: app.id, name: app.name, icon: app.icon, description: app.description },
      client_id,
      redirect_uri,
      scope: scope || 'read',
      state: state || '',
      user: { id: req.user.id, username: req.user.username },
    });
  });

  // —— 提交授权（POST）——
  router.post('/authorize', requireAuth, (req, res) => {
    const { client_id, redirect_uri, scope, state, allow } = req.body;

    if (!client_id || !redirect_uri) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const app = db.prepare('SELECT * FROM oauth_apps WHERE app_id = ? AND status = ?').get(client_id, 'active');
    if (!app) return res.status(400).json({ error: 'invalid_client' });

    if (!allow) {
      // 用户拒绝授权
      const sep = redirect_uri.includes('?') ? '&' : '?';
      return res.redirect(`${redirect_uri}${sep}error=access_denied&state=${encodeURIComponent(state || '')}`);
    }

    // 生成授权码（10分钟有效）
    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`INSERT INTO oauth_codes (code, app_id, user_id, scopes, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(code, client_id, req.user.id, JSON.stringify(scope ? scope.split(' ') : ['read']), redirect_uri, expiresAt);

    addOperationLog(db, { userId: req.user.id, username: req.user.username, action: 'oauth_authorize', targetType: 'oauth_app', targetId: app.id, detail: `授权应用: ${app.name}`, ip: req.ip });

    // 重定向回第三方应用
    const sep = redirect_uri.includes('?') ? '&' : '?';
    const redirectUrl = `${redirect_uri}${sep}code=${code}&state=${encodeURIComponent(state || '')}`;
    res.json({ redirect_url: redirectUrl, code });
  });

  // —— 用授权码换取 Token ——
  router.post('/token', (req, res) => {
    const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token } = req.body;

    if (grant_type === 'authorization_code') {
      if (!code || !client_id || !client_secret) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      const app = db.prepare('SELECT * FROM oauth_apps WHERE app_id = ?').get(client_id);
      if (!app || app.app_secret !== client_secret) {
        return res.status(401).json({ error: 'invalid_client' });
      }

      const authCode = db.prepare('SELECT * FROM oauth_codes WHERE code = ?').get(code);
      if (!authCode || authCode.used || new Date(authCode.expires_at) < new Date()) {
        return res.status(400).json({ error: 'invalid_grant', error_description: '授权码无效或已过期' });
      }
      if (authCode.app_id !== client_id) {
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // 标记授权码已使用
      db.prepare('UPDATE oauth_codes SET used = 1 WHERE id = ?').run(authCode.id);

      // 生成令牌
      const accessToken = crypto.randomBytes(32).toString('hex');
      const refreshToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`INSERT INTO oauth_tokens (access_token, refresh_token, app_id, user_id, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(accessToken, refreshToken, client_id, authCode.user_id, authCode.scopes, expiresAt);

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 7 * 24 * 60 * 60,
        refresh_token: refreshToken,
        scope: JSON.parse(authCode.scopes || '["read"]').join(' '),
      });
    }

    if (grant_type === 'refresh_token') {
      if (!refresh_token || !client_id || !client_secret) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      const app = db.prepare('SELECT * FROM oauth_apps WHERE app_id = ?').get(client_id);
      if (!app || app.app_secret !== client_secret) {
        return res.status(401).json({ error: 'invalid_client' });
      }

      const token = db.prepare('SELECT * FROM oauth_tokens WHERE refresh_token = ? AND revoked = 0').get(refresh_token);
      if (!token) return res.status(400).json({ error: 'invalid_grant' });

      // 撤销旧令牌
      db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE id = ?').run(token.id);

      // 生成新令牌
      const accessToken = crypto.randomBytes(32).toString('hex');
      const newRefreshToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`INSERT INTO oauth_tokens (access_token, refresh_token, app_id, user_id, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(accessToken, newRefreshToken, client_id, token.user_id, token.scopes, expiresAt);

      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 7 * 24 * 60 * 60,
        refresh_token: newRefreshToken,
        scope: JSON.parse(token.scopes || '["read"]').join(' '),
      });
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  // —— 撤销令牌 ——
  router.post('/revoke', (req, res) => {
    const { token, client_id, client_secret } = req.body;
    if (!token || !client_id || !client_secret) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const app = db.prepare('SELECT * FROM oauth_apps WHERE app_id = ?').get(client_id);
    if (!app || app.app_secret !== client_secret) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE access_token = ? OR refresh_token = ?').run(token, token);
    res.json({ success: true });
  });

  return router;
}

/**
 * OAuth Bearer Token 认证中间件（用于开放API）
 */
export function requireOAuth(db) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) return res.status(401).json({ error: 'invalid_token', error_description: '缺少访问令牌' });

    const tokenRecord = db.prepare('SELECT * FROM oauth_tokens WHERE access_token = ? AND revoked = 0').get(token);
    if (!tokenRecord) return res.status(401).json({ error: 'invalid_token', error_description: '令牌无效或已撤销' });
    if (new Date(tokenRecord.expires_at) < new Date()) return res.status(401).json({ error: 'invalid_token', error_description: '令牌已过期' });

    const app = db.prepare('SELECT * FROM oauth_apps WHERE app_id = ?').get(tokenRecord.app_id);
    if (!app || app.status !== 'active') return res.status(401).json({ error: 'invalid_token', error_description: '应用已禁用' });

    // IP白名单校验
    const ipWhitelist = JSON.parse(app.ip_whitelist || '[]');
    if (ipWhitelist.length > 0 && !ipWhitelist.includes(req.ip)) {
      return res.status(403).json({ error: 'access_denied', error_description: 'IP不在白名单中' });
    }

    req.oauth = {
      appId: tokenRecord.app_id,
      userId: tokenRecord.user_id,
      scopes: JSON.parse(tokenRecord.scopes || '["read"]'),
      rateLimit: app.rate_limit,
    };
    next();
  };
}
