/**
 * 行为分析与健康分服务（第三批）
 * - 事件写入（批量）
 * - 漏斗计算（曝光→浏览→交换→成单 转化）
 * - 分日趋势（事件量 / 独立访客）
 * - 租户业务健康分（资料完整度/内容活跃/访客活跃/转化率/集市参与）
 * - 总后台按解决方案概览
 */
import path from 'node:path';
import { config } from '../config.js';

// ============ 事件写入 ============

/**
 * 批量写入埋点事件。
 * 每条约：{ eventType, page, cardId, sceneId, visitorKey, userId, durationMs, extra }
 * tenantId 由调用方解析（登录态 req.customerId / cardId 反查 / 显式传入）。
 * 返回 { ok, written }。
 */
export function trackEvents(db, tenantId, solution, events = []) {
  if (!Array.isArray(events) || !events.length) return { ok: true, written: 0 };
  const stmt = db.prepare(`
    INSERT INTO analytics_events (tenant_id, solution, event_type, page, card_id, scene_id, visitor_key, user_id, duration_ms, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const run = (list) => {
    let n = 0;
    db.exec('BEGIN');
    try {
      for (const ev of list) {
        if (!ev || !ev.eventType) continue;
        stmt.run(
          tenantId || 0,
          solution || 'card',
          String(ev.eventType).slice(0, 64),
          String(ev.page || '').slice(0, 128),
          Number(ev.cardId) || 0,
          Number(ev.sceneId) || 0,
          String(ev.visitorKey ? String(ev.visitorKey) : '').slice(0, 128),
          Number(ev.userId) || 0,
          Number(ev.durationMs) || 0,
          JSON.stringify(ev.extra || {}).slice(0, 2000)
        );
        n++;
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      throw e;
    }
    return n;
  };
  const written = run(events.slice(0, 50));
  return { ok: true, written };
}

// ============ 漏斗 ============

/**
 * 漏斗：按事件类型序列统计转化。
 * 步骤定义（固定业务漏斗）：
 *   page_view 曝光 → card_view 浏览名片 → exchange_init 发起交换 → exchange_success 交换成功
 * 另有辅助转化：card_view → form_submit 表单留资
 * 同一访客（visitor_key）跨步骤去重。
 */
const FUNNEL_STEPS = [
  { key: 'page_view', label: '页面曝光' },
  { key: 'card_view', label: '浏览名片' },
  { key: 'exchange_init', label: '发起交换' },
  { key: 'exchange_success', label: '交换成功' },
];

export function calcFunnel(db, tenantId, { start = '', end = '', steps = FUNNEL_STEPS } = {}) {
  const where = ['tenant_id = ?'];
  const params = [tenantId];
  if (start) { where.push("event_date >= date(?)"); params.push(start); }
  if (end) { where.push("event_date <= date(?)"); params.push(end); }
  const whereSql = where.join(' AND ');

  const result = steps.map((step, i) => {
    const row = db.prepare(
      `SELECT COUNT(DISTINCT CASE WHEN visitor_key != '' THEN visitor_key END) AS visitors, COUNT(*) AS events
       FROM analytics_events WHERE ${whereSql} AND event_type = ? AND visitor_key != ''`
    ).get(...params, step.key);
    return {
      key: step.key,
      label: step.label,
      visitors: row.visitors || 0,
      events: row.events || 0,
      conversion: 0,
    };
  });

  // 计算转化率（相对上一环节）
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1].visitors;
    result[i].conversion = prev > 0 ? Math.round((result[i].visitors / prev) * 1000) / 10 : 0;
  }
  // 首环节转化率 = 100%
  if (result.length) result[0].conversion = 100;
  return result;
}

// ============ 趋势 ============

/** 分日趋势：近 N 天 事件量 / 独立访客 / 独立名片。 */
export function trendSeries(db, tenantId, { days = 14, solution = '' } = {}) {
  const params = [tenantId, Number(days)];
  let solutionSql = '';
  if (solution) { solutionSql = ' AND solution = ?'; params.push(solution); }
  const rows = db.prepare(
    `SELECT event_date AS d,
            COUNT(*) AS events,
            COUNT(DISTINCT CASE WHEN visitor_key != '' THEN visitor_key END) AS visitors,
            COUNT(DISTINCT CASE WHEN card_id > 0 THEN card_id END) AS cards
     FROM analytics_events
     WHERE tenant_id = ? AND event_date >= date('now', '-' || ? || ' days')${solutionSql}
     GROUP BY event_date ORDER BY event_date`
  ).all(...params);
  return rows.map((r) => ({ date: r.d, events: r.events, visitors: r.visitors, cards: r.cards || 0 }));
}

/** 事件分布：按 event_type 汇总。 */
export function eventDistribution(db, tenantId, { start = '', end = '' } = {}) {
  const where = ['tenant_id = ?'];
  const params = [tenantId];
  if (start) { where.push("event_date >= date(?)"); params.push(start); }
  if (end) { where.push("event_date <= date(?)"); params.push(end); }
  return db.prepare(
    `SELECT event_type AS type, COUNT(*) AS count FROM analytics_events
     WHERE ${where.join(' AND ')} GROUP BY event_type ORDER BY count DESC`
  ).all(...params);
}

/** 名片 TOP：按 card_id 聚合浏览/表单/交换。 */
export function topCards(db, tenantId, { limit = 5, start = '', end = '' } = {}) {
  const where = ['tenant_id = ?', 'card_id > 0'];
  const params = [tenantId];
  if (start) { where.push("event_date >= date(?)"); params.push(start); }
  if (end) { where.push("event_date <= date(?)"); params.push(end); }
  const rows = db.prepare(
    `SELECT card_id AS id,
            SUM(CASE WHEN event_type='card_view' THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN event_type='form_submit' THEN 1 ELSE 0 END) AS leads,
            SUM(CASE WHEN event_type='exchange_init' THEN 1 ELSE 0 END) AS exchanges
     FROM analytics_events WHERE ${where.join(' AND ')}
     GROUP BY card_id ORDER BY views DESC LIMIT ?`
  ).all(...params, Number(limit));
  const names = db.prepare(
    `SELECT id, name, company, position FROM card_profile WHERE id IN (${rows.map(() => '?').join(',') || 'NULL'})`
  ).all(...rows.map((r) => r.id));
  const nameMap = new Map(names.map((n) => [n.id, n]));
  return rows.map((r) => {
    const p = nameMap.get(r.id) || {};
    return { cardId: r.id, name: p.name || `名片#${r.id}`, company: p.company || '', position: p.position || '', views: r.views, leads: r.leads, exchanges: r.exchanges };
  });
}

