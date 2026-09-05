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
  maxUploadBytes: 50 * 1024 * 1024,
};
