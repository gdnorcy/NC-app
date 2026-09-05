import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { createDb } from './db.js';
import { createAuthRouter, requireAuth } from './auth.js';
import { createScenesRouter } from './routes/scenes.js';

export function createApp({ db } = {}) {
  const database = db || createDb();
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // 全景图静态服务
  app.use('/uploads', express.static(config.uploadsDir, { fallthrough: true }));

  // 登录 / 场景 API
  app.use('/api/auth', createAuthRouter());
  app.use('/api', createScenesRouter(database));

  // 健康检查
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // 生产环境：托管 web 构建产物，SPA 路由回退到 index.html
  const indexHtml = path.join(config.webDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.webDistDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      return res.sendFile(indexHtml);
    });
  }

  return app;
}
