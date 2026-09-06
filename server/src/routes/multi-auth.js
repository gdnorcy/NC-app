import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { addOperationLog } from '../db.js';

/**
 * 多端认证路由
 * 支持：微信小程序登录、公众号OAuth登录、绑定微信
 */
export function createMultiAuthRouter(db) {
  const router = Router();

  // 微信小程序登录
  router.post('/wx-mini-login', async (req, res) => {
    const { code, nickname, avatar } = req.body;
    if (!code) return res.status(400).json({ error: '缺少code' });

    try {
      const wxConfig = getConfig(db, 'wx_mini');
      if (!wxConfig.appId || !wxConfig.appSecret) {
        return res.status(400).json({ error: '微信小程序未配置' });
      }

      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${wxConfig.appId}&secret=${wxConfig.appSecret}&js_code=${code}&grant_type=authorization_code`;
      const wxRes = await fetch(url);
      const wxData = await wxRes.json();

      if (wxData.errcode) {
        return res.status(400).json({ error: wxData.errmsg || '微信登录失败' });
      }

      const { openid, unionid } = wxData;
      let user = db.prepare('SELECT * FROM users WHERE wx_openid = ?').get(openid);

      if (!user) {
        const username = `wx_${openid.slice(-8)}`;
        const { hash, salt } = hashPassword(crypto.randomBytes(16).toString('hex'));
        db.prepare(`INSERT INTO users (username, password_hash, password_salt, role, wx_openid, wx_unionid, nickname, avatar) VALUES (?, ?, ?, 'tenant_member', ?, ?, ?, ?)`)
          .run(username, hash, salt, openid, unionid || null, nickname || '', avatar || '');
        user = db.prepare('SELECT * FROM users WHERE wx_openid = ?').get(openid);
      }

      const token = generateToken(user);
      addOperationLog(db, user.id, 'wx_mini_login');
      res.json({ token, user: toUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 公众号OAuth授权URL
  router.get('/wx-mp-auth-url', (req, res) => {
    const { redirectUri, scope = 'snsapi_userinfo' } = req.query;
    const wxConfig = getConfig(db, 'wx_mp');
    if (!wxConfig.appId) return res.status(400).json({ error: '公众号未配置' });

    const state = crypto.randomBytes(8).toString('hex');
    const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${wxConfig.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}#wechat_redirect`;
    res.json({ url, state });
  });

  // 公众号OAuth登录
  router.post('/wx-mp-login', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '缺少code' });

    try {
      const wxConfig = getConfig(db, 'wx_mp');
      if (!wxConfig.appId || !wxConfig.appSecret) {
        return res.status(400).json({ error: '公众号未配置' });
      }

      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${wxConfig.appId}&secret=${wxConfig.appSecret}&code=${code}&grant_type=authorization_code`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.errcode) {
        return res.status(400).json({ error: tokenData.errmsg || '微信登录失败' });
      }

      const { openid, unionid, access_token } = tokenData;
      let nickname = '', avatar = '';

      try {
        const userUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
        const userRes = await fetch(userUrl);
        const userData = await userRes.json();
        nickname = userData.nickname || '';
        avatar = userData.headimgurl || '';
      } catch (e) {}

      let user = db.prepare('SELECT * FROM users WHERE mp_openid = ?').get(openid);
      if (!user) {
        const username = `mp_${openid.slice(-8)}`;
        const { hash, salt } = hashPassword(crypto.randomBytes(16).toString('hex'));
        db.prepare(`INSERT INTO users (username, password_hash, password_salt, role, mp_openid, wx_unionid, nickname, avatar) VALUES (?, ?, ?, 'tenant_member', ?, ?, ?, ?)`)
          .run(username, hash, salt, openid, unionid || null, nickname, avatar);
        user = db.prepare('SELECT * FROM users WHERE mp_openid = ?').get(openid);
      }

      const token = generateToken(user);
      addOperationLog(db, user.id, 'wx_mp_login');
      res.json({ token, user: toUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 绑定微信（已登录用户）
  router.post('/bind-wx', requireAuth, async (req, res) => {
    const { code, type = 'mini' } = req.body;
    if (!code) return res.status(400).json({ error: '缺少code' });

    try {
      const cfg = type === 'mini' ? getConfig(db, 'wx_mini') : getConfig(db, 'wx_mp');
      if (!cfg.appId || !cfg.appSecret) return res.status(400).json({ error: '微信未配置' });

      const url = type === 'mini'
        ? `https://api.weixin.qq.com/sns/jscode2session?appid=${cfg.appId}&secret=${cfg.appSecret}&js_code=${code}&grant_type=authorization_code`
        : `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${cfg.appId}&secret=${cfg.appSecret}&code=${code}&grant_type=authorization_code`;

      const wxRes = await fetch(url);
      const wxData = await wxRes.json();
      if (wxData.errcode) return res.status(400).json({ error: wxData.errmsg });

      const field = type === 'mini' ? 'wx_openid' : 'mp_openid';
      db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(wxData.openid, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function getConfig(db, key) {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? JSON.parse(row.value) : {};
    } catch (e) { return {}; }
  }

  function generateToken(user) {
    return jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  }

  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  function toUser(user) {
    const { password_hash, password_salt, ...safe } = user;
    return safe;
  }

  function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
      req.user = jwt.verify(token, config.jwtSecret);
      next();
    } catch (e) {
      res.status(401).json({ error: '登录已过期' });
    }
  }

  return router;
}
