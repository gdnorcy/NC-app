import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
import { createStoreRouter } from './routes/store.js';
import { createGoodsRouter } from './routes/goods.js';
import { createLiveRouter } from './routes/live.js';
import { createCardKeyRouter } from './routes/cardKey.js';
import { createGiftCardRouter } from './routes/giftCard.js';
import { createGiftRouter } from './routes/giftProduct.js';
import { createContentRouter, createContentPublicRouter } from './routes/content.js';
import { createSolutionsRouter } from './routes/solutions.js';
import { createMultiAuthRouter } from './routes/multi-auth.js';
import { createAppRegistryRouter } from './routes/app-registry.js';
import { createAppsAdminRouter } from './routes/appsAdmin.js';
import { createCardTemplateRouter } from './routes/cardTemplates.js';
import { adminOverview } from './services/analytics.js';
import { createOAuthRouter } from './routes/oauth.js';
import { createOpenApiRouter } from './routes/openapi.js';
import { createOAuthAppsRouter } from './routes/oauth-apps.js';
import { createChannelRouter } from './routes/channel.js';
import { createCardRouter } from './routes/card.js';
import { createMallRouter } from './routes/mall.js';
import { createPaymentRouter } from './routes/payment.js';
import { createDistributionRouter } from './routes/distribution.js';
import { default as createDesignRouter } from './routes/design.js';import { createCardMarketRouter } from './routes/cardMarket.js';
import { createBillingRouter, createCustomerBillingRouter } from './routes/billing.js';
import { hasSolution, tenantState } from './tenant.js';

