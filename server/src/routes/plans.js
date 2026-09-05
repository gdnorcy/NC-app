import path from 'node:path';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { toPlan, toScene, genShareToken, addOperationLog } from '../db.js';
import { requireAuth } from '../auth.js';
import { getStorage } from '../storage/index.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(new Error('仅支持 JPG / PNG / WebP 图片'));
    }
    cb(null, true);
  },
});

function parsePlanBody(body) {
  return {
    projectId: body.projectId === undefined || body.projectId === null ? null : Number(body.projectId) || null,
    name: typeof body.name === 'string' ? body.name.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    coverPath: typeof body.coverPath === 'string' ? body.coverPath.trim() : '',
    sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    published: body.published === undefined ? 1 : body.published ? 1 : 0,
    shareEnabled: body.shareEnabled === undefined ? 1 : body.shareEnabled ? 1 : 0,
    regenerateShareToken: body.regenerateShareToken === true,
  };
}

function shareUrl(req, token) {
  if (!token) return '';
  return `${req.protocol}://${req.get('host')}/s/${token}`;
}

/** 查方案所属客户项目 */
function getCustomerOfPlan(db, planId) {
  const plan = db.prepare('SELECT project_id FROM plans WHERE id = ?').get(planId);
  if (!plan || !plan.project_id) return null;
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(plan.project_id);
}

/** 客户项目是否已过期（valid_until 当天仍算有效） */
function isCustomerExpired(customer) {
  if (!customer || !customer.valid_until) return false;
  if (customer.status === 'disabled') return true;
  const end = new Date(customer.valid_until + 'T23:59:59');
  return end.getTime() < Date.now();
}

/** 方案 + 其上架场景数 */
function planWithSceneCount(db, row) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM scenes WHERE plan_id = ? AND published = 1').get(row.id)?.n || 0;
  return { ...toPlan(row), sceneCount: n };
}

