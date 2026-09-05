import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

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
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

/** 存量库迁移：场景表补字段；建默认项目收纳旧场景；存储配置升级为多厂商 */
function migrate(db) {
  const sceneCols = db.prepare('PRAGMA table_info(scenes)').all();
  if (!sceneCols.some((c) => c.name === 'preview_path')) {
    db.exec("ALTER TABLE scenes ADD COLUMN preview_path TEXT NOT NULL DEFAULT ''");
  }
  if (!sceneCols.some((c) => c.name === 'pyramid')) {
    db.exec("ALTER TABLE scenes ADD COLUMN pyramid TEXT NOT NULL DEFAULT ''");
  }
  const addCol = (name, ddl) => {
    const cols = db.prepare('PRAGMA table_info(scenes)').all();
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE scenes ADD COLUMN ${ddl}`);
  };
  addCol('project_id', 'project_id INTEGER');
  addCol('share_token', "share_token TEXT NOT NULL DEFAULT ''");
  addCol('share_enabled', 'share_enabled INTEGER NOT NULL DEFAULT 0');

  // 默认项目：收纳所有未归属（含存量）场景
  const projectCount = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  let defaultId = null;
  if (projectCount === 0) {
    const info = db
      .prepare('INSERT INTO projects (name, description, share_token, share_enabled) VALUES (?, ?, ?, 1)')
      .run('默认项目', '自动创建的默认项目，收纳全部存量场景', genShareToken());
    defaultId = info.lastInsertRowid;
  } else {
    defaultId = db.prepare('SELECT id FROM projects ORDER BY sort_order ASC, id ASC LIMIT 1').get()?.id || null;
  }
  if (defaultId !== null) {
    db.prepare('UPDATE scenes SET project_id = ? WHERE project_id IS NULL OR project_id = 0').run(defaultId);
  }

  const storageCols = db.prepare('PRAGMA table_info(storage_config)').all().map((c) => c.name);
  // 旧版单厂商结构（access_key 列存在）→ 升级为多厂商 providers JSON
  if (storageCols.includes('access_key')) {
    const old = db.prepare('SELECT * FROM storage_config WHERE id = 1').get() || {};
    const base = { accessKey: '', secretKey: '', bucket: '', region: '', zone: '', folder: '', cdnDomain: '' };
    const providers = {
      local: {},
      oss: { ...base },
      qiniu: { ...base },
    };
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
}

/** 数据库行 -> 项目 API JSON（camelCase） */
export function toProject(row) {
  if (!row) return null;
  return {
    id: row.id,
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

/** 数据库行 -> API JSON（camelCase） */
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
    projectId: row.project_id || null,
    shareToken: row.share_token || '',
    shareEnabled: Boolean(row.share_enabled),
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
