// 防伪溯源 trace 应用 —— C 端公开段 + 租户后台段
// 🔴 两段必须分开挂载（平台标准 §3.2）：
//   - 公开段：app.use('/api/trace', createTracePublicRouter(db))         ← 不套 requireAuth
//   - 后台段：app.use('/api/customer/trace', requireAuth, createTraceAdminRouter(db))
//     后台段挂 /api/customer 前缀，是为了与 web-admin 的 customerApiCall（baseURL=/api/customer）对齐，
//     URL 不重复前缀；租户标识只从 req.user.customerId 取（requireAuth 解析后的 JWT 载荷）。
import { Router } from 'express';
import crypto from 'crypto';
import { softAuth } from '../auth.js';
import { config } from '../config.js';
import { hasSolution } from '../tenant.js';
import { buildTraceCodeFromSerial, canonicalBatchSegment, cleanTraceCode, DEFAULT_CODESET, parseTraceCode, verifyTraceCode } from '../services/traceCode.js';
import { generateTracePackage } from '../services/traceGenerate.js';
import { normalizeDisplaySlots, pickDisplaySlots } from '../services/traceSlots.js';
import { maskSecretValue, mergeSecretInput, readSecret } from '../crypto.js';
import { applyTraceReward } from '../services/traceReward.js';

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function pageParams(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function safeJson(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}

function nowIso() {
  return new Date().toISOString();
}

function tenantIdOf(req) {
  // 🔴 适配本项目鉴权口径：requireAuth 解析出的 JWT 载荷字段是 customerId
  //    （server/src/auth.js），不存在 tenant_id / tenantId —— 用错则 tenantId 恒 0，
  //    所有带 tenant_id = ? 的查询查不到数据、直接 401。
  //    同时兼容 card_token 形态（softAuth 解析出的 platform_user 行，字段名是 customer_id）。
  const u = req.user || {};
  return Number(u.customerId ?? u.customer_id ?? 0);
}

/**
 * 后台段租户守卫。
 * 🔴 租户标识唯一来源 = req.user.customerId（requireAuth 解析的 JWT 载荷），
 *    绝不能从 query/body 直传（越权）。role 校验与 customer.js requireTenant 同口径。
 */
function requireTenant(req, res, next) {
  const user = req.user;
  if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
    return sendError(res, 403, '无权访问客户后台');
  }
  const tenantId = tenantIdOf(req);
  if (!tenantId) return sendError(res, 403, '账号未关联客户项目');
  req.traceTenantId = tenantId;
  return next();
}

/**
 * 公开段租户解析（C 端扫码用户无需登录）。
 *
 * 🔴 越权红线：租户标识**只能**来自 ① URL 查询串 `?tid=`（C 端页面按应用带 tid，
 *    与 mall 的 `requireGoodsApp` 同款口径）或 ② 登录态 req.user.customerId。
 *    **禁止**从 req.body / req.query.tenantId 直传 —— 那等于把租户读写权交给前端，
 *    任何人改一个参数就能跨租户查码、领奖、改设置。
 * 兜底 config.defaultTenantId 仅供单租户自营场景；正式部署请在 C 端页面带 tid。
 */
const DEFAULT_TRACE_TENANT_ID = Number(config.defaultTenantId || 1);

function publicTenant(req) {
  return Number(req.query.tid) || tenantIdOf(req) || DEFAULT_TRACE_TENANT_ID;
}

/**
 * 当前查询者的 openid / userId。
 *
 * 🔴 优先级：登录态优先（软认证解出的 platform_user），body 只作兜底。
 *    反过来写（body 优先）等于允许任何人伪造别人的 openid 冒领奖励 / 污染查询记录。
 */
function actorOf(req) {
  const u = req.user || {};
  return {
    openid: String(u.openid || req.body?.openid || req.query?.openid || req.headers['x-openid'] || ''),
    userId: Number(u.id || req.body?.userId || 0),
  };
}

function getSettings(db, tenantId) {
  const row = db.prepare('SELECT * FROM trace_settings WHERE tenant_id = ?').get(tenantId);
  if (!row) {
    // 🔴 首次访问懒初始化：库存给 -888（原 PHP 语义「不限」）。
    //    不做这一步的话，新租户 cocom 恒为 0 → traceGenerate.deductCocom 直接抛
    //    「防伪码库存不足」→ 应用开通后第一批码永远生成不出来。
    //    只对**真实存在的租户**初始化，避免公开段 ?tid= 传任意数字就造出一行脏数据。
    const isRealTenant = db.prepare('SELECT id FROM projects WHERE id = ?').get(tenantId);
    if (isRealTenant) {
      db.prepare(`INSERT OR IGNORE INTO trace_settings (tenant_id, settings_json, luck_json, cocom, updated_at)
        VALUES (?, '{}', '{}', -888, datetime('now'))`).run(tenantId);
    }
  }
  const fresh = db.prepare('SELECT * FROM trace_settings WHERE tenant_id = ?').get(tenantId);
  const settings = safeJson(fresh?.settings_json, {});
  return { row: fresh, settings };
}

/**
 * 🔴 按码里切出的批次段反查批次。
 *
 * 主路径 = 精确匹配 trace_batches.batch（写入时已按 m[2] 归一，必然命中）。
 * 回落路径 = 拿租户所有批次做 canonicalBatchSegment 比对，兼容「库里存的是
 * 原始串（8 位日期号等）、码里切的是 m[2] 位」的历史数据 —— 否则老批次
 * 生成的码在 C 端永远「不存在或已失效」。
 */
function findBatchBySegment(db, tenantId, segment, rule) {
  const seg = String(segment || '');
  if (!seg) return null;
  const exact = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND batch = ?').get(tenantId, seg);
  if (exact) return exact;
  const rows = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ?').all(tenantId);
  for (const row of rows) {
    if (canonicalBatchSegment(row.batch, rule) === seg) return row;
  }
  return null;
}

