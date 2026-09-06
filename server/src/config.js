import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'panorama-dev-secret',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPass: process.env.ADMIN_PASS || 'admin123',
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  dbPath: path.join(dataDir, 'panorama.db'),
  webDistDir: path.join(__dirname, '..', '..', 'web', 'dist'),
  publicDir: path.join(__dirname, '..', 'public'),
  maxUploadBytes: 50 * 1024 * 1024,
  // 上传转码：主图最大长边（像素）与 WebP 质量
  imageMaxSize: Number(process.env.IMAGE_MAX_SIZE || 4096),
  imageQuality: Number(process.env.IMAGE_QUALITY || 80),
  // 低清预览图长边（像素），用于渐进加载与缩略图
  previewSize: Number(process.env.PREVIEW_SIZE || 1024),
};
