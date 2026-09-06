import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { requireOAuth } from './oauth.js';
import { getStorage } from '../storage/index.js';
import { toPlan, toScene } from '../db.js';

/**
 * 开放 API 路由
 * 供第三方应用通过 OAuth Token 调用
 */
export function createOpenApiRouter(db) {
  const router = Router();

  // 简单内存限流（按app_id，每分钟）
  const rateLimitMap = new Map();

  function rateLimit(req, res, next) {
    const appId = req.oauth.appId;
    const limit = req.oauth.rateLimit || 100;
    const now = Date.now();
    const windowStart = now - 60 * 1000;

    if (!rateLimitMap.has(appId)) rateLimitMap.set(appId, []);
    const calls = rateLimitMap.get(appId).filter(t => t > windowStart);
    rateLimitMap.set(appId, calls);

    if (calls.length >= limit) {
      return res.status(429).json({ error: 'rate_limit_exceeded', error_description: `请求频率超过限制（${limit}次/分钟）` });
    }
    calls.push(now);
    next();
  }

  // API调用日志中间件
  function apiLog(req, res, next) {
    const startTime = Date.now();
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const responseTime = Date.now() - startTime;
      try {
        db.prepare(`INSERT INTO api_logs (app_id, user_id, endpoint, method, status_code, ip, response_time, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            req.oauth?.appId || null,
            req.oauth?.userId || null,
            req.path,
            req.method,
            res.statusCode,
            req.ip,
            responseTime,
            body?.error || null
          );
      } catch (e) { /* 日志失败不影响API */ }
      return originalJson(body);
    };
    next();
  }

  router.use(requireOAuth(db));
  router.use(rateLimit);
  router.use(apiLog);

  // —— 方案列表 ——
  router.get('/plans', (req, res) => {
    if (!req.oauth.scopes.includes('read')) return res.status(403).json({ error: 'insufficient_scope' });
    const userId = req.oauth.userId;
    const user = db.prepare('SELECT customer_id FROM users WHERE id = ?').get(userId);
    if (!user?.customer_id) return res.json({ plans: [] });

    const plans = db.prepare('SELECT * FROM plans WHERE project_id = ? ORDER BY sort_order ASC, id ASC').all(user.customer_id);
    res.json({ plans: plans.map(p => toPlan(p)) });
  });

  // —— 方案详情 ——
  router.get('/plans/:id', (req, res) => {
    if (!req.oauth.scopes.includes('read')) return res.status(403).json({ error: 'insufficient_scope' });
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(req.params.id));
    if (!plan) return res.status(404).json({ error: 'not_found' });
    res.json({ plan: toPlan(plan) });
  });

  // —— 场景列表 ——
  router.get('/plans/:planId/scenes', (req, res) => {
    if (!req.oauth.scopes.includes('read')) return res.status(403).json({ error: 'insufficient_scope' });
    const scenes = db.prepare('SELECT * FROM scenes WHERE plan_id = ? ORDER BY sort_order ASC, id ASC').all(Number(req.params.planId));
    res.json({ scenes: scenes.map(s => toScene(s)) });
  });

  // —— 场景详情 ——
  router.get('/scenes/:id', (req, res) => {
    if (!req.oauth.scopes.includes('read')) return res.status(403).json({ error: 'insufficient_scope' });
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(Number(req.params.id));
    if (!scene) return res.status(404).json({ error: 'not_found' });
    res.json({ scene: toScene(scene) });
  });

  // —— 创建场景 ——
  router.post('/scenes', (req, res) => {
    if (!req.oauth.scopes.includes('write')) return res.status(403).json({ error: 'insufficient_scope' });
    const { planId, title, description, imagePath, sortOrder } = req.body;
    if (!planId || !title) return res.status(400).json({ error: '缺少必要参数' });

    const info = db.prepare(`INSERT INTO scenes (plan_id, title, description, image_path, sort_order, published) VALUES (?, ?, ?, ?, ?, 1)`)
      .run(Number(planId), title, description || '', imagePath || '', sortOrder || 0);
    const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ scene: toScene(scene) });
  });

  // —— 上传全景图 ——
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });
  router.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.oauth.scopes.includes('write')) return res.status(403).json({ error: 'insufficient_scope' });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    try {
      const storage = await getStorage(db);
      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const filename = `openapi-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
      const url = await storage.put(req.file.buffer, filename);
      res.status(201).json({ path: url, filename });
    } catch (e) {
      res.status(400).json({ error: '上传失败', detail: e.message });
    }
  });

  // —— 生成分享链接 ——
  router.post('/share', (req, res) => {
    if (!req.oauth.scopes.includes('read')) return res.status(403).json({ error: 'insufficient_scope' });
    const { planId, sceneId } = req.body;
    if (!planId) return res.status(400).json({ error: '缺少planId' });

    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(planId));
    if (!plan) return res.status(404).json({ error: '方案不存在' });

    const shareUrl = `${req.protocol}://${req.get('host')}/?plan=${planId}${sceneId ? `&scene=${sceneId}` : ''}`;
    res.json({ share_url: shareUrl, plan_id: planId, scene_id: sceneId || null });
  });

  // —— 获取用户信息 ——
  router.get('/userinfo', (req, res) => {
    const user = db.prepare('SELECT id, username, phone, role, customer_id FROM users WHERE id = ?').get(req.oauth.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user });
  });

  return router;
}
