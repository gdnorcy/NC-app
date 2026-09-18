import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { verifyPassword, hashPassword, toUser, addOperationLog, resolveMemberRoles } from './db.js';
import { rateLimitMiddleware } from './rate-limit.js';
import { tenantState } from './tenant.js';
import { getSmsProvider, genSmsCode } from './sms.js';

const VALID_ROLES = ['admin', 'operator', 'tenant_admin', 'tenant_member'];
const SMS_CODE_TTL_MINUTES = 5;
const SMS_SEND_INTERVAL_MS = 60 * 1000; // 同一手机号 60 秒内只能发一次

export function issueToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      username: user.username,
      role: user.role,
      customerId: user.customer_id || null,
      enterpriseId: user.enterprise_id || null,
      memberId: user.memberId || null,
      roles: (user.roles || []).map((r) => r.code),
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function createAuthRouter(db) {
  const router = express.Router();

  function findLoginUser(identifier) {
    // 新模型优先：accounts（登录凭据）→ 关联的租户成员（业务身份）
    const acc = db
      .prepare('SELECT * FROM accounts WHERE username = ? OR phone = ?')
      .get(identifier, identifier);
    if (acc) {
      const member = db
        .prepare("SELECT * FROM tenant_members WHERE account_id = ? AND status = 'active' ORDER BY id LIMIT 1")
        .get(acc.id);
      if (member) {
        const roles = resolveMemberRoles(db, member.id);
        const role = roles.some((r) => r.code === 'tenant_admin') ? 'tenant_admin' : 'tenant_member';
        // 成员权限点：汇总其全部角色的 role_permissions.menu_key（前端菜单可见性/后端操作判定用）
        const perms = db
          .prepare(
            `SELECT DISTINCT rp.menu_key FROM member_roles mr
             JOIN role_permissions rp ON rp.role_id = mr.role_id
             WHERE mr.member_id = ?`
          )
          .all(member.id)
          .map((r) => r.menu_key);
        return {
          id: acc.id,
          username: acc.username || acc.phone || '',
          phone: acc.phone || null,
          password_hash: acc.password_hash,
          password_salt: acc.password_salt,
          role,
          status: acc.status,
          customer_id: member.tenant_id,
          enterprise_id: null,
          memberId: member.id,
          roles,
          perms,
          isMemberAccount: true,
        };
      }
    }
    // 旧模型兜底：users（平台 admin/operator / 测试直插 / 未迁移存量）
    const u = db.prepare('SELECT * FROM users WHERE username = ? OR phone = ?').get(identifier, identifier);
    if (u) {
      return { ...u, roles: [], memberId: null, perms: [], isMemberAccount: false };
    }
    return null;
  }

  // —— 账号密码登录（IP 防刷：每 60s 最多 20 次尝试） ——
  router.post('/login', rateLimitMiddleware({ keyFn: (req) => `login:${req.ip}`, limit: 20, windowMs: 60_000 }), (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '请输入账号和密码' });
    }
    const user = findLoginUser(String(username).trim());
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: '账号不存在或已停用' });
    }
    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    // 租户账号需校验所属客户生命周期（存在/启用/未到期）
    // 到期策略：adminExpireMode=allow → 放行只读登录（前端只读横幅）；否则拦截
    let readonly = false;
    if (['tenant_admin', 'tenant_member'].includes(user.role) && user.customer_id) {
      const state = tenantState(db, user.customer_id, { ctx: 'admin' });
      if (!state.active) {
        const name = state.project?.customer_name || '客户';
        if (state.missing) return res.status(401).json({ error: '所属客户不存在或已删除' });
        if (state.expired) {
          if (state.readonly) readonly = true;
          else return res.status(401).json({ error: `客户「${name}」服务已到期，请联系平台续费` });
        } else {
          return res.status(401).json({ error: `客户「${name}」已被禁用，请联系管理员` });
        }
      }
    }
    const token = issueToken(user);
    addOperationLog(db, { userId: user.id, username: user.username, action: 'login', targetType: 'auth', detail: '账号密码登录', ip: req.ip });
    return res.json({ token, user: toUser(user), ...(readonly ? { readonly: true } : {}) });
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
    const user = findLoginUser(phone);
    if (!user) {
      return res.status(404).json({ error: '该手机号尚未注册' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: '账号已停用' });
    }
    // 租户账号需校验所属客户生命周期（存在/启用/未到期）
    // 到期策略：adminExpireMode=allow → 放行只读登录（前端只读横幅）；否则拦截
    let smsReadonly = false;
    if (['tenant_admin', 'tenant_member'].includes(user.role) && user.customer_id) {
      const state = tenantState(db, user.customer_id, { ctx: 'admin' });
      if (!state.active) {
        const name = state.project?.customer_name || '客户';
        if (state.missing) return res.status(401).json({ error: '所属客户不存在或已删除' });
        if (state.expired) {
          if (state.readonly) smsReadonly = true;
          else return res.status(401).json({ error: `客户「${name}」服务已到期，请联系平台续费` });
        } else {
          return res.status(401).json({ error: `客户「${name}」已被禁用，请联系管理员` });
        }
      }
    }
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id);
    const token = issueToken(user);
    addOperationLog(db, { userId: user.id, username: user.username, action: 'login', targetType: 'auth', detail: '手机号验证码登录', ip: req.ip });
    return res.json({ token, user: toUser(user), ...(smsReadonly ? { readonly: true } : {}) });
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
    req.user = {
      id: payload.uid,
      username: payload.username,
      role: payload.role,
      customerId: payload.customerId || null,
      enterpriseId: payload.enterpriseId || null,
      memberId: payload.memberId || null,
      roles: payload.roles || [],
    };
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

/** 权限点校验中间件工厂：requirePerm(db, appCode, menuKey)
 *  - 平台账号 admin/operator 全量
 *  - 租户超管（role=tenant_admin 或 roles 含 tenant_admin）全量
 *  - 普通成员：校验其角色的 role_permissions 是否命中（app_code + menu_key）
 *  - 门店管理员（store_admin）：P0 放行其 scope=store 的应用菜单（门店端工作台 P1 再做严格隔离）
 */
export function requirePerm(db, app, key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    const role = req.user.role;
    if (role === 'admin' || role === 'operator') return next();
    if (role === 'tenant_admin' || (req.user.roles || []).includes('tenant_admin')) return next();
    if (!req.user.memberId) return res.status(403).json({ error: '无权限执行此操作' });
    const hit = db
      .prepare('SELECT 1 FROM role_permissions rp WHERE rp.role_id IN (SELECT role_id FROM member_roles WHERE member_id = ?) AND rp.app_code = ? AND rp.menu_key = ?')
      .get(req.user.memberId, app, key);
    if (!hit) return res.status(403).json({ error: '无权限执行此操作' });
    return next();
  };
}

export { VALID_ROLES };
