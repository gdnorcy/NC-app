import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { config } from './config.js';
import { createDb } from './db.js';
import { createAuthRouter, requireAuth } from './auth.js';
import { createScenesRouter } from './routes/scenes.js';
import { createStorageRouter } from './routes/storage.js';
import { createPlansRouter } from './routes/plans.js';
import { createCustomersRouter } from './routes/customers.js';
import { createUsersRouter } from './routes/users.js';
import { createSettingsRouter } from './routes/settings.js';
import { createLogsRouter } from './routes/logs.js';
import { createCustomerRouter } from './routes/customer.js';
import { createSolutionsRouter } from './routes/solutions.js';
import { createMultiAuthRouter } from './routes/multi-auth.js';
import { createAppRegistryRouter } from './routes/app-registry.js';
import { createOAuthRouter } from './routes/oauth.js';
import { createOpenApiRouter } from './routes/openapi.js';
import { createOAuthAppsRouter } from './routes/oauth-apps.js';
import { createChannelRouter } from './routes/channel.js';
import { createCardRouter } from './routes/card.js';
import { createPaymentRouter } from './routes/payment.js';
import { createCardMarketRouter } from './routes/cardMarket.js';

export function createApp({ db } = {}) {
  const database = db || createDb();
  const app = express();

  // 微信回调需要原始XML文本，必须在express.json之前
  app.use('/api/channel/wx-callback', express.text({ type: '*/xml' }));
  app.use('/api/channel/wx-message', express.text({ type: '*/xml' }));

  app.use(express.json({ limit: '1mb' }));

  // 全景图静态服务
  app.use('/uploads', express.static(config.uploadsDir, { fallthrough: true }));

  // 登录 / 方案 / 场景 / 客户项目 / 用户 API
  app.use('/api/auth', createAuthRouter(database));
  app.use('/api', createPlansRouter(database));
  app.use('/api', createScenesRouter(database));
  app.use('/api/admin', createCustomersRouter(database));
  app.use('/api/admin', createStorageRouter(database));
  app.use('/api/admin/users', createUsersRouter(database));
  app.use('/api', createSettingsRouter(database));
  app.use('/api', createLogsRouter(database));
  app.use('/api/customer', requireAuth, createCustomerRouter(database));
  app.use('/api/admin/solutions', requireAuth, createSolutionsRouter(database));
  app.use('/api/auth', createMultiAuthRouter(database));
  app.use('/api', createAppRegistryRouter(database));
  app.use('/oauth', createOAuthRouter(database));
  app.use('/openapi', createOpenApiRouter(database));
  app.use('/api/admin/oauth', createOAuthAppsRouter(database));
  app.use('/api/channel', createChannelRouter(database));
  app.use('/api/card', createCardRouter(database, {
    code2Session: async (code) => {
      // TODO: 接入微信code2session，暂时返回mock数据
      return { openid: 'mock_' + code, unionid: '' };
    },
  }));
  // 支付回调不需要认证（第三方支付平台调用）
  app.use('/api/payment/notify', createPaymentRouter(database));
  // 支付API使用组合认证：支持JWT（租户/平台）和card_token（个人用户）
  const comboAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '未登录' });
    // 尝试card_token格式
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      if (payload.uid) {
        const user = database.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
        if (user && user.status === 'active') {
          req.user = { ...user, id: user.id, role: 'personal_user', customerId: user.customer_id || null };
          req.userId = user.id;
          // 未直接绑定租户时回退到所属企业映射的租户（与 card.js auth 保持一致）
          if (!req.user.customerId && user.enterprise_id) {
            const ent = database.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(user.enterprise_id);
            if (ent) req.user.customerId = ent.customer_id;
          }
          return next();
        }
      }
    } catch {}
    // 回退到JWT认证
    requireAuth(req, res, next);
  };
  app.use('/api/payment', comboAuth, createPaymentRouter(database));
  // 人脉集市API（组合认证：支持JWT和card_token）
  app.use('/api/card-market', comboAuth, createCardMarketRouter(database));

  // 健康检查
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // 旧URL重定向到新URL
  app.get('/admin.html', (_req, res) => res.redirect(301, '/admin'));
  app.get('/customer.html', (_req, res) => res.redirect(301, '/customer'));

  // Vue管理后台构建产物
  const adminDist = path.join(config.publicDir, 'admin');
  if (fs.existsSync(adminDist)) {
    app.use('/admin-assets', express.static(adminDist, { maxAge: '1y' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path === '/admin' || req.path.startsWith('/admin/')) {
        res.set('Cache-Control', 'no-cache');
        return res.sendFile(path.join(adminDist, 'admin.html'));
      }
      if (req.path === '/customer' || req.path.startsWith('/customer/')) {
        res.set('Cache-Control', 'no-cache');
        return res.sendFile(path.join(adminDist, 'customer.html'));
      }
      next();
    });
  }

  // uni-app H5构建产物（移动端）
  const mobileDist = path.join(__dirname, '..', '..', 'web-app', 'dist', 'build', 'h5');
  if (fs.existsSync(mobileDist)) {
    app.use('/mobile-assets', express.static(path.join(mobileDist, 'assets'), { maxAge: '1y' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path === '/mobile' || req.path.startsWith('/mobile/')) {
        res.set('Cache-Control', 'no-cache');
        return res.sendFile(path.join(mobileDist, 'index.html'));
      }
      next();
    });
  }

  // 智能名片H5构建产物
  const cardDist = path.join(config.publicDir, 'card');
  if (fs.existsSync(cardDist)) {
    app.use('/card/assets', express.static(path.join(cardDist, 'assets'), { maxAge: '1y' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path === '/card' || req.path.startsWith('/card/')) {
        res.set('Cache-Control', 'no-cache');
        return res.sendFile(path.join(cardDist, 'index.html'));
      }
      next();
    });
  }

  // 生产环境：托管 web 构建产物，SPA 路由回退到对应入口页
  const indexHtml = path.join(config.webDistDir, 'index.html');
  const oldAdminHtml = path.join(config.webDistDir, 'admin.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.webDistDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
        },
      })
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      if (req.path.startsWith('/admin') || req.path.startsWith('/customer')) return next();
      if (req.path.startsWith('/card')) return next();
      return res.sendFile(indexHtml);
    });
  }

  // 统一错误处理：记录堆栈（生产诊断必需），返回安全错误信息
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api-error]', req.method, req.path, err?.message || err);
    if (err?.stack) console.error(err.stack);
    const status = err?.status || 500;
    const message = err?.expose ? err.message : (status >= 500 ? '服务器内部错误' : (err?.message || '请求失败'));
    if (!res.headersSent) res.status(status).json({ error: message });
  });

  return app;
}
