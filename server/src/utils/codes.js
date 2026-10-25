/**
 * 码生成工具（第21轮：入驻兑换码）
 *
 * 背景：全仓原有三处口令生成全是 Math.random 裸写（db.js 的 projects.invite_code、
 * customers.js、customer.js 的 ENT 码），不密码学安全；其中 projects.invite_code
 * 所在列连 UNIQUE 都没有，理论上会撞码。
 *
 * 本文件提供两个能力：
 *   ① genCodes()     —— 可配字母表的安全随机串生成（默认剔除 0/O/1/I/L 等易混淆字符），
 *                        因为兑换码要给用户手打/电话报读，不像 token 可以纯 base64url。
 *   ② generateJoinCodes() —— 批量生成 + 数据库防重循环 + 直接落盘。
 *
 * 🔴 防重必须在 DB 层做最终兜底：table 上有 UNIQUE(code)，这里再兜一层 SELECT 重试，
 *    避免同一批次内自己撞自己把 INSERT 打成 UNIQUE constraint failed 整批失败。
 */
import { randomBytes } from 'node:crypto';

/** 默认字母表：大写字母+数字，剔除 0/O/1/I/L —— 手写录入与电话报读的易混淆件 */
export const DEFAULT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * 生成一个随机码（密码学安全，无取模偏置）
 *
 * 实现要点：拒绝抽样（rejection sampling）。直接 randomBytes(i) % len 会让前
 * (256 % len) 个字节出现概率略高，属于可忽略但真实存在的偏置；这里超出阈值的字节
 * 丢弃重取，保证均匀分布。
 *
 * @param {number} length 码长
 * @param {string} alphabet 字母表
 * @returns {string}
 */
export function genCode(length = 10, alphabet = DEFAULT_ALPHABET) {
  if (!alphabet || alphabet.length < 2) throw new Error('字母表至少需要 2 个字符');
  const size = alphabet.length;
  // 256 以内能被 size 整除的最大值 +1 → 超出这个值的随机字节丢弃重取
  const threshold = 256 - (256 % size);
  let out = '';
  const buf = randomBytes(length * 2); // 多取一些，应对丢弃
  let i = 0;
  while (out.length < length) {
    if (i >= buf.length) {
      // 极端情况（几乎不可能）：重新补 buffer
      return out + genCode(length - out.length, alphabet);
    }
    const b = buf[i++];
    if (b >= threshold) continue; // 丢弃偏置于尾部的字节
    out += alphabet[b % size];
  }
  return out;
}

/**
 * 生成 n 个互不重复的码
 * @param {number} n
 * @param {object} opts { length, alphabet }
 * @returns {string[]}
 */
export function genCodes(n, { length = 10, alphabet = DEFAULT_ALPHABET } = {}) {
  const set = new Set();
  let guard = 0;
  while (set.size < n) {
    set.add(genCode(length, alphabet));
    if (++guard > n * 50) throw new Error('生成唯一码超时，请增大码长或字母表');
  }
  return [...set];
}

/**
 * 批量生成入驻兑换码并落库（含 DB 防重）
 *
 * @param {DatabaseSync} db
 * @param {object} p
 * @param {number} p.customerId 租户（必填，防跨租户）
 * @param {number} p.batchId
 * @param {number} p.count 生成数量
 * @param {string} [p.applyType] individual / enterprise
 * @param {string} [p.expiresAt] YYYY-MM-DD 或为空
 * @param {string} [p.alphabet]
 * @param {number} [p.length]
 * @returns {{ codes: string[], inserted: number }}
 */
export function generateJoinCodes(db, {
  customerId, batchId = 0, count = 1, applyType = 'individual',
  expiresAt = null, alphabet = DEFAULT_ALPHABET, length = 10, remark = '',
}) {
  const n = Math.max(1, Math.min(Number(count) || 1, 2000));
  const exists = db.prepare('SELECT id FROM tenant_join_code WHERE code = ?');
  const insert = db.prepare(`
    INSERT INTO tenant_join_code (customer_id, batch_id, code, status, max_uses, apply_type, expires_at, remark)
    VALUES (?, ?, ?, 0, 1, ?, ?, ?)
  `);

  const codes = [];
  let guard = 0;
  while (codes.length < n) {
    // 一次性生成一批候选，再逐个校验，减少往返
    const candidates = genCodes(Math.min(n - codes.length, 200), { length, alphabet });
    for (const code of candidates) {
      if (exists.get(code)) continue; // 撞库：跳过换下一个（UNIQUE 是最后兜底）
      codes.push(code);
      if (codes.length >= n) break;
    }
    if (++guard > 100) throw new Error('生成唯一兑换码失败：可用空间不足');
  }

  // 🔴 批量落盘必须是事务：要么整批成功，要么回滚。否则部分入库会让租户拿到残缺批次，
  //    还得人工去数哪些生成了（批量下发场景最常见的坑）。
  db.exec('BEGIN');
  try {
    for (const code of codes) {
      insert.run(Number(customerId), Number(batchId), code, applyType, expiresAt, remark);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* 回滚失败无需再抛 */ }
    throw e;
  }
  return { codes, inserted: codes.length };
}