// ============ 健康分 ============

/**
 * 租户业务健康分 0-100。
 * 维度（各 0-20）：
 *  1 资料完整度：名片字段完整率（name/company/position/phone/avatar/wechat 等）
 *  2 内容活跃度：近 7 天动态/视频发布量
 *  3 访客活跃度：近 7 天独立访客数（相对名片数）
 *  4 转化表现：form_submit / card_view 转化率
 *  5 集市参与：集市上架数 + 交换数
 * 附带建议列表。
 */
const CARD_FIELDS = ['name', 'company', 'position', 'phone', 'wechat', 'avatar', 'address'];

export function calcHealthScore(db, tenantId) {
  const dims = [];
  const advice = [];

  // 1. 资料完整度（名片经 platform_user 归属租户）
  const profiles = db.prepare(
    `SELECT cp.* FROM card_profile cp JOIN platform_user u ON cp.user_id = u.id
     WHERE u.customer_id = ? AND cp.status = 'active'`
  ).all(tenantId);
  const fieldCompleteness = CARD_FIELDS.map((f) => {
    const filled = profiles.filter((p) => p[f]).length;
    return profiles.length ? filled / profiles.length : 0;
  });
  const completeness = profiles.length ? fieldCompleteness.reduce((a, b) => a + b, 0) / CARD_FIELDS.length : 0;
  dims.push(Math.round(completeness * 20 * 10) / 10);
  if (!profiles.length) advice.push('还没有入驻个人名片：先在「入驻管理」创建个人或通过小程序入驻申请。');
  else if (completeness < 0.5) advice.push('部分名片资料不完整：补充公司、职位、头像、联系方式可显著提升访客信任。');

  // 2. 内容活跃度（近7天动态/视频）
  const recentDyn = db.prepare(
    "SELECT COUNT(*) AS n FROM card_dynamic WHERE created_at >= datetime('now','-7 days') AND status='active'"
  ).get().n || 0;
  const contentScore = Math.min(20, recentDyn * 4);
  dims.push(contentScore);
  if (recentDyn === 0) advice.push('近 7 天没有发布动态：定期发布内容能提高名片回访率。');

  // 3. 访客活跃度（近7天独立访客 / 名片数）
  const recentVisitors = db.prepare(
    "SELECT COUNT(DISTINCT visitor_key) AS n FROM analytics_events WHERE tenant_id = ? AND event_type='card_view' AND visitor_key != '' AND event_date >= date('now','-7 days')"
  ).get(tenantId).n || 0;
  const visitorScore = Math.min(20, Math.round((recentVisitors / Math.max(profiles.length, 1)) * 20 * 10) / 10);
  dims.push(visitorScore);
  if (recentVisitors === 0) advice.push('近 7 天没有名片浏览：建议分享名片链接或开通全端渠道扩大曝光。');

  // 4. 转化表现（form_submit / card_view）
  const views = db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE tenant_id = ? AND event_type='card_view' AND visitor_key != '' AND event_date >= date('now','-7 days')").get(tenantId).n || 0;
  const leads = db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE tenant_id = ? AND event_type='form_submit' AND event_date >= date('now','-7 days')").get(tenantId).n || 0;
  const conv = views > 0 ? leads / views : 0;
  dims.push(Math.min(20, Math.round(conv * 200 * 10) / 10)); // 10% 转化=满分
  if (views > 0 && conv < 0.02) advice.push('名片浏览转化为线索的比例偏低：可在名片上增加「一键留资」表单入口。');

  // 5. 集市参与
  const marketItems = db.prepare("SELECT COUNT(*) AS n FROM card_market_items WHERE customer_id = ? AND audit_status='approved'").get(tenantId).n || 0;
  const exchanges = db.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE tenant_id = ? AND event_type='exchange_success'").get(tenantId).n || 0;
  const marketScore = Math.min(20, marketItems * 2 + exchanges);
  dims.push(marketScore);
  if (marketItems === 0) advice.push('人脉集市尚未上架任何名片：开启集合并引导成员上架，扩大租户内人脉网络。');

  const total = Math.round(dims.reduce((a, b) => a + b, 0) * 10) / 10;
  const level = total >= 80 ? '优秀' : total >= 60 ? '良好' : total >= 40 ? '一般' : '待提升';
  return {
    score: total,
    level,
    dimensions: [
      { key: 'profile', label: '资料完整度', score: dims[0], max: 20 },
      { key: 'content', label: '内容活跃度', score: dims[1], max: 20 },
      { key: 'visitor', label: '访客活跃度', score: dims[2], max: 20 },
      { key: 'conversion', label: '转化表现', score: dims[3], max: 20 },
      { key: 'market', label: '集市参与', score: dims[4], max: 20 },
    ],
    advice,
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
}

// ============ 总后台：按解决方案概览 ============

/** 总后台概览：按解决方案统计事件量/租户数/独立访客；平台健康分均值。 */
export function adminOverview(db, { days = 14 } = {}) {
  const bySolution = db.prepare(
    `SELECT solution,
            COUNT(*) AS events,
            COUNT(DISTINCT tenant_id) AS tenants,
            COUNT(DISTINCT CASE WHEN visitor_key != '' THEN visitor_key END) AS visitors
     FROM analytics_events
     WHERE event_date >= date('now', '-' || ? || ' days')
     GROUP BY solution ORDER BY events DESC`
  ).all(Number(days));

  const tenants = db.prepare("SELECT COUNT(DISTINCT tenant_id) AS n FROM analytics_events WHERE event_date >= date('now', '-' || ? || ' days')").get(Number(days)).n || 0;
  const totalEvents = bySolution.reduce((a, b) => a + b.events, 0);

  return { bySolution, tenants, totalEvents, days: Number(days) };
}