function saveSettings(db, tenantId, settings) {
  // 🔴 首次插入时 cocom 给 -888（不限）：列默认值是 0，而 0 会被 deductCocom 判成
  //    「库存不足」→ 租户还没充值就永远生成不出码。已存在时只更新 settings_json，不动库存。
  db.prepare(`INSERT INTO trace_settings (tenant_id, settings_json, cocom, updated_at)
    VALUES (?, ?, -888, datetime('now'))
    ON CONFLICT(tenant_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = datetime('now')`)
    .run(tenantId, JSON.stringify(settings || {}));
}

function getRule(db, tenantId) {
  const row = db.prepare('SELECT * FROM trace_code_rules WHERE tenant_id = ?').get(tenantId);
  const rule = safeJson(row?.rule_json, {});
  const m = rule.m || {};
  const k = rule.k || {};
  // 🔴 k 码表绝不能回落成空串（空 k → 校验位退化为常量 → 防伪码可伪造，
  //    详见 services/traceCode.js 的 DEFAULT_CODESET 注释）。
  //    逐格回落：哪一格缺失就用默认那一格，绝不整表替换（保留租户自定义的 k）。
  const kk = {};
  for (let i = 1; i <= 5; i += 1) {
    const v = String(k[i] ?? '');
    kk[i] = v || String(DEFAULT_CODESET.k[i] ?? '');
  }
  return {
    row,
    rule: {
      ...rule,
      m: { 1: String(m[1] ?? 'FW'), 2: Number(m[2] ?? 7), 3: Number(m[3] ?? 6), 4: Number(m[4] ?? 5), 5: Number(m[5] ?? 20) },
      k: kk,
      zdl: Number(rule.zdl ?? 10) || 10,
    },
  };
}

/**
 * 批次号规范化（按码制 m[2] = 批次号长度）。
 *
 * 🔴 为什么必须在这里归一：
 *   防伪码的「批次段」长度 = 码制 m[2]，C 端验真时 parseTraceCode 按 m[2] 从码里切批次段，
 *   再拿它去 trace_batches.batch 精确匹配。若库里存的批次号与切出来的批次段不是同一串
 *   （长度不同 / 含分隔符 / 大小写不同），生成出来的码在 C 端永远查不到批次 →
 *   「防伪码不存在或已失效」。而清洗函数 cleanTraceCode 会把 - . , 空格全删掉，
 *   这些字符一旦混进批次号，码段长度就会漂移 → 同样对不上。
 *   所以：只允许字母数字、全大写、长度不足左补 0、超长直接报错。
 */
function normalizeBatchNo(db, tenantId, raw) {
  const { rule } = getRule(db, tenantId);
  const batchLen = Math.max(1, Number(rule.m?.[2] ?? 7));
  const batch = String(raw || '').trim().toUpperCase();
  if (!batch) return { error: '批次号不能为空' };
  if (!/^[0-9A-Z]+$/.test(batch)) return { error: '批次号只能包含字母和数字（不能含 - . , 空格等分隔符）' };
  if (batch.length > batchLen) return { error: `批次号长度不能超过 ${batchLen} 位（由码制的「批次号长度」决定）` };
  return { batch: batch.padStart(batchLen, '0'), batchLen };
}

function saveRule(db, tenantId, body) {
  const m1 = String(body.m1 || '').toUpperCase();
  if (m1.length !== 2) throw new Error('防伪码前缀 m1 必须为 2 位');
  const k = {};
  for (let i = 1; i <= 5; i += 1) {
    k[i] = String(body[`k${i}`] || '');
    if (i <= 4 && k[i].length !== 10) throw new Error(`k${i} 必须为 10 位`);
  }
  const m = {
    1: m1,
    2: Number(body.m2 || 7),
    3: Number(body.m3 || 6),
    4: Number(body.m4 || 5),
    5: Number(body.m5 || 20),
  };
  // 🔴 码长自洽校验：前缀(m1) + 批次(m2) + 流水(m3) + 校验(m4) 必须等于总长(m5)。
  //    不等时 computeTraceCode 会按 totalLen 截断 body → 流水号被吃掉几位，
  //    不同流水号生成出同一个码 → 码重复、批次错乱，且全程无任何报错。
  const expect = m[1].length + m[2] + m[3] + m[4];
  if (expect !== m[5]) {
    throw new Error(`码长不自洽：前缀(${m[1].length}) + 批次号(${m[2]}) + 流水号(${m[3]}) + 校验位(${m[4]}) = ${expect}，必须等于总长 ${m[5]}`);
  }
  // 🔴 已生成过码之后，禁止改「会改变码结构」的长度参数。
  //    m2（批次段宽度）一改，parseTraceCode 切出来的批次段宽度就变了，
  //    库里已存的批次号再也对不上 → 所有已印出去的码瞬间全部失效（用户投诉级）。
  //    m1/m3/m4/m5 同理（前缀变了前缀不匹配；流水/校验/总长变了校验算法位置变了）。
  //    唯一能安全改的是 k（校验字符集）与 zdl（错误次数上限）。
  const prev = getRule(db, tenantId).rule;
  const structuralChanged = ['1', '2', '3', '4', '5'].some((key) => String(prev.m[key]) !== String(m[key]));
  if (structuralChanged) {
    const used = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ?').get(tenantId).c;
    if (Number(used) > 0) {
      throw new Error(`该租户已生成 ${used} 个防伪码，不能再修改码制结构（前缀/批次号长度/流水号长度/校验位长度/总长）——改了会让已印出去的码全部失效。如需继续，请新建租户或先清理已有码`);
    }
  }
  const rule = {
    k,
    m,
    s: 0,
    zdl: Number(body.zdl || 10) || 10,
  };
  db.prepare(`INSERT INTO trace_code_rules (tenant_id, m1, rule_json, publish_no, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tenant_id) DO UPDATE SET m1 = excluded.m1, rule_json = excluded.rule_json, publish_no = excluded.publish_no, updated_at = datetime('now')`)
    .run(tenantId, m1, JSON.stringify(rule), String(body.publishNo || nowIso()));
  return rule;
}

