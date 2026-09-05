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

  /** @returns {Promise<string>} 可公开访问的 URL */
  async put(buffer, key) {
    const filename = path.basename(key);
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const target = path.join(config.uploadsDir, filename);
    fs.writeFileSync(target, buffer);
    return `/uploads/${filename}`;
  }

  async delete(publicUrl) {
    if (!publicUrl) return;
    const uploadsRoot = path.resolve(config.uploadsDir);
    const target = path.resolve(path.join(uploadsRoot, path.basename(publicUrl)));
    if (target.startsWith(uploadsRoot + path.sep) && fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }

  async testConnection() {
    return { ok: true, message: '本地存储可用' };
  }
}
