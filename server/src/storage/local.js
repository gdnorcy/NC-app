import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

/**
 * 本地存储：文件写入 server/data/uploads/，URL 为 /uploads/{filename}
 */
export class LocalStorage {
  constructor(storageConfig) {
    this.config = storageConfig || { provider: 'local' };
  }

  /** @returns {Promise<string>} 可公开访问的 URL（支持子目录 key） */
  async put(buffer, key) {
    const rel = path.posix.normalize(key).replace(/^\/+/, '');
    if (rel === '.' || rel === '..' || rel.startsWith('../')) throw new Error('非法存储路径');
    const target = path.resolve(config.uploadsDir, rel);
    const root = path.resolve(config.uploadsDir);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('非法存储路径');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return `/uploads/${rel}`;
  }

  async delete(publicUrl) {
    if (!publicUrl) return;
    const rel = decodeURIComponent(publicUrl.replace(/^\/uploads\//, ''));
    const root = path.resolve(config.uploadsDir);
    const target = path.resolve(path.join(root, rel));
    if (target !== root && !target.startsWith(root + path.sep)) return;
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      // 顺带清理空的父目录（瓦片层级目录等）
      let dir = path.dirname(target);
      while (dir.startsWith(root) && dir !== root && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      }
    }
  }

  async testConnection() {
    return { ok: true, message: '本地存储可用' };
  }
}