function addHistory(db, tenantId, type, summary, req, remark = '') {
  db.prepare(`INSERT INTO trace_histories (tenant_id, type, summary, uid, openid, ip, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
    .run(tenantId, type, summary, Number(req.user?.id || req.body?.userId || 0), String(req.body?.openid || req.headers['x-openid'] || ''), String(req.ip || ''), remark);
}

/**
 * C 端公开段（不套 requireAuth）。
 * 挂载：app.use('/api/trace', createTracePublicRouter(db))
 * 路径：/api/trace/public/*
 * 🔴 租户定位：只认 URL ?tid= 或登录态 req.user.customerId（publicTenant），
 *    禁止从 body/query.tenantId 直传 —— 否则任何人改一个参数就能跨租户查码、领奖。
 */
export function createTracePublicRouter(db) {
  const router = Router();

  // 🔴 软认证（不强制登录）：游客扫码也能查，但登录用户可解析出 openid / 租户归属，
  //    让「我的奖品」「首次查询奖励」落到真实用户身上。
  //    用 auth.js 的 softAuth（与 /api/card-market/super-form 同一口径），不自造解析逻辑。
  router.use((req, res, next) => {
    softAuth(req, db);
    next();
  });

  router.get('/public/scan-entry', (req, res) => {
    const code = cleanTraceCode(req.query.co || '');
    if (!code) return sendError(res, 400, '防伪码不能为空');
    return res.json({ code });
  });

  router.post('/public/verify', (req, res) => {
    const tenantId = publicTenant(req);
    const { settings } = getSettings(db, tenantId);
    const { rule } = getRule(db, tenantId);
    const raw = cleanTraceCode(req.body.co || '');
    const yzm = cleanTraceCode(req.body.yzm || '');
    if (!raw) return sendError(res, 400, '防伪码不能为空');
    const code = yzm ? `${raw}0${yzm}` : raw;
    const entryType = yzm ? '9' : '6';
    const { openid, userId } = actorOf(req);
    const ip = String(req.ip || req.body.ip || '');

    if (!verifyTraceCode(code, rule)) {
      db.prepare('INSERT INTO trace_wrong_attempts (tenant_id, openid, ip, code, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
        .run(tenantId, openid, ip, code);
      const wrong = db.prepare(`SELECT COUNT(*) AS c FROM trace_wrong_attempts
        WHERE tenant_id = ? AND (openid = ? OR ip = ?) AND created_at > datetime('now', '-1 day')`).get(tenantId, openid, ip);
      if (Number(wrong.c) > rule.zdl) return sendError(res, 429, '错误次数过多，请稍后再试');
      return sendError(res, 400, '防伪码不存在或已失效');
    }

    const parsed = parseTraceCode(code, rule);
    let record = db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND code = ?').get(tenantId, code);
    let batch = record
      ? db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(tenantId, record.batch_id)
      : findBatchBySegment(db, tenantId, parsed.batch, rule);
    if (!batch || Number(batch.is_active) !== 1) return sendError(res, 400, '防伪码不存在或已失效');

    const upperlimit = Number(settings.upperlimit || 0);
    if (upperlimit > 0 && Number(batch.rcon || 0) >= upperlimit && !record) {
      return sendError(res, 400, settings.con_msg || '查询次数已达上限');
    }

    // 🔴 事务口径 = 平台统一写法 db.exec('BEGIN'/'COMMIT'/'ROLLBACK')。
    //    交付物原版用 better-sqlite3 的 db.transaction(fn) —— 本平台是 node:sqlite，
    //    DatabaseSync 没有 transaction() 方法 → 调用即 TypeError → 验真接口 500。
    // 🔴 本次是否「首查」必须在事务内定下来：下面的累加分支要靠它区分
    //    「刚置 1 的首查」与「真正的复访」，否则 num 会算错（详见累加处注释）。
    let isNewEntry = false;
    db.exec('BEGIN');
    try {
      if (!record) {
        const info = db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, entry_type, num, queried_at, openid, user_id, ip, hdtype, is_valid, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, datetime('now'), ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`)
          .run(tenantId, batch.id, code, entryType, openid, userId, ip, Number(batch.inttype || 0));
        record = db.prepare('SELECT * FROM trace_codes WHERE id = ?').get(info.lastInsertRowid);
        db.prepare('UPDATE trace_batches SET rcon = rcon + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, batch.id);
        isNewEntry = true;
      } else if (Number(record.num || 0) === 0) {
        db.prepare(`UPDATE trace_codes SET num = 1, queried_at = datetime('now'), openid = ?, user_id = ?, ip = ?, updated_at = datetime('now')
          WHERE tenant_id = ? AND id = ?`).run(openid, userId, ip, tenantId, record.id);
        db.prepare('UPDATE trace_batches SET rcon = rcon + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, batch.id);
        record = db.prepare('SELECT * FROM trace_codes WHERE id = ?').get(record.id);
        isNewEntry = true;
      }
      const recent = db.prepare(`SELECT id FROM trace_histories WHERE tenant_id = ? AND type = 0 AND summary = ? AND openid = ? AND created_at > datetime('now', '-21 seconds')`)
        .get(tenantId, code, openid);
      if (!recent) {
        db.prepare(`INSERT INTO trace_histories (tenant_id, type, summary, uid, openid, ip, remark, created_at)
          VALUES (?, 0, ?, ?, ?, ?, ?, datetime('now'))`)
          .run(tenantId, code, userId, openid, ip, `第${Number(record.num || 0)}次查询`);
        // 🔴 只有「复访」才累加 num。原写法是 `if (num > 1)`：首查把 num 置 1 后不满足，
        //    num 永远卡在 1 → first 恒 true → 「仅首次查询可见」的展示位永远显示、
        //    首查奖励也会重复发。判据必须是「本次是不是首查」，不是「num 是否 > 1」。
        if (!isNewEntry) {
          db.prepare('UPDATE trace_codes SET num = num + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, record.id);
        }
        record = db.prepare('SELECT * FROM trace_codes WHERE id = ?').get(record.id);
      }
      batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(tenantId, batch.id);
      db.exec('COMMIT');
    } catch (txErr) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      throw txErr;
    }

    const reward = applyTraceReward({
      db,
      tenantId,
      settings,
      batch,
      record,
      req,
      adapters: globalThis.traceRewardAdapters || {},
    });
    record = reward.record || record;

    return res.json({
      ok: true,
      code,
      first: Number(record.num || 0) <= 1,
      // 🔴 首页展示位：按「展示条件」+ 本次查询态挑出本次该渲染的位。
      //    数量上限 8（公众号当前图文消息接口口径），条件语义见 traceSlots.js。
      //    isTopQueryer = 本次访问人是该码的首位查询人；游客（无 openid）恒判非首位。
      // 🔴 必须在这里剥掉 keyCipher：展示位是公开接口下发的，密文一旦出网
      //    等于把租户的接口凭据交给任何人（拿到密文 + 我们服务的解密能力即可还原）。
      slots: pickDisplaySlots(settings.displaySlots || [], {
        isFirstQuery: Number(record.num || 0) <= 1,
        isTopQueryer: Boolean(record.openid) && record.openid === openid,
      }).map(({ keyCipher, ...rest }) => rest),
      num: Number(record.num || 0),
      batch: {
        id: batch.id,
        batch: batch.batch,
        product: batch.product,
        factory: batch.factory,
        brand: batch.brand,
        origin: batch.origin,
        province: batch.province,
        city: batch.city,
        district: batch.district,
        banner: batch.banner,
        logo: batch.logo,
        video: batch.video,
        buyLink: batch.buy_link,
        rcon: Number(batch.rcon || 0),
        params: safeJson(batch.params_json, []),
        wailink: safeJson(batch.wailink_json, {}),
      },
      reward,
      settings: {
        welcome: settings.welcome || '',
        sucOne: settings.suc_one || '',
        sucTwo: settings.suc_two || '',
        ftel: settings.ftel || '',
        dtel: settings.dtel || '',
        script: settings.script || '',
      },
    });
  });

  // ==================== 公开端点（无需登录） ====================

  // 第三方 API 验证（原 doMobilea）
  router.post('/public/api/verify', (req, res) => {
    const tenantId = publicTenant(req);
    const { settings } = getSettings(db, tenantId);
    const { rule } = getRule(db, tenantId);

    // IP 白名单校验
    const apiIp = String(settings.api?.ip || '');
    const apiKey = String(settings.api?.key || '');
    if (apiIp.length < 8 || apiKey.length < 20) return sendError(res, 403, '1888');
    const clientIp = String(req.ip || req.body.ip || '');
    if (clientIp !== apiIp) return sendError(res, 403, '1839');

    const co = cleanTraceCode(req.body.co || '');
    const ke = String(req.body.ke || '').toUpperCase();
    if (co.length !== Number(rule.m[5] || 20)) return sendError(res, 400, '1877');
    if (ke.length !== 32) return sendError(res, 400, '1876');

    // 签名验证：md5(tenantId + co + ip + apiKey)
    // 🔴 第三方调用方必须带 `?tid=<租户ID>`（与 publicTenant 的取租户口径一致），
    //    否则签名里的 tenantId 与服务端算出的不一致 → 403 '1875'。
    //    租户归属由 IP 白名单 + apiKey 双因子保证，apiKey 是租户自有密钥。
    const sign = crypto.createHash('md5').update(`${tenantId}${co}${clientIp}${apiKey}`).digest('hex').toUpperCase();
    if (ke !== sign) return sendError(res, 403, '1875');

    if (!verifyTraceCode(co, rule)) return sendError(res, 400, '1899');

    const parsed = parseTraceCode(co, rule);
    const batch = findBatchBySegment(db, tenantId, parsed.batch, rule);
    if (!batch) return sendError(res, 400, '1866');

    // IP 属地查询（可选）
    let province = '', city = '';
    if (clientIp && globalThis.traceIpAdapter) {
      try {
        const ipInfo = globalThis.traceIpAdapter(clientIp);
        province = ipInfo?.province || '';
        city = ipInfo?.city || '';
      } catch {}
    }

    // 记录查询（事务口径同公开验真：db.exec('BEGIN'/'COMMIT'/'ROLLBACK')）
    db.exec('BEGIN');
    try {
      const existing = db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND code = ?').get(tenantId, co);
      if (!existing) {
        db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, entry_type, num, queried_at, openid, user_id, ip, hdtype, is_valid, created_at, updated_at)
          VALUES (?, ?, ?, '0', 1, datetime('now'), '', 0, ?, 88, 1, datetime('now'), datetime('now'))`)
          .run(tenantId, batch.id, co, clientIp);
        db.prepare('UPDATE trace_batches SET rcon = rcon + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, batch.id);
      }
      db.prepare(`INSERT INTO trace_histories (tenant_id, type, summary, uid, openid, ip, remark, created_at)
        VALUES (?, 0, ?, 0, '', ?, ?, datetime('now'))`)
        .run(tenantId, co, clientIp, `API查询：${province}·${city}`);
      db.exec('COMMIT');
    } catch (txErr) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      throw txErr;
    }

    return res.json({
      content: 0,
      no: 1,
      co,
      pro: { name: batch.product, pic: batch.banner, link: batch.buy_link },
      title: settings.suc_one || '验证通过',
      text: [batch.product, batch.factory, batch.brand].filter(Boolean),
      source: [],
      history: [],
    });
  });

  // 奖品/红包领取（原 doMobileGets）
  router.post('/public/claim', (req, res) => {
    const tenantId = publicTenant(req);
    const { settings } = getSettings(db, tenantId);
    const recordId = Number(req.body.id || 0);
    const sj = String(req.body.sj || '').trim(); // 手机号
    const { openid } = actorOf(req);

    if (!recordId) return sendError(res, 400, '参数出错！');
    const record = db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND id = ?').get(tenantId, recordId);
    if (!record) return sendError(res, 400, '参数出错！');
    if (Number(record.is_rewarded) === 1) return sendError(res, 400, '奖品已经发放，请不要重复领奖！');

    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(tenantId, record.batch_id);
    if (!batch) return sendError(res, 400, '批次不存在');
    const hd = safeJson(batch.caid_json, {});
    if (String(hd.red?.is) === '0') return sendError(res, 400, '活动出错！');

    // 手机号验证
    if (String(hd.red?.tp) === '1') {
      if (!/^1[3-9]\d{9}$/.test(sj)) return sendError(res, 400, '手机号格式不正确！');
      // 如需短信验证码，由目标平台提供 smsAdapter
      if (String(hd.red?.ic) === '1' && globalThis.traceSmsAdapter) {
        const smsOk = globalThis.traceSmsAdapter.verify(sj, String(req.body.smsma || ''));
        if (!smsOk) return sendError(res, 400, '手机验证码不正确！');
      }
    }

    // 发放红包
    if (String(record.credit_type) === 'credit9' && Number(record.fnum) > 0) {
      const adapters = globalThis.traceRewardAdapters || {};
      if (adapters.sendRedPacket) {
        const result = adapters.sendRedPacket({
          openid,
          amountCents: Number(record.fnum),
          recordId: record.id,
          settings,
          batch,
          config: hd.red || {},
        });
        if (result.ok) {
          db.prepare('UPDATE trace_codes SET is_rewarded = 1, tx = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
            .run(`${sj},${result.message || '发放成功'}`, tenantId, recordId);
          return res.json({ zt: 0, ts: '奖品发放成功！' });
        }
      }
    }

    return sendError(res, 400, settings.rednotx || '奖品发完了！');
  });

  // 奖品兑换/地址填写（原 doMobilegaidz）
  router.post('/public/exchange', (req, res) => {
    const tenantId = publicTenant(req);
    const orderId = Number(req.body.id || 0);
    const mm = String(req.body.mm || '').trim();

    if (!orderId || !mm) return sendError(res, 400, '参数出错！');

    // 订单表由目标平台提供，这里使用适配器
    const adapters = globalThis.traceOrderAdapters || {};
    if (!adapters.getOrder || !adapters.updateOrder) {
      return sendError(res, 501, '目标平台未配置订单适配器');
    }

    const order = adapters.getOrder(orderId, tenantId);
    if (!order || order.orderno !== mm) return sendError(res, 400, '参数出错！');
    if (String(order.status) !== '1') return sendError(res, 400, '参数出错！');

    const address = {
      tel: String(req.body.tel || '').trim(),
      consignee: String(req.body.consignee || '').trim(),
      province: String(req.body.province || '').trim(),
      city: String(req.body.city || '').trim(),
      district: String(req.body.district || '').trim(),
      address: String(req.body.address || '').trim(),
    };

    const result = adapters.updateOrder(orderId, tenantId, { ...address, status: '2', exchange_time: nowIso() });
    if (result.ok) {
      return res.json({ zt: 0, ts: '兑换成功！' });
    }
    return sendError(res, 400, result.message || '兑换失败！');
  });

  // 用户奖品列表（原 doMobilemygoods）
  router.get('/public/mygoods', (req, res) => {
    const tenantId = publicTenant(req);
    // 🔴 openid 优先取登录态（软认证解出的 platform_user），query/header 仅作兜底
    const { openid } = actorOf(req);
    if (!openid) return sendError(res, 401, '请先登录');

    const { page, pageSize, offset } = pageParams(req);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND openid = ? AND is_rewarded = 1`)
      .get(tenantId, openid).c;
    const list = db.prepare(`SELECT c.*, b.product, b.brand, b.logo FROM trace_codes c
      LEFT JOIN trace_batches b ON b.tenant_id = c.tenant_id AND b.id = c.batch_id
      WHERE c.tenant_id = ? AND c.openid = ? AND c.is_rewarded = 1
      ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(tenantId, openid, pageSize, offset);

    return res.json({ list, total, page, pageSize });
  });

  /**
   * 单码公开查询历史（交付物 api-contract.md §4 列的 GET /history）。
   *
   * 🔴 交付物前端封装里写了 traceHistory() 调 /public/history，但**后端从未实现该路由**
   *    → 运行必 404。本处补齐路由（不是删前端方法），保持交付契约完整。
   *
   * 🔴 隐私红线：公开查询历史**不返回 openid / ip / uid**，只给时间戳与备注，
   *    否则任何人都能通过一个防伪码反查消费者身份。
   */
  router.get('/public/history', (req, res) => {
    const tenantId = publicTenant(req);
    const code = cleanTraceCode(req.query.code || '');
    if (!code) return sendError(res, 400, '防伪码不能为空');

    const { settings } = getSettings(db, tenantId);
    const limit = Math.min(50, Math.max(1, Number(settings.history_limit || 10)));
    const list = db.prepare(`SELECT created_at, remark FROM trace_histories
      WHERE tenant_id = ? AND type = 0 AND summary = ?
      ORDER BY id DESC LIMIT ?`).all(tenantId, code, limit);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM trace_histories
      WHERE tenant_id = ? AND type = 0 AND summary = ?`).get(tenantId, code).c;

    return res.json({ list, total, code });
  });

  return router;
}

