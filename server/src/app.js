import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { createDb } from './db.js';
import { createAuthRouter, requireAuth } from './auth.js';
import { createScenesRouter } from './routes/scenes.js';
import { createStorageRouter } from './routes/storage.js';
import { createPlansRouter } from './routes/plans.js';
import { createCustomersRouter } from './routes/customers.js';

export function createApp({ db } = {}) {
  const database = db || createDb();
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // 全景图静态服务
  app.use('/uploads', express.static(config.uploadsDir, { fallthrough: true }));

  // 登录 / 方案 / 场景 / 客户项目 API
  app.use('/api/auth', createAuthRouter());
  app.use('/api', createPlansRouter(database));
  app.use('/api', createScenesRouter(database));
  app.use('/api/admin', createCustomersRouter(database));
  app.use('/api/admin', createStorageRouter(database));

  // 健康检查
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // 生产环境：托管 web 构建产物，SPA 路由回退到对应入口页
  const indexHtml = path.join(config.webDistDir, 'index.html');
  const adminHtml = path.join(config.webDistDir, 'admin.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.webDistDir, {
        // HTML 每次校验（内容常变）；带 hash 的 assets 仍走默认长缓存
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
        },
      })
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      const target = req.path.startsWith('/admin') ? adminHtml : indexHtml;
      return res.sendFile(target);
    });
  }

  return app;
}