export function createPlansRouter(db) {
  const router = express.Router();

  // —— 公开：分享开启的方案列表（前台首页） ——
  router.get('/plans', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = db
      .prepare(
        `SELECT p.* FROM plans p
         LEFT JOIN projects c ON p.project_id = c.id
         WHERE p.published = 1 AND p.share_enabled = 1
           AND (c.valid_until IS NULL OR c.valid_until >= date('now'))
           AND (c.status IS NULL OR c.status != 'disabled')
         ORDER BY p.sort_order ASC, p.id ASC`
      )
      .all();
    res.json({ plans: rows.map((r) => planWithSceneCount(db, r)) });
  });

  // —— 公开：方案详情（方案 + 上架场景） ——
  router.get('/plans/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    if (!row || !row.published || !row.share_enabled) return res.status(404).json({ error: '方案不存在或未公开' });
    const customer = getCustomerOfPlan(db, id);
    if (isCustomerExpired(customer)) return res.status(403).json({ error: '该客户项目已过期，分享已关闭' });
    const scenes = db
      .prepare('SELECT * FROM scenes WHERE plan_id = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
      .all(id)
      .map(toScene);
    res.json({ plan: planWithSceneCount(db, row), scenes });
  });

  // —— 公开：分享令牌解析（方案级或场景级） ——
  router.get('/s/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(404).json({ error: '链接无效' });

    // 场景级：单场景分享
    const scene = db.prepare('SELECT * FROM scenes WHERE share_token = ? AND share_enabled = 1').get(token);
    if (scene) {
      const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(scene.plan_id) || {};
      const customer = getCustomerOfPlan(db, scene.plan_id);
      if (isCustomerExpired(customer)) return res.status(403).json({ error: '该客户项目已过期，分享已关闭' });
      const scenes = db
        .prepare('SELECT * FROM scenes WHERE plan_id = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
        .all(scene.plan_id)
        .map(toScene);
      return res.json({ type: 'scene', scene: toScene(scene), plan: toPlan(plan) || null, project: toPlan(plan) || null, scenes });
    }

    // 方案级
    const plan = db.prepare('SELECT * FROM plans WHERE share_token = ? AND share_enabled = 1').get(token);
    if (!plan) return res.status(404).json({ error: '链接无效或已关闭' });
    const customer = getCustomerOfPlan(db, plan.id);
    if (isCustomerExpired(customer)) return res.status(403).json({ error: '该客户项目已过期，分享已关闭' });
    const scenes = db
      .prepare('SELECT * FROM scenes WHERE plan_id = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
      .all(plan.id)
      .map(toScene);
    const planWithCount = planWithSceneCount(db, plan);
    res.json({ type: 'project', plan: planWithCount, project: planWithCount, scenes });
  });

  // —— 公开：分享二维码图片 ——
  router.get('/s/:token/qr', async (req, res) => {
    const token = String(req.params.token || '').trim();
    // 方案级
    const plan = db.prepare('SELECT id FROM plans WHERE share_token = ? AND share_enabled = 1').get(token);
    if (plan) {
      const customer = getCustomerOfPlan(db, plan.id);
      if (isCustomerExpired(customer)) return res.status(403).json({ error: '该客户项目已过期' });
    }
    // 场景级
    const scene = db.prepare('SELECT plan_id FROM scenes WHERE share_token = ? AND share_enabled = 1').get(token);
    if (scene) {
      const customer = getCustomerOfPlan(db, scene.plan_id);
      if (isCustomerExpired(customer)) return res.status(403).json({ error: '该客户项目已过期' });
    }
    if (!plan && !scene) return res.status(404).json({ error: '链接无效或已关闭' });
    const size = Math.min(Math.max(Number(req.query.size) || 320, 128), 1024);
    try {
      const url = shareUrl(req, token);
      const png = await QRCode.toBuffer(url, { width: size, margin: 1 });
      res.set('Content-Type', 'image/png').set('Cache-Control', 'no-store').send(png);
    } catch (err) {
      res.status(500).json({ error: '二维码生成失败' });
    }
  });

  // —— 管理：登录后操作 ——
  router.use('/admin', requireAuth);

  router.get('/admin/plans', (_req, res) => {
    const rows = db.prepare('SELECT * FROM plans ORDER BY sort_order ASC, id ASC').all();
    res.json({ plans: rows.map((r) => planWithSceneCount(db, r)) });
  });

  router.post('/admin/plans', (req, res) => {
    const { projectId, name, description, coverPath, sortOrder, published, shareEnabled } = parsePlanBody(req.body);
    if (!name) return res.status(400).json({ error: '方案名称不能为空' });
    // 归属客户：缺省归入第一个客户
    let pid = projectId;
    if (pid === null) {
      pid = db.prepare('SELECT id FROM projects ORDER BY id ASC LIMIT 1').get()?.id || null;
    }
    const info = db
      .prepare(
        `INSERT INTO plans (project_id, name, description, cover_path, sort_order, published, share_token, share_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(pid, name, description, coverPath, sortOrder, published, genShareToken(), shareEnabled);
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_plan', targetType: 'plan', targetId: info.lastInsertRowid, detail: `创建方案: ${name}`, ip: req.ip });
    res.status(201).json({ plan: toPlan(row) });
  });

  router.put('/admin/plans/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '方案不存在' });
    const { projectId, name, description, coverPath, sortOrder, published, shareEnabled, regenerateShareToken } = parsePlanBody(req.body);
    const next = {
      projectId: projectId === null ? row.project_id : projectId,
      name: name || row.name,
      description: description === '' ? row.description : description,
      coverPath: coverPath || row.cover_path || '',
      sortOrder: Number.isNaN(sortOrder) ? row.sort_order : sortOrder,
      published,
      shareEnabled,
      shareToken: regenerateShareToken ? genShareToken() : row.share_token,
    };
    db.prepare(
      `UPDATE plans
       SET project_id = ?, name = ?, description = ?, cover_path = ?, sort_order = ?, published = ?, share_token = ?, share_enabled = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.projectId, next.name, next.description, next.coverPath, next.sortOrder, next.published, next.shareToken, next.shareEnabled, id);
    const updated = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_plan', targetType: 'plan', targetId: id, detail: `更新方案: ${next.name}`, ip: req.ip });
    res.json({ plan: toPlan(updated) });
  });

  router.delete('/admin/plans/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '方案不存在' });
    db.prepare('DELETE FROM plans WHERE id = ?').run(id);
    // 方案内场景归入默认方案，避免孤儿数据
    const fallback = db.prepare('SELECT id FROM plans ORDER BY sort_order ASC, id ASC LIMIT 1').get()?.id;
    db.prepare('UPDATE scenes SET plan_id = ? WHERE plan_id = ?').run(fallback ?? null, id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_plan', targetType: 'plan', targetId: id, detail: `删除方案: ${row.name}`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 管理：封面上传 ——
  router.post('/admin/plans/cover', (req, res) => {
    coverUpload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 50MB' : err.message });
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      try {
        const storage = await getStorage(db);
        const buf = await sharpCover(req.file.buffer);
        const url = await storage.put(buf, `cover-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`);
        res.status(201).json({ coverPath: url });
      } catch (e) {
        console.error('封面上传失败:', e);
        res.status(400).json({ error: '封面上传失败' });
      }
    });
  });

  return router;
}

async function sharpCover(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}