export function createApp({ db, deps = {} } = {}) {
  const database = db || createDb();
  const app = express();

  // API 响应禁用 ETag/304 协商缓存：uni.request(H5 XHR) 遇到 304 会拿到空 body，
  // 导致「接口 200/304 但页面数据为空」（购物车/门店等 GET 均受影响），API 数据频繁变更不该走协商缓存
  app.disable('etag');

  // 微信回调需要原始XML文本，必须在express.json之前
  app.use('/api/channel/wx-callback', express.text({ type: '*/xml' }));
  app.use('/api/channel/wx-message', express.text({ type: '*/xml' }));

  app.use(express.json({ limit: '1mb' }));

  // —— 统一请求日志 + requestId（仅记录 API，静态资源不刷屏） ——
  app.use((req, res, next) => {
    req.id = crypto.randomUUID().slice(0, 8);
    if (!req.path.startsWith('/api/')) return next();
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[api] ${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

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
  app.use('/api/customer/distribution', requireAuth, createDistributionRouter(database));
  // 商品体系（1:1 菜鸟云 duoproducts）：商品/分类/参数/商城设置
  app.use('/api/customer/goods', requireAuth, createGoodsRouter(database));
  // 小程序直播（1:1 菜鸟云「微信直播」）：直播列表/商品同步/商品审核
  app.use('/api/customer/live', requireAuth, createLiveRouter(database, deps));
  // 内容体系（1:1 菜鸟云「内容」）：文章/组图/视频/评论/基础设置（管理端）+ C 端公开读取
  app.use('/api/customer/content', requireAuth, createContentRouter(database));
  // 门店体系（1:1 nshop 连锁门店 chainShop）：门店/分组/标签/提现/基础设置 + 配额购买
  app.use('/api/customer/store', requireAuth, createStoreRouter(database));
  app.use('/api/card/content', createContentPublicRouter(database));
  // 商城 C 端公开 API（/api/mall 独立命名空间，方案C；requireGoodsApp C 端变体在 router 内）
  app.use('/api/mall', createMallRouter(database));
  app.use('/api/customer/card-key', requireAuth, createCardKeyRouter(database));
  app.use('/api/customer/gift-card', requireAuth, createGiftCardRouter(database));
  app.use('/api/customer/gift', requireAuth, createGiftRouter(database));

  // 设计中心：素材中心 /api/material + 装修配置 /api/design（顶层前缀，租户中间件内部校验）
  const designRouters = createDesignRouter(database);
  app.use('/api/material', requireAuth, designRouters.material);
  app.use('/api/design', requireAuth, designRouters.design);

  app.use('/api/admin/solutions', requireAuth, createSolutionsRouter(database));
  // 总后台 · 应用中心（应用分类/卡片管理）
  app.use('/api/admin/apps-center', requireAuth, createAppsAdminRouter(database));
  // 名片模板库：平台公共（总后台）+ 租户私有（客户后台）
  app.use('/api/admin/card', requireAuth, createCardTemplateRouter(database, { mode: 'admin' }));
  app.use('/api/customer/card', requireAuth, createCardTemplateRouter(database, { mode: 'tenant' }));
  // 总后台：行为分析概览（按解决方案）
  app.use('/api/admin/analytics', requireAuth, (req, res) => {
    if (req.method === 'GET') {
      try {
        const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
        res.json(adminOverview(database, { days }));
      } catch (e) { res.status(500).json({ error: e.message }); }
    } else {
      res.status(405).json({ error: 'Method Not Allowed' });
    }
  });
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
    // 公开路径白名单（访客免认证）：表单提交
    if (/^\/forms\/\d+\/submit$/.test(req.path)) {
      req.user = null;
      return next();
    }
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
          // 最后兜底：按入驻记录（个体/员工）反查租户，防止 enterprise_id 脏数据导致无法访问
          if (!req.user.customerId) {
            const member = database.prepare("SELECT customer_id FROM tenant_individuals WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(user.id)
              || database.prepare("SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1").get(user.id);
            if (member) req.user.customerId = member.customer_id;
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
  // 计费API（总后台套餐/发票管理 + 客户后台套餐/发票）
  app.use('/api', createBillingRouter(database));
  app.use('/api/customer', requireAuth, createCustomerBillingRouter(database));

  // 健康检查（含依赖探测：数据库连通性）
  app.get('/api/health', (_req, res) => {
    let dbOk = true;
    try {
      database.prepare('SELECT 1').get();
    } catch {
      dbOk = false;
    }
    res.json({
      ok: dbOk,
      uptime: Math.round(process.uptime()),
      version: config.version || '1.0.0',
      db: dbOk ? 'ok' : 'error',
      ts: Date.now(),
    });
  });

  // 旧URL重定向到新URL
  app.get('/admin.html', (_req, res) => res.redirect(301, '/admin'));
  app.get('/customer.html', (_req, res) => res.redirect(301, '/customer'));

  // 送礼物分享样式素材（1:1 复刻菜鸟云 giftForYou 3 张分享图）
  const giftShareDist = path.join(config.publicDir, 'gift-share');
  if (fs.existsSync(giftShareDist)) {
    app.use('/gift-share', express.static(giftShareDist, { maxAge: '1y' }));
  }

  // 商城风格素材（1:1 复刻菜鸟云 duoproducts/cateset：分类/详情风格缩略图、详情背景、分享图、价格背景、主题图）
  const goodsStyleDist = path.join(config.publicDir, 'goods-style');
  if (fs.existsSync(goodsStyleDist)) {
    app.use('/goods-style', express.static(goodsStyleDist, { maxAge: '1y' }));
  }

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

  // ============ 行业应用公开入口（独立首页方案：每个应用一个 URL 前缀） ============
  // 登记表：路径前缀 → { code: 应用 code, name: 应用名, dist: 产物目录, index: 入口文件名 }
  // 未来新增行业应用（/mall、/content、/live…）只需在此登记 + 产物就位。
  // 未开通校验：仅当顶层 query 带 tid 且租户可判定时生效（未开通 → 统一「未开通」提示页）；
  // 无 tid / 预览签名(exp+sig) / 静态资源一律放行（兼容 hash 内 tid 的旧链接）。
  const appEntries = [];

  const notOpenedPage = (entry) => `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"><title>应用未开通</title></head>
<body style="margin:0;background:#F7F8FA;font-family:'PingFang SC','Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:32px;">
<svg width="56" height="56" viewBox="0 0 24 24" fill="none" style="display:block;margin:0 auto 16px;">
<rect x="5" y="11" width="14" height="9" rx="2" stroke="#165DFF" stroke-width="1.6"/>
<path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#165DFF" stroke-width="1.6"/>
</svg>
<h1 style="font-size:18px;color:#1D2129;margin:0 0 8px;">「${entry.name}」未开通</h1>
<p style="font-size:14px;color:#86909C;margin:0 0 24px;line-height:1.6;">该应用尚未在当前租户开通，请联系平台管理员，<br/>或前往应用中心开通后使用。</p>
<a href="/customer#/apps" style="display:inline-block;background:#165DFF;color:#fff;text-decoration:none;font-size:14px;padding:10px 24px;border-radius:8px;">前往应用中心</a>
</div></body></html>`;

  // 智能名片H5构建产物（/card）
  const cardDist = path.join(config.publicDir, 'card');
  if (fs.existsSync(cardDist)) {
    appEntries.push({ prefix: '/card', code: 'card', name: '智能名片', dist: cardDist, index: 'index.html' });
    // 商城 C 端独立入口预留（/mall）：当前与 /card 共用 uni H5 产物，hash 直达商城页；
    // 未来商城 C 端独立构建时，仅需将 mallDist 指向新产物目录即可（code 已按 goods 应用校验开通）
    const mallDist = path.join(config.publicDir, 'card');
    appEntries.push({ prefix: '/mall', code: 'goods', name: '商城', dist: mallDist, index: 'index.html' });
  }

  // 360全景查看端（/pano）：vite 构建产物 base=/pano/，SW 注册 /pano/sw.js
  const indexHtml = path.join(config.webDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    appEntries.push({ prefix: '/pano', code: 'panorama', name: '360全景', dist: config.webDistDir, index: 'index.html' });
  }

  // 统一入口校验（先于所有 express.static 注册，确保带 tid 的 HTML 请求先经过未开通判定）
  for (const entry of appEntries) {
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path !== entry.prefix && !req.path.startsWith(entry.prefix + '/')) return next();
      if (req.path.startsWith(entry.prefix + '/assets') || req.path.startsWith(entry.prefix + '/static')) return next();
      if (req.query.exp && req.query.sig) return next();
      const tid = Number(req.query.tid);
      if (tid) {
        const state = tenantState(database, tid, { ctx: 'mini' });
        if (state.missing || state.expired) {
          res.status(403).set('Cache-Control', 'no-cache');
          return res.send(notOpenedPage(entry));
        }
        if (!hasSolution(database, tid, entry.code)) {
          res.status(403).set('Cache-Control', 'no-cache');
          return res.send(notOpenedPage(entry));
        }
      }
      next();
    });
  }

  // 静态资源（强缓存）
  for (const entry of appEntries) {
    app.use(`${entry.prefix}/assets`, express.static(path.join(entry.dist, 'assets'), { maxAge: '1y' }));
    if (fs.existsSync(path.join(entry.dist, 'static'))) {
      app.use(`${entry.prefix}/static`, express.static(path.join(entry.dist, 'static'), { maxAge: '1y' }));
    }
  }
  // 全景其余静态文件（sw.js、favicon 等，HTML 不缓存）
  if (fs.existsSync(indexHtml)) {
    app.use('/pano', express.static(config.webDistDir, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
      },
    }));
    // 旧 SW 注册地址兼容：/sw.js → /pano/sw.js
    app.get('/sw.js', (req, res) => res.redirect(301, '/pano/sw.js'));
    // 根路径兼容：旧全景入口 / 迁移到 /pano（保留 query，如 ?plan=1&scene=N）
    app.use((req, res, next) => {
      if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
        const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
        return res.redirect(301, '/pano' + q);
      }
      next();
    });
  }

  // /mall 无路径时默认直达商城占位页（保留 query，如 ?tid=1），保持 /mall 前缀独立入口观感；
  // 仅精确匹配裸 /mall（无尾斜杠）。注意：redirect 目标必须带尾斜杠 /mall/，
  // 否则浏览器重发请求时 hash 不上送，路径仍为 /mall → 无限重定向（ERR_TOO_MANY_REDIRECTS）。
  app.get('/mall', (req, res, next) => {
    if (req.path !== '/mall') return next();
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, '/mall/' + q + '#/pages/mall/index');
  });

  // 统一入口 fallback（静态资源已由 express.static 处理，走到这里的是 SPA 路由/HTML）
  for (const entry of appEntries) {
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path !== entry.prefix && !req.path.startsWith(entry.prefix + '/')) return next();
      res.set('Cache-Control', 'no-cache');
      return res.sendFile(path.join(entry.dist, entry.index));
    });
  }

  // 统一错误处理：记录堆栈（生产诊断必需），返回安全错误信息
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(`[api-error] ${req.id || '-'} ${req.method} ${req.path}`, err?.message || err);
    if (err?.stack) console.error(err.stack);
    const status = err?.status || 500;
    const message = err?.expose ? err.message : (status >= 500 ? '服务器内部错误' : (err?.message || '请求失败'));
    if (!res.headersSent) res.status(status).json({ error: message });
  });

  return app;
}
