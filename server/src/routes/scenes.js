import path from 'node:path';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { toScene, genShareToken, addOperationLog } from '../db.js';
import { requireAuth } from '../auth.js';
import { getStorage } from '../storage/index.js';
import { generatePyramidTiles, pyramidTileUrls } from '../tiling.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const upload = multer({
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

/**
 * 转码上传图片：
 * - 主图：限长边 config.imageMaxSize（默认 4096）
 * - 低清预览：限长边 config.previewSize（默认 1024），供缩略图与渐进加载
 * - 金字塔切片：原图宽 >= 2048 时生成多层级瓦片（前端按视角按需加载）
 * 返回 { path, previewPath, pyramid }
 */
export async function transcodeImage(buffer, storage) {
  const base = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  const image = sharp(buffer).rotate();
  const mainBuffer = await image
    .clone()
    .resize({
      width: config.imageMaxSize,
      height: config.imageMaxSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: config.imageQuality })
    .toBuffer();

  const previewBuffer = await image
    .clone()
    .resize({
      width: config.previewSize,
      height: config.previewSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: Math.min(config.imageQuality - 10, 70) })
    .toBuffer();

  const path = await storage.put(mainBuffer, `${base}-main.webp`);
  const previewPath = await storage.put(previewBuffer, `${base}-preview.webp`);
  const pyramid = await generatePyramidTiles(buffer, storage, base);
  return { path, previewPath, pyramid };
}

function parseSceneBody(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const imagePath = typeof body.imagePath === 'string' ? body.imagePath.trim() : '';
  const previewPath = typeof body.previewPath === 'string' ? body.previewPath.trim() : '';
  let pyramid = '';
  if (body.pyramid && typeof body.pyramid === 'object') {
    try {
      pyramid = JSON.stringify(body.pyramid);
    } catch {
      pyramid = '';
    }
  } else if (typeof body.pyramid === 'string') {
    pyramid = body.pyramid;
  }
  const sortOrder = Number.isInteger(body.sortOrder) ? body.sortOrder : 0;
  const published = body.published === undefined ? 1 : body.published ? 1 : 0;
  const planId = body.planId === undefined || body.planId === null
    ? (body.projectId === undefined || body.projectId === null ? null : Number(body.projectId) || null)
    : Number(body.planId) || null;
  const shareEnabled = body.shareEnabled === undefined ? 0 : body.shareEnabled ? 1 : 0;
  const regenerateShareToken = body.regenerateShareToken === true;
  let hotspots = '[]';
  if (Array.isArray(body.hotspots)) {
    try { hotspots = JSON.stringify(body.hotspots); } catch { hotspots = '[]'; }
  } else if (typeof body.hotspots === 'string') {
    hotspots = body.hotspots;
  }
  return { title, description, imagePath, previewPath, pyramid, sortOrder, published, planId, shareEnabled, regenerateShareToken, hotspots };
}

export function createScenesRouter(db) {
  const router = express.Router();

  // —— 公开：展示端获取上架场景列表 ——
  router.get('/scenes', (_req, res) => {
    res.set('Cache-Control', 'no-store');
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
    const { title, description, imagePath, previewPath, pyramid, hotspots, sortOrder, published, planId, shareEnabled } = parseSceneBody(req.body);
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    if (!imagePath) return res.status(400).json({ error: '请先上传全景图' });
    // 归属方案：缺省归入默认方案
    let pid = planId;
    if (pid === null) {
      pid = db.prepare('SELECT id FROM plans ORDER BY sort_order ASC, id ASC LIMIT 1').get()?.id || null;
    }
    const info = db
      .prepare(
        `INSERT INTO scenes (title, description, image_path, preview_path, pyramid, hotspots, plan_id, share_token, share_enabled, sort_order, published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, description, imagePath, previewPath, pyramid, hotspots, pid, shareEnabled ? genShareToken() : '', shareEnabled, sortOrder, published);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_scene', targetType: 'scene', targetId: info.lastInsertRowid, detail: `创建场景: ${title}`, ip: req.ip });
    res.status(201).json({ scene: toScene(row) });
  });

  router.put('/admin/scenes/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '场景不存在' });

    const { title, description, imagePath, previewPath, pyramid, sortOrder, published, planId, shareEnabled, regenerateShareToken, hotspots } = parseSceneBody(req.body);
    const next = {
      title: title || row.title,
      description: description === '' ? row.description : description,
      imagePath: imagePath || row.image_path,
      previewPath: previewPath || row.preview_path || '',
      pyramid: pyramid || row.pyramid || '',
      hotspots: hotspots || row.hotspots || '[]',
      sortOrder: Number.isNaN(sortOrder) ? row.sort_order : sortOrder,
      published,
      planId: planId === null ? row.plan_id : planId,
      shareEnabled,
      shareToken:
        regenerateShareToken || (shareEnabled && !row.share_token)
          ? genShareToken()
          : row.share_token,
    };
    db.prepare(
      `UPDATE scenes
       SET title = ?, description = ?, image_path = ?, preview_path = ?, pyramid = ?, hotspots = ?, sort_order = ?, published = ?,
           plan_id = ?, share_token = ?, share_enabled = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.title, next.description, next.imagePath, next.previewPath, next.pyramid, next.hotspots, next.sortOrder, next.published, next.planId, next.shareToken, next.shareEnabled, id);

    const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_scene', targetType: 'scene', targetId: id, detail: `更新场景: ${next.title}`, ip: req.ip });
    res.json({ scene: toScene(updated) });
  });

  router.delete('/admin/scenes/:id', async (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '场景不存在' });
    db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
    try {
      const storage = await getStorage(db);
      await storage.delete(row.image_path);
      await storage.delete(row.preview_path);
      // 清理金字塔瓦片（云端对象需逐个删除）
      let pyramid = null;
      if (row.pyramid) {
        try {
          pyramid = JSON.parse(row.pyramid);
        } catch {
          pyramid = null;
        }
      }
      if (pyramid) {
        for (const url of pyramidTileUrls(pyramid)) {
          await storage.delete(url);
        }
      }
    } catch (e) {
      console.warn('删除存储文件失败:', e);
    }
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_scene', targetType: 'scene', targetId: id, detail: `删除场景: ${row.title}`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— 管理：上传全景图（自动转码为两档 WebP 并经存储层上传） ——
  router.post('/admin/upload', (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 50MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      try {
        const storage = await getStorage(db);
        const result = await transcodeImage(req.file.buffer, storage);
        res.status(201).json({ ...result, originalName: req.file.originalname });
      } catch (e) {
        console.error('图片转码或上传失败:', e);
        res.status(400).json({ error: '图片处理失败，请确认文件为有效的全景图' });
      }
    });
  });

  return router;
}
