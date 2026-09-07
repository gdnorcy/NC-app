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
  let solutions = body.solutions;
  if (!Array.isArray(solutions) || solutions.length === 0) solutions = ['panorama'];
  // 只保留字符串类型的solution code，过滤掉数字ID等非法值
  solutions = solutions.filter(s => typeof s === 'string' && s.trim());
  let config = body.config;
  if (typeof config !== 'object' || config === null) config = {};
  return {
    customerName: typeof body.customerName === 'string' ? body.customerName.trim() : '',
    logoPath: typeof body.logoPath === 'string' ? body.logoPath.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    validFrom: typeof body.validFrom === 'string' ? body.validFrom.trim() : '',
    validUntil: typeof body.validUntil === 'string' ? body.validUntil.trim() : '',
    isPinned: body.isPinned === true ? 1 : 0,
    remark: typeof body.remark === 'string' ? body.remark.trim() : '',
    status: ['disabled', 'trashed'].includes(body.status) ? body.status : 'active',
    solutions: JSON.stringify(solutions),
    config: JSON.stringify(config),
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

  // —— 工作台统计（全局 + 按解决方案分组） ——
  router.get('/dashboard/stats', (_req, res) => {
    // 全局统计
    const global = {
      customers: db.prepare('SELECT COUNT(*) AS n FROM projects WHERE status != ?').get('trashed')?.n || 0,
      plans: db.prepare('SELECT COUNT(*) AS n FROM plans').get()?.n || 0,
      scenes: db.prepare('SELECT COUNT(*) AS n FROM scenes').get()?.n || 0,
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n || 0,
    };

    // 所有解决方案
    const solutions = db.prepare('SELECT * FROM solutions ORDER BY sort_order ASC, id ASC').all();

    // 按解决方案分组统计
    const bySolution = solutions.map((sol) => {
      // 开通该解决方案的客户数
      const allProjects = db.prepare('SELECT id, solutions FROM projects WHERE status != ?').all('trashed');
      const customerIds = allProjects
        .filter((p) => {
          try {
            const arr = JSON.parse(p.solutions || '[]');
            return arr.includes(sol.code) || arr.includes(String(sol.id));
          } catch { return false; }
        })
        .map((p) => p.id);

      // 这些客户下的方案数
      const planCount = customerIds.length
        ? db.prepare(`SELECT COUNT(*) AS n FROM plans WHERE project_id IN (${customerIds.map(() => '?').join(',')})`).get(...customerIds)?.n || 0
        : 0;

      // 这些方案下的场景数
      const sceneCount = planCount
        ? db.prepare(`SELECT COUNT(*) AS n FROM scenes WHERE plan_id IN (SELECT id FROM plans WHERE project_id IN (${customerIds.map(() => '?').join(',')}))`).get(...customerIds)?.n || 0
        : 0;

      return {
        solutionId: sol.id,
        solutionName: sol.name,
        solutionCode: sol.code,
        solutionIcon: sol.icon,
        enabled: !!sol.enabled,
        customers: customerIds.length,
        plans: planCount,
        scenes: sceneCount,
      };
    });

    res.json({ global, bySolution });
  });

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
    const { customerName, logoPath, description, validFrom, validUntil, isPinned, remark, status, solutions, config } = parseCustomerBody(req.body);
    if (!customerName) return res.status(400).json({ error: '客户名称不能为空' });
    const inviteCode = 'P' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const info = db
      .prepare(
        `INSERT INTO projects (customer_name, logo_path, description, valid_from, valid_until, is_pinned, remark, status, solutions, config, invite_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(customerName, logoPath, description, validFrom || null, validUntil || null, isPinned, remark, status, solutions, config, inviteCode);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    addOperationLog(db, { userId: req.user?.uid, username: req.user?.username, action: 'create_customer', targetType: 'customer', targetId: info.lastInsertRowid, detail: `创建客户: ${customerName}`, ip: req.ip });
    res.status(201).json({ project: toCustomer(row) });
  });

  router.put('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: '客户项目不存在' });
    const { customerName, logoPath, description, validFrom, validUntil, isPinned, remark, status, solutions, config } = parseCustomerBody(req.body);
    const next = {
      customerName: customerName || row.customer_name,
      logoPath: logoPath === '' ? row.logo_path || '' : logoPath,
      description: description === '' ? row.description || '' : description,
      validFrom: validFrom === '' ? row.valid_from : validFrom || null,
      validUntil: validUntil === '' ? row.valid_until : validUntil || null,
      isPinned,
      remark: remark === '' ? row.remark || '' : remark,
      status,
      solutions,
      config,
    };
    db.prepare(
      `UPDATE projects
       SET customer_name = ?, logo_path = ?, description = ?, valid_from = ?, valid_until = ?, is_pinned = ?, remark = ?, status = ?, solutions = ?, config = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(next.customerName, next.logoPath, next.description, next.validFrom, next.validUntil, next.isPinned, next.remark, next.status, next.solutions, next.config, id);
    // 总后台授权人脉集市（类似模板）：config.market 存在时同步初始化/覆盖租户集市配置
    try {
      const parsedCfg = typeof config === 'string' ? JSON.parse(config) : (config || {});
      const marketCfg = (parsedCfg && typeof parsedCfg === 'object' && parsedCfg.market) || null;
      if (marketCfg) {
        const exist = db.prepare('SELECT id FROM card_market_settings WHERE customer_id = ?').get(id);
        if (exist) {
          db.prepare(`UPDATE card_market_settings SET
            enabled = COALESCE(?, enabled),
            style = COALESCE(?, style),
            notice = COALESCE(?, notice),
            updated_at = datetime('now') WHERE customer_id = ?`).run(
            marketCfg.enabled === undefined ? null : (marketCfg.enabled ? 1 : 0),
            marketCfg.style || null,
            marketCfg.notice === undefined ? null : String(marketCfg.notice),
            id
          );
        } else {
          db.prepare(`INSERT INTO card_market_settings (customer_id, enabled, style, notice) VALUES (?, ?, ?, ?)`)
            .run(id, marketCfg.enabled === false ? 0 : 1, marketCfg.style || 'A', marketCfg.notice || '');
        }
      }
    } catch (e) { /* 同步失败不阻断项目保存 */ }
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
    if (cust.status === 'disabled') return res.status(400).json({ error: '该客户已被禁用，无法进入' });
    if (cust.status === 'trashed') return res.status(400).json({ error: '该客户已在回收站，请先恢复' });
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
