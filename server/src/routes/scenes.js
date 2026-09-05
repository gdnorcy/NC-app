import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { toScene } from '../db.js';
import { requireAuth } from '../auth.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
      cb(null, config.uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(new Error('仅支持 JPG / PNG / WebP 图片'));
    }
    cb(null, true);
  },
});

function parseSceneBody(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const imagePath = typeof body.imagePath === 'string' ? body.imagePath.trim() : '';
  const sortOrder = Number.isInteger(body.sortOrder) ? body.sortOrder : 0;
  const published = body.published === undefined ? 1 : body.published ? 1 : 0;
  return { title, description, imagePath, sortOrder, published };
}

/** 仅删除 uploads 目录内的文件，防止路径穿越 */
function removeUploadedFile(imagePath) {
  if (!imagePath) return;
  const uploadsRoot = path.resolve(config.uploadsDir);
  const target = path.resolve(path.join(uploadsRoot, path.basename(imagePath)));
  if (target.startsWith(uploadsRoot + path.sep) && fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
}

export function createScenesRouter(db) {
  const router = express.Router();

  // —— 公开：展示端获取上架场景列表 ——
  router.get('/scenes', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM scenes WHERE published = 1 ORDER BY sort_order ASC, id ASC')
      .all();
    res.json({ scenes: rows.map(toScene) });
  });

  // —— 管理：登录后操作 ——
  router.use('/admin', requireAuth);

  router.get('/admin/scenes', (_req, res) => {
    const rows = db.prepare('SELECT * FROM scenes ORDER BY sort_order ASC, id ASC').all();
    res.json({ scenes: rows.map(toScene) });
  });

  router.post('/admin/scenes', (req, res) => {
    const { title, description, imagePath, sortOrder, published } = parseSceneBody(req.body);
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    if (!imagePath) return res.status(400).json({ error: '请先上传全景图' });
    const info = db
      .prepare(
        'INSERT INTO scenes (title, description, image_path, sort_order, published) VALUES (?, ?, ?, ?, ?)'
      )
      .run(title, description, imagePath, sortOrder, published);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ scene: toScene(row) });
  });

  router.put('/admin/scenes/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '场景不存在' });

    const { title, description, imagePath, sortOrder, published } = parseSceneBody(req.body);
    const next = {
      title: title || row.title,
      description: description === '' ? row.description : description,
      imagePath: imagePath || row.image_path,
      sortOrder: Number.isNaN(sortOrder) ? row.sort_order : sortOrder,
      published,
    };
    db.prepare(
      `UPDATE scenes
       SET title = ?, description = ?, image_path = ?, sort_order = ?, published = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.title, next.description, next.imagePath, next.sortOrder, next.published, id);

    const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    res.json({ scene: toScene(updated) });
  });

  router.delete('/admin/scenes/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '场景不存在' });
    db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
    removeUploadedFile(row.image_path);
    res.json({ ok: true });
  });

  // —— 管理：上传全景图 ——
  router.post('/admin/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 50MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      res.status(201).json({ path: `/uploads/${req.file.filename}` });
    });
  });

  return router;
}
