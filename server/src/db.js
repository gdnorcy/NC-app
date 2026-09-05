import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  preview_path TEXT NOT NULL DEFAULT '',
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

export function createDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  db.exec("INSERT OR IGNORE INTO storage_config (id, provider) VALUES (1, 'local')");
  migrate(db);
  return db;
}

/** 存量库迁移：场景表补 preview_path / pyramid；存储配置表升级为多厂商结构 */
function migrate(db) {
  const sceneCols = db.prepare('PRAGMA table_info(scenes)').all();
  if (!sceneCols.some((c) => c.name === 'preview_path')) {
    db.exec("ALTER TABLE scenes ADD COLUMN preview_path TEXT NOT NULL DEFAULT ''");
  }
  if (!sceneCols.some((c) => c.name === 'pyramid')) {
    db.exec("ALTER TABLE scenes ADD COLUMN pyramid TEXT NOT NULL DEFAULT ''");
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
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
