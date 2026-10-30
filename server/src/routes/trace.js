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
import { buildTraceCodeFromSerial, canonicalBatchSegment, cleanTraceCode, DEFAULT_CODESET, isDemoSerial, parseTraceCode, randomTraceKeys, serializeTraceRule, parseTraceRule, verifyTraceCode } from '../services/traceCode.js';
import { generateTracePackage } from '../services/traceGenerate.js';
import { makeZip } from '../services/zip.js';
import { normalizeDisplaySlots, pickDisplaySlots, slotsEnabled, substituteSlotPlaceholders } from '../services/traceSlots.js';
import { checkQueryQuota, registerTraceQuery } from '../services/traceQuery.js';
import { buildScanQueryView, normalizeScanMode, normalizeTraceSwitch } from '../services/traceScanMode.js';
import { issueOpenidTicket, readOpenidTicket } from '../services/traceOauth.js';
import { decryptSecret, encryptSecret, maskSecretValue, mergeSecretInput, readSecret } from '../crypto.js';
import { applyTraceReward } from '../services/traceReward.js';
import { getPlatformSettings } from './tracePlatform.js';
import { absoluteUrl, publicBaseUrl } from '../utils/publicUrl.js';
import { countTraceCodesGenerated, isTraceBatchActivated } from '../db.js';
import { WxMpService, showQrImageUrl } from '../services/wx-mp.js';
import { WxComponentService } from '../services/wx-component.js';

// 🔴 extra：可选的**结构化补充字段**（与 error 文案并存）。
//    用途：给前端可编程的判据（如闸门拦截时带 gateRequired=true），
//    避免前端靠字符串匹配文案判断（改一个字就失效）。
function sendError(res, status, error, extra) {
  return res.status(status).json({ error, ...(extra && typeof extra === 'object' ? extra : {}) });
}

/**
 * 微信「ticket 换图片」代理专用错误：把微信的 404（= ticket 失效/过期）翻译成人话，
 * 并回落正确的 HTTP 状态（404），让前端能据此「请重新生成」而不是当成网关 502 误报。
 * 其它非 2xx 仍按 502（上游网关/网络问题）。
 */
