import path from 'node:path';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { toProject, toScene, genShareToken } from '../db.js';
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

function parseProjectBody(body) {
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    coverPath: typeof body.coverPath === 'string' ? body.coverPath.trim() : '',
    sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    published: body.published === undefined ? 1 : body.published ? 1 : 0,
    shareEnabled: body.shareEnabled === undefined ? 1 : body.shareEnabled ? 1 : 0,
    regenerateShareToken: body.regenerateShareToken === true,
  };
}

/** 拼接分享链接（前端相对路径亦可，这里给完整 URL 供复制/二维码） */
function shareUrl(req, token) {
  if (!token) return '';
  return `${req.protocol}://${req.get('host')}/s/${token}`;
}

/** 项目 + 其上架场景数 */
function projectWithSceneCount(db, row) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM scenes WHERE project_id = ? AND published = 1').get(row.id)?.n || 0;
  return { ...toProject(row), sceneCount: n };
}

export function createProjectsRouter(db) {
  const router = express.Router();

  // —— 公开：分享开启的项目列表（首页） ——
  router.get('/projects', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = db
      .prepare('SELECT * FROM projects WHERE published = 1 AND share_enabled = 1 ORDER BY sort_order ASC, id ASC')
      .all();
    res.json({ projects: rows.map((r) => projectWithSceneCount(db, r)) });
  });

  // —— 公开：项目详情（项目 + 上架场景） ——
  router.get('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row || !row.published || !row.share_enabled) return res.status(404).json({ error: '项目不存在或未公开' });
    const scenes = db
      .prepare('SELECT * FROM scenes WHERE project_id = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
      .all(id)
      .map(toScene);
    res.json({ project: projectWithSceneCount(db, row), scenes });
  });

  // —— 公开：分享令牌解析（项目级或场景级） ——
  router.get('/s/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(404).json({ error: '链接无效' });

    // 场景级：单场景分享
    const scene = db.prepare('SELECT * FROM scenes WHERE share_token = ? AND share_enabled = 1').get(token);
    if (scene) {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(scene.project_id) || {};
      const scenes = db
        .prepare('SELECT * FROM scenes WHERE project_id = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
        .all(scene.project_id)
        .map(toScene);
      return res.json({ type: 'scene', scene: toScene(scene), project: toProject(project) || null, scenes });
    }

    // 项目级
    const project = db.prepare('SELECT * FROM projects WHERE share_token = ? AND share_enabled = 1').get(token);
    if (!project) return res.status(404).json({ error: '链接无效或已关闭' });
    const scenes = db
      .prepare('SELECT * FROM scenes WHERE project_id = ? AND published = 1 ORDER BY sort_order ASC, id ASC')
      .all(project.id)
      .map(toScene);
    res.json({ type: 'project', project: projectWithSceneCount(db, project), scenes });
  });

  // —— 公开：分享二维码图片 ——
  router.get('/s/:token/qr', async (req, res) => {
    const token = String(req.params.token || '').trim();
    const ok =
      db.prepare('SELECT id FROM projects WHERE share_token = ? AND share_enabled = 1').get(token) ||
      db.prepare('SELECT id FROM scenes WHERE share_token = ? AND share_enabled = 1').get(token);
    if (!ok) return res.status(404).json({ error: '链接无效或已关闭' });
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

  router.get('/admin/projects', (_req, res) => {
    const rows = db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, id ASC').all();
    res.json({ projects: rows.map((r) => projectWithSceneCount(db, r)) });
  });

  router.post('/admin/projects', (req, res) => {
    const { name, description, coverPath, sortOrder, published, shareEnabled } = parseProjectBody(req.body);
    if (!name) return res.status(400).json({ error: '项目名称不能为空' });
    const info = db
      .prepare(
        `INSERT INTO projects (name, description, cover_path, sort_order, published, share_token, share_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, description, coverPath, sortOrder, published, genShareToken(), shareEnabled);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ project: toProject(row) });
  });

  router.put('/admin/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '项目不存在' });
    const { name, description, coverPath, sortOrder, published, shareEnabled, regenerateShareToken } = parseProjectBody(req.body);
    const next = {
      name: name || row.name,
      description: description === '' ? row.description : description,
      coverPath: coverPath || row.cover_path || '',
      sortOrder: Number.isNaN(sortOrder) ? row.sort_order : sortOrder,
      published,
      shareEnabled,
      shareToken: regenerateShareToken ? genShareToken() : row.share_token,
    };
    db.prepare(
      `UPDATE projects
       SET name = ?, description = ?, cover_path = ?, sort_order = ?, published = ?, share_token = ?, share_enabled = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.name, next.description, next.coverPath, next.sortOrder, next.published, next.shareToken, next.shareEnabled, id);
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.json({ project: toProject(updated) });
  });

  router.delete('/admin/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '项目不存在' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    // 项目内场景归入默认项目，避免孤儿数据
    const fallback = db.prepare('SELECT id FROM projects ORDER BY sort_order ASC, id ASC LIMIT 1').get()?.id;
    db.prepare('UPDATE scenes SET project_id = ? WHERE project_id = ?').run(fallback ?? null, id);
    res.json({ ok: true });
  });

  // —— 管理：封面上传 ——
  router.post('/admin/projects/cover', (req, res) => {
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

/** 封面图压缩为长边 640 的 WebP */
async function sharpCover(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}
