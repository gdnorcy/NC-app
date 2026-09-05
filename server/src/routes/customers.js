import path from 'node:path';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { toCustomer, toPlan, genShareToken, addOperationLog } from '../db.js';
import { requireAuth, issueToken } from '../auth.js';
import { getStorage } from '../storage/index.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const logoUpload = multer({
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

function parseCustomerBody(body) {
  return {
    customerName: typeof body.customerName === 'string' ? body.customerName.trim() : '',
    logoPath: typeof body.logoPath === 'string' ? body.logoPath.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    validFrom: typeof body.validFrom === 'string' ? body.validFrom.trim() : '',
    validUntil: typeof body.validUntil === 'string' ? body.validUntil.trim() : '',
    isPinned: body.isPinned === true ? 1 : 0,
    remark: typeof body.remark === 'string' ? body.remark.trim() : '',
    status: body.status === 'disabled' ? 'disabled' : 'active',
  };
}

/** 客户项目 + 方案数 + 场景数 */
function customerWithCounts(db, row) {
  const planCount = db.prepare('SELECT COUNT(*) AS n FROM plans WHERE project_id = ?').get(row.id)?.n || 0;
  const sceneCount = db
    .prepare('SELECT COUNT(*) AS n FROM scenes s JOIN plans p ON s.plan_id = p.id WHERE p.project_id = ?')
    .get(row.id)?.n || 0;
  return { ...toCustomer(row), planCount, sceneCount };
}

export function createCustomersRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  // —— 客户项目列表（置顶优先，再按 id） ——
  router.get('/projects', (_req, res) => {
    const rows = db.prepare('SELECT * FROM projects ORDER BY is_pinned DESC, id ASC').all();
    res.json({ projects: rows.map((r) => customerWithCounts(db, r)) });
  });

  router.get('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '客户项目不存在' });
    const plans = db
      .prepare('SELECT * FROM plans WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
      .all(id)
      .map((p) => {
        const n = db.prepare('SELECT COUNT(*) AS n FROM scenes WHERE plan_id = ? AND published = 1').get(p.id)?.n || 0;
        return { ...toPlan(p), sceneCount: n };
      });
    res.json({ project: customerWithCounts(db, row), plans });
  });

  router.post('/projects', (req, res) => {
    const { customerName, logoPath, description, validFrom, validUntil, isPinned, remark, status } = parseCustomerBody(req.body);
    if (!customerName) return res.status(400).json({ error: '客户名称不能为空' });
    const info = db
      .prepare(
        `INSERT INTO projects (customer_name, logo_path, description, valid_from, valid_until, is_pinned, remark, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(customerName, logoPath, description, validFrom || null, validUntil || null, isPinned, remark, status);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_customer', targetType: 'customer', targetId: info.lastInsertRowid, detail: `创建客户: ${customerName}`, ip: req.ip });
    res.status(201).json({ project: toCustomer(row) });
  });

  router.put('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '客户项目不存在' });
    const { customerName, logoPath, description, validFrom, validUntil, isPinned, remark, status } = parseCustomerBody(req.body);
    const next = {
      customerName: customerName || row.customer_name,
      logoPath: logoPath === '' ? row.logo_path || '' : logoPath,
      description: description === '' ? row.description || '' : description,
      validFrom: validFrom === '' ? row.valid_from : validFrom || null,
      validUntil: validUntil === '' ? row.valid_until : validUntil || null,
      isPinned,
      remark: remark === '' ? row.remark || '' : remark,
      status,
    };
    db.prepare(
      `UPDATE projects
       SET customer_name = ?, logo_path = ?, description = ?, valid_from = ?, valid_until = ?, is_pinned = ?, remark = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.customerName, next.logoPath, next.description, next.validFrom, next.validUntil, next.isPinned, next.remark, next.status, id);
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'update_customer', targetType: 'customer', targetId: id, detail: `更新客户: ${next.customerName}`, ip: req.ip });
    res.json({ project: toCustomer(updated) });
  });

  router.delete('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '客户项目不存在' });
    // 不允许删除最后一个客户项目（防止方案无归属）
    const total = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
    if (total <= 1) return res.status(400).json({ error: '至少保留一个客户项目' });
    // 其下方案归入默认客户（id 最小的）
    const fallback = db.prepare('SELECT id FROM projects WHERE id != ? ORDER BY id ASC LIMIT 1').get(id)?.id;
    db.prepare('UPDATE plans SET project_id = ? WHERE project_id = ?').run(fallback, id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'delete_customer', targetType: 'customer', targetId: id, detail: `删除客户: ${row.customer_name}`, ip: req.ip });
    res.json({ ok: true });
  });

  // —— Logo 上传 ——
  router.post('/projects/logo', (req, res) => {
    logoUpload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 50MB' : err.message });
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      try {
        const storage = await getStorage(db);
        const buf = await sharpLogo(req.file.buffer);
        const url = await storage.put(buf, `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`);
        res.status(201).json({ logoPath: url });
      } catch (e) {
        console.error('Logo 上传失败:', e);
        res.status(400).json({ error: 'Logo 上传失败' });
      }
    });
  });

  // —— 以客户管理员身份进入客户后台 ——
  router.post('/projects/:id/impersonate', (req, res) => {
    const id = Number(req.params.id);
    const cust = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!cust) return res.status(404).json({ error: '客户不存在' });
    // 找该客户下第一个可用的租户管理员
    let user = db.prepare(
      "SELECT * FROM users WHERE customer_id = ? AND role = 'tenant_admin' AND status = 'active' ORDER BY id ASC LIMIT 1"
    ).get(id);
    // 没有管理员则找第一个可用成员
    if (!user) {
      user = db.prepare(
        "SELECT * FROM users WHERE customer_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1"
      ).get(id);
    }
    if (!user) {
      return res.status(400).json({ error: '该客户下暂无可用账号，请先在用户管理中创建租户账号' });
    }
    const token = issueToken(user);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'impersonate', targetType: 'customer', targetId: id, detail: `进入客户后台: ${cust.customer_name} (${user.username})`, ip: req.ip });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  return router;
}

async function sharpLogo(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