function sendWxQrError(res, upstreamStatus) {
  if (Number(upstreamStatus) === 404) {
    return sendError(res, 404, '二维码已失效或已过期，请重新生成');
  }
  return sendError(res, 502, `微信二维码接口返回 ${upstreamStatus}`);
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

/**
 * 🔴 P3 独立活动广告位（全局活动设置），与首页展示位互不干扰。
 *
 * 为什么不复用 displaySlots：展示位有「最多 8 个」「按展示条件挑选」等约束，且语义是
 *   「本租户通用推荐位」；活动广告位是「一次活动一张图 + 一个带参链接」，语义与展示位不同，
 *   强行复用会让两边都变形。所以单独一个 settings.activity 字段，C 端在结果海报下方渲染一张。
 *
 * 变量替换（对标「全局活动设置」的 linkkey + [FWM]/[KEY]）：
 *   [FWM] → 本次查询的防伪码（让活动落地页知道是哪个码点进来的）；
 *   [KEY] → 后台配置的 linkKey（活动专属标识 / 渠道参数）。
 * link / title 中的这两种占位符都会被替换，cover 是纯图片地址不替换。
 *
 * when：0=总是展示 / 1=仅首次查询展示 / 2=仅非首次查询展示（与展示位 SLOTWHEN 口径一致）。
 *
 * @returns {null|object} 未启用或按 when 不展示时返回 null；否则返回 { enabled, cover, title, link, when }
 */
function buildTraceActivity(activityCfg, code, isFirstQuery) {
  const cfg = activityCfg && typeof activityCfg === 'object' ? activityCfg : null;
  if (!cfg || !cfg.enabled) return null;
  const when = Number(cfg.when || 0);
  const show = when === 0 || (when === 1 && isFirstQuery) || (when === 2 && !isFirstQuery);
  if (!show) return null;
  const linkKey = String(cfg.linkKey || '');
  // 🔴 占位符大小写不敏感；只替换 link / title（cover 是图片 URL，含 [FWM] 没有语义）。
  const sub = (s) => String(s || '').replace(/\[FWM\]/gi, code).replace(/\[KEY\]/gi, linkKey);
  return {
    enabled: true,
    cover: String(cfg.cover || ''),
    title: sub(cfg.title || ''),
    link: sub(cfg.link || ''),
    when,
  };
}

function getRule(db, tenantId) {
  const row = db.prepare('SELECT * FROM trace_code_rules WHERE tenant_id = ?').get(tenantId);
  const rule = parseTraceRule(row?.rule_json);
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
    // 🔴 码制「是否已由用户确认」：系统给新租户播种的随机 k1–k4 未经过用户确认（is_confirmed=0），
    //    批次管理页据此显示软引导，提示用户去核一遍再生成。反馈值只从**码制行**读，
    //    绝不从 settings 读 —— 那是另一张表，混读会读到别的租户的口径。
    confirmed: Number(row?.is_confirmed ?? 0) === 1,
    // 🔴 P0 印刷锁定态：locked_at 非空 = 本租户已**正式印刷过**防伪码 →
    //    k1~k4（校验密钥）与 m1~m5（码结构）都不可再改。
    //    空串 = 未锁定（存量租户升级后一律未锁定，锁定只由「正式生成」这个动作触发）。
    locked: Boolean(String(row?.locked_at || '').trim()),
    lockedAt: String(row?.locked_at || '').trim(),
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
  // 🔴 一次性取当前码制（getRule 会把 k 逐格回落到默认值）：
  //    后面既要比对差异，又要拿 prev.k[5] 当 k5 的回落值 —— 分两次取会拿到两个快照，
  //    并发保存时两个快照不一致 → 差异比对失真。
  const cur = getRule(db, tenantId);
  const prev = cur.rule;
  const m1 = String(body.m1 || '').toUpperCase();
  if (m1.length !== 2) throw new Error('防伪码前缀 m1 必须为 2 位');
  const k = {};
  for (let i = 1; i <= 5; i += 1) {
    // 🔴 k5 是系统保留位（1 位），租户不可改。body 若不传，回落到「已存的 k5」或默认 '7'，
    //    绝不能用空串覆盖 —— 否则 k5 被清空会让已印码按 1 位 k5 算出来的校验位全错位。
    if (i === 5) {
      k[5] = String(body.k5 || prev?.k?.[5] || DEFAULT_CODESET.k[5] || '7');
      continue;
    }
    k[i] = String(body[`k${i}`] || '');
    if (k[i].length !== 10) throw new Error(`k${i} 必须为 10 位`);
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
  const structuralChanged = ['1', '2', '3', '4', '5'].some((key) => String(prev.m[key]) !== String(m[key]));
  // 🔴 k1~k4 是校验位的运算密钥（不是"字符集偏好"）：改 k → 已印码按旧 k 算出的校验位
  //    与新 k 算出的对不上 → verifyTraceCode 全量失败 → 消费者扫出来全是「已失效」。
  //    这条以前是漏的（注释里写"唯一能安全改的是 k"，恰恰说反了）。
  const keyChanged = [1, 2, 3, 4].some((i) => String(prev.k?.[i] ?? '') !== String(k[i]));

  if (cur.locked) {
    // 🔴 P0 印刷锁定：已正式印刷 → 密钥与结构都不可改。
    //    边界：zdl（错误次数上限）与 publishNo 不影响已印码的验真结果 → 仍可改。
    const when = cur.lockedAt || '此前';
    if (keyChanged) {
      throw new Error(`码制已锁定（${when} 已正式印刷防伪码）：校验字符集 k1~k4 不能修改 —— 改了会让已印出去的码全部验真失败。如需继续，请新建租户。`);
    }
    if (structuralChanged) {
      throw new Error(`码制已锁定（${when} 已正式印刷防伪码）：前缀/批次号长度/流水号长度/校验位长度/总长不能修改 —— 改了会让已印出去的码全部失效。如需继续，请新建租户。`);
    }
  } else if (keyChanged || structuralChanged) {
    // 🔴 计数必须用 countTraceCodesGenerated：只数 trace_codes 的话「生成 500 个码、
    //    一个都还没被扫」时计数为 0 → 锁不生效 → 用户改完 m2，已印出去的 500 个码全废。
    const used = countTraceCodesGenerated(db, tenantId);
    if (used > 0) {
      if (keyChanged) {
        throw new Error(`该租户已生成 ${used} 个防伪码，校验字符集 k1~k4 不能再修改——改了会让已印出去的码全部验真失败。如需继续，请新建租户或先清理已有码`);
      }
      throw new Error(`该租户已生成 ${used} 个防伪码，不能再修改码制结构（前缀/批次号长度/流水号长度/校验位长度/总长）——改了会让已印出去的码全部失效。如需继续，请新建租户或先清理已有码`);
    }
  }
  const rule = {
    k,
    m,
    s: 0,
    zdl: Number(body.zdl || 10) || 10,
  };
  // 🔴 保存即确认：is_confirmed=1 让批次管理的软引导消失。
  //    之所以用独立标记而不是「行是否存在」：租户创建时就会播种一行随机码制，
  //    行存在 ≠ 用户看过 ≠ 用户确认过，拿行存在当判据会让引导永远不出现。
  db.prepare(`INSERT INTO trace_code_rules (tenant_id, m1, rule_json, publish_no, is_confirmed, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(tenant_id) DO UPDATE SET m1 = excluded.m1, rule_json = excluded.rule_json, publish_no = excluded.publish_no, is_confirmed = 1, updated_at = datetime('now')`)
    .run(tenantId, m1, serializeTraceRule(rule), String(body.publishNo || nowIso()));
  return rule;
}

/**
 * 🔴 生成防伪码前的批次可用性守卫（三条生成入口共用，禁止各写一套）。
 *
 * 为什么必须拦：C 端验真路径（/public/verify）对 is_active != 1 的批次直接判
 *   「防伪码不存在或已失效」。而生成路径原本只查批次存在 → 停用批次照样能生成出一整批
 *   消费者扫了必假的码：后台显示「生成成功 500 条」，客诉在扫码端才爆，且无法挽回
 *   （码已经印出去了）。所以必须在生成入口就把这条堵死。
 */
function guardBatchGenerable(res, batch) {
  if (!batch) {
    sendError(res, 404, '批次不存在');
    return false;
  }
  if (Number(batch.is_active) !== 1) {
    sendError(res, 400, '该批次已停用，不能生成防伪码（停用批次的码消费者扫码会提示已失效）。请先激活批次');
    return false;
  }
  return true;
}

function addHistory(db, tenantId, type, summary, req, remark = '') {
  db.prepare(`INSERT INTO trace_histories (tenant_id, type, summary, uid, openid, ip, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
    .run(tenantId, type, summary, Number(req.user?.id || req.body?.userId || 0), String(req.body?.openid || req.headers['x-openid'] || ''), String(req.ip || ''), remark);
}

/**
 * 🔴 批次激活落库（P2 先印后绑）。幂等：重复激活只更新来源与备注，不插重复行。
 * @param source 'admin'=租户后台点激活 / 'dealer'=经销商凭口令自助激活
 */
function activateTraceBatch(db, tenantId, batchId, source = 'admin', actor = '', remark = '') {
  db.prepare(`INSERT INTO trace_activations (tenant_id, batch_id, source, actor, remark, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tenant_id, batch_id) DO UPDATE SET
      source = excluded.source, actor = excluded.actor, remark = excluded.remark, created_at = excluded.created_at`)
    .run(Number(tenantId), Number(batchId), String(source), String(actor), String(remark));
  return true;
}

/**
 * 批次激活口令（8 位，去掉 0/O/1/I 等易混字符 → 线下口述不歧义）。
 * 用 crypto.randomBytes 而不是 Math.random：这是能开批次闸门的凭据，
 * 可预测 = 谁都能提前激活别人的批次。
 */
function makeActivationPin(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
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

  /**
   * 查询**之前**先问一嘴：这个商户当前用的是哪一档扫码查询方案。
   * 🔴 必须放在验真之前：先验真再去网页授权 → 授权回来页面重载会**再验一次**，
   *    而两次的 openid 不同（游客 vs 授权后）→ 21 秒去重窗口拦不住 → 查询次数虚高翻倍。
   *    这一档是不是需要授权，只能由服务端说了算（前端不该猜）。
   */
  router.get('/public/scan-mode', (req, res) => {
    const tenantId = publicTenant(req);
    const { settings } = getSettings(db, tenantId);
    const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(tenantId);
    return res.json({ scanMode: normalizeScanMode(settings.scanMode), oauthReady: Boolean(channel) });
  });

  // ===== 网页授权（取 openid，用于「结果必须由本人扫码才能拿到」） =====
  // 🔴 为什么必须服务端走一趟：openid 是身份凭据，前端直传 = 谁都能冒充谁。
  //    这里签发的 `oc` 是**服务端 AES 密文凭据**（见 services/traceOauth.js），
  //    前端只在后续请求里原样回传，改一个字符就失效。
  const OAUTH_COOKIE = 'trace_oauth';
  const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

  /** 只放行**本站相对路径**（防开放重定向：//evil.com 与 http://evil.com 一律拒绝）。 */
  function safeBackPath(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return '';
    if (!s.startsWith('/')) return '';
    if (s.startsWith('//')) return '';
    return s;
  }
  function readCookie(req, name) {
    const jar = String(req?.headers?.cookie || '');
    const hit = jar.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
  }
  function appendQuery(path, pairs) {
    return `${path}${path.includes('?') ? '&' : '?'}${pairs}`;
  }

  router.get('/public/wx-auth/start', (req, res) => {
    const tenantId = publicTenant(req);
    const back = safeBackPath(req.query.redirect);
    if (!back) return sendError(res, 400, '回调地址非法（必须是本站相对路径）');
    const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(tenantId);
    if (!channel) return sendError(res, 400, '该商户尚未配置公众号');

    // 🔴 state 防 CSRF：随机值存进 httpOnly cookie，回调时比对。
    //    少了这一步，攻击者可以拿自己授权过的 code 诱使受害者完成授权 → 串号。
    //    回跳地址也一并放进 cookie：不能信任回调 query 里的地址（那是外部输入）。
    const state = crypto.randomBytes(12).toString('hex');
    const jar = encryptSecret(JSON.stringify({ s: state, r: back, t: tenantId, e: Date.now() + OAUTH_STATE_TTL_MS }));
    res.cookie(OAUTH_COOKIE, jar, { httpOnly: true, sameSite: 'lax', maxAge: OAUTH_STATE_TTL_MS, path: '/' });
    const redirectUri = absoluteUrl(req, `/api/trace/public/wx-auth/callback?tid=${tenantId}`);
    const url = new WxMpService(db, new WxComponentService(db)).buildOauthUrl({ channel, redirectUri, state });
    return res.redirect(302, url);
  });

  router.get('/public/wx-auth/callback', async (req, res) => {
    const tenantId = publicTenant(req);
    const failed = (reason) => sendError(res, 400, reason);
    let jar = {};
    try {
      jar = JSON.parse(decryptSecret(readCookie(req, OAUTH_COOKIE)));
    } catch {
      return failed('授权会话已失效，请重新扫码查询');
    }
    // 🔴 清掉一次性 cookie，避免同一个 state 被反复使用
    res.clearCookie(OAUTH_COOKIE, { path: '/' });

    const state = String(req.query.state || '');
    if (!jar.s || state !== jar.s) return failed('授权校验失败（state 不匹配），请重新扫码查询');
    if (Number(jar.t) !== Number(tenantId)) return failed('授权会话与当前商户不一致，请重新扫码查询');
    if (!jar.e || Number(jar.e) < Date.now()) return failed('授权已超时，请重新扫码查询');
    if (!req.query.code) return failed('未取得授权 code');

    const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(tenantId);
    if (!channel) return failed('该商户尚未配置公众号');
    try {
      const wxMp = new WxMpService(db, new WxComponentService(db));
      const openid = await wxMp.exchangeOauthOpenid(channel, String(req.query.code));
      const ticket = issueOpenidTicket(tenantId, openid);
      return res.redirect(302, appendQuery(String(jar.r), `oc=${encodeURIComponent(ticket)}`));
    } catch (e) {
      // 🔴 授权失败不能让消费者卡死：带标记回跳，页面按「未授权」继续出结果（只是不做强绑定）。
      return res.redirect(302, appendQuery(String(jar.r), 'oafail=1'));
    }
  });

  /**
   * 查询时**现场**生成一张短时效场景码（供溯源页引导「长按识别」）。
   *
   * 🔴 为什么挂在公开段：扫码的是消费者，几千几万人都不可能先登录；
   *    挂在 `/api/customer` 那段（要 JWT）就永远到不了他们手上。
   *    租户归属只认 URL 上的 ?tid=（publicTenant），与 /public/verify 同口径。
   *
   * 🔴 幂等（60 秒内复用同一张）：页面刷新、反复打开都不该每次烧一个微信额度，
   *    而且图本来也不该变 —— 图一换，用户手里正在长按的那张就废了。
   *    短时效 + 一次有效的兜底语义不受影响。
   */
  router.post('/public/mp-scene', async (req, res) => {
    const tenantId = publicTenant(req);
    const code = String(req.body?.code || req.query?.code || '').trim().toUpperCase();
    if (!code) return sendError(res, 400, '缺少防伪码');
    const { rule } = getRule(db, tenantId);
    const parsed = parseTraceCode(code, rule);
    if (!findBatchBySegment(db, tenantId, parsed.batch, rule)) return sendError(res, 404, '防伪码不存在');
    const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(tenantId);
    if (!channel) return sendError(res, 400, '该商户尚未配置公众号');

    // 🔴 openid 只从**服务端签发的凭据**里解：前端传 openid 一律不认。
    //    拿到就做「本人绑定」（换人扫拒绝），拿不到就靠短时效 + 一次有效兜底。
    const openid = readOpenidTicket(req.body?.oc || req.query?.oc || '', tenantId);
    // 🔴 复用必须同 openid：否则甲开的页面可能复用到乙生成过的那张 → 绑定形同虚设。
    const fresh = db.prepare(`SELECT * FROM trace_mp_scenes
      WHERE tenant_id = ? AND code = ? AND openid = ? AND used_at IS NULL AND expires_at > datetime('now') AND created_at > datetime('now', '-60 seconds')
      ORDER BY id DESC LIMIT 1`).get(tenantId, code, openid);
    if (fresh) {
      return res.json({
        ok: true, sceneId: fresh.scene_id, code, ticket: fresh.ticket, expiresAt: fresh.expires_at, reused: true,
        imageUrl: `/api/trace/public/mp-scene/image?tid=${tenantId}&scene=${fresh.scene_id}`,
      });
    }
    try {
      const wxMp = new WxMpService(db, new WxComponentService(db));
      const scene = await wxMp.createTraceSceneQr(channel, code, openid, Number(req.body?.ttl) || 1800);
      return res.json({
        ok: true, ...scene, reused: false, bound: openid ? 1 : 0,
        // 🔴 回同源地址而非微信 CDN 地址：微信图片站有防盗链，前端直连大概率是空白图。
        imageUrl: `/api/trace/public/mp-scene/image?tid=${tenantId}&scene=${scene.sceneId}`,
      });
    } catch (e) {
      return sendError(res, 400, e.message || '生成引导二维码失败');
    }
  });

  /**
   * 临时场景码图片代理（服务端拉微信图片再转发，同源返回给前端）。
   * 🔴 只在**本租户自己生成过的**行里按 scene_id 命中才代理：
   *     ticket 本身就是外部不可信输入，不做成"任意 ticket 都能代理"（会成为 SSRF 跳板）。
   */
  router.get('/public/mp-scene/image', async (req, res) => {
    const tenantId = publicTenant(req);
    const sceneId = Number(req.query.scene || 0);
    if (!sceneId) return sendError(res, 400, '缺少 scene');
    const row = db.prepare('SELECT * FROM trace_mp_scenes WHERE tenant_id = ? AND scene_id = ?').get(tenantId, sceneId);
    if (!row || !row.ticket) return sendError(res, 404, '二维码不存在或已过期');
    try {
      const upstream = await fetch(showQrImageUrl(row.ticket));
      if (!upstream.ok) return sendWxQrError(res, upstream.status);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.send(buf);
    } catch (e) {
      return sendError(res, 502, e.message || '获取二维码图片失败');
    }
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
    const actor = actorOf(req);
    // 🔴 网页授权凭据优先：它是服务端签发的，比登录态/body 里的 openid 更可信；
    //    没有凭据时回落到原口径（登录态优先，body 兜底）。
    const ticketOpenid = readOpenidTicket(String(req.body?.oc || ''), tenantId);
    const openid = ticketOpenid || actor.openid;
    const userId = actor.userId;
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

    // 🔴 P2 激活闸门（先印后绑）：批次未被激活（经销商扫码绑定）之前，
    //    消费者扫码只得到一句引导语，看不到任何溯源详情。
    //    闸门必须放在**写查询记录之前** —— 未激活的批次不该把「查询次数」涨上去，
    //    否则租户会看到「货还没发出去，怎么已经有人查了」的假数据。
    //    开关复用后台已有的「码激活」(settings.isjihuo)，此前它是零消费点的空开关。
    if (Number(settings.isjihuo || 0) === 1 && !isTraceBatchActivated(db, tenantId, batch.id)) {
      // 🔴 带结构化标记 gateRequired=true：C 端据此显示「去激活批次」入口。
      //    只回文案的话前端只能靠字符串匹配 → 改一个字就失效（脆）。
      return sendError(res, 403, '该批次尚未激活，请联系经销商扫码激活后再查询溯源信息', { gateRequired: true, batchNo: batch.batch });
    }

    // 🔴 配额与计数都走 services/traceQuery.js 的唯一实现 —— 公众号回复通道
    //    （services/wx-mp.js）写的是同一组计数器，绝不能各写一份。
    const quotaMsg = checkQueryQuota({ settings, batch, record });
    if (quotaMsg) return sendError(res, 400, quotaMsg);

    const reg = registerTraceQuery({
      db,
      tenantId,
      code,
      batch,
      record,
      openid,
      userId,
      ip,
      entryType,
      rule,
      serial: parsed.serial,
    });
    record = reg.record;
    batch = reg.batch;

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
      // 🔴 P1 试印码识别：流水号落在「顶部预留段」→ 明确告诉 C 端这是演示码，
      //    不让试印品冒充正品（试印包流入市场时，消费者一眼能分清）。
      demo: isDemoSerial(parsed.serial, rule),
      // 🔴 首页展示位：按「展示条件 + 本次查询态」挑出本次该渲染的位。
      //    数量上限 8 是**我们自定的产品上限**（≠ 微信被动回复的 1 条上限，见 traceSlots.js）。
      //    isTopQueryer = 本次访问人是该码的首位查询人；游客（无 openid）恒判非首位。
      // 🔴 必须在这里剥掉 keyCipher：展示位是公开接口下发的，密文一旦出网
      //    等于把租户的接口凭据交给任何人（拿到密文 + 我们服务的解密能力即可还原）。
      // 🔴 展示位总开关（slotsEnabled=0）→ 整个区块不下发（后台关掉即彻底不出现）。
      // 🔴 链接里的 {CODE}/{TID} 在这里替换成真实值 —— 服务端替换是唯一出处，
      //    前端不再做（前端也不知道该码值；以前 C 端拿到的还是字面量 {CODE}，点必坏）。
      slots: (slotsEnabled(settings) ? pickDisplaySlots(settings.displaySlots || [], {
        isFirstQuery: Number(record.num || 0) <= 1,
        isTopQueryer: Boolean(record.openid) && record.openid === openid,
      }) : []).map(({ keyCipher, ...rest }) => ({
        // 🔴 authKey 是**要明文下发**的（拼进跳转链接给外部接口验签），不是凭据，
        //    所以只剥 keyCipher（接口密钥密文）；鉴权码留着给占位符替换与前端展示。
        ...rest,
        title: substituteSlotPlaceholders(rest.title, { code, tenantId, authKey: rest.authKey }),
        link: substituteSlotPlaceholders(rest.link, { code, tenantId, authKey: rest.authKey }),
      })),
      num: Number(record.num || 0),
      // 🔴 当前「扫码查询方案」：C 端据此决定是否渲染「长按识别、由公众号推送结果」引导。
      //    取值已在服务端白名单归一（traceScanMode），前端只做相等判断，不认魔法字符串以外的东西。
      // 🔴 P3 按批次冻结：scan_mode_follow=1（默认跟随）→ 用当前全局设置；
      //    =0（冻结）→ 用本批次出码时记录的模式 print_scan_mode（空则回落当前，保留今天行为）。
      scanMode: Number(batch.scan_mode_follow ?? 1) === 1
        ? normalizeScanMode(settings.scanMode)
        : normalizeScanMode(batch.print_scan_mode || settings.scanMode),
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
        // 🔴 C 端提示是**按查询次数分档**的（首次/二次/三次及以后/超限），不是首查二选一。
        //    之前只下发 sucOne/sucTwo → 第 35 次查询也只能落到「二次查询提示」（用户反馈的真 bug）。
        //    这里补齐三次及以后(sucThree)、超限(conMsg) 与上限阈值(upperlimit，0=不限制)。
        sucThree: settings.suc_three || '',
        conMsg: settings.con_msg || '',
        upperlimit: Number(settings.upperlimit || 0),
        ftel: settings.ftel || '',
        dtel: settings.dtel || '',
        script: settings.script || '',
      },
      // 🔴 P3 独立活动广告位（不复用首页展示位）：服务端按 [FWM]→防伪码 / [KEY]→linkKey 替换后下发。
      activity: buildTraceActivity(settings.activity, code, Number(record.num || 0) <= 1),
    });
  });

  // ==================== 公开端点（无需登录） ====================

  // 第三方 API 验证（原 doMobilea）
  router.post('/public/api/verify', (req, res) => {
    const tenantId = publicTenant(req);
    const { settings } = getSettings(db, tenantId);
    const { rule } = getRule(db, tenantId);

    // IP 白名单校验
    // 🔴 平台级 API 授权优先：平台在总后台配置的 IP 白名单 + 通信密钥；
    //    平台未配置时回落到租户自有 settings.api（兼容历史租户自配，避免一刀切断掉已对接的第三方）。
    const platform = getPlatformSettings(db);
    const pApi = platform.config?.apiAuth || {};
    const usePlatformApi = Array.isArray(pApi.allowedIps) && pApi.allowedIps.length > 0 && !!pApi.commKeyCipher;
    const allowedIps = usePlatformApi
      ? pApi.allowedIps
      : String(settings.api?.ip || '').split(',').map((s) => s.trim()).filter(Boolean);
    const apiKey = usePlatformApi ? readSecret(pApi.commKeyCipher) : String(settings.api?.key || '');
    if (allowedIps.length < 1 || apiKey.length < 20) return sendError(res, 403, '1888');
    const clientIp = String(req.ip || req.body.ip || '');
    if (!allowedIps.includes(clientIp)) return sendError(res, 403, '1839');

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

    // 🔴 P2 激活闸门：第三方 API 通道同样受闸门约束 ——
    //    否则 API 通道成了「先印后绑」的旁路，码还没到经销商手上就能被第三方系统查穿。
    //    对外 API 用数字错误码约定（见本函数上方各码），1890 = 批次未激活。
    if (Number(settings.isjihuo || 0) === 1 && !isTraceBatchActivated(db, tenantId, batch.id)) {
      return sendError(res, 403, '1890');
    }

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
        // 🔴 is_demo 同 /public/verify：按流水号预留段判定试印码。
        const isDemo = isDemoSerial(parsed.serial, rule) ? 1 : 0;
        db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, entry_type, num, queried_at, openid, user_id, ip, hdtype, is_valid, is_demo, created_at, updated_at)
          VALUES (?, ?, ?, '0', 1, datetime('now'), '', 0, ?, 88, 1, ?, datetime('now'), datetime('now'))`)
          .run(tenantId, batch.id, co, clientIp, isDemo);
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

  /**
   * 🔴 经销商自助激活批次（P2 先印后绑）。
   *
   * 流程：租户印刷 → 批次处于「未激活」→ 货到经销商手里 → 经销商凭租户给的
   *   8 位激活口令调本接口 → 批次激活 → 消费者扫码才看得到溯源详情。
   *
   * 🔴 租户定位只认 URL ?tid=（与其它公开段一致）：经销商不登录，
   *    租户标识不能从 body 直传（越权：改一个 tid 就能激活别人家的批次）。
   * 🔴 口令比对：库里存密文，用 readSecret 还原后逐字比较；密文永不出网。
   */
  router.post('/public/batch-activate', (req, res) => {
    const tenantId = publicTenant(req);
    const batchNo = String(req.body?.batch || '').trim().toUpperCase();
    const pin = String(req.body?.pin || '').trim();
    if (!batchNo || !pin) return sendError(res, 400, '批次号与激活口令不能为空');
    const { rule } = getRule(db, tenantId);
    const batch = findBatchBySegment(db, tenantId, canonicalBatchSegment(batchNo, rule), rule);
    if (!batch) return sendError(res, 404, '批次不存在，请核对批次号');
    if (Number(batch.is_active) !== 1) return sendError(res, 400, '该批次已停用，请联系厂家处理');
    const cipher = String(batch.activate_pin_cipher || '');
    if (!cipher) return sendError(res, 400, '该批次未设置激活口令，请联系厂家提供');
    const real = readSecret(cipher);
    if (!real || real !== pin) {
      // 🔴 失败尝试留痕 + 限流：激活口令是能开批次闸门的凭据，
      //    没有限流就等于给「枚举 8 位口令」开了后门（后台「错误码」页可见）。
      const ip = String(req.ip || '');
      db.prepare('INSERT INTO trace_wrong_attempts (tenant_id, openid, ip, code, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))')
        .run(tenantId, '', ip, `[激活]${batchNo}`);
      const bad = db.prepare(`SELECT COUNT(*) AS c FROM trace_wrong_attempts
        WHERE tenant_id = ? AND ip = ? AND created_at > datetime('now', '-1 day')`).get(tenantId, ip);
      if (Number(bad.c) > 20) return sendError(res, 429, '激活尝试过于频繁，请稍后再试');
      return sendError(res, 403, '激活口令不正确');
    }
    activateTraceBatch(db, tenantId, batch.id, 'dealer', '', '经销商凭口令激活');
    return res.json({ ok: true, batch: batch.batch, product: batch.product || '' });
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
      // 🔴 扫码查询方案由服务端出具（含每档是否真的可用 + 不可用的具体原因），
      //    后台只负责渲染 —— 不做「后台写一份标签、服务端认另一份」的两份真相。
      scanQuery: buildScanQueryView(db, req.traceTenantId, settings),
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
      // 🔴 枚举字段必须服务端白名单归一：客户端传什么是不可信的，
      //    落到库里的只能是 traceScanMode 里那几档之一（非法值一律回落默认档）。
      if ('scanMode' in patch) patch.scanMode = normalizeScanMode(patch.scanMode);
      if ('wxReply' in patch) patch.wxReply = normalizeTraceSwitch(patch.wxReply);
      // 🔴 展示位总开关：必须服务端归一（0/1），不能把客户端原值直接落库。
      //    缺省不写这个字段 = 保持原值（老租户库里没有该字段时读侧按「开」处理）。
      if ('slotsEnabled' in patch) patch.slotsEnabled = normalizeTraceSwitch(patch.slotsEnabled);
      // 🔴 scanQuery 是**算出来的视图**（可用性依赖当前公众号配置），不是配置本身 ——
      //    一旦被写回 settings_json，下一次读到的就是过期快照（公众号后来配好了也仍显示不可用）。
      delete patch.scanQuery;
      saveSettings(db, req.traceTenantId, patch);
      addHistory(db, req.traceTenantId, 1, 'setting', req, '更新防伪溯源设置');
      return res.json({ ok: true });
    } catch (e) {
      return sendError(res, 400, e.message || '设置保存失败');
    }
  });

  router.get('/code-rule', (req, res) => {
    const cur = getRule(db, req.traceTenantId);
    // 🔴 回传锁定态：前端据此禁用码制输入框并给出「已印刷不可改」的明确提示，
    //    避免用户填了一堆再点保存才被服务端拒绝（体验差 + 容易误解为系统故障）。
    return res.json({ rule: cur.rule, locked: cur.locked, lockedAt: cur.lockedAt, confirmed: cur.confirmed });
  });

  // 🔴 随机 k1–k4 的取数口：只吐随机串，**不落库**。落库必须由用户点「保存码制」触发，
  //    否则点一下按钮就把租户正在用的校验密钥换掉 → 已印出去的码全部验真失败。
  router.get('/code-rule/random-keys', (req, res) => {
    const k = randomTraceKeys();
    return res.json({ k1: k[1], k2: k[2], k3: k[3], k4: k[4] });
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
    // 🔴 P2 激活态：一次查全租户的激活记录做映射（避免每行一次查询的 N+1）。
    const actRows = db.prepare('SELECT batch_id, source, actor, created_at FROM trace_activations WHERE tenant_id = ?').all(req.traceTenantId);
    const actMap = new Map(actRows.map((r) => [Number(r.batch_id), r]));
    const withAct = list.map((b) => {
      const act = actMap.get(Number(b.id));
      return {
        ...b,
        activated: act ? 1 : 0,
        activation_source: act?.source || '',
        activated_at: act?.created_at || '',
      };
    });
    const cur = getRule(db, req.traceTenantId);
    return res.json({ list: withAct, total, page, pageSize, ruleConfirmed: cur.confirmed, ruleLocked: cur.locked, ruleLockedAt: cur.lockedAt });
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
      const info = db.prepare(`INSERT INTO trace_batches (tenant_id, m1, batch, product, factory, brand, origin, logo, banner, video, buy_link, province, city, district, inttype, is_chuanhuo, integral, caid_json, toshop_json, wailink_json, params_json, validity, bbox, sbox, red_budget_cents, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`)
        .run(req.traceTenantId, String(b.m1 || rule.m[1] || '').toUpperCase(), normalized.batch, String(b.product || ''), String(b.factory || ''), String(b.brand || ''), String(b.origin || ''), String(b.logo || ''), String(b.banner || ''), String(b.video || ''), String(b.buyLink || ''), String(b.province || ''), String(b.city || ''), String(b.district || ''), Number(b.inttype || 0), Number(b.isChuanhuo || 0), Number(b.integral || 0), JSON.stringify(b.caid || {}), JSON.stringify(b.toshop || {}), JSON.stringify(b.wailink || {}), JSON.stringify(b.params || []), Number(b.validity || 0), Number(b.bbox || 0), Number(b.sbox || 0), Number(b.redBudgetCents ?? -1));
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
    db.prepare(`UPDATE trace_batches SET product = ?, factory = ?, brand = ?, origin = ?, logo = ?, banner = ?, video = ?, buy_link = ?, province = ?, city = ?, district = ?, inttype = ?, is_chuanhuo = ?, integral = ?, caid_json = ?, toshop_json = ?, wailink_json = ?, params_json = ?, validity = ?, bbox = ?, sbox = ?, red_budget_cents = ?, scan_mode_follow = ?, print_scan_mode = ?, is_active = ?, updated_at = datetime('now')
      WHERE tenant_id = ? AND id = ?`)
      .run(String(b.product || ''), String(b.factory || ''), String(b.brand || ''), String(b.origin || ''), String(b.logo || ''), String(b.banner || ''), String(b.video || ''), String(b.buyLink || ''), String(b.province || ''), String(b.city || ''), String(b.district || ''), Number(b.inttype || 0), Number(b.isChuanhuo || 0), Number(b.integral || 0), JSON.stringify(b.caid || {}), JSON.stringify(b.toshop || {}), JSON.stringify(b.wailink || {}), JSON.stringify(b.params || []), Number(b.validity || 0), Number(b.bbox || 0), Number(b.sbox || 0), Number(b.redBudgetCents ?? -1), Number(b.scanModeFollow ?? 1), String(b.printScanMode || ''), Number(b.isActive ?? 1), req.traceTenantId, id);
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
    if (!guardBatchGenerable(res, batch)) return undefined;
    // 🔴 平台级生成权限门控（#472），与 generate-codes 同口径
    const genMode = getPlatformSettings(db).config?.generation?.mode || 'open';
    if (genMode === 'closed') return sendError(res, 403, '防伪码生成已全局关闭');
    if (genMode === 'platformOnly') return sendError(res, 403, '生成权限未对租户开放，请联系平台运营');
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
    if (!guardBatchGenerable(res, batch)) return undefined;
    // 🔴 平台级生成权限门控（#472）：open=租户可生成 / platformOnly=仅平台 / closed=全关。
    //    在 tenant 路由里调用方必为租户，故 platformOnly/closed 直接拒绝。
    const genMode = getPlatformSettings(db).config?.generation?.mode || 'open';
    if (genMode === 'closed') return sendError(res, 403, '防伪码生成已全局关闭');
    if (genMode === 'platformOnly') return sendError(res, 403, '生成权限未对租户开放，请联系平台运营');
    const { rule } = getRule(db, req.traceTenantId);
    const { settings } = getSettings(db, req.traceTenantId);
    // 🔴 站点根域名优先取平台级配置（#474），平台未配时回落租户自有 siteroot。
    const siteRoot = (getPlatformSettings(db).config?.siteRoot || '').trim() || settings.siteroot || '';
    try {
      // 🔴 demo=1 走试印通道：不扣库存、不锁码制、用流水号顶部预留号段、包面带【演示·试印】标注。
      //    正式生成（demo 不传）成功后会把码制锁死（locked_at）—— 试印不触发。
      const demo = req.body?.demo ?? req.query?.demo ?? 0;
      const pkg = generateTracePackage({
        db,
        tenantId: req.traceTenantId,
        batch,
        rule,
        settings,
        demo,
        codetype: req.body.codetype ?? req.query.codetype ?? 1,
        codeno: req.body.codeno ?? req.query.codeno ?? 1,
        codenot: req.body.codenot ?? req.query.codenot ?? 0,
        siteRoot,
        origin: publicBaseUrl(req),
        packageFormat: String(req.body?.format || req.query?.format || '') === 'zip' ? 'zip' : 'html',
      });
      addHistory(db, req.traceTenantId, 1, `${rule.m[1]}${batch.batch}`, req, `生成防伪码：(${req.body.codetype ?? req.query.codetype ?? 1}) 共 ${pkg.created} 条${pkg.demo ? '（试印·演示）' : ''}`);
      // 🔴 format=zip：走 /export 之外的「生成即拿 zip」通道 —— 后台「生成并下载」要的就是
      //    同一批内容，打成 zip 便于大批量传输（对标系统的码包下载同样是 application/zip）。
      //    🔴 H1：二维码大批量走 makeMultiZip 产出的就是 zip buffer（pkg.isBuffer=true），直接回传；
      //    文本码型则在此用 makeZip 把单 txt 包一层 zip。
      if (String(req.body?.format || req.query?.format || '') === 'zip') {
        const isBuf = pkg.isBuffer === true;
        const buf = isBuf ? pkg.content : makeZip(pkg.filename, pkg.content);
        return res.json({
          ok: true,
          created: pkg.created,
          sets: pkg.sets || 0,
          demo: Boolean(pkg.demo),
          filename: isBuf ? pkg.filename : pkg.filename.replace(/\.(txt|html)$/i, '') + '.zip',
          contentType: 'application/zip',
          content: buf.toString('base64'),
          encoding: 'base64',
        });
      }
      return res.json({ ok: true, created: pkg.created, sets: pkg.sets || 0, demo: Boolean(pkg.demo), filename: pkg.filename, contentType: pkg.contentType, content: pkg.content });
    } catch (e) {
      return sendError(res, 400, e.message || '生成防伪码失败');
    }
  });

  router.get('/batches/:id/export', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    // 🔴 导出同样要过这条守卫：它内部走的还是 generateTracePackage，会扣库存并推进批次序号
    //    （不是只读下载），停用批次导出等于白扣一批库存、拿到一包扫不出来的码。
    if (!guardBatchGenerable(res, batch)) return undefined;
    const wantZip = String(req.query.format || 'txt') === 'zip';
    const { rule } = getRule(db, req.traceTenantId);
    const { settings } = getSettings(db, req.traceTenantId);
    const siteRoot = (getPlatformSettings(db).config?.siteRoot || '').trim() || settings.siteroot || '';
    try {
      // 🔴 导出同样支持试印模式（demo=1）：试印包不扣库存、不锁码制。
      const demo = req.query.demo ?? req.body?.demo ?? 0;
      const pkg = generateTracePackage({
        db,
        tenantId: req.traceTenantId,
        batch,
        rule,
        settings,
        demo,
        codetype: req.query.codetype ?? 1,
        codeno: req.query.codeno ?? 100,
        codenot: req.query.codenot ?? 0,
        siteRoot,
        origin: publicBaseUrl(req),
        packageFormat: String(req.query?.format || '') === 'zip' ? 'zip' : 'html',
      });
      addHistory(db, req.traceTenantId, 1, `${rule.m[1]}${batch.batch}`, req, `下载防伪码数据包：${pkg.filename}${pkg.demo ? '（试印·演示）' : ''}`);
      // 🔴 zip 导出：单文件 store 模式打包（零新依赖，见 services/zip.js）。
      //    为什么要它：对标系统的码包下载就是 application/zip；
      //    大批量（上万码）时单 txt 在部分 IM/邮件客户端里会被截断或打不开。
      //    🔴 H1：二维码大批量走 makeMultiZip 产出 zip buffer（pkg.isBuffer=true），直接发；
      //    文本码型则在此用 makeZip 把单 txt 包一层 zip。
      if (wantZip) {
        const isBuf = pkg.isBuffer === true;
        const buf = isBuf ? pkg.content : makeZip(pkg.filename, pkg.content);
        const zipName = isBuf ? pkg.filename : pkg.filename.replace(/\.(txt|html)$/i, '') + '.zip';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
        res.setHeader('Content-Length', String(buf.length));
        return res.send(buf);
      }
      res.setHeader('Content-Type', pkg.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${pkg.filename}"`);
      return res.send(pkg.content);
    } catch (e) {
      return sendError(res, 400, e.message || '导出防伪码失败');
    }
  });

  router.post('/batches/:id/activate', (req, res) => {
    const id = Number(req.params.id);
    // 🔴 端点名叫 activate，不传 isActive 时必须按「激活」处理。
    //    原文 Number(req.body.isActive ? 1 : 0)：不传 body 时 isActive 是 undefined
    //    → 写入 0（**停用**）—— 一个叫「激活」的接口反过来把批次停用了。
    //    调用方（后台「激活」按钮）就是空 body 调的，等于点「激活」= 停用。
    const want = req.body?.isActive === undefined ? 1 : (req.body.isActive ? 1 : 0);
    db.prepare('UPDATE trace_batches SET is_active = ?, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?')
      .run(want, req.traceTenantId, id);
    return res.json({ ok: true, isActive: want });
  });

  /* ==================== P2 批次激活（先印后绑） ==================== */

  /**
   * 🔴 激活闸门（先印后绑）的批次状态查询。
   *
   * ⚠️ 路径叫 /activation，**不是** /activate：后者是 is_active（批次启停）的老端点，
   *    语义完全不同 —— 两者撞名会让「激活批次」和「启用批次」在代码里混成一件事。
   */
  router.get('/batches/:id/activation', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    const act = db.prepare('SELECT * FROM trace_activations WHERE tenant_id = ? AND batch_id = ?').get(req.traceTenantId, id);
    const pinCipher = String(batch.activate_pin_cipher || '');
    return res.json({
      batch: batch.batch,
      activated: Boolean(act),
      source: act?.source || '',
      actor: act?.actor || '',
      remark: act?.remark || '',
      activatedAt: act?.created_at || '',
      // 🔴 口令只回显掩码（明文永不二次下发，租户丢了只能重置）。
      activatePin: pinCipher ? maskSecretValue(readSecret(pinCipher)) : '',
      hasPin: Boolean(pinCipher),
    });
  });

  /** 租户后台直接激活批次（source=admin） */
  router.post('/batches/:id/activation', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    activateTraceBatch(db, req.traceTenantId, id, 'admin', String(req.user?.username || req.user?.name || ''), String(req.body?.remark || '租户后台激活'));
    addHistory(db, req.traceTenantId, 1, batch.batch, req, '激活批次（先印后绑）');
    return res.json({ ok: true, activated: true });
  });

  /** 撤销激活（批次作废 / 经销商换货时回滚） */
  router.delete('/batches/:id/activation', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    db.prepare('DELETE FROM trace_activations WHERE tenant_id = ? AND batch_id = ?').run(req.traceTenantId, id);
    addHistory(db, req.traceTenantId, 1, batch.batch, req, '撤销批次激活');
    return res.json({ ok: true, activated: false });
  });

  /**
   * 批量激活（G3：闸门开启后存量批次要逐个激活，几百个批次 = 几百次点击）。
   *
   * 🔴 为什么是「显式传 ids」而不是「一键全激活」：
   *    激活 = 放行消费者看溯源详情 → 误激活等于**没设防**。所以
   *    ① 必须显式传要激活的批次 id 列表（后台勾选），不给「全选所有」这种危险默认值；
   *    ② 必须先传 confirm=true 才真执行（前端二次确认，防误触）；
   *    ③ 返回逐个批次的成功/失败明细（有的批次可能已激活/不存在）。
   */
  router.post('/batches/activate-batch', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0) : [];
    if (!ids.length) return sendError(res, 400, '请选择要激活的批次');
    if (req.body?.confirm !== true) return sendError(res, 400, '批量激活需要二次确认（confirm=true）');
    const operator = String(req.user?.username || req.user?.name || '');
    const detail = [];
    let ok = 0;
    for (const id of ids) {
      const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
      if (!batch) {
        detail.push({ id, ok: false, reason: '批次不存在' });
        continue;
      }
      try {
        activateTraceBatch(db, req.traceTenantId, id, 'admin', operator, String(req.body?.remark || '租户后台批量激活'));
        ok += 1;
        detail.push({ id, batch: batch.batch, ok: true });
      } catch (e) {
        detail.push({ id, batch: batch.batch, ok: false, reason: e.message || '激活失败' });
      }
    }
    addHistory(db, req.traceTenantId, 1, `${ids.length} 个批次`, req, `批量激活批次（先印后绑）：成功 ${ok} / 共 ${ids.length}`);
    return res.json({ ok: true, total: ids.length, success: ok, failed: ids.length - ok, detail });
  });

  /**
   * 生成 / 重置批次激活口令（经销商自助激活用）。
   *
   * 🔴 明文**只在本次响应里出现一次**，库里存密文；回显一律掩码。
   *    租户拿到明文后线下发给经销商；经销商凭口令调公开接口激活批次。
   */
  router.post('/batches/:id/activation-pin', (req, res) => {
    const id = Number(req.params.id);
    const batch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, id);
    if (!batch) return sendError(res, 404, '批次不存在');
    const pin = makeActivationPin(8);
    db.prepare("UPDATE trace_batches SET activate_pin_cipher = ?, updated_at = datetime('now') WHERE tenant_id = ? AND id = ?")
      .run(encryptSecret(pin), req.traceTenantId, id);
    addHistory(db, req.traceTenantId, 1, batch.batch, req, '重置批次激活口令');
    return res.json({ ok: true, activatePin: pin, activatePinMasked: maskSecretValue(pin) });
  });

  router.get('/codes', (req, res) => {
    const { page, pageSize, offset } = pageParams(req);
    const code = `%${String(req.query.code || '').trim()}%`;
    const total = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND code LIKE ?').get(req.traceTenantId, code).c;
    const list = db.prepare(`SELECT c.*, b.batch, b.product FROM trace_codes c LEFT JOIN trace_batches b ON b.tenant_id = c.tenant_id AND b.id = c.batch_id
      WHERE c.tenant_id = ? AND c.code LIKE ? ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(req.traceTenantId, code, pageSize, offset);
    return res.json({ list, total, page, pageSize });
  });

  /**
   * 扫码地址状态（给后台生成弹窗用）。
   *
   * 🔴 为什么要有这个接口：防伪码是印在包装上给消费者扫的，**URL 配错是印完才发现的事故**
   *    （印 10 万个码，扫出来打不开 → 全废）。而 URL 绝对地址依赖「站点根域名」配置，
   *    没配时 traceQueryUrl 会退化成相对路径 `/card/#/...` → 手机相机扫出来打不开。
   *    所以在**生成之前**就把「扫出来会打开哪个地址」摆给商家看。
   */
  router.get('/scan-url', (req, res) => {
    const { settings } = getSettings(db, req.traceTenantId);
    const siteRoot = (getPlatformSettings(db).config?.siteRoot || '').trim() || settings.siteroot || '';
    const origin = publicBaseUrl(req);
    // 与 traceQueryUrl 完全同源的基址判定（不能另写一套，否则提示与实际会不一致）
    const base = /^https?:\/\//i.test(siteRoot)
      ? (siteRoot.endsWith('/') ? siteRoot : `${siteRoot}/`)
      : (origin ? (origin.endsWith('/') ? origin : `${origin}/`) : '');
    const absolute = !!base;
    return res.json({
      ok: true,
      absolute,
      // 商家看到的「消费者扫码后打开的地址」
      previewUrl: absolute ? `${base}card/#/pages/trace/index?co=…&tid=${req.traceTenantId}` : '',
      source: siteRoot ? 'siteroot' : (origin ? 'request-host' : 'none'),
      hint: absolute
        ? '消费者扫码后打开上面的地址；二维码下方同时印有防伪明文码，磨损或反光时可手动输入。'
        : '未配置站点根域名，印出的二维码将指向相对路径，手机扫码无法打开 —— 请先在设置里填写站点根域名。',
    });
  });

  router.post('/codes/:id/mark-error', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('UPDATE trace_codes SET is_err = 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(req.traceTenantId, id);
    addHistory(db, req.traceTenantId, 1, String(id), req, `标记异常：${String(req.body.reason || '')}`);
    return res.json({ ok: true });
  });

  // 生成该防伪码对应的「公众号带参二维码」（永久字符串码，scene=码值）。
  // 🔴 用途：商户把此二维码印到产品上，消费者用微信扫 → 在公众号内弹出图文卡片
  //    （由 wx-mp.js 的 SCAN 事件处理按展示位构造）。这是「绑单码」方案：一张码一张二维码。
  // 🔴 返回 showUrl 即二维码图片地址，后台可直接 <img> 展示 / 下载；ticket 可换图。
  /**
   * 带参二维码能力预检（回答「这个公众号能不能出带参二维码」）。
   * 🔴 微信硬规则：永久字符串码（QR_LIMIT_STR_SCENE）只对「已认证服务号」开放，
   *    订阅号/未认证服务号一律 48001。本接口把能查到的认证状态先查出来给后台，
   *    查不到（手动对接模式）就明说「查不到，以出码结果为准」，不猜。
   */
  router.get('/mp-qr/capability', async (req, res) => {
    const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(req.traceTenantId);
    if (!channel) return sendError(res, 400, '该租户未配置已授权或已填密钥的公众号');
    try {
      const wxMp = new WxMpService(db, new WxComponentService(db));
      const cap = await wxMp.checkParamQrCapability(channel);
      return res.json({ ok: true, ...cap });
    } catch (e) {
      return sendError(res, 400, e.message || '查询公众号能力失败');
    }
  });

  router.post('/codes/:id/mp-qr', async (req, res) => {
    // 🔴 取码口径（这里是本轮修的真实 bug）：
    //    原实现只按 trace_codes.id 查 —— 而 trace_codes **只在消费者首次扫码查询时才 INSERT**，
    //    刚生成、还没被扫过的码在库里根本没有行 → 一律 404，
    //    「给码出公众号二维码」这个功能对绝大多数码直接不可用。
    //    现在按三级回退取码：① 请求里直接给码值 ② :id 命中 trace_codes 行 ③ :id 本身就是码值。
    const param = String(req.params.id || '').trim();
    let code = String(req.body?.code || req.query?.code || '').trim().toUpperCase();
    if (!code) {
      const row = db.prepare('SELECT * FROM trace_codes WHERE tenant_id = ? AND id = ?').get(req.traceTenantId, Number(param));
      if (row) code = String(row.code || '').trim().toUpperCase();
      else if (!/^\d+$/.test(param)) code = param.toUpperCase();
    }
    if (!code) return sendError(res, 404, '防伪码不存在');
    // 🔴 跨租户防线：码必须属于本租户 —— 按本租户码制反查批次，查不到就是别人的码 / 乱码。
    const { rule } = getRule(db, req.traceTenantId);
    const parsed = parseTraceCode(code, rule);
    const ownerBatch = findBatchBySegment(db, req.traceTenantId, parsed.batch, rule);
    if (!ownerBatch) return sendError(res, 404, '防伪码不存在');
    const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(req.traceTenantId);
    if (!channel) return sendError(res, 400, '该租户未配置已授权或已填密钥的公众号');
    try {
      const wxMp = new WxMpService(db, new WxComponentService(db));
      const qr = await wxMp.createParamQr(channel, code);
      return res.json({ ok: true, code, ticket: qr.ticket, url: qr.url, showUrl: qr.showUrl });
    } catch (e) {
      return sendError(res, 400, e.message || '生成公众号带参二维码失败');
    }
  });

  /**
   * 公众号带参二维码图片代理（服务端拉微信图片再转发）。
   *
   * 🔴 为什么不让前端直接 <img src="微信取图地址?ticket=...">（取图地址见 showQrImageUrl）：
   *    ① 微信图片站有**防盗链**（Referer 校验）→ 在后台页面里引可能返回空白图；
   *    ② 前端拿不到图 → 商家只能截图，没有「下载二维码图片」可用。
   *    代理后前端用**同源**地址 <img>，一定能显示、也能直接下载。
   *
   * 权限：只代理本租户**自己出过的**码（按 ticket 反查不行 → 改按码值反查批次，
   *       保证是本租户的码），避免变成「任意 URL 代理」被当成 SSRF 跳板。
   */
  router.get('/mp-qr/image', async (req, res) => {
    const ticket = String(req.query.ticket || '').trim();
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!ticket || !code) return sendError(res, 400, '缺少 ticket 或 code');
    // 跨租户防线：码必须属于本租户
    const { rule } = getRule(db, req.traceTenantId);
    const parsed = parseTraceCode(code, rule);
    const ownerBatch = findBatchBySegment(db, req.traceTenantId, parsed.batch, rule);
    if (!ownerBatch) return sendError(res, 404, '防伪码不存在');
    try {
      const upstream = await fetch(showQrImageUrl(ticket));
      if (!upstream.ok) return sendWxQrError(res, upstream.status);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=600');
      return res.send(buf);
    } catch (e) {
      return sendError(res, 502, e.message || '获取二维码图片失败');
    }
  });

  // 注：同样的「现场生成临时场景码」能力已落到**公开段** /public/mp-scene（消费者未登录，
  // 且有 60 秒幂等复用）。此处不再保留一份后台版，避免同一件事两处定义各自漂移。

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
    // 🔴 正式口径一律排除试印码（is_demo=1）：试印是印刷前的小批量验证，
    //    混进正式统计会让「已查次数/总码数」失真（试印时自己扫几遍就刷上去了）。
    const totalQueries = db.prepare('SELECT COALESCE(SUM(num), 0) AS c FROM trace_codes WHERE tenant_id = ? AND is_demo = 0').get(tenantId).c;
    const totalCodes = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND is_demo = 0').get(tenantId).c;
    const demoCodes = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND is_demo = 1').get(tenantId).c;
    const errorCodes = db.prepare('SELECT COUNT(*) AS c FROM trace_codes WHERE tenant_id = ? AND is_err = 1 AND is_demo = 0').get(tenantId).c;
    const batches = db.prepare('SELECT COUNT(*) AS c FROM trace_batches WHERE tenant_id = ?').get(tenantId).c;
    return res.json({ totalQueries: Number(totalQueries), totalCodes: Number(totalCodes), demoCodes: Number(demoCodes), errorCodes: Number(errorCodes), batches: Number(batches) });
  });

  router.get('/stats/region', (req, res) => {
    const level = req.query.level === 'city' ? 'city' : 'province';
    const list = db.prepare(`SELECT ${level} AS name, COUNT(*) AS value FROM trace_codes WHERE tenant_id = ? AND is_demo = 0 GROUP BY ${level} ORDER BY value DESC LIMIT 50`).all(req.traceTenantId);
    return res.json({ list });
  });

  router.get('/stats/trend', (req, res) => {
    const list = db.prepare(`SELECT substr(created_at, 1, 10) AS name, COUNT(*) AS value FROM trace_histories WHERE tenant_id = ? AND type = 0 GROUP BY substr(created_at, 1, 10) ORDER BY name ASC`).all(req.traceTenantId);
    return res.json({ list });
  });

  // 🔴 防伪码库存充值入口已整体收归平台侧（总后台 → 防伪溯源 → 库存与充值台账）。
  //    租户侧不提供充值：曾经过 requireTenant 即可调用（普通成员也能给自己加额、无上限、无凭证、无平台审计），
  //    计量口径必须由平台侧发放记录驱动，否则库存数量没有可信来源。
  //    这里改为**只读余量**，租户看到不足时联系平台。

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

