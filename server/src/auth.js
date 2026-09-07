import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { verifyPassword, hashPassword, toUser, addOperationLog } from './db.js';
import { rateLimitMiddleware } from './rate-limit.js';
import { tenantState } from './tenant.js';
import { getSmsProvider, genSmsCode } from './sms.js';

const VALID_ROLES = ['admin', 'operator', 'tenant_admin', 'tenant_member'];
const SMS_CODE_TTL_MINUTES = 5;
const SMS_SEND_INTERVAL_MS = 60 * 1000; // 同一手机号 60 秒内只能发一次

export function issueToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role, customerId: user.customer_id || null },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function createAuthRouter(db) {
  const router = express.Router();

  function findUserByIdentifier(identifier) {
    // identifier 可以是 username 或 phone
    return db
      .prepare('SELECT * FROM users WHERE username = ? OR phone = ?')
      .get(identifier, identifier);
  }

  // —— 账号密码登录（IP 防刷：每 60s 最多 20 次尝试） ——
  router.post('/login', rateLimitMiddleware({ keyFn: (req) => `login:${req.ip}`, limit: 20, windowMs: 60_000 }), (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '请输入账号和密码' });
    }
    const user = findUserByIdentifier(String(username).trim());
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: '账号不存在或已停用' });
    }
    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    // 租户账号需校验所属客户生命周期（存在/启用/未到期）
    if (['tenant_admin', 'tenant_member'].includes(user.role) && user.customer_id) {
      const state = tenantState(db, user.customer_id);
      if (!state.active) {
        const name = state.project?.customer_name || '客户';
        if (state.missing) return res.status(401).json({ error: '所属客户不存在或已删除' });
        if (state.expired) return res.status(401).json({ error: `客户「${name}」服务已到期，请联系平台续费` });
        return res.status(401).json({ error: `客户「${name}」已被禁用，请联系管理员` });
      }
    }
    const token = issueToken(user);
    addOperationLog(db, { userId: user.id, username: user.username, action: 'login', targetType: 'auth', detail: '账号密码登录', ip: req.ip });
    return res.json({ token, user: toUser(user) });
  });

  // —— 发送短信验证码（IP 防刷：每 60s 最多 10 条；另按手机号有 60s 1 条的库级限频） ——
  router.post('/sms-code', rateLimitMiddleware({ keyFn: (req) => `sms:${req.ip}`, limit: 10, windowMs: 60_000 }), (req, res) => {
    const { phone, purpose = 'register' } = req.body || {};
    if (!phone || !/^1\d{10}$/.test(String(phone))) {
      return res.status(400).json({ error: '请输入正确的手机号' });
    }
    if (!['register', 'login'].includes(purpose)) {
      return res.status(400).json({ error: '无效的验证码用途' });
    }
    // 限频：60 秒内同一手机号同一用途只能发一次
    const recent = db
      .prepare(
        "SELECT created_at FROM sms_codes WHERE phone = ? AND purpose = ? ORDER BY id DESC LIMIT 1"
      )
      .get(phone, purpose);
    if (recent) {
      const elapsed = Date.now() - new Date(recent.created_at + 'Z').getTime();
      if (elapsed < SMS_SEND_INTERVAL_MS) {
        const wait = Math.ceil((SMS_SEND_INTERVAL_MS - elapsed) / 1000);
        return res.status(429).json({ error: `发送过于频繁，请 ${wait} 秒后再试` });
      }
    }
    const code = genSmsCode();
    const expiresAt = new Date(Date.now() + SMS_CODE_TTL_MINUTES * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    db.prepare(
      'INSERT INTO sms_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, ?)'
    ).run(phone, code, purpose, expiresAt);

    getSmsProvider()
      .send(phone, code, purpose)
      .then((result) => {
        // 开发环境 mock provider 会回传 code，方便测试；生产环境不回传
        const resp = { ok: true, expiresIn: SMS_CODE_TTL_MINUTES * 60 };
        if (result && result.code && result.provider === 'mock') {
          resp.devCode = result.code;
        }
        res.json(resp);
      })
      .catch(() => res.status(500).json({ error: '短信发送失败，请稍后重试' }));
  });

  // —— 手机号 + 验证码 注册 ——
  router.post('/register', (req, res) => {
    const { phone, code, password, username } = req.body || {};
    if (!phone || !/^1\d{10}$/.test(String(phone))) {
      return res.status(400).json({ error: '请输入正确的手机号' });
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return res.status(400).json({ error: '请输入 6 位验证码' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    // 校验验证码
    const record = db
      .prepare(
        "SELECT * FROM sms_codes WHERE phone = ? AND purpose = 'register' AND used = 0 ORDER BY id DESC LIMIT 1"
      )
      .get(phone);
    if (!record || record.code !== String(code)) {
      return res.status(400).json({ error: '验证码错误' });
    }
    if (new Date(record.expires_at + 'Z').getTime() < Date.now()) {
      return res.status(400).json({ error: '验证码已过期' });
    }
    // 手机号是否已注册
    if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
      return res.status(409).json({ error: '该手机号已注册' });
    }
    // 用户名（可选，不填则用手机号）
    let uname = username ? String(username).trim() : phone;
    if (uname && db.prepare('SELECT id FROM users WHERE username = ?').get(uname)) {
      return res.status(409).json({ error: '该用户名已被占用' });
    }
    // 标记验证码已使用
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id);

    const { hash, salt } = hashPassword(password);
    const info = db
      .prepare(
        'INSERT INTO users (username, phone, password_hash, password_salt, role, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(uname, phone, hash, salt, 'operator', 'active');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = issueToken(user);
    addOperationLog(db, { userId: user.id, username: user.username, action: 'register', targetType: 'auth', detail: `手机号注册: ${phone}`, ip: req.ip });
    return res.json({ token, user: toUser(user) });
  });

  // —— 手机号 + 验证码 登录 ——
  router.post('/login-phone', (req, res) => {
    const { phone, code } = req.body || {};
    if (!phone || !/^1\d{10}$/.test(String(phone))) {
      return res.status(400).json({ error: '请输入正确的手机号' });
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return res.status(400).json({ error: '请输入 6 位验证码' });
    }
    const record = db
      .prepare(
        "SELECT * FROM sms_codes WHERE phone = ? AND purpose = 'login' AND used = 0 ORDER BY id DESC LIMIT 1"
      )
      .get(phone);
    if (!record || record.code !== String(code)) {
      return res.status(400).json({ error: '验证码错误' });
    }
    if (new Date(record.expires_at + 'Z').getTime() < Date.now()) {
      return res.status(400).json({ error: '验证码已过期' });
    }
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      return res.status(404).json({ error: '该手机号尚未注册' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: '账号已停用' });
    }
    // 租户账号需校验所属客户生命周期（存在/启用/未到期）
    if (['tenant_admin', 'tenant_member'].includes(user.role) && user.customer_id) {
      const state = tenantState(db, user.customer_id);
      if (!state.active) {
        const name = state.project?.customer_name || '客户';
        if (state.missing) return res.status(401).json({ error: '所属客户不存在或已删除' });
        if (state.expired) return res.status(401).json({ error: `客户「${name}」服务已到期，请联系平台续费` });
        return res.status(401).json({ error: `客户「${name}」已被禁用，请联系管理员` });
      }
    }
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id);
    const token = issueToken(user);
    addOperationLog(db, { userId: user.id, username: user.username, action: 'login', targetType: 'auth', detail: '手机号验证码登录', ip: req.ip });
    return res.json({ token, user: toUser(user) });
  });

  return router;
}

// —— 鉴权中间件 ——
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.uid, username: payload.username, role: payload.role, customerId: payload.customerId || null };
    return next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

/** 角色校验中间件工厂：requireRole('admin') 或 requireRole(['admin','operator']) */
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: '无权限执行此操作' });
    }
    return next();
  };
}

export { VALID_ROLES };
