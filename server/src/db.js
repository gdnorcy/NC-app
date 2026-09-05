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
`;

export function createDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** 存量库迁移：补充新增列 */
function migrate(db) {
  const columns = db.prepare('PRAGMA table_info(scenes)').all();
  const names = new Set(columns.map((c) => c.name));
  if (!names.has('preview_path')) {
    db.exec("ALTER TABLE scenes ADD COLUMN preview_path TEXT NOT NULL DEFAULT ''");
  }
}

/** 数据库行 -> API JSON（camelCase） */
export function toScene(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imagePath: row.image_path,
    previewPath: row.preview_path || '',
    sortOrder: row.sort_order,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
