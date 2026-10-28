// 防伪溯源 trace —— 平台级（总后台）设置
//
// 🔴 挂载：app.use('/api/admin/trace', requireAuth, createTracePlatformRouter(db))
// 🔴 平台级门控：仅平台角色 admin / operator 可读写；租户（tenant_admin/tenant_member）一律 403。
// 🔴 与租户后台 createTraceAdminRouter 严格隔离：租户侧 tenant_id = 真实租户，平台侧配置落在独立的
//    trace_platform_settings（单行 id=1），绝不混入 trace_settings，也不从前端直传 tenantId。
// 🔴 防伪码算法密钥（码制 k1–k5 / 码长 m1–m5）是平台常量，在 services/traceCode.js 的 DEFAULT_CODESET
//    固化，故意不在此处开放编辑 —— 改之会使所有已发码作废。本模块只承载运营类平台配置。
import { Router } from 'express';
import { encryptSecret, readSecret, maskSecretValue, mergeSecretInput } from '../crypto.js';

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function safeJson(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}

/** 平台配置默认结构（绝不在这里放码制密钥） */
const DEFAULT_PLATFORM = {
  siteRoot: '',                                          // #474 自定义域名（C 端生成码用的根域名）
  apiAuth: { allowedIps: [], commKeyCipher: '' },         // #475 API 授权：IP 白名单 + 通信密钥（密文）
  generation: { mode: 'open' },                           // #472 生成权限：open=租户可生成 / platformOnly=仅平台 / closed=全关
  mobileTemplate: '',                                     // #473 手机端模板（配置先存，运行时消费待接）
  serviceProvider: {                                      // #476 服务商微信支付（密文存储，运行时适配器待接）
    wxAppId: '', mchId: '', apiKeyCipher: '', kqf: '',
  },
};

function requirePlatform(req, res, next) {
  const u = req.user || {};
  if (!u || !['admin', 'operator'].includes(u.role)) {
    return sendError(res, 403, '仅平台管理员可访问');
  }
  return next();
}

export function getPlatformSettings(db) {
  let row = db.prepare('SELECT * FROM trace_platform_settings WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO trace_platform_settings (id, config_json, updated_at) VALUES (1, ?, datetime(\'now\'))')
      .run(JSON.stringify(DEFAULT_PLATFORM));
    row = db.prepare('SELECT * FROM trace_platform_settings WHERE id = 1').get();
  }
  return { row, config: safeJson(row?.config_json, DEFAULT_PLATFORM) };
}

/**
 * 合并提交的配置到既有配置。
 * 🔴 顺序不能反：先把明文密钥轮成密文，否则明文密钥会当普通字段落库（明文裸奔）。
 * 🔴 密钥字段用 mergeSecretInput：空串/脱敏占位符 = 不修改，保留原密文。
 */
function mergeConfig(prev, body) {
  const next = JSON.parse(JSON.stringify(prev || DEFAULT_PLATFORM));
  if (body && typeof body === 'object') {
    if ('siteRoot' in body) next.siteRoot = String(body.siteRoot || '').trim();
    if (body.apiAuth && typeof body.apiAuth === 'object') {
      const a = body.apiAuth;
      next.apiAuth = {
        ...(prev?.apiAuth || {}),
        allowedIps: Array.isArray(a.allowedIps) ? a.allowedIps.map((x) => String(x).trim()).filter(Boolean) : (prev?.apiAuth?.allowedIps || []),
        commKeyCipher: mergeSecretInput(String(a.commKey ?? ''), String(prev?.apiAuth?.commKeyCipher || '')),
      };
    }
    if (body.generation && typeof body.generation === 'object') {
      const m = String(body.generation.mode || 'open');
      next.generation = { mode: ['open', 'platformOnly', 'closed'].includes(m) ? m : 'open' };
    }
    if ('mobileTemplate' in body) next.mobileTemplate = String(body.mobileTemplate || '');
    if (body.serviceProvider && typeof body.serviceProvider === 'object') {
      const s = body.serviceProvider;
      next.serviceProvider = {
        wxAppId: String(s.wxAppId || ''),
        mchId: String(s.mchId || ''),
        apiKeyCipher: mergeSecretInput(String(s.apiKey ?? ''), String(prev?.serviceProvider?.apiKeyCipher || '')),
        kqf: String(s.kqf || ''),
      };
    }
  }
  return next;
}

/** 脱敏回显：密钥只给掩码，永不送明文 */
function maskConfig(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  if (c.apiAuth) c.apiAuth.commKey = maskSecretValue(readSecret(c.apiAuth.commKeyCipher));
  if (c.serviceProvider) c.serviceProvider.apiKey = maskSecretValue(readSecret(c.serviceProvider.apiKeyCipher));
  return c;
}

