import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

/**
 * 三层数据模型：
 *   projects（客户项目） 1:N  plans（方案，原"项目"） 1:N  scenes（场景）
 * 存量迁移：旧 projects 表（方案）重命名为 plans，scenes.project_id 重命名为 plan_id，
 * 新建 projects（客户）表，所有 plans 自动归入"默认客户"。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  preview_path TEXT NOT NULL DEFAULT '',
  pyramid TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS storage_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'local',
  providers TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const PLANS_SCHEMA = `
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_path TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  share_token TEXT NOT NULL DEFAULT '',
  share_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const CUSTOMERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  logo_path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  valid_from TEXT,
  valid_until TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const USERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SMS_CODES_SCHEMA = `
CREATE TABLE IF NOT EXISTS sms_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'register',
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_codes(phone, purpose);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON operation_logs(created_at);
`;

/** 生成不可猜的分享令牌（8 字符 base64url） */
export function genShareToken() {
  return randomBytes(6).toString('base64url');
}

export function createDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  db.exec("INSERT OR IGNORE INTO storage_config (id, provider) VALUES (1, 'local')");
  migrate(db);
  return db;
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function colExists(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
}

/** 存量库迁移（幂等） */
function migrate(db) {
  // —— scenes 表：补字段 + project_id → plan_id ——
  if (!colExists(db, 'scenes', 'preview_path')) {
    db.exec("ALTER TABLE scenes ADD COLUMN preview_path TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'scenes', 'pyramid')) {
    db.exec("ALTER TABLE scenes ADD COLUMN pyramid TEXT NOT NULL DEFAULT ''");
  }
  if (colExists(db, 'scenes', 'project_id') && !colExists(db, 'scenes', 'plan_id')) {
    db.exec('ALTER TABLE scenes RENAME COLUMN project_id TO plan_id');
  }
  if (!colExists(db, 'scenes', 'plan_id')) {
    db.exec('ALTER TABLE scenes ADD COLUMN plan_id INTEGER');
  }
  if (!colExists(db, 'scenes', 'share_token')) {
    db.exec("ALTER TABLE scenes ADD COLUMN share_token TEXT NOT NULL DEFAULT ''");
  }
  if (!colExists(db, 'scenes', 'share_enabled')) {
    db.exec('ALTER TABLE scenes ADD COLUMN share_enabled INTEGER NOT NULL DEFAULT 0');
  }

  // —— 旧 projects（方案）表 → 重命名为 plans ——
  if (tableExists(db, 'projects') && !tableExists(db, 'plans')) {
    // 旧 projects 是方案表（有 name/cover_path/share_token 列），重命名
    const oldCols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
    if (oldCols.includes('name') && oldCols.includes('share_token')) {
      db.exec('ALTER TABLE projects RENAME TO plans');
    }
  }
  db.exec(PLANS_SCHEMA);
  if (!colExists(db, 'plans', 'project_id')) {
    db.exec('ALTER TABLE plans ADD COLUMN project_id INTEGER');
  }

  // —— 新建 projects（客户项目）表 ——
  // 如果上面没重命名（新库或旧 projects 已是客户表），直接建
  if (!tableExists(db, 'projects')) {
    db.exec(CUSTOMERS_SCHEMA);
  } else {
    // 旧库 projects 已被 rename 为 plans，这里补建客户表；若已是客户表则补列
    const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
    if (!cols.includes('customer_name')) {
      // 极端情况：projects 表存在但不是客户表结构 → 重命名为 plans_old 后重建
      db.exec('ALTER TABLE projects RENAME TO projects_old');
      db.exec(CUSTOMERS_SCHEMA);
    } else {
      if (!cols.includes('logo_path')) db.exec("ALTER TABLE projects ADD COLUMN logo_path TEXT NOT NULL DEFAULT ''");
      if (!cols.includes('valid_from')) db.exec('ALTER TABLE projects ADD COLUMN valid_from TEXT');
      if (!cols.includes('valid_until')) db.exec('ALTER TABLE projects ADD COLUMN valid_until TEXT');
      if (!cols.includes('is_pinned')) db.exec('ALTER TABLE projects ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
      if (!cols.includes('remark')) db.exec("ALTER TABLE projects ADD COLUMN remark TEXT NOT NULL DEFAULT ''");
      if (!cols.includes('status')) db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    }
  }

  // —— 默认客户：收纳所有未归属方案 ——
  const custCount = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  let defaultCustId = null;
  if (custCount === 0) {
    const info = db
      .prepare('INSERT INTO projects (customer_name, description, status) VALUES (?, ?, ?)')
      .run('默认客户', '自动创建的默认客户，收纳全部存量方案', 'active');
    defaultCustId = info.lastInsertRowid;
  } else {
    defaultCustId = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get()?.id || null;
  }
  if (defaultCustId !== null) {
    db.prepare('UPDATE plans SET project_id = ? WHERE project_id IS NULL OR project_id = 0').run(defaultCustId);
  }

  // —— 默认方案：收纳所有未归属场景 ——
  let defaultPlanId = db.prepare('SELECT id FROM plans ORDER BY sort_order ASC, id ASC LIMIT 1').get()?.id || null;
  if (defaultPlanId === null) {
    const info = db
      .prepare(
        'INSERT INTO plans (project_id, name, description, share_token, share_enabled) VALUES (?, ?, ?, ?, 1)'
      )
      .run(defaultCustId, '默认方案', '自动创建的默认方案，收纳全部存量场景', genShareToken());
    defaultPlanId = info.lastInsertRowid;
  }
  if (defaultPlanId !== null) {
    db.prepare('UPDATE scenes SET plan_id = ? WHERE plan_id IS NULL OR plan_id = 0').run(defaultPlanId);
  }

  // —— storage_config 多厂商升级 ——
  const storageCols = db.prepare('PRAGMA table_info(storage_config)').all().map((c) => c.name);
  if (storageCols.includes('access_key')) {
    const old = db.prepare('SELECT * FROM storage_config WHERE id = 1').get() || {};
    const base = { accessKey: '', secretKey: '', bucket: '', region: '', zone: '', folder: '', cdnDomain: '' };
    const providers = { local: {}, oss: { ...base }, qiniu: { ...base } };
    const target = old.provider === 'oss' ? 'oss' : old.provider === 'qiniu' ? 'qiniu' : null;
    if (target) {
      providers[target] = {
        accessKey: old.access_key || '',
        secretKey: old.secret_key || '',
        bucket: old.bucket || '',
        region: old.region || '',
        zone: '',
        folder: '',
        cdnDomain: old.cdn_domain || '',
      };
    }
    db.exec('DROP TABLE storage_config');
    db.exec(`
      CREATE TABLE storage_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL DEFAULT 'local',
        providers TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.prepare('INSERT INTO storage_config (id, provider, providers) VALUES (1, ?, ?)').run(
      old.provider || 'local',
      JSON.stringify(providers)
    );
  }

  // —— users 表 + 默认 admin ——
  db.exec(USERS_SCHEMA);
  db.exec(SMS_CODES_SCHEMA);
  const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n;
  if (adminCount === 0) {
    const { hash, salt } = hashPassword(config.adminPass);
    db.prepare(
      'INSERT INTO users (username, phone, password_hash, password_salt, role, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(config.adminUser, null, hash, salt, 'admin', 'active');
  }
}

/** 数据库行 -> 客户项目 API JSON（camelCase） */
export function toCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerName: row.customer_name,
    logoPath: row.logo_path || '',
    description: row.description || '',
    validFrom: row.valid_from || '',
    validUntil: row.valid_until || '',
    isPinned: Boolean(row.is_pinned),
    remark: row.remark || '',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 数据库行 -> 方案 API JSON（camelCase，原 toProject） */
export function toPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id || null,
    name: row.name,
    description: row.description,
    coverPath: row.cover_path || '',
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    shareToken: row.share_token || '',
    shareEnabled: Boolean(row.share_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 兼容旧调用：toProject -> toPlan */
export const toProject = toPlan;

/** 数据库行 -> 场景 API JSON（camelCase） */
export function toScene(row) {
  if (!row) return null;
  let pyramid = null;
  if (row.pyramid) {
    try {
      pyramid = JSON.parse(row.pyramid);
    } catch {
      pyramid = null;
    }
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imagePath: row.image_path,
    previewPath: row.preview_path || '',
    pyramid,
    planId: row.plan_id || null,
    projectId: row.plan_id || null, // 兼容旧前端字段
    shareToken: row.share_token || '',
    shareEnabled: Boolean(row.share_enabled),
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- 密码哈希（scrypt） ----------
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  try {
    const derived = scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** 数据库行 -> 用户 API JSON（camelCase，不含密码哈希） */
export function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username || '',
    phone: row.phone || '',
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- 通用设置（key-value） ----------
export function getAllSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(db, key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, v);
}

export function setSettingsBatch(db, pairs) {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  for (const [k, v] of pairs) {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    stmt.run(k, val);
  }
}

// ---------- 操作日志 ----------
export function addOperationLog(db, { userId, username, action, targetType, targetId, detail, ip }) {
  db.prepare(
    `INSERT INTO operation_logs (user_id, username, action, target_type, target_id, detail, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId ?? null, username ?? null, action, targetType ?? null, targetId ?? null, detail ?? null, ip ?? null);
}

export function queryOperationLogs(db, { userId, action, targetType, from, to, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push('user_id = ?'); params.push(userId); }
  if (action) { where.push('action = ?'); params.push(action); }
  if (targetType) { where.push('target_type = ?'); params.push(targetType); }
  if (from) { where.push('created_at >= ?'); params.push(from); }
  if (to) { where.push('created_at <= ?'); params.push(to); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db
    .prepare(`SELECT * FROM operation_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM operation_logs ${whereSql}`).get(...params)?.n || 0;
  return { logs: rows, total };
}
