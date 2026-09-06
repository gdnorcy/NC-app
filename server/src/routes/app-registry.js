import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * 应用注册中心路由
 * 提供应用列表、应用详情、应用配置、租户应用开通状态等API
 */
export function createAppRegistryRouter(db) {
  const router = Router();

  // 获取所有应用（公开）
  router.get('/apps', (_req, res) => {
    try {
      const apps = db.prepare('SELECT * FROM solutions WHERE enabled = 1 ORDER BY sort_order').all();
      res.json({
        apps: apps.map(a => ({
          id: a.id, name: a.name, code: a.code, description: a.description,
          icon: a.icon, sortOrder: a.sort_order,
          config: a.app_config ? JSON.parse(a.app_config) : null,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 获取单个应用详情
  router.get('/apps/:code', (req, res) => {
    try {
      const app = db.prepare('SELECT * FROM solutions WHERE code = ? AND enabled = 1').get(req.params.code);
      if (!app) return res.status(404).json({ error: '应用不存在' });
      res.json({
        id: app.id, name: app.name, code: app.code, description: app.description,
        icon: app.icon, config: app.app_config ? JSON.parse(app.app_config) : null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 获取租户已开通的应用
  router.get('/tenant/apps', requireAuth, (req, res) => {
    try {
      const customer = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.user.customer_id);
      if (!customer) return res.status(404).json({ error: '租户不存在' });

      const enabledCodes = customer.solutions ? JSON.parse(customer.solutions) : [];
      const apps = db.prepare('SELECT * FROM solutions WHERE enabled = 1 AND code IN (' + enabledCodes.map(() => '?').join(',') + ') ORDER BY sort_order')
        .all(...enabledCodes);

      res.json({
        apps: apps.map(a => ({
          id: a.id, name: a.name, code: a.code, description: a.description,
          icon: a.icon, config: a.app_config ? JSON.parse(a.app_config) : null,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 获取租户应用配置
  router.get('/tenant/apps/:code/config', requireAuth, (req, res) => {
    try {
      const customer = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.user.customer_id);
      if (!customer) return res.status(404).json({ error: '租户不存在' });

      const appConfig = customer.config ? JSON.parse(customer.config) : {};
      res.json({ config: appConfig[req.params.code] || {} });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 更新租户应用配置
  router.put('/tenant/apps/:code/config', requireAuth, (req, res) => {
    try {
      const customer = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.user.customer_id);
      if (!customer) return res.status(404).json({ error: '租户不存在' });

      const config = customer.config ? JSON.parse(customer.config) : {};
      config[req.params.code] = req.body;
      db.prepare('UPDATE projects SET config = ?, updated_at = datetime("now") WHERE id = ?')
        .run(JSON.stringify(config), req.user.customer_id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 检查应用是否对租户开通
  router.get('/tenant/apps/:code/check', requireAuth, (req, res) => {
    try {
      const customer = db.prepare('SELECT solutions FROM projects WHERE id = ?').get(req.user.customer_id);
      if (!customer) return res.json({ enabled: false });
      const enabledCodes = customer.solutions ? JSON.parse(customer.solutions) : [];
      res.json({ enabled: enabledCodes.includes(req.params.code) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
      req.user = jwt.verify(token, config.jwtSecret);
      next();
    } catch (e) {
      res.status(401).json({ error: '登录已过期' });
    }
  }

  return router;
}