export function createTracePlatformRouter(db) {
  const router = Router();
  router.use(requirePlatform);

  // 平台配置读取（脱敏）
  router.get('/platform-settings', (_req, res) => {
    const { config } = getPlatformSettings(db);
    return res.json({ config: maskConfig(config) });
  });

  // 平台配置保存（密钥加密落库）
  router.put('/platform-settings', (req, res) => {
    try {
      const { config: prev } = getPlatformSettings(db);
      const merged = mergeConfig(prev, req.body || {});
      db.prepare('UPDATE trace_platform_settings SET config_json = ?, updated_at = datetime(\'now\') WHERE id = 1')
        .run(JSON.stringify(merged));
      return res.json({ config: maskConfig(merged) });
    } catch (e) {
      return sendError(res, 400, e.message || '保存失败');
    }
  });

  // #471 防伪码库存：列出各租户当前余量（与 trace_settings.cocom 对齐）
  router.get('/cocom/tenants', (_req, res) => {
    const rows = db.prepare(`SELECT p.id AS tenantId, p.customer_name AS name, COALESCE(t.cocom, 0) AS cocom
      FROM projects p LEFT JOIN trace_settings t ON t.tenant_id = p.id
      WHERE p.status != 'trashed' ORDER BY p.id ASC`).all();
    return res.json({ list: rows.map((r) => ({ ...r, cocom: Number(r.cocom) })) });
  });

  // 🔴 库存读写共用的原子操作（都在事务里读改写，避免并发充值互相覆盖）。
  //    cocom 语义：-888 = 不限；>=0 = 具体余量。其余负数一律非法（会被 deductCocom 判成「库存不足」，
  //    与「不限」混淆，是历史遗留的脏取值，必须从入口挡住）。
  function cocomOf(tenantId) {
    const row = db.prepare('SELECT cocom FROM trace_settings WHERE tenant_id = ?').get(tenantId);
    return row ? Number(row.cocom) : 0;
  }
  function tenantExists(tenantId) {
    // 🔴 必须校验租户真实存在：否则拿任意 id 就能凭空建出一行 trace_settings 脏数据
    return !!db.prepare("SELECT id FROM projects WHERE id = ? AND status != 'trashed'").get(tenantId);
  }
  /**
   * 事务内「读当前 → 计算 → 写库存 + 写台账」。
   * @param compute (cur) => ({ next, delta }) 或 null 表示拒绝（走 ROLLBACK，不留痕迹）
   */
  function applyCocom(tenantId, compute, req, note) {
    db.exec('BEGIN');
    try {
      const cur = cocomOf(tenantId);
      const r = compute(cur);
      if (!r) { db.exec('ROLLBACK'); return null; }
      db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at)
        VALUES (?, '{}', '{}', ?, datetime('now'))
        ON CONFLICT(tenant_id) DO UPDATE SET cocom = ?, updated_at = datetime('now')`)
        .run(tenantId, r.next, r.next);
      db.prepare(`INSERT INTO trace_cocom_recharges (tenant_id, delta, balance_after, operator, note, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))`)
        .run(tenantId, r.delta, r.next, String(req.user?.username || req.user?.id || ''), String(note || ''));
      db.exec('COMMIT');
      return r.next;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* 已回滚则忽略 */ }
      throw e;
    }
  }

  // #471 充值（累加）—— 防伪码库存的唯一出口，租户侧不再有充值入口
  router.post('/cocom/tenants/:id/recharge', (req, res) => {
    const tenantId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return sendError(res, 400, '租户 ID 无效');
    if (!Number.isInteger(amount) || amount <= 0) return sendError(res, 400, '充值数量必须为正整数');
    if (amount > 9999999) return sendError(res, 400, '单次充值数量过大');
    if (!tenantExists(tenantId)) return sendError(res, 400, '租户不存在');

    try {
      // 🔴 无限库存下充值毫无意义（生成时不扣减），且会把「不限」悄悄覆盖成有限值 → 直接拒绝并说清怎么做
      const next = applyCocom(tenantId, (cur) => (cur === -888 ? null : { next: cur + amount, delta: amount }), req, req.body?.note || '平台充值');
      if (next === null) return sendError(res, 400, '该租户当前为「不限」库存，无需充值；如需改为限量，请先用「调整」设定目标值');
      return res.json({ ok: true, cocom: next });
    } catch (e) {
      return sendError(res, 400, e.message || '充值失败');
    }
  });

  // #471 调整某租户库存（直接设为目标值 / 设为不限，写台账）
  router.put('/cocom/tenants/:id', (req, res) => {
    const tenantId = Number(req.params.id);
    const target = Number(req.body?.cocom);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return sendError(res, 400, '租户 ID 无效');
    if (!Number.isInteger(target)) return sendError(res, 400, '库存值无效');
    // 🔴 合法取值只有两种：-888（不限）与 >=0 的余量。其他负数会造成「看起来有库存却生成不了」的脏状态
    if (target !== -888 && target < 0) return sendError(res, 400, '库存值无效：只能填 >=0 的余量，或 -888 表示不限');
    if (target > 99999999) return sendError(res, 400, '库存值过大');
    if (!tenantExists(tenantId)) return sendError(res, 400, '租户不存在');

    try {
      const next = applyCocom(tenantId, (cur) => ({ next: target, delta: target - cur }), req, req.body?.note || '平台调整');
      return res.json({ ok: true, cocom: next });
    } catch (e) {
      return sendError(res, 400, e.message || '调整失败');
    }
  });

  // #471 充值台账
  router.get('/cocom/tenants/:id/ledger', (req, res) => {
    const tenantId = Number(req.params.id);
    const list = db.prepare(`SELECT id, delta, balance_after, operator, note, created_at
      FROM trace_cocom_recharges WHERE tenant_id = ? ORDER BY id DESC LIMIT 200`).all(tenantId);
    return res.json({ list });
  });

  return router;
}
