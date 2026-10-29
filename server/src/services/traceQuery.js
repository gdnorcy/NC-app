/**
 * 防伪码「查询登记」的唯一实现。
 *
 * 🔴 为什么必须抽出来：消费者触达防伪码不止一条通路 ——
 *     ① C 端溯源页 / 第三方 API（routes/trace.js）
 *     ② 公众号内直接发送防伪码 → 被动回复（services/wx-mp.js）
 *    两条路**都会动同一组计数器**（trace_codes.num / trace_batches.rcon / trace_histories）。
 *    各自写一份 → num 语义漂移 → 「是否首次查询」判错 →
 *    「仅首次查询可见」的展示位与首查奖励全部失准（这也是本项目历史上踩过的同类坑）。
 *    所以把它做成单点函数，任何新增通路都必须调它。
 *
 * 🔴 计数口径（不要改，改了首查语义就错）：
 *    - 库里没这行            → INSERT num=1，批次 rcon+1，本次算首查（queryNo=1）
 *    - 有这行但 num=0       → 置 1（同上），算首查（历史 while-else 遗留形态）
 *    - 有这行且 num>0       → 本次 queryNo = num+1，属复访
 *    - 21 秒去重窗口        → 同一 openid 对同一码的抖动重发不重复计数、不重复写历史
 *    - **只有复访才 num+1**（原写法 `if (num>1)` 会让 num 永远卡在 1 → first 恒 true）
 */
import { isDemoSerial } from './traceCode.js';

/** 同一访问者对同一码的去重窗口（秒）。抖一下就多算一次查询 = 查询数据虚高。 */
export const TRACE_QUERY_DEDUPE_SECONDS = 21;

/**
 * 查询配额预检。
 * 🔴 必须**在写记录之前**判：达到上限还去 INSERT 会把本不该被计数的查询算进去，
 *    批次里出现「货没发完已经查爆」的假数据。
 * @returns {string} 空串 = 放行；非空 = 应回给用户的拦截文案
 */
export function checkQueryQuota({ settings, batch, record }) {
  const upperlimit = Number(settings?.upperlimit || 0);
  if (upperlimit > 0 && Number(batch?.rcon || 0) >= upperlimit && !record) {
    return String(settings?.con_msg || '查询次数已达上限');
  }
  return '';
}

/**
 * 登记一次查询（调用方负责：码校验通过 + 批次归属已确认 + 已过配额预检）。
 *
 * @returns {{record:object, batch:object, first:boolean, queryNo:number, isNewEntry:boolean, deduped:boolean}}
 */
export function registerTraceQuery({
  db,
  tenantId,
  code,
  batch,
  record = null,
  openid = '',
  userId = 0,
  ip = '',
  entryType = '6',
  rule = null,
  serial = '',
  makeRemark = null,
  dedupeSeconds = TRACE_QUERY_DEDUPE_SECONDS,
}) {
  let cur = record || null;
  let isNewEntry = false;
  let deduped = false;
  let queryNo = 0;
  let freshBatch = batch;

  // 🔴 事务口径 = 平台统一写法 db.exec('BEGIN'/'COMMIT'/'ROLLBACK')。
  db.exec('BEGIN');
  try {
    if (!cur) {
      // is_demo：按流水号是否落在「顶部预留段」判定（试印码）→ 统计与结构锁都排除它。
      const isDemo = rule && serial && isDemoSerial(serial, rule) ? 1 : 0;
      const info = db.prepare(`INSERT INTO trace_codes (tenant_id, batch_id, code, entry_type, num, queried_at, openid, user_id, ip, hdtype, is_valid, is_demo, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'), ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`)
        .run(tenantId, batch.id, code, String(entryType || '6'), openid, userId, ip, Number(batch.inttype || 0), isDemo);
      cur = db.prepare('SELECT * FROM trace_codes WHERE id = ?').get(info.lastInsertRowid);
      db.prepare('UPDATE trace_batches SET rcon = rcon + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, batch.id);
      isNewEntry = true;
      queryNo = 1;
    } else if (Number(cur.num || 0) === 0) {
      db.prepare(`UPDATE trace_codes SET num = 1, queried_at = datetime('now'), openid = ?, user_id = ?, ip = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND id = ?`).run(openid, userId, ip, tenantId, cur.id);
      db.prepare('UPDATE trace_batches SET rcon = rcon + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, batch.id);
      cur = db.prepare('SELECT * FROM trace_codes WHERE id = ?').get(cur.id);
      isNewEntry = true;
      queryNo = 1;
    } else {
      // 复访：本次序号 = 当前 num + 1（登记成功后 num 会 +1）
      queryNo = Number(cur.num || 0) + 1;
    }

    const win = Number(dedupeSeconds) > 0 ? Number(dedupeSeconds) : TRACE_QUERY_DEDUPE_SECONDS;
    const recent = db.prepare(`SELECT id FROM trace_histories WHERE tenant_id = ? AND type = 0 AND summary = ? AND openid = ? AND created_at > datetime('now', ?)`)
      .get(tenantId, code, openid, `-${win} seconds`);
    if (recent) {
      deduped = true;
    } else {
      const remark = typeof makeRemark === 'function' ? makeRemark(queryNo) : `第${queryNo}次查询`;
      db.prepare(`INSERT INTO trace_histories (tenant_id, type, summary, uid, openid, ip, remark, created_at)
        VALUES (?, 0, ?, ?, ?, ?, ?, datetime('now'))`)
        .run(tenantId, code, userId, openid, ip, String(remark || ''));
      if (!isNewEntry) {
        db.prepare('UPDATE trace_codes SET num = num + 1, updated_at = datetime(\'now\') WHERE tenant_id = ? AND id = ?').run(tenantId, cur.id);
      }
      cur = db.prepare('SELECT * FROM trace_codes WHERE id = ?').get(cur.id);
    }
    freshBatch = db.prepare('SELECT * FROM trace_batches WHERE tenant_id = ? AND id = ?').get(tenantId, batch.id);
    db.exec('COMMIT');
  } catch (txErr) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    throw txErr;
  }

  return {
    record: cur,
    batch: freshBatch,
    first: Number(cur.num || 0) <= 1,
    queryNo,
    isNewEntry,
    deduped,
  };
}