/**
 * 租户后台段（挂载时必须套 requireAuth）。
 * 挂载：app.use('/api/customer/trace', requireAuth, createTraceAdminRouter(db))
 * 路径：/api/customer/trace/*
 * 🔴 租户标识唯一来源 = req.user.customerId（requireTenant 守卫），所有 SQL 均带 tenant_id = ?
 */
export function createTraceAdminRouter(db) {
  const router = Router();
  router.use(requireTenant);

  /**
   * 应用授权校验（与 live/store 同一口径）。
   * 🔴 租户没开通「防伪溯源」应用（projects.solutions → solution_apps）时，
   *    即便拿到了 customer_token 也不该能读写 trace 数据 —— 否则应用中心看不到、
   *    租户却能直接敲 API 开通，属于越权。
   */
  router.use((req, res, next) => {
    if (!hasSolution(db, req.traceTenantId, 'trace')) {
      return sendError(res, 403, '未开通「防伪溯源」应用，请联系平台管理员开通');
    }
    return next();
  });

  router.get('/settings', (req, res) => {
    const { row, settings } = getSettings(db, req.traceTenantId);
    // 🔴 库存（cocom）是 trace_settings 的**独立列**，不在 settings_json 里 →
    //    必须取 row.cocom，否则前端永远看到 0。
    // 🔴 展示位的「接口密钥」是租户自己的凭据：库里存密文，**永不把密文送回浏览器**，
    //    只送 maskSecretValue 的脱敏串（前端原样回传 = 不修改，见 mergeSecretInput）。
    const slots = Array.isArray(settings.displaySlots) ? settings.displaySlots : [];
    const view = {
      ...settings,
      displaySlots: slots.map((s) => {
        const { keyCipher, ...rest } = s || {};
        return { ...rest, accessKey: maskSecretValue(readSecret(keyCipher)) };
      }),
    };
    return res.json({ settings: view, cocom: Number(row?.cocom ?? 0) });
  });

  router.put('/settings', (req, res) => {
    try {
      const body = req.body?.settings || req.body || {};
      const patch = { ...(body && typeof body === 'object' ? body : {}) };
      const prev = getSettings(db, req.traceTenantId).settings || {};
      const prevSlots = Array.isArray(prev.displaySlots) ? prev.displaySlots : [];
      const submitted = Array.isArray(patch.displaySlots) ? patch.displaySlots : [];
      // 🔴 顺序不能反：先归一化会让明文密钥被当普通字段透传进库（**明文落库**），
      //    所以先把密钥轮成密文，再交给归一化（归一化对密文只做不透明透传）。
      const staged = submitted.map((raw, i) => {
        const one = raw && typeof raw === 'object' ? raw : {};
        const cipher = mergeSecretInput(String(one.accessKey || ''), String(prevSlots[i]?.keyCipher || ''));
        const { accessKey, ...rest } = one; // 明文不落库
        return { ...rest, keyCipher: cipher };
      });
      // 🔴 必须**整批**归一化：逐个调用会让「最多 8 个」的上限校验永远不成立
      //    （每次只看到 1 个），上限形同虚设。归一化也顺带剥掉多余字段。
      patch.displaySlots = normalizeDisplaySlots(staged);
      saveSettings(db, req.traceTenantId, patch);
      addHistory(db, req.traceTenantId, 1, 'setting', req, '更新防伪溯源设置');
      return res.json({ ok: true });
    } catch (e) {
      return sendError(res, 400, e.message || '设置保存失败');
    }
  });

  router.get('/code-rule', (req, res) => {
    const { rule } = getRule(db, req.traceTenantId);
    return res.json({ rule });
  });

  router.put('/code-rule', (req, res) => {
    try {
      const rule = saveRule(db, req.traceTenantId, req.body || {});
      addHistory(db, req.traceTenantId, 1, 'code-rule', req, '更新防伪码制');
      return res.json({ rule });
    } catch (e) {
      return sendError(res, 400, e.message || '码制保存失败');
    }
  });

  router.get('/batches', (req, res) => {
    const { page, pageSize, offset } = pageParams(req);
    const keyword = `%${String(req.query.keyword || '').trim()}%`;
    const total = db.prepare(`SELECT COUNT(*) AS c FROM trace_batches WHERE tenant_id = ? AND (batch LIKE ? OR product LIKE ? OR factory LIKE ? OR brand LIKE ?)`)
      .get(req.traceTenantId, keyword, keyword, keyword, keyword).c;
    const list = db.prepare(`SELECT * FROM trace_batches WHERE tenant_id = ? AND (batch LIKE ? OR product LIKE ? OR factory LIKE ? OR brand LIKE ?)
      ORDER BY id DESC LIMIT ? OFFSET ?`).all(req.traceTenantId, keyword, keyword, keyword, keyword, pageSize, offset);
    return res.json({ list, total, page, pageSize });
  });

  router.post('/batches', (req, res) => {
    const b = req.body || {};
    if (!String(b.batch || '').trim()) return sendError(res, 400, '批次号不能为空');
    // 🔴 批次号必须按码制 m[2] 归一（长度 / 字符集），否则 C 端验真时切出的批次段
    //    与 trace_batches.batch 对不上 → 生成出来的码永远「不存在或已失效」。
    const normalized = normalizeBatchNo(db, req.traceTenantId, b.batch);
    if (normalized.error) return sendError(res, 400, normalized.error);
    const { rule } = getRule(db, req.traceTenantId);
    try {
      const info = db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, origin, logo, banner, video, buy_link, province, city, district, inttype, is_chuanhuo, integral, caid_json, toshop_json, wailink_json, params_json, validity, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`)
        .run(req.traceTenantId, String(b.m1 || rule.m[1] || '').toUpperCase(), normalized.batch, String(b.product || ''), String(b.factory || ''), String(b.brand || ''), String(b.origin || ''), String(b.logo || ''), String(b.banner || ''), String(b.video || ''), String(b.buyLink || ''), String(b.province || ''), String(b.city || ''), String(b.district || ''), Number(b.inttype || 0), Number(b.isChuanhuo || 0), Number(b.integral || 0), JSON.stringify(b.caid || {}), JSON.stringify(b.toshop || {}), JSON.stringify(b.wailink || {}), JSON.stringify(b.params || []), Number(b.validity || 0));
      addHistory(db, req.traceTenantId, 1, normalized.batch, req, '新增防伪批次');
      return res.json({ id: Number(info.lastInsertRowid), batch: normalized.batch });
    } catch (e) {
      return sendError(res, 400, e.message.includes('UNIQUE') ? '批次号已存在' : '批次保存失败');
    }
  });

  router.get('/batches/:id', (req, res) => {
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, Number(req.params.id));
    if (!batch) return sendError(res, 404, '批次不存在');
    return res.json({ batch });
  });

  router.put('/batches/:id', (req, res) => {
    const id = Number(req.params.id);
    const exists = db.prepare('SELECT id FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!exists) return sendError(res, 404, '批次不存在');
    const b = req.body || {};
    db.prepare(`UPDATE trace_batches SET product = ?, factory = ?, brand = ?, origin = ?, logo = ?, banner = ?, video = ?, buy_link = ?, province = ?, city = ?, district = ?, inttype = ?, is_chuanhuo = ?, integral = ?, caid_json = ?, toshop_json = ?, wailink_json = ?, params_json = ?, validity = ?, is_active = ?, updated_at = datetime('now')
      WHERE tenant_id = ? AND id = ?`)
      .run(String(b.product || ''), String(b.factory || ''), String(b.brand || ''), String(b.origin || ''), String(b.logo || ''), String(b.banner || ''), String(b.video || ''), String(b.buyLink || ''), String(b.province || ''), String(b.city || ''), String(b.district || ''), Number(b.inttype || 0), Number(b.isChuanhuo || 0), Number(b.integral || 0), JSON.stringify(b.caid || {}), JSON.stringify(b.toshop || {}), JSON.stringify(b.wailink || {}), JSON.stringify(b.params || []), Number(b.validity || 0), Number(b.isActive ?? 1), req.traceTenantId, id);
    addHistory(db, req.traceTenantId, 1, String(id), req, '编辑防伪批次');
    return res.json({ ok: true });
  });

  router.delete('/batches/:id', (req, res) => {
    const id = Number(req.params.id);
    // 🔴 COUNT(*) 的别名已经在 .get(...).c 上取过一次了，
    //    再写 Number(used.c) 就是 Number(undefined) = NaN，NaN > 0 恒 false
    //    → 软删除保护从不触发 → 有码的批次被硬删，码变孤儿（查不到批次 → 码全部失效）。
    const used = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND batch_id = ?').get(req.traceTenantId, id).c;
    if (Number(used) > 0) {
      db.prepare('UPDATE trace_batches SET is_active = 0, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(req.traceTenantId, id);
      return res.json({ ok: true, softDeleted: true });
    }
    db.prepare('DELETE FROM trace_batch_rules WHERE tenant_id = ? AND batch_id = ?').run(req.traceTenantId, id);
    db.prepare('DELETE FROM trace_batches WHERE tenant_id = ? AND id = ?').run(req.traceTenantId, id);
    addHistory(db, req.traceTenantId, 1, String(id), req, '删除防伪批次');
    return res.json({ ok: true });
  });

  router.post('/batches/:id/generate-codes-legacy', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    const { rule } = getRule(db, req.traceTenantId);
    const count = Math.min(100000, Math.max(1, Number(req.body.codeno || req.body.count || 1)));
    let created = 0;
    const insert = db.prepare(`INSERT OR IGNORE INTO trace_codes (tenant_id, batch_id, code, entry_type, num, is_valid, created_at, updated_at)
      VALUES (?, ?, ?, '0', 0, 1, datetime('now'), datetime('now'))`);
    db.exec('BEGIN');
    try {
      const start = Number(db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND batch_id = ?').get(req.traceTenantId, id).c) + 1;
      for (let i = 0; i < count; i += 1) {
        const code = buildTraceCodeFromSerial(batch.batch, String(start + i), rule);
        created += insert.run(req.traceTenantId, id, code).changes;
      }
      const total = Number(db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND batch_id = ?').get(req.traceTenantId, id).c);
      db.prepare('UPDATE trace_batches SET num = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(total, req.traceTenantId, id);
      db.exec('COMMIT');
    } catch (txErr) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      throw txErr;
    }
    addHistory(db, req.traceTenantId, 1, batch.batch, req, `生成防伪码 ${created} 个`);
    return res.json({ ok: true, created });
  });

  router.post('/batches/:id/generate-codes', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    const { rule } = getRule(db, req.traceTenantId);
    const { settings } = getSettings(db, req.traceTenantId);
    try {
      const pkg = generateTracePackage({
        db,
        tenantId: req.traceTenantId,
        batch,
        rule,
        settings,
        codetype: req.body.codetype ?? req.query.codetype ?? 1,
        codeno: req.body.codeno ?? req.query.codeno ?? 1,
        codenot: req.body.codenot ?? req.query.codenot ?? 0,
        siteRoot: req.body.siteRoot || settings.siteroot || '',
        origin: `${req.protocol}://${req.get('host')}`,
      });
      addHistory(db, req.traceTenantId, 1, `${rule.m[1]}${batch.batch}`, req, `生成防伪码：(${req.body.codetype ?? req.query.codetype ?? 1}) 共 ${pkg.created} 条`);
      return res.json({ ok: true, created: pkg.created, sets: pkg.sets || 0, filename: pkg.filename, contentType: pkg.contentType, content: pkg.content });
    } catch (e) {
      return sendError(res, 400, e.message || '生成防伪码失败');
    }
  });

  router.get('/batches/:id/export', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    if (String(req.query.format || 'txt') === 'zip') return sendError(res, 501, 'zip 导出需目标平台提供压缩适配器，当前先交付 txt/html 内容');
    const { rule } = getRule(db, req.traceTenantId);
    const { settings } = getSettings(db, req.traceTenantId);
    try {
      const pkg = generateTracePackage({
        db,
        tenantId: req.traceTenantId,
        batch,
        rule,
        settings,
        codetype: req.query.codetype ?? 1,
        codeno: req.query.codeno ?? 100,
        codenot: req.query.codenot ?? 0,
        siteRoot: settings.siteroot || '',
        origin: `${req.protocol}://${req.get('host')}`,
      });
      addHistory(db, req.traceTenantId, 1, `${rule.m[1]}${batch.batch}`, req, `下载防伪码数据包：${pkg.filename}`);
      res.setHeader('Content-Type', pkg.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${pkg.filename}"`);
      return res.send(pkg.content);
    } catch (e) {
      return sendError(res, 400, e.message || '导出防伪码失败');
    }
  });

  router.post('/batches/:id/activate', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('UPDATE trace_batches SET is_active = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
      .run(Number(req.body.isActive ? 1 : 0), req.traceTenantId, id);
    return res.json({ ok: true });
  });

  router.get('/codes', (req, res) => {
    const { page, pageSize, offset } = pageParams(req);
    const code = `%${String(req.query.code || '').trim()}%`;
    const total = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND code LIKE ?').get(req.traceTenantId, code).c;
    const list = db.prepare(`SELECT c.*, b.batch, b.product FROM trace_codes c LEFT JOIN trace_batches b ON b.tenant_id = c.tenant_id AND b.id = c.batch_id
      WHERE c.tenant_id = ? AND c.code LIKE ? ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(req.traceTenantId, code, pageSize, offset);
    return res.json({ list, total, page, pageSize });
  });

  router.post('/codes/:id/mark-error', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('UPDATE trace_codes SET is_err = 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(req.traceTenantId, id);
    addHistory(db, req.traceTenantId, 1, String(id), req, `标记异常：${String(req.body.reason || '')}`);
    return res.json({ ok: true });
  });

  router.get('/histories', (req, res) => {
    const { page, pageSize, offset } = pageParams(req);
    const summary = `%${String(req.query.summary || '').trim()}%`;
    const type = Number(req.query.type ?? -1);
    const whereType = type >= 0 ? 'AND type = ?' : '';
    const params = type >= 0 ? [req.traceTenantId, summary, type, pageSize, offset] : [req.traceTenantId, summary, pageSize, offset];
    const list = db.prepare(`SELECT * FROM trace_histories WHERE tenant_id = ? AND summary LIKE ? ${whereType} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params);
    const totalParams = type >= 0 ? [req.traceTenantId, summary, type] : [req.traceTenantId, summary];
    const total = db.prepare(`SELECT COUNT(*) AS c FROM trace_histories WHERE tenant_id = ? AND summary LIKE ? ${whereType}`).get(...totalParams).c;
    return res.json({ list, total, page, pageSize });
  });

  router.get('/wrong-attempts', (req, res) => {
    const { page, pageSize, offset } = pageParams(req);
    const total = db.prepare('SELECT COUNT(*) AS c FROM trace_wrong_attempts WHERE tenant_id = ?').get(req.traceTenantId).c;
    const list = db.prepare('SELECT * FROM trace_wrong_attempts WHERE tenant_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(req.traceTenantId, pageSize, offset);
    return res.json({ list, total, page, pageSize });
  });

  router.get('/stats/summary', (req, res) => {
    const tenantId = req.traceTenantId;
    const totalQueries = db.prepare('SELECT COALESCE(SUM(num), 0) AS c FROM trace_codes WHERE tenant_id = ?').get(tenantId).c;
    const totalCodes = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ?').get(tenantId).c;
    const errorCodes = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND is_err = 1').get(tenantId).c;
    const batches = db.prepare('SELECT COUNT(*) AS c FROM trace_batches WHERE tenant_id = ?').get(tenantId).c;
    return res.json({ totalQueries: Number(totalQueries), totalCodes: Number(totalCodes), errorCodes: Number(errorCodes), batches: Number(batches) });
  });

  router.get('/stats/region', (req, res) => {
    const level = req.query.level === 'city' ? 'city' : 'province';
    const list = db.prepare(`SELECT ${level} AS name, COUNT(*) AS value FROM trace_codes WHERE tenant_id = ? GROUP BY ${level} ORDER BY value DESC LIMIT 50`).all(req.traceTenantId);
    return res.json({ list });
  });

  router.get('/stats/trend', (req, res) => {
    const list = db.prepare(`SELECT substr(created_at, 1, 10) AS name, COUNT(*) AS value FROM trace_histories WHERE tenant_id = ? AND type = 0 GROUP BY substr(created_at, 1, 10) ORDER BY name ASC`).all(req.traceTenantId);
    return res.json({ list });
  });

  // 防伪码库存充值（原 chong）
  router.post('/recharge', (req, res) => {
    const amount = Number(req.body.amount || 0);
    if (amount <= 0) return sendError(res, 400, '充值数量必须大于 0');

    // 🔴 库存存在 trace_settings.cocom **独立列**（traceGenerate.deductCocom 也是读这一列），
    //    原实现读 settings.cocom（settings_json 里的键，恒 undefined）→ current 恒 0
    //    → 每次充值都覆盖成 amount 而非累加，充值多次只剩最后一次的量。
    const { row } = getSettings(db, req.traceTenantId);
    const current = Number(row?.cocom ?? 0);
    const next = current === -888 ? -888 : current + amount;

    db.prepare(`INSERT INTO trace_settings (tenant_id, cocom, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET cocom = ?, updated_at = datetime('now')`)
      .run(req.traceTenantId, next, next);

    addHistory(db, req.traceTenantId, 1, 'recharge', req, `充值防伪码库存：+${amount}，当前 ${next === -888 ? '不限' : next}`);
    return res.json({ ok: true, cocom: next });
  });

  // 商品关联配置（溯源页「查看商品」跳哪儿）。开关值落在 settings.isint，随 PUT /settings 保存。
  // 🔴 只列本平台真实存在的来源：外部第三方商城的商品表在我们库里根本没有，
  //    列进下拉 = 后台能选、服务端零消费的「空头权益」，不做。
  router.get('/shop-integration', (req, res) => {
    const { settings } = getSettings(db, req.traceTenantId);
    const sources = [
      { value: 0, label: '不关联商品', table: '' },
      { value: 1, label: '本平台商城商品', table: 'goods' },
      { value: 2, label: '外部商品链接', table: '' },
    ];
    return res.json({ current: Number(settings.isint || 0), sources });
  });

  return router;
}

