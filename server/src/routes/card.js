/**
 * 智能名片解决方案 API
 * 个人C端用户 + 企业租户 + 平台运营
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { getStorage } from '../storage/index.js';
import { checkTenantAccess } from '../tenant.js';
import { trackEvents } from '../services/analytics.js';
import { createDistributionService, buildShareUrl } from '../services/distribution.js';
import { createMemberService } from '../services/member.js';
import { createGoodsOrderService } from '../services/goodsOrder.js';
import { PaymentService } from '../services/payment.js';
import { createRadarService } from '../services/radar.js';
import { createQuotaService } from '../services/quota.js';

// 设计中心「保存并预览」签名密钥（管理端/查看端共用，固定开发密钥；上线前可改为环境变量）
const PREVIEW_SECRET = 'nuok-design-preview-secret-2026';

const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/x-m4a', 'audio/m4a', 'audio/webm', 'audio/x-mpeg']);

export function createCardRouter(db, wxService) {
  const router = Router();
  const voiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 语音简介 ≤10MB
  });
  const distribution = createDistributionService(db);
  const member = createMemberService(db);
  const radar = createRadarService(db);
  const quota = createQuotaService(db);

  // ============================================================
  // 微信授权登录/注册
  // ============================================================
  router.post('/auth/wx-login', async (req, res) => {
    try {
      const { code, parentId, tid } = req.body;
      if (!code) return res.status(400).json({ error: 'code不能为空' });

      // 调用微信code2session
      let openid, unionid;
      try {
        const result = await wxService.code2Session(code);
        openid = result.openid;
        unionid = result.unionid || '';
      } catch (e) {
        return res.status(400).json({ error: '微信登录失败: ' + e.message });
      }

      // 查找或创建用户
      let user = db.prepare('SELECT * FROM platform_user WHERE openid = ?').get(openid);
      let isNew = false;

      if (!user) {
        isNew = true;
        // 溯源绑定已迁移到租户维度（dist_user_relation）：扫码静默绑定由 POST /distribution/bind 负责
        // （老 platform_user.parent_id 字段保留兼容存量读取，新绑定不再写入）
        const result = db.prepare(
          'INSERT INTO platform_user (openid, unionid, nickname, avatar) VALUES (?,?,?,?)'
        ).run(openid, unionid, '微信用户', '');
        user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(result.lastInsertRowid);
      }

      // H5 演示/无微信环境：URL 携带 tid 时，将无归属用户自动绑定到该租户（建 enterprise + 写 customer_id）
      // 使 mock 登录用户能正常参与购物车/下单（租户上下文一致），真实微信登录不受影响。
      if (!user.customer_id && Number(tid)) {
        const cid = Number(tid);
        const ent = db.prepare(
          "SELECT id FROM tenant_enterprises WHERE customer_id = ? AND name = ?"
        ).get(cid, 'H5演示用户_' + user.id);
        const entId = ent ? ent.id : db.prepare(
          "INSERT INTO tenant_enterprises (customer_id, name) VALUES (?, ?)"
        ).run(cid, 'H5演示用户_' + user.id).lastInsertRowid;
        db.prepare('UPDATE platform_user SET enterprise_id = ?, customer_id = ? WHERE id = ?')
          .run(entId, cid, user.id);
        user.customer_id = cid;
        user.enterprise_id = entId;
      }

      // 生成token
      const token = Buffer.from(JSON.stringify({ uid: user.id, openid, ts: Date.now() })).toString('base64') + '.' + randomBytes(8).toString('hex');

      res.json({
        token,
        user: toUser(user),
        isNew,
        hasCard: !!db.prepare('SELECT id FROM card_profile WHERE user_id = ?').get(user.id),
        identity: {
          customerId: user.customer_id || null,
          enterpriseId: user.enterprise_id || null,
          identityType: user.identity_type || '',
        },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 可选认证中间件：无 token 不阻断（用于设计中心预览签名放行）
  function authOptional(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return next();
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
      if (user && user.status === 'active') {
        req.user = user;
        req.userId = user.id;
        req.customerId = user.customer_id || null;
        if (!req.customerId && user.enterprise_id) {
          const ent = db.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(user.enterprise_id);
          if (ent) req.customerId = ent.customer_id;
        }
      }
      next();
    } catch { next(); }
  }

  // 预览签名校验：sig = sha256(tid:exp:PREVIEW_SECRET) 前 32 位，exp 30 分钟内有效
  // 签名通过即可免登录访问该租户配置（含发布版首页），preview=1 仅标识「草稿预览」意图，不强求
  function verifyPreviewSig(q) {
    const tid = Number(q.tid);
    const exp = Number(q.exp);
    if (!tid || !exp || exp < Math.floor(Date.now() / 1000)) return 0;
    const expect = createHash('sha256').update(`${tid}:${exp}:${PREVIEW_SECRET}`).digest('hex').slice(0, 32);
    return String(q.sig) === expect ? tid : 0;
  }

  // 认证中间件（注入租户上下文 customerId）
  function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
      if (!user || user.status !== 'active') return res.status(401).json({ error: '账号异常' });
      req.user = user;
      req.userId = user.id;
      // 租户上下文：优先用户绑定的租户，其次所属企业映射的租户
      req.customerId = user.customer_id || null;
      if (!req.customerId && user.enterprise_id) {
        const ent = db.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(user.enterprise_id);
        if (ent) req.customerId = ent.customer_id;
      }
      next();
    } catch {
      res.status(401).json({ error: 'token无效' });
    }
  }

  // 租户上下文中间件：必须已绑定租户
  function requireTenant(req, res, next) {
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户，禁止访问' });
    // 租户生命周期 + 智能名片解决方案授权（P2-10/P2-11）
    // 到期且 miniExpireMode=prompt → 只读放行（仅GET）；写操作拒绝
    const blocked = checkTenantAccess(db, req.customerId, 'card', 'mini');
    if (blocked) {
      if (blocked.readonly && req.method === 'GET') { req.customerId = req.customerId || customerId; req.tenantReadonly = true; return next(); }
      return res.status(blocked.status).json({ error: blocked.error });
    }
    next();
  }

  // ============================================================
  // 用户信息
  // ============================================================
  router.get('/user/profile', auth, (req, res) => {
    // 与 /cards 一致：join 租户配置，使 brandColor 可用
    const card = db.prepare(`SELECT cp.*, pu.member_level as owner_member_level, pj.config as tenant_config,
      ct.theme_config as template_theme
      FROM card_profile cp
      LEFT JOIN platform_user pu ON cp.user_id = pu.id
      LEFT JOIN projects pj ON pj.id = (
        SELECT COALESCE(
          (SELECT customer_id FROM tenant_individuals WHERE user_id = cp.user_id LIMIT 1),
          (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = cp.user_id LIMIT 1),
          0)
      )
      LEFT JOIN card_templates ct ON ct.id = cp.template_id
      WHERE cp.user_id = ?`).get(req.user.id);
    res.json({ user: toUser(req.user), card: card ? toCard(card) : null });
  });

  router.put('/user/profile', auth, (req, res) => {
    const { nickname, avatar, phone } = req.body;
    db.prepare("UPDATE platform_user SET nickname=?, avatar=?, phone=?, updated_at=datetime('now') WHERE id=?")
      .run(nickname || req.user.nickname, avatar || req.user.avatar, phone || req.user.phone, req.user.id);
    const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(req.user.id);
    res.json({ user: toUser(user) });
  });

  // ============================================================
  // 名片模板商业化（两层：平台→租户购买→租户设C端售价；C端用户→付费解锁）
  // 可见范围：租户自建 + 平台免费(price=0) + 平台已购付费
  // ============================================================
  /** 某租户对 C 端可见的模板列表（含 C 端售价 price，元；0=免费） */
  function cVisibleTemplates(customerId) {
    const owned = new Map();
    db.prepare("SELECT asset_key, c_price FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'card_template'")
      .all(customerId || 0)
      .forEach((r) => owned.set(Number(r.asset_key), Number(r.c_price || 0)));
    const rows = db.prepare(`
      SELECT * FROM card_templates ct WHERE ct.enabled = 1 AND (
        (ct.tenant_id != 0 AND ct.tenant_id = ?)
        OR (ct.tenant_id = 0 AND ct.price <= 0)
        OR (ct.tenant_id = 0 AND ct.price > 0 AND EXISTS (
          SELECT 1 FROM tenant_asset_purchases tap
          WHERE tap.tenant_id = ? AND tap.asset_type = 'card_template' AND tap.asset_key = CAST(ct.id AS TEXT)
        ))
      ) ORDER BY ct.tenant_id, ct.sort_order, ct.id DESC
    `).all(customerId || 0, customerId || 0);
    return rows.map((t) => {
      const isPlatform = Number(t.tenant_id) === 0;
      const cPrice = isPlatform ? (owned.get(Number(t.id)) || 0) : Number(t.price || 0);
      return {
        id: t.id, name: t.name, cover: t.cover, description: t.description, layout: t.layout || 'card',
        themeConfig: (() => { try { return JSON.parse(t.theme_config); } catch { return {}; } })(),
        tenantId: t.tenant_id, price: cPrice,
      };
    });
  }

  /** C 端用户已购模板集合 */
  function userOwnedTemplates(userId) {
    return new Set(db.prepare('SELECT template_id FROM user_template_purchases WHERE user_id = ?').all(userId).map((r) => Number(r.template_id)));
  }

  /** 校验模板是否对 C 端用户可用（可见 + 免费或已购） */
  function canCUseTemplate(customerId, userId, templateId) {
    if (!templateId) return { ok: true };
    const list = cVisibleTemplates(customerId);
    const t = list.find((x) => x.id === Number(templateId));
    if (!t) return { ok: false, error: '模板不存在或不可用' };
    if (Number(t.price) <= 0) return { ok: true, price: 0 };
    if (userId && userOwnedTemplates(userId).has(Number(templateId))) return { ok: true, price: Number(t.price) };
    return { ok: false, error: '该模板为付费模板，请先购买' };
  }

  // C 端模板列表（未登录：仅平台免费模板；登录后：租户可见集合 + 本人已购状态）
  router.get('/templates', authOptional, (req, res) => {
    try {
      const list = cVisibleTemplates(req.customerId || 0);
      const owned = req.user ? userOwnedTemplates(req.user.id) : new Set();
      res.json({ templates: list.map((t) => ({ ...t, purchased: owned.has(Number(t.id)) })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // C 端购买付费模板（生成支付单，支付成功后由 payment 解锁 user_template_purchases）
  router.post('/templates/:id/purchase', auth, (req, res) => {
    try {
      if (!req.customerId) return res.status(403).json({ error: '未入驻任何企业，暂不可购买模板' });
      const id = Number(req.params.id);
      const t = cVisibleTemplates(req.customerId).find((x) => x.id === id);
      if (!t) return res.status(404).json({ error: '模板不存在或不可用' });
      if (Number(t.price) <= 0) return res.status(400).json({ error: '免费模板无需购买' });
      if (userOwnedTemplates(req.user.id).has(id)) return res.status(400).json({ error: '已购买该模板' });
      const payment = new PaymentService(db);
      const order = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'card',
        productType: 'template',
        productId: String(id),
        productName: t.name,
        amount: Math.round(Number(t.price) * 100), // payment_orders.amount 单位为分
        channel: req.body.channel || 'wechat',
        remark: '购买名片模板',
      });
      res.json({ orderNo: order.orderNo, amount: order.amount, templateName: t.name, templateId: id });
    } catch (e) { res.status(400).json({ error: e.message || '下单失败' }); }
  });

  // ============================================================
  // 名片 CRUD
  // ============================================================
  router.get('/cards', auth, (req, res) => {
    // 与 /cards/:id 一致：join 租户配置，使列表也携带 brandColor
    const cards = db.prepare(`SELECT cp.*, pu.member_level as owner_member_level, pj.config as tenant_config
      FROM card_profile cp
      LEFT JOIN platform_user pu ON cp.user_id = pu.id
      LEFT JOIN projects pj ON pj.id = (
        SELECT COALESCE(
          (SELECT customer_id FROM tenant_individuals WHERE user_id = cp.user_id LIMIT 1),
          (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = cp.user_id LIMIT 1),
          0)
      )
      LEFT JOIN card_templates ct ON ct.id = cp.template_id
      WHERE cp.user_id = ? ORDER BY cp.created_at DESC`).all(req.user.id);
    res.json({ cards: cards.map(toCard) });
  });

  router.get('/cards/:id', (req, res) => {
    const card = db.prepare(`SELECT cp.*, pu.member_level as owner_member_level, pj.config as tenant_config,
      ct.theme_config as template_theme, ct.layout as template_layout
      FROM card_profile cp
      LEFT JOIN platform_user pu ON cp.user_id = pu.id
      LEFT JOIN projects pj ON pj.id = (
        SELECT COALESCE(
          (SELECT customer_id FROM tenant_individuals WHERE user_id = cp.user_id LIMIT 1),
          (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = cp.user_id LIMIT 1)
        )
      )
      LEFT JOIN card_templates ct ON ct.id = cp.template_id
      WHERE cp.id = ?`).get(req.params.id);
    if (card) card.template_layout = card.template_layout || 'card';
    if (!card) return res.status(404).json({ error: '名片不存在' });
    if (card.status !== 'active') return res.status(404).json({ error: '名片不可用' });
    // 附加租户启用的表单（优先挂载到本名片，否则取租户第一个 active 表单）
    let activeForm = null;
    const tenantId = card.customer_id || (() => {
      const t = db.prepare('SELECT customer_id FROM tenant_individuals WHERE user_id = ? AND status = ? LIMIT 1').get(card.user_id, 'active')
        || db.prepare('SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = ? AND status = ? LIMIT 1').get(card.user_id, 'active');
      return t?.customer_id || null;
    })();
    if (tenantId) {
      const bound = db.prepare("SELECT id, title, description, fields FROM card_form_template WHERE customer_id = ? AND status = 'active' AND card_id = ? LIMIT 1")
        .get(tenantId, card.id);
      const any = bound || db.prepare("SELECT id, title, description, fields FROM card_form_template WHERE customer_id = ? AND status = 'active' AND (card_id IS NULL OR card_id = 0) ORDER BY id DESC LIMIT 1")
        .get(tenantId);
      if (any) activeForm = { id: any.id, title: any.title, description: any.description, fields: JSON.parse(any.fields || '[]') };
    }
    card.templateLayout = card.template_layout || 'card';
    card.collectCount = db.prepare('SELECT COUNT(*) AS c FROM card_collect WHERE card_id = ?').get(card.id).c;
    card.recentVisitors = db.prepare(
      'SELECT pu.avatar FROM card_visitor cv LEFT JOIN platform_user pu ON cv.visitor_user_id = pu.id WHERE cv.card_id = ? AND pu.avatar IS NOT NULL AND pu.avatar != \'\' ORDER BY cv.last_visit_at DESC LIMIT 8'
    ).all(card.id).map((r) => r.avatar);
    res.json({ card: toCard(card), activeForm });
  });

  // 名片动态列表（公开，展示名片所有者的动态）
  router.get('/cards/:id/dynamics', (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    // 可选登录态：带当前用户点赞标记
    let myUid = null;
    try {
      if (req.headers.authorization) {
        const payload = JSON.parse(Buffer.from(req.headers.authorization.split(' ')[1].split('.')[0], 'base64').toString());
        myUid = payload.uid || null;
      }
    } catch {}
    const rows = db.prepare(`SELECT d.*, u.nickname, u.avatar FROM card_dynamic d
      LEFT JOIN platform_user u ON d.user_id = u.id
      WHERE d.card_id = ? AND d.status='active' AND d.visibility='public'
      ORDER BY d.created_at DESC LIMIT 20`).all(card.id);
    const liked = myUid ? new Set(db.prepare('SELECT dynamic_id FROM card_dynamic_like WHERE user_id = ?').all(myUid).map(r => r.dynamic_id)) : new Set();
    res.json({ dynamics: rows.map((d) => toDynamic(d, liked.has(d.id))) });
  });

  // 名片视频列表（公开）
  router.get('/cards/:id/videos', (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    const videos = db.prepare('SELECT id, card_id, title, cover_url, duration, sort_order FROM card_videos WHERE card_id = ? ORDER BY sort_order ASC, id ASC').all(card.id);
    res.json({ videos: videos.map((v) => ({ id: v.id, cardId: v.card_id, title: v.title, coverUrl: v.cover_url, duration: v.duration, sortOrder: v.sort_order })) });
  });

  // ============================================================
  // 语音简介上传（阶段C：上传音频；克隆语音后续新增）
  // ============================================================
  router.post('/voice-upload', auth, (req, res) => {
    voiceUpload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '音频大小不能超过 10MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到音频文件' });
      const mime = (req.file.mimetype || '').toLowerCase();
      if (!AUDIO_MIME.has(mime)) {
        return res.status(400).json({ error: '仅支持 mp3/wav/m4a/aac/ogg 音频格式' });
      }
      const ext = (path.extname(req.file.originalname || '') || '.mp3').toLowerCase().replace(/[^a-z0-9.]/g, '');
      try {
        const storage = await getStorage(db);
        const url = await storage.put(req.file.buffer, `voice-card-${req.user.id}-${Date.now()}${ext}`);
        res.status(201).json({ url, name: req.file.originalname || '语音简介' });
      } catch (e) {
        console.error('语音上传失败:', e);
        res.status(500).json({ error: '语音上传失败' });
      }
    });
  });

  router.post('/cards', auth, (req, res) => {
    const { name, position, phone, wechat, email, company, bio, businessField, needTags, avatar, isPublic, templateId, voiceUrl, voiceName } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });
    const chkTpl = canCUseTemplate(req.customerId, req.user.id, templateId);
    if (!chkTpl.ok) return res.status(400).json({ error: chkTpl.error });
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, phone, wechat, email, company, bio, business_field, need_tags, avatar, is_public, template_id, voice_url, voice_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', phone || '', wechat || '', email || '', company || '', bio || '', businessField || '', Array.isArray(needTags) ? JSON.stringify(needTags) : (needTags || ''), avatar || '', isPublic ? 1 : 0, templateId || '', voiceUrl || '', voiceName || '');
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(result.lastInsertRowid);
    res.json({ card: toCard(card) });
  });

  // 创建名片+入驻申请（合并流程）
  router.post('/cards/create-with-apply', auth, (req, res) => {
    const { name, position, city, phone, wechat, email, bio, businessField, avatar, isPublic, videoChannel,
            slogan, tags, templateId, voiceUrl, voiceName,
            bindCode, applyType, enterpriseName, industry } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });
    const chkTpl = canCUseTemplate(req.customerId, req.user.id, templateId);
    if (!chkTpl.ok) return res.status(400).json({ error: chkTpl.error });

    // 1. 创建名片
    const cardType = applyType === 'enterprise' ? 'company' : 'personal';
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, city, phone, wechat, email, bio, business_field, avatar, is_public, video_channel, card_type, slogan, tags, template_id, voice_url, voice_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', city || '', phone || '', wechat || '', email || '', bio || '', businessField || '', avatar || '', isPublic ? 1 : 0, videoChannel || '', cardType, slogan || '', tags || '', templateId || '', voiceUrl || '', voiceName || '');
    const cardId = result.lastInsertRowid;

    // 2. 处理入驻申请（填了口令才入驻）
    if (bindCode) {
      // 安全口令：只按 invite_code 匹配（含纯数字口令），禁止直接用 project id 猜测入驻
      const project = db.prepare('SELECT * FROM projects WHERE invite_code = ?').get(String(bindCode).trim());
      if (!project) {
        return res.status(400).json({ error: '入驻口令无效' });
      }
      if (project.status !== 'active') {
        return res.status(400).json({ error: '该客户项目已停用，无法入驻' });
      }
      if (project.valid_until && project.valid_until < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ error: '该客户项目已过期，无法入驻' });
      }
      const customerId = project.id;

      // 企业入驻必须提供企业名称（前置校验，先于重复入驻校验给出明确错误）
      if (applyType === 'enterprise' && !enterpriseName) {
        return res.status(400).json({ error: '企业名称不能为空' });
      }

      // 重复/重新申请校验（rejected 允许重新申请；双身份：个人+企业 允许并存）
      const already = applyType === 'enterprise'
        ? db.prepare('SELECT id, status FROM tenant_enterprises WHERE customer_id = ? AND admin_user_id = ?').get(customerId, req.user.id)
        : db.prepare('SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ?').get(customerId, req.user.id);
      if (already && already.status !== 'rejected') {
        return res.status(400).json({
          error: already.status === 'pending' ? '申请审核中，请耐心等待管理员审核' : '已入驻该客户项目，请勿重复入驻'
        });
      }
      let applyStatus = 'pending';
      if (already && already.status === 'rejected') {
        // 拒绝后重新申请
        if (applyType === 'individual') {
          db.prepare("UPDATE tenant_individuals SET status = 'pending', name = ?, phone = ?, position = ?, company = ?, updated_at = datetime('now') WHERE id = ?")
            .run(name, phone || '', position || '', city || '', already.id);
        } else {
          db.prepare("UPDATE tenant_enterprises SET status = 'pending', name = ?, industry = ?, updated_at = datetime('now') WHERE id = ?")
            .run(enterpriseName, industry || '', already.id);
          db.prepare("UPDATE tenant_enterprise_employees SET name = ?, position = ?, status = 'pending', updated_at = datetime('now') WHERE enterprise_id = ? AND user_id = ?")
            .run(name, position || '', already.id, req.user.id);
        }
        db.prepare('INSERT INTO tenant_invite_log (customer_id, invite_code, user_id) VALUES (?, ?, ?)').run(customerId, String(bindCode).trim(), req.user.id);
        const card0 = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(cardId);
        return res.json({ card: toCard(card0), applyStatus });
      }

      // 口令使用审计
      db.prepare('INSERT INTO tenant_invite_log (customer_id, invite_code, user_id) VALUES (?, ?, ?)').run(customerId, String(bindCode).trim(), req.user.id);
      // 审核流：创建 pending，不绑定租户、不关联名片（审核通过后由 card-market/apply/audit 完成）

      if (applyType === 'enterprise') {
        const entResult = db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, admin_user_id, status)
          VALUES (?, ?, ?, ?, 'pending')`).run(customerId, enterpriseName, industry || '', req.user.id);
        const enterpriseId = entResult.lastInsertRowid;
        db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, position, role, status)
          VALUES (?, ?, ?, ?, ?, 'admin', 'pending')`).run(enterpriseId, customerId, req.user.id, name, position || '');
      } else {
        db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(customerId, req.user.id, name, phone || '', position || '', city || '');
      }
    }

    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(cardId);
    res.json({ card: toCard(card), applyStatus: bindCode ? 'pending' : undefined });
  });

  router.put('/cards/:id', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    const { name, position, city, phone, wechat, email, company, bio, businessField, needTags, avatar, isPublic, videoChannel, slogan, tags, templateId, voiceUrl, voiceName } = req.body;
    // 模板校验（C 端可见 + 免费或已购）
    if (templateId !== undefined && templateId) {
      const chkTpl = canCUseTemplate(req.customerId, req.user.id, templateId);
      if (!chkTpl.ok) return res.status(400).json({ error: chkTpl.error });
    }
    db.prepare(
      `UPDATE card_profile SET name=?, position=?, city=?, phone=?, wechat=?, email=?, company=?, bio=?, business_field=?, need_tags=?, avatar=?, is_public=?, video_channel=?, slogan=?, tags=?, template_id=?, voice_url=?, voice_name=?, updated_at=datetime('now') WHERE id=?`
    ).run(name || card.name, position ?? card.position, city ?? card.city, phone ?? card.phone, wechat ?? card.wechat, email ?? card.email, company ?? card.company, bio ?? card.bio, businessField ?? card.business_field, needTags !== undefined ? (Array.isArray(needTags) ? JSON.stringify(needTags) : needTags) : card.need_tags, avatar ?? card.avatar, isPublic !== undefined ? (isPublic ? 1 : 0) : card.is_public, videoChannel ?? card.video_channel, slogan ?? card.slogan, tags ?? card.tags, templateId !== undefined ? templateId : card.template_id, voiceUrl !== undefined ? voiceUrl : card.voice_url, voiceName !== undefined ? voiceName : card.voice_name, card.id);
    const updated = db.prepare(`SELECT cp.*, ct.theme_config as template_theme
      FROM card_profile cp LEFT JOIN card_templates ct ON ct.id = cp.template_id WHERE cp.id = ?`).get(card.id);
    res.json({ card: toCard(updated) });
  });

  router.delete('/cards/:id', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    db.prepare("UPDATE card_profile SET status='deleted', updated_at=datetime('now') WHERE id=?").run(card.id);
    res.json({ ok: true });
  });

  // 名片作品集列表（公开）
  router.get('/cards/:id/works', (req, res) => {
    const works = db.prepare('SELECT id, card_id, image_url, title, sort_order FROM card_works WHERE card_id = ? ORDER BY sort_order ASC, id ASC').all(req.params.id);
    res.json({ works: works.map((w) => ({ id: w.id, cardId: w.card_id, imageUrl: w.image_url, title: w.title, sortOrder: w.sort_order })) });
  });

  // ============================================================
  // 访客行为采集
  // ============================================================
  router.post('/visitor/track', async (req, res) => {
    try {
      const { cardId, visitorOpenid, actionType, actionDetail, duration, page } = req.body;
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });

      const today = new Date().toISOString().slice(0, 10);

      // 更新或创建访客记录（24小时内合并）
      let visitor = db.prepare(
        'SELECT * FROM card_visitor WHERE card_id=? AND visitor_openid=? AND visit_date=?'
      ).get(cardId, visitorOpenid || 'anonymous', today);

      if (visitor) {
        db.prepare(
          "UPDATE card_visitor SET visit_count=visit_count+1, duration=duration+?, last_visit_at=datetime('now') WHERE id=?"
        ).run(duration || 0, visitor.id);
      } else {
        db.prepare(
          'INSERT INTO card_visitor (card_id, visitor_openid, visit_date, visit_count, duration, pages) VALUES (?,?,?,1,?,?)'
        ).run(cardId, visitorOpenid || 'anonymous', today, duration || 0, JSON.stringify([page || 'profile']));
      }

      // 记录行为详情
      db.prepare(
        'INSERT INTO card_visitor_action (card_id, visitor_openid, action_type, action_detail) VALUES (?,?,?,?)'
      ).run(cardId, visitorOpenid || 'anonymous', actionType || 'view', actionDetail || '');

      // 更新名片访问量
      if (actionType === 'view') {
        db.prepare('UPDATE card_profile SET view_count=view_count+1 WHERE id=?').run(cardId);
      }

      // ===== 运营型雷达链路（评估修订：cardId 反查租户 → 匹配事件 → 意向分 → 客户池 → 话术 → 分级提醒） =====
      // 雷达链路失败不阻塞主上报（try/catch 兜底）
      try {
        const cardRow = db.prepare('SELECT user_id FROM card_profile WHERE id = ?').get(cardId);
        const tenantId = radar.resolveTenant(cardId);
        const event = radar.matchEvent(tenantId, actionType || 'view');
        if (event && cardRow) {
          const ownerUserId = cardRow.user_id;
          const visitor = {
            openid: visitorOpenid || 'anonymous',
            name: (actionDetail || '').slice(0, 64),
            phone: '',
            wechat: '',
            company: '',
            userId: 0,
          };
          // 已注册访客：card_visitor.visitor_user_id 关联真实用户（如有）
          const vRow = db.prepare(
            'SELECT visitor_user_id FROM card_visitor WHERE card_id=? AND visitor_openid=? ORDER BY id DESC LIMIT 1'
          ).get(cardId, visitorOpenid || 'anonymous');
          if (vRow && vRow.visitor_user_id) visitor.userId = vRow.visitor_user_id;

          const intent = radar.onVisitorEvent(tenantId, ownerUserId, visitor, event, { duration: duration || 0 });

          // 高意向事件（转发/留电话/二次回访等 importance>=2）或带可识别身份（有姓名/已注册）时沉淀客户池
          let client = null;
          if (event.importance >= 2 || visitor.name || visitor.userId) {
            client = radar.upsertClient(tenantId, ownerUserId, visitor, 'radar');
          }

          // 话术：写入跟进建议（不自动群发，合规），随响应返回供前端提示
          const words = radar.pickWords(tenantId, event.id, intent.hit);
          if (client && client.id) {
            db.prepare(
              "INSERT INTO card_customer_follow (customer_id, user_id, content, next_follow_at) VALUES (?,?,?,NULL)"
            ).run(client.id, ownerUserId, words);
          }

          // 分级提醒：高意向事件才推送（通道未接降级站内提醒，见 radar.sendNotify）
          if (event.importance >= 2) {
            radar.sendNotify(tenantId, ownerUserId, event, visitor);
          }
        }
      } catch (radarErr) { /* 雷达链路异常不影响访客上报 */ }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // 访客雷达
  // ============================================================
  router.get('/visitors/summary', auth, (req, res) => {
    // 访客雷达为付费功能：free 或会员已过期 → 锁定
    const isMember = req.user.member_level !== 'free' && req.user.member_expire_at && new Date(req.user.member_expire_at) > new Date();
    if (!isMember) {
      return res.json({
        locked: true,
        memberLevel: req.user.member_level || 'free',
        memberExpireAt: req.user.member_expire_at || null,
        today: 0, week: 0, total: 0, diff: 0, visitors: []
      });
    }

    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.json({ today: 0, week: 0, total: 0, diff: 0, visitors: [] });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const todayCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(card.id, today).c;
    const yesterdayCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(card.id, yesterday).c;
    const weekCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date>=?').get(card.id, weekAgo).c;
    const total = db.prepare('SELECT view_count FROM card_profile WHERE id=?').get(card.id).view_count;

    // 较昨日增幅
    let diff = 0;
    if (yesterdayCount > 0) diff = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);

    const visitors = db.prepare(
      'SELECT * FROM card_visitor WHERE card_id=? ORDER BY last_visit_at DESC LIMIT 50'
    ).all(card.id);

    const enriched = visitors.map((v) => {
      // 关联昵称/头像
      let nickname = '', avatar = '';
      if (v.visitor_user_id) {
        const u = db.prepare('SELECT nickname, avatar FROM platform_user WHERE id=?').get(v.visitor_user_id);
        if (u) { nickname = u.nickname; avatar = u.avatar; }
      }
      // 最近动作
      const lastAction = db.prepare('SELECT action_type, action_detail FROM card_visitor_action WHERE card_id=? AND visitor_openid=? ORDER BY created_at DESC LIMIT 1').get(card.id, v.visitor_openid);
      const actionType = lastAction ? lastAction.action_type : '';
      const actionDetail = lastAction ? lastAction.action_detail : '';

      // 全部行为（用于意向评分）
      const actions = db.prepare('SELECT action_type, action_detail FROM card_visitor_action WHERE card_id=? AND visitor_openid=?').all(card.id, v.visitor_openid);
      const actionTypes = new Set(actions.map(a => a.action_type));

      // 标签推断（按最近动作优先）：已交换名片 > 观看视频 > 高意向 > 新访客
      let tag = '新访客', tagColor = '#9a9a9a';
      if (actionType === 'exchange') { tag = '已交换名片'; tagColor = '#07c160'; }
      else if (actionType === 'video' || (actionDetail || '').includes('视频')) { tag = '观看视频'; tagColor = '#1d4e8f'; }
      else if (v.visit_count >= 2) { tag = '高意向'; tagColor = '#07c160'; }

      // ===== AI 意向评分（本地规则引擎，0-100） =====
      let score = 0;
      score += Math.min(45, (v.visit_count || 1) * 15);            // 访问频次（封顶45）
      if (v.duration > 60) score += 10;
      if (v.duration > 180) score += 5;                            // 深度停留（封顶15）
      if (actionTypes.has('exchange')) score += 20;                // 交换名片（强意向）
      if (actionTypes.has('video') || actionTypes.has('share') || actionTypes.has('form')) score += 10;
      if (actionTypes.has('comment') || actionTypes.has('like')) score += 5;
      const firstVisit = db.prepare('SELECT MIN(visit_date) as d FROM card_visitor WHERE card_id=? AND visitor_openid=?').get(card.id, v.visitor_openid).d;
      const isReturning = firstVisit && firstVisit < v.visit_date;
      if (isReturning) score += 10;                                // 回访加分
      score = Math.min(100, score);
      const level = score >= 70 ? '高意向' : (score >= 40 ? '中意向' : '低意向');
      const levelColor = score >= 70 ? '#07c160' : (score >= 40 ? '#FF7D00' : '#9a9a9a');

      // 行为描述
      const durText = v.duration > 0 ? ` · 停留${v.duration >= 60 ? Math.floor(v.duration / 60) + '分' + (v.duration % 60) + '秒' : v.duration + '秒'}` : '';
      const behavior = `访问${v.visit_count}次${durText}`;
      const timeAgo = timeAgoText(v.last_visit_at);

      return {
        id: v.id, cardId: v.card_id, visitorOpenid: v.visitor_openid, visitorUserId: v.visitor_user_id,
        nickname: nickname || (v.visitor_openid === 'anonymous' ? '匿名访客' : '访客'), avatar,
        visitCount: v.visit_count, duration: v.duration, lastVisitAt: v.last_visit_at,
        tag, tagColor, actionType, behavior, timeAgo, unread: !v.read_at,
        score, level, levelColor, firstVisitAt: firstVisit || null, isReturning,
      };
    });

    res.json({ today: todayCount, week: weekCount, total, diff, visitors: enriched, trend: buildVisitorTrend(db, card.id) });
  });

  // 访客已读标记（红点消失）
  router.post('/visitors/:visitorOpenid/read', auth, (req, res) => {
    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    db.prepare('UPDATE card_visitor SET read_at = datetime(\'now\') WHERE card_id=? AND visitor_openid=?')
      .run(card.id, req.params.visitorOpenid);
    res.json({ ok: true });
  });

  // ============================================================
  // 运营型雷达（阶段A：高潜榜/意向详情/配置/话术/转发链/导出/站内提醒/订阅授权）
  // ============================================================

  // 会员门槛判断（与 /visitors/summary 同口径：非 free 且未过期）
  function radarMember(req, res) {
    const isMember = req.user.member_level !== 'free' && req.user.member_expire_at && new Date(req.user.member_expire_at) > new Date();
    if (!isMember) {
      res.json({ locked: true, memberLevel: req.user.member_level || 'free', memberExpireAt: req.user.member_expire_at || null });
      return null;
    }
    return isMember;
  }

  // 高潜客户榜（会员内）
  router.get('/radar/top-leads', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const card = db.prepare('SELECT id, user_id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (!card) return res.json({ leads: [], total: 0 });
      const tenantId = radar.resolveTenant(card.id);
      const leads = radar.topLeads(tenantId, req.user.id, Number(req.query.limit) || 20).map((r) => ({
        visitorOpenid: r.visitor_openid,
        visitorUserId: r.visitor_user_id,
        score: r.score,
        hitCount: r.hit_count,
        level: r.score >= 70 ? '高意向' : (r.score >= 40 ? '中意向' : '低意向'),
        lastCalcAt: r.last_calc_at,
        words: radar.pickWords(tenantId, (() => { const e = radar.matchEvent(tenantId, 'view'); return e ? e.id : 0; })(), r.hit_count),
      }));
      res.json({ leads, total: leads.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 单个访客意向详情（会员内）
  router.get('/radar/intent/:visitorOpenid', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (!card) return res.json({ intent: null });
      const tenantId = radar.resolveTenant(card.id);
      const intent = radar.intentOf(tenantId, req.user.id, req.params.visitorOpenid);
      res.json({ intent: intent ? { ...intent, level: intent.score >= 70 ? '高意向' : (intent.score >= 40 ? '中意向' : '低意向') } : null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 小程序端上报订阅授权结果（阶段D消费；阶段A留存授权记录）
  router.post('/radar/subscribe', auth, (req, res) => {
    try {
      const { granted, tmplIds = [] } = req.body || {};
      db.prepare(
        'INSERT INTO card_radar_subscribe (user_id, granted, tmpl_ids) VALUES (?,?,?)'
      ).run(req.user.id, granted ? 1 : 0, JSON.stringify(Array.isArray(tmplIds) ? tmplIds.slice(0, 5) : []));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 名片主查看雷达配置
  router.get('/radar/config', auth, (req, res) => {
    const cfg = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id = ?').get(req.customerId || 0);
    res.json({ config: cfg ? { switch: cfg.switch, xcxTmpid: cfg.xcx_tmpid, gzhAppid: cfg.gzh_appid, gzhTmpid: cfg.gzh_tmpid } : null });
  });

  // 更新雷达配置（开关/推送模板；tenant 级 upsert）
  router.post('/radar/config', auth, requireTenant, (req, res) => {
    try {
      const { switch: sw, xcxTmpid, gzhAppid, gzhTmpid } = req.body || {};
      const exists = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id = ?').get(req.customerId);
      if (exists) {
        db.prepare(
          "UPDATE card_radar_push_config SET switch=?, xcx_tmpid=?, gzh_appid=?, gzh_tmpid=?, updated_at=datetime('now') WHERE id=?"
        ).run(sw !== undefined ? (sw ? 1 : 0) : exists.switch, xcxTmpid ?? exists.xcx_tmpid, gzhAppid ?? exists.gzh_appid, gzhTmpid ?? exists.gzh_tmpid, exists.id);
      } else {
        db.prepare(
          'INSERT INTO card_radar_push_config (tenant_id, switch, xcx_tmpid, gzh_appid, gzh_tmpid) VALUES (?,?,?,?,?)'
        ).run(req.customerId, sw ? 1 : 0, xcxTmpid || '', gzhAppid || '', gzhTmpid || '');
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 话术列表（按事件分组，tenant 维度 + 平台公共）
  router.get('/radar/words', auth, (req, res) => {
    const events = db.prepare(
      'SELECT * FROM card_radar_event WHERE enabled = 1 AND (tenant_id = ? OR tenant_id = 0) ORDER BY tenant_id DESC, sort_order, id'
    ).all(req.customerId || 0);
    res.json({ groups: events.map((ev) => ({
      eventId: ev.id, name: ev.name, title: ev.title, importance: ev.importance,
      words: db.prepare('SELECT id, time_start, time_end, words FROM card_radar_words WHERE tenant_id = ? AND event_id = ? ORDER BY time_start').all(req.customerId || 0, ev.id),
    })) });
  });

  // 新增/编辑话术（tenant 维度）
  router.post('/radar/words', auth, requireTenant, (req, res) => {
    try {
      const { eventId, timeStart = 0, timeEnd = 0, words } = req.body || {};
      const ev = db.prepare('SELECT id FROM card_radar_event WHERE id = ? AND (tenant_id = ? OR tenant_id = 0)').get(eventId, req.customerId);
      if (!ev) return res.status(404).json({ error: '事件不存在' });
      if (!words || !String(words).trim()) return res.status(400).json({ error: '话术内容不能为空' });
      const r = db.prepare(
        'INSERT INTO card_radar_words (tenant_id, event_id, time_start, time_end, words) VALUES (?,?,?,?,?)'
      ).run(req.customerId, eventId, Number(timeStart) || 0, Number(timeEnd) || 0, String(words).trim().slice(0, 500));
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 转发传播链列表（会员内）
  router.get('/radar/shares', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (!card) return res.json({ shares: [], total: 0 });
      const tenantId = radar.resolveTenant(card.id);
      const shares = radar.shares(tenantId, card.id, Number(req.query.limit) || 50);
      res.json({ shares: shares.map((s) => ({ id: s.id, fromUserId: s.from_user_id, toOpenid: s.to_openid, shareUrl: s.share_url, createdAt: s.created_at })), total: shares.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 记录转发链（公开，分享名片时上报）
  router.post('/radar/share', (req, res) => {
    try {
      const { cardId, fromUserId, toOpenid, shareUrl } = req.body || {};
      if (!cardId || !fromUserId) return res.status(400).json({ error: '参数缺失' });
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ?').get(cardId);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      const tenantId = radar.resolveTenant(cardId);
      radar.trackShare(tenantId, cardId, fromUserId, toOpenid || '', shareUrl || '');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 客户+意向导出 CSV（会员内；企微同步占位）
  router.get('/radar/export', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const leads = radar.topLeads(req.customerId || 0, req.user.id, 500);
      const lines = ['访客openid,意向分,命中次数,最近计算时间'];
      for (const l of leads) {
        lines.push(`${l.visitor_openid},${l.score},${l.hit_count},${l.last_calc_at}`);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="radar-leads.csv"');
      res.send('\uFEFF' + lines.join('\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 当前会员权益：features + 配额余量（阶段C：AI报告入口 / 会员卡权益清单用；free 返回空 features + 不限配额）
  router.get('/radar/features', auth, (req, res) => {
    const lead = quota.quotaLeft(req.user.id, 'lead');
    const push = quota.quotaLeft(req.user.id, 'push');
    const collect = quota.quotaLeft(req.user.id, 'collect');
    const all = ['ai_report', 'ai_words', 'quota_lead', 'quota_push', 'enterprise'];
    res.json({
      isMember: !!quota.planOf(req.user.id),
      features: all.filter((f) => quota.hasFeature(req.user.id, f)),
      quota: {
        lead: { limit: lead.limit, used: lead.used, left: lead.left, unlimited: lead.unlimited },
        push: { limit: push.limit, used: push.used, left: push.left, unlimited: push.unlimited },
        collect: { limit: collect.limit, used: collect.used, left: collect.left, unlimited: collect.unlimited },
      },
    });
  });

  // 站内提醒列表（名片主消息页）
  router.get('/radar/notifies', auth, (req, res) => {
    const notifies = radar.listNotifies(req.customerId || 0, req.user.id, Number(req.query.limit) || 50);
    res.json({ notifies: notifies.map((n) => ({ id: n.id, eventName: n.event_name, title: n.title, visitorName: n.visitor_name, channel: n.channel, status: n.status, readAt: n.read_at, createdAt: n.created_at })) });
  });

  // 站内提醒已读
  router.post('/radar/notifies/:id/read', auth, (req, res) => {
    db.prepare("UPDATE card_radar_notify SET read_at = datetime('now') WHERE id = ? AND owner_user_id = ?")
      .run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  // ============================================================
  // 名片收藏（产品决策：本期做；collect_limit 权益：0=不限，超限提示升级）
  // ============================================================
  router.post('/collect', auth, (req, res) => {
    try {
      const { cardId } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });
      const card = db.prepare("SELECT * FROM card_profile WHERE id = ? AND status = 'active'").get(cardId);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      if (Number(card.user_id) === req.user.id) return res.status(400).json({ error: '不能收藏自己的名片' });
      const exist = db.prepare('SELECT id FROM card_collect WHERE card_id = ? AND user_id = ?').get(cardId, req.user.id);
      if (exist) return res.json({ ok: true, collected: true });
      // 收藏上限校验（collect_limit：0=不限）
      if (!quota.canCollect(req.user.id)) {
        return res.status(403).json({ error: '收藏数量已达上限，升级会员可收藏更多名片', limitHit: true });
      }
      db.prepare('INSERT INTO card_collect (card_id, user_id) VALUES (?,?)').run(cardId, req.user.id);
      res.json({ ok: true, collected: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 取消收藏
  router.delete('/collect', auth, (req, res) => {
    try {
      const { cardId } = req.query || {};
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });
      db.prepare('DELETE FROM card_collect WHERE card_id = ? AND user_id = ?').run(cardId, req.user.id);
      res.json({ ok: true, collected: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 我的收藏列表
  router.get('/collects', auth, (req, res) => {
    try {
      const rows = db.prepare(
        `SELECT c.*, cp.name, cp.company, cp.position, cp.avatar FROM card_collect c
         LEFT JOIN card_profile cp ON cp.id = c.card_id
         WHERE c.user_id = ? ORDER BY c.id DESC LIMIT ?`
      ).all(req.user.id, Number(req.query.limit) || 50);
      res.json({ collects: rows.map((r) => ({
        id: r.id, cardId: r.card_id, name: r.name || '', company: r.company || '', position: r.position || '', avatar: r.avatar || '', createdAt: r.created_at,
      })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 无感留资（修订二：card_lead 提交表；授权手机号 → 落线索 → 客户池 → 高意向事件+提醒）
  // ============================================================
  router.post('/leads', (req, res) => {
    try {
      const { cardId, name = '', phone = '' } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });
      const card = db.prepare("SELECT * FROM card_profile WHERE id = ? AND status = 'active'").get(cardId);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      if (!phone && !name) return res.status(400).json({ error: '请至少提供姓名或手机号' });
      const tenantId = radar.resolveTenant(cardId);
      // 留资配额（阶段B对齐：套餐有效期累计 + 成功才扣 + 超限引导升级；free 不限）
      if (!quota.canLead(card.user_id)) {
        return res.status(403).json({ error: '留资额度已达上限，升级会员可解锁更多留资', limitHit: true });
      }
      db.prepare(
        'INSERT INTO card_lead (tenant_id, card_id, owner_user_id, visitor_openid, name, phone, source) VALUES (?,?,?,?,?,?,?)'
      ).run(tenantId, cardId, card.user_id, '', String(name).trim().slice(0, 64), String(phone).trim().slice(0, 32), 'radar');
      // 入客户池（有手机号/姓名时）
      radar.upsertClient(tenantId, card.user_id, { openid: '', name: String(name).trim() || '游客', phone: String(phone).trim(), wechat: '', company: '', userId: 0 }, 'radar');
      // 触发高意向事件 form（importance>=2 → 站内提醒）
      const event = radar.matchEvent(tenantId, 'form');
      if (event) {
        radar.onVisitorEvent(tenantId, card.user_id, { openid: '', name: String(name).trim() || '游客', phone: String(phone).trim(), userId: 0 }, event, {});
        radar.sendNotify(tenantId, card.user_id, event, { name: String(name).trim() || '匿名访客' });
      }
      res.json({ ok: true, message: '提交成功，我们会尽快与您联系' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 近7日访问趋势（按日聚合，缺日补0）
  function buildVisitorTrend(db, cardId) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const c = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(cardId, d).c;
      days.push({ date: d.slice(5), count: c });
    }
    return days;
  }

  function timeAgoText(time) {    if (!time) return '';
    const d = new Date(String(time).replace(' ', 'T'));
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 172800000) return '昨天';
    return String(time).slice(5, 16);
  }

  router.get('/visitors/:visitorOpenid/timeline', auth, (req, res) => {
    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.json({ actions: [] });
    const actions = db.prepare(
      'SELECT * FROM card_visitor_action WHERE card_id=? AND visitor_openid=? ORDER BY created_at DESC LIMIT 100'
    ).all(card.id, req.params.visitorOpenid);
    res.json({ actions: actions.map(toVisitorAction) });
  });

  // ============================================================
  // 客户管理
  // ============================================================
  router.get('/customers', auth, (req, res) => {
    const { status, tag } = req.query;
    let sql = 'SELECT * FROM card_customer WHERE owner_user_id=?';
    const params = [req.user.id];
    if (status) { sql += ' AND status=?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC';
    const customers = db.prepare(sql).all(...params);
    res.json({ customers: customers.map(toCustomer) });
  });

  router.post('/customers', auth, (req, res) => {
    const { name, phone, wechat, company, tags, source, sourceCardId } = req.body;
    if (!name) return res.status(400).json({ error: '客户姓名不能为空' });
    const result = db.prepare(
      'INSERT INTO card_customer (owner_user_id, name, phone, wechat, company, tags, source, source_card_id) VALUES (?,?,?,?,?,?,?,?)'
    ).run(req.user.id, name, phone || '', wechat || '', company || '', JSON.stringify(tags || []), source || 'manual', sourceCardId || null);
    const customer = db.prepare('SELECT * FROM card_customer WHERE id=?').get(result.lastInsertRowid);
    res.json({ customer: toCustomer(customer) });
  });

  router.put('/customers/:id', auth, (req, res) => {
    const customer = db.prepare('SELECT * FROM card_customer WHERE id=? AND owner_user_id=?').get(req.params.id, req.user.id);
    if (!customer) return res.status(404).json({ error: '客户不存在' });
    const { name, phone, wechat, company, tags, status, nextFollowAt } = req.body;
    db.prepare(
      "UPDATE card_customer SET name=?, phone=?, wechat=?, company=?, tags=?, status=?, next_follow_at=?, updated_at=datetime('now') WHERE id=?"
    ).run(name || customer.name, phone ?? customer.phone, wechat ?? customer.wechat, company ?? customer.company, tags ? JSON.stringify(tags) : customer.tags, status || customer.status, nextFollowAt || null, customer.id);
    const updated = db.prepare('SELECT * FROM card_customer WHERE id=?').get(customer.id);
    res.json({ customer: toCustomer(updated) });
  });

  router.post('/customers/:id/follow', auth, (req, res) => {
    const { content, nextFollowAt } = req.body;
    if (!content) return res.status(400).json({ error: '跟进内容不能为空' });
    db.prepare('INSERT INTO card_customer_follow (customer_id, user_id, content, next_follow_at) VALUES (?,?,?,?)')
      .run(req.params.id, req.user.id, content, nextFollowAt || null);
    db.prepare("UPDATE card_customer SET last_follow_at=datetime('now'), next_follow_at=?, updated_at=datetime('now') WHERE id=?")
      .run(nextFollowAt || null, req.params.id);
    res.json({ ok: true });
  });

  router.get('/customers/:id/follows', auth, (req, res) => {
    const follows = db.prepare('SELECT * FROM card_customer_follow WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
    res.json({ follows: follows.map(toFollow) });
  });

  // ============================================================
  // 名片交换
  // ============================================================
  router.post('/exchange', auth, (req, res) => {
    const { toCardId, sharePhone } = req.body;
    const myCard = db.prepare('SELECT * FROM card_profile WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!myCard) return res.status(400).json({ error: '请先创建名片' });
    const toCard = db.prepare('SELECT * FROM card_profile WHERE id=?').get(toCardId);
    if (!toCard) return res.status(404).json({ error: '对方名片不存在' });

    db.prepare(
      'INSERT INTO card_exchange (from_user_id, to_user_id, from_card_id, to_card_id, phone_shared) VALUES (?,?,?,?,?)'
    ).run(req.user.id, toCard.user_id, myCard.id, toCardId, sharePhone ? 1 : 0);

    db.prepare('UPDATE card_profile SET exchange_count=exchange_count+1 WHERE id=?').run(toCardId);

    // 自动转为客户
    const exists = db.prepare('SELECT id FROM card_customer WHERE owner_user_id=? AND name=?').get(req.user.id, toCard.name);
    if (!exists) {
      db.prepare(
        'INSERT INTO card_customer (owner_user_id, name, phone, wechat, company, source, source_card_id) VALUES (?,?,?,?,?,?,?)'
      ).run(req.user.id, toCard.name, sharePhone ? toCard.phone : '', toCard.wechat, toCard.company, 'exchange', toCardId);
    }

    res.json({ ok: true, exchangedCard: toCard(toCard) });
  });

  // ============================================================
  // 人脉集市
  // ============================================================
  router.get('/market', auth, (req, res) => {
    const { keyword, businessField, page = 1, pageSize = 20 } = req.query;
    let sql = "SELECT * FROM card_profile WHERE is_public=1 AND status='active'";
    const params = [];
    if (keyword) { sql += ' AND (name LIKE ? OR company LIKE ? OR position LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (businessField) { sql += ' AND business_field LIKE ?'; params.push(`%${businessField}%`); }
    sql += ' ORDER BY view_count DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    const cards = db.prepare(sql).all(...params);
    const total = db.prepare("SELECT COUNT(*) as c FROM card_profile WHERE is_public=1 AND status='active'").get().c;
    res.json({ cards: cards.map(toCard), total, page: Number(page), pageSize: Number(pageSize) });
  });

  // ============================================================
  // 会员套餐
  // ============================================================
  router.get('/member/packages', (_req, res) => {
    const packages = db.prepare('SELECT * FROM member_package WHERE enabled=1 ORDER BY sort_order').all();
    res.json({ packages: packages.map(p => ({ ...p, features: JSON.parse(p.features || '[]') })) });
  });

  router.get('/member/status', auth, (req, res) => {
    const isMember = req.user.member_level !== 'free' && req.user.member_expire_at && new Date(req.user.member_expire_at) > new Date();
    res.json({
      level: isMember ? req.user.member_level : 'free',
      expireAt: req.user.member_expire_at,
      isMember,
    });
  });

  // ============================================================
  // 租户级会员卡（1:1 复刻菜鸟云：我的会员卡/等级列表/申请/签到/购买）
  // ============================================================

  // 我的会员卡（等级卡/卡号/到期/积分/余额/设置/申请状态）
  router.get('/member/my-card', auth, (req, res) => {
    if (!req.customerId) return res.json({ card: null, levels: [], settings: null, applyStatus: null, unbound: true });
    res.json(member.myCard(req.customerId, req.user.id));
  });

  // 会员等级列表（C 端展示/购买/申请用）
  router.get('/member/levels', auth, (req, res) => {
    if (!req.customerId) return res.json({ levels: [] });
    res.json({ levels: member.listLevels(req.customerId) });
  });

  // 申请会员（申请模式）
  router.post('/member/apply', auth, (req, res) => {
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户' });
    const r = member.apply(req.customerId, req.user.id, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // 每日签到（积分）
  router.post('/member/sign', auth, (req, res) => {
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户' });
    const r = member.sign(req.customerId, req.user.id);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // 直接购买会员（生成支付单，支付成功后开卡）
  router.post('/member/buy', auth, (req, res) => {
    try {
      if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户' });
      const levelId = Number(req.body.levelId);
      const level = member.getLevel(req.customerId, levelId);
      if (!level) return res.status(404).json({ error: '会员等级不存在' });
      if (level.upgrade_mode !== 'consume' || !level.buy_price) return res.status(400).json({ error: '该等级不支持直接购买' });
      const settings = member.getSettings(req.customerId);
      if (!settings.card_enabled) return res.status(400).json({ error: '会员卡未启用' });
      const payment = new PaymentService(db);
      const order = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'card',
        productType: 'member_card',
        productId: String(level.id),
        productName: level.name || `会员${level.level_no}级`,
        amount: level.buy_price,
        channel: req.body.channel || 'wechat',
        remark: '购买会员卡',
      });
      res.json({ orderNo: order.orderNo, amount: order.amount, level });
    } catch (e) {
      res.status(400).json({ error: e.message || '下单失败' });
    }
  });

  // ============================================================
  // 商品订单（二期-A：C 端下单 → 支付单 → 分销分账/扣库存/通知由支付成功链路处理）
  // ============================================================

  // 我的订单列表（C 端）
  router.get('/goods/orders', auth, (req, res) => {
    try {
      if (!req.customerId) return res.json({ list: [] });
      const svc = createGoodsOrderService(db);
      const { status = '', page = 1, pageSize = 10 } = req.query;
      const result = svc.listOrders({ customerId: req.customerId, status, keyword: '', page: Number(page), pageSize: Number(pageSize) });
      // C 端仅返回当前用户订单
      const list = (result.list || []).filter((o) => o.user_id === req.user.id);
      res.json({ list, total: list.length });
    } catch (e) {
      res.status(400).json({ error: e.message || '查询失败' });
    }
  });

  // 申请售后（1:1 复刻菜鸟云：仅退款/退货退款，已支付订单可申请，同单唯一）
  router.post('/goods/orders/:id/after-sale', auth, requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const row = svc.createAfterSale({
        customerId: req.customerId, orderId: req.params.id, userId: req.user.id,
        type: req.body.type, reason: req.body.reason,
      });
      res.json(row);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // 下单：建业务单 + 支付单，返回支付所需信息
  router.post('/goods/order', auth, requireTenant, (req, res) => {
    try {
      const { items, deliveryMode = 'express', receiverName = '', receiverPhone = '', receiverAddress = '', remark = '' } = req.body || {};
      const svc = createGoodsOrderService(db);
      const order = svc.createOrder({
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        items, deliveryMode, receiverName, receiverPhone, receiverAddress, remark,
      });
      const payment = new PaymentService(db);
      const payOrder = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'goods',
        productType: 'goods',
        productId: String(order.id),
        productName: `商品订单#${order.orderNo}`,
        amount: order.pay_amount,
        channel: req.body?.channel || 'wechat',
        remark: `GO_${order.orderNo}`,
      });
      res.json({ orderNo: order.order_no, payOrderNo: payOrder.orderNo, amount: order.pay_amount, id: order.id });
    } catch (e) {
      res.status(400).json({ error: e.message || '下单失败' });
    }
  });

  // ============================================================
  // 分销（租户维度 dist_* 表；未入驻租户返回空态，不再读老 distribution_commission）
  // ============================================================

  // 扫码静默溯源绑定（首次进入租户绑定，永久锁定，不弹窗）
  router.post('/distribution/bind', auth, requireTenant, (req, res) => {
    const { parentId, identityType } = req.body;
    if (!parentId) return res.json({ ok: true, message: '无绑定来源' });
    const idt = identityType || req.user.identity_type || 'individual';
    const result = distribution.bindRelation(req.customerId, req.user.id, idt, Number(parentId), 'qrcode');
    if (!result.ok) return res.json({ ok: false, error: result.error });
    res.json({ ok: true, relation: result.relation });
  });

  // 分销漏斗埋点：share（登录用户主动分享）/ view（带邀请链接访问，可未登录，按访客去重）
  router.post('/distribution/funnel', (req, res) => {
    try {
      const { eventType, inviter, visitorKey } = req.body || {};
      if (eventType === 'share') {
        if (!req.user || !req.user.id) return res.json({ ok: false, error: '未登录' });
        const tenantId = req.customerId || (() => { const u = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(req.user.id); return u ? u.customer_id : 0; })();
        if (!tenantId) return res.json({ ok: false, error: '未入驻租户' });
        distribution.trackFunnel(tenantId, req.user.id, 'share', '');
        return res.json({ ok: true });
      }
      if (eventType === 'view') {
        const pid = Number(inviter || 0);
        const vk = String(visitorKey || '').slice(0, 64);
        if (!pid || !vk) return res.json({ ok: false, error: '缺少邀请人或访客标识' });
        const inv = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(pid);
        if (!inv || !inv.customer_id) return res.json({ ok: false, error: '邀请人不存在' });
        distribution.trackFunnel(inv.customer_id, pid, 'view', vk);
        return res.json({ ok: true });
      }
      res.json({ ok: false, error: '未知事件类型' });
    } catch (e) {
      res.json({ ok: false, error: '埋点失败' });
    }
  });

  // 我的推广二维码（PRD：名片ID + 租户归属，扫码跳名片自动绑定上下级）
  router.get('/distribution/qrcode', auth, async (req, res) => {
    try {
      if (!req.customerId) return res.json({ ok: false, error: '未入驻任何租户，暂无法生成推广码' });
      const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const shareUrl = buildShareUrl(req.user.id, `${proto}://${host}`);
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
      res.json({ ok: true, qrDataUrl, shareUrl, inviterId: req.user.id });
    } catch (e) {
      res.status(500).json({ error: '二维码生成失败' });
    }
  });

  // 我的分销中心汇总（钱包三键隔离 + 直推/间推 + 本月佣金 + 分销商申请状态 + 基本设置/关系设置透传）
  router.get('/distribution/summary', auth, (req, res) => {
    if (!req.customerId) return res.json({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, isEnableDist: false, isEnablePartner: false, isEnableShareAll: false, isEnableShareCat: false, isEnableShareArea: false, unbound: true, isPartner: false, shareTags: [], partnerPending: 0, partnerTotal: 0, sharePending: 0, shareTotal: 0, shareAllPending: 0, shareAllTotal: 0, shareCatPending: 0, shareCatTotal: 0, shareAreaPending: 0, shareAreaTotal: 0, shareCatGroups: [], shareAreaGroups: [], currentLevelName: '默认等级', currentLevelNo: 1, nextLevel: null, levels: [], subTmplReview: '', subTmplDone: '', gate: 0, applyStatus: null, canApply: false, distName: '推广员', subName: '下级', bindRule: 0, becomeRule: 0, becomeAmount: 0, becomeProducts: '', applyTopImg: '', promoteImg: '', applyTip: '', shareTitle: '', shareImg: '', applyAgreement: '', distNotice: '', posterBadge: true, zeroOrder: false, showParent: false, showPhone: false, defaultLevel: '默认等级', parent: null, posterTemplates: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const s = distribution.getSummary(req.customerId, req.user.id, idt);
    const apply = distribution.getApplyStatus(req.customerId, req.user.id, idt);
    res.json({
      wallet: {
        waitSettle: s.wallet.wait_settle,
        available: s.wallet.available,
        totalIncome: s.wallet.total_income,
        totalWithdraw: s.wallet.total_withdraw,
      },
      directCount: s.directCount,
      indirectCount: s.indirectCount,
      monthCommission: s.monthCommission,
      monthNew: s.monthNew,
      todayCommission: s.todayCommission || 0,
      todayOrder: s.todayOrder || 0,
      todayNew: s.todayNew || 0,
      totalCommission: s.totalCommission || 0,
      totalOrders: s.totalOrders || 0,
      withdrawing: s.withdrawing || 0,
      isEnableDist: !!s.isEnableDist,
      isEnablePartner: !!s.isEnablePartner,
      isEnableShareAll: !!s.isEnableShareAll,
      isEnableShareCat: !!s.isEnableShareCat,
      isEnableShareArea: !!s.isEnableShareArea,
      selfName: s.selfName || '我',
      selfAvatar: s.selfAvatar || '',
      isPartner: s.isPartner,
      partnerMode: s.partnerMode || 0,
      shareTags: s.shareTags,
      partnerPending: s.partnerPending,
      partnerTotal: s.partnerTotal,
      sharePending: s.sharePending,
      shareTotal: s.shareTotal,
      shareAllPending: s.shareAllPending,
      shareAllTotal: s.shareAllTotal,
      shareCatPending: s.shareCatPending,
      shareCatTotal: s.shareCatTotal,
      shareAreaPending: s.shareAreaPending,
      shareAreaTotal: s.shareAreaTotal,
      shareCatGroups: s.shareCatGroups || [],
      shareAreaGroups: s.shareAreaGroups || [],
      currentLevelName: s.currentLevelName || '默认等级',
      currentLevelNo: s.currentLevelNo || 1,
      nextLevel: s.nextLevel || null,
      levels: s.levels || [],
      subTmplReview: s.subTmplReview || '',
      subTmplDone: s.subTmplDone || '',
      posterTemplates: s.posterTemplates || [],
      // 分销商申请链路：gate 门槛（become_rule）/ 是否可申请 / 最新申请状态
      gate: apply.gate,
      inWhitelist: apply.inWhitelist,
      canApply: apply.canApply,
      applyStatus: apply.applyStatus,
      rejectReason: apply.rejectReason,
      // 基本设置 / 分销参数 / 关系设置 / 分享设置 / 协议与须知
      distName: s.distName, subName: s.subName,
      applyTopImg: s.applyTopImg, promoteImg: s.promoteImg, applyTip: s.applyTip,
      zeroOrder: s.zeroOrder, showParent: s.showParent, showPhone: s.showPhone, defaultLevel: s.defaultLevel,
      bindRule: s.bindRule, becomeRule: s.becomeRule, becomeAmount: s.becomeAmount, becomeProducts: s.becomeProducts,
      shareTitle: s.shareTitle, shareImg: s.shareImg,
      applyAgreement: s.applyAgreement, distNotice: s.distNotice,
      posterBadge: s.posterBadge !== undefined ? s.posterBadge : true,
      withdrawMin: s.withdrawMin || 0,
      withdrawFeeRate: s.withdrawFeeRate || 0,
      parent: s.parent,
    });
  });

  // 申请成为分销商（门槛=2 指定名单时开放）
  router.post('/distribution/apply', auth, requireTenant, (req, res) => {
    const idt = req.body.identityType || req.user.identity_type || 'individual';
    res.json(distribution.applyDistributor(req.customerId, req.user.id, idt));
  });

  // 合伙人「团队流水」：团队成员付费订单明细
  router.get('/distribution/team-orders', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { page = 1, pageSize = 20 } = req.query;
    res.json(distribution.getTeamOrders(req.customerId, req.user.id, idt, { page: Number(page), pageSize: Number(pageSize) }));
  });

  // 我的下级客户列表（直推 level=1 / 间推 level=2）
  router.get('/distribution/subs', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { level = 1, page = 1, pageSize = 20 } = req.query;
    res.json(distribution.getSubs(req.customerId, req.user.id, idt, { level: Number(level), page: Number(page), pageSize: Number(pageSize) }));
  });

  // 收益明细（type 过滤：level1/level2/partner/share_all/share_cat/share_area）
  router.get('/distribution/logs', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { page = 1, pageSize = 20, type = '' } = req.query;
    const r = distribution.getLogs(req.customerId, req.user.id, idt, { page: Number(page), pageSize: Number(pageSize), type });
    res.json(r);
  });

  // 钱包
  router.get('/distribution/wallet', auth, (req, res) => {
    if (!req.customerId) return res.json(null);
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const w = distribution.getWallet(req.customerId, req.user.id, idt);
    res.json({ waitSettle: w.wait_settle, available: w.available, totalIncome: w.total_income, totalWithdraw: w.total_withdraw });
  });

  // 申请提现
  router.post('/distribution/withdraw', auth, requireTenant, (req, res) => {
    const { amount, identityType, payAccount } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: '提现金额无效' });
    const idt = identityType || req.user.identity_type || 'individual';
    const r = distribution.applyWithdraw(req.customerId, req.user.id, idt, Number(amount), payAccount || '');
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true, withdrawNo: r.withdrawNo });
  });

  // 提现记录
  router.get('/distribution/withdraws', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { page = 1, pageSize = 20, status = '' } = req.query;
    res.json(distribution.getWithdraws(req.customerId, req.user.id, idt, { page: Number(page), pageSize: Number(pageSize), status }));
  });

  // 我的下级列表（直推/间推）
  router.get('/distribution/team', auth, (req, res) => {
    if (!req.customerId) return res.json({ firstLevel: [], secondLevel: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    // 合伙人「我的团队」：沿 pid1 递归收集全部团队成员（BFS，防环）
    if (req.query.scope === 'all') {
      return res.json(distribution.buildTeam(req.customerId, req.user.id, idt));
    }
    const firstLevel = db.prepare(
      'SELECT r.user_id as id, u.nickname, u.avatar, r.bind_time as createdAt FROM dist_user_relation r LEFT JOIN platform_user u ON u.id = r.user_id WHERE r.tenant_id = ? AND r.pid1 = ? AND r.identity_type = ? ORDER BY r.id DESC'
    ).all(req.customerId, req.user.id, idt);
    const secondLevel = db.prepare(
      'SELECT r.user_id as id, u.nickname, u.avatar, r.bind_time as createdAt FROM dist_user_relation r LEFT JOIN platform_user u ON u.id = r.user_id WHERE r.tenant_id = ? AND r.pid2 = ? AND r.identity_type = ? ORDER BY r.id DESC'
    ).all(req.customerId, req.user.id, idt);
    res.json({
      firstLevel: firstLevel.map(u => ({ id: u.id, nickname: u.nickname || '微信用户', avatar: u.avatar, createdAt: u.createdAt })),
      secondLevel: secondLevel.map(u => ({ id: u.id, nickname: u.nickname || '微信用户', avatar: u.avatar, createdAt: u.createdAt })),
    });
  });

  // ============================================================
  // 动态
  // ============================================================
  router.get('/dynamics', auth, (req, res) => {
    const dynamics = db.prepare('SELECT * FROM card_dynamic WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
    res.json({ dynamics: dynamics.map(toDynamic) });
  });

  router.post('/dynamics', auth, (req, res) => {
    const { content, images, visibility, title, cardId } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    const result = db.prepare('INSERT INTO card_dynamic (user_id, card_id, title, content, images, visibility) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, cardId || null, title || '', content, JSON.stringify(images || []), visibility || 'public');
    const dynamic = db.prepare(`SELECT d.*, u.nickname, u.avatar FROM card_dynamic d
      LEFT JOIN platform_user u ON d.user_id = u.id WHERE d.id = ?`).get(result.lastInsertRowid);
    res.json({ dynamic: toDynamic(dynamic) });
  });

  // ============ 动态点赞/取消点赞 ============
  router.post('/dynamics/:id/like', auth, (req, res) => {
    const dyn = db.prepare("SELECT * FROM card_dynamic WHERE id = ? AND status = 'active'").get(req.params.id);
    if (!dyn) return res.status(404).json({ error: '动态不存在' });
    const exist = db.prepare('SELECT id FROM card_dynamic_like WHERE dynamic_id = ? AND user_id = ?').get(dyn.id, req.user.id);
    if (exist) {
      db.prepare('DELETE FROM card_dynamic_like WHERE id = ?').run(exist.id);
      db.prepare('UPDATE card_dynamic SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(dyn.id);
      return res.json({ liked: false, likeCount: Math.max(0, (dyn.like_count || 0) - 1) });
    }
    db.prepare('INSERT INTO card_dynamic_like (dynamic_id, user_id) VALUES (?, ?)').run(dyn.id, req.user.id);
    db.prepare('UPDATE card_dynamic SET like_count = like_count + 1 WHERE id = ?').run(dyn.id);
    res.json({ liked: true, likeCount: (dyn.like_count || 0) + 1 });
  });

  // ============ 动态评论 ============
  router.post('/dynamics/:id/comments', auth, (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
    const dyn = db.prepare("SELECT * FROM card_dynamic WHERE id = ? AND status = 'active'").get(req.params.id);
    if (!dyn) return res.status(404).json({ error: '动态不存在' });
    const r = db.prepare('INSERT INTO card_dynamic_comment (dynamic_id, user_id, content) VALUES (?, ?, ?)')
      .run(dyn.id, req.user.id, content.trim().slice(0, 200));
    db.prepare('UPDATE card_dynamic SET comment_count = comment_count + 1 WHERE id = ?').run(dyn.id);
    const c = db.prepare(`SELECT c.*, u.nickname, u.avatar FROM card_dynamic_comment c
      LEFT JOIN platform_user u ON c.user_id = u.id WHERE c.id = ?`).get(r.lastInsertRowid);
    res.json({ comment: { id: c.id, dynamicId: c.dynamic_id, userId: c.user_id, nickname: c.nickname || '访客', avatar: c.avatar || '', content: c.content, createdAt: c.created_at } });
  });

  // 动态评论列表（公开只读）
  router.get('/dynamics/:id/comments', (req, res) => {
    const rows = db.prepare(`SELECT c.*, u.nickname, u.avatar FROM card_dynamic_comment c
      LEFT JOIN platform_user u ON c.user_id = u.id
      WHERE c.dynamic_id = ? AND c.status = 'active' ORDER BY c.created_at ASC LIMIT 50`).all(req.params.id);
    res.json({ comments: rows.map((c) => ({ id: c.id, dynamicId: c.dynamic_id, userId: c.user_id, nickname: c.nickname || '访客', avatar: c.avatar || '', content: c.content, createdAt: c.created_at })) });
  });

  // ============================================================
  // 工具函数
  // ============================================================
  function toUser(row) {
    if (!row) return null;
    return {
      id: row.id, openid: row.openid, nickname: row.nickname, avatar: row.avatar,
      phone: row.phone || '', memberLevel: row.member_level, memberExpireAt: row.member_expire_at,
      enterpriseId: row.enterprise_id, enterpriseRole: row.enterprise_role,
      parentId: row.parent_id, status: row.status, createdAt: row.created_at,
    };
  }

  function toCard(row) {
    if (!row) return null;
    let ownerMemberLevel = 'free';
    if (row.owner_member_level !== undefined) ownerMemberLevel = row.owner_member_level || 'free';
    // 租户品牌色（projects.config.brand_color）
    let brandColor = '';
    if (row.tenant_config) {
      try { const cfg = JSON.parse(row.tenant_config); brandColor = cfg.brand_color || ''; } catch {}
    }
    // 模板主题（card_templates.theme_config）
    let templateTheme = null;
    if (row.template_theme) {
      try { templateTheme = JSON.parse(row.template_theme); } catch {}
    }
    return {
      id: row.id, userId: row.user_id, enterpriseId: row.enterprise_id, cardType: row.card_type,
      name: row.name, position: row.position, city: row.city, phone: row.phone, wechat: row.wechat, email: row.email,
      company: row.company, bio: row.bio, businessField: row.business_field, avatar: row.avatar,
      slogan: row.slogan || '', tags: row.tags || '', needTags: row.need_tags || '',
      templateId: row.template_id, templateTheme, templateLayout: row.template_layout || 'card', videoChannel: row.video_channel, isPublic: !!row.is_public,
      collectCount: row.collectCount || 0, recentVisitors: row.recentVisitors || [],
      voiceUrl: row.voice_url || '', voiceName: row.voice_name || '',
      viewCount: row.view_count, exchangeCount: row.exchange_count, status: row.status,
      ownerMemberLevel,
      brandColor,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function toDynamic(row, likedByMe = false) {
    if (!row) return null;
    let images = [];
    try { images = JSON.parse(row.images || '[]'); } catch {}
    return {
      likedByMe: !!likedByMe,
      id: row.id, userId: row.user_id, cardId: row.card_id, title: row.title || '',
      content: row.content, images, likeCount: row.like_count || 0, commentCount: row.comment_count || 0,
      authorName: row.nickname || '', authorAvatar: row.avatar || '',
      createdAt: row.created_at,
    };
  }

  function toVisitor(row) {
    if (!row) return null;
    return {
      id: row.id, cardId: row.card_id, visitorOpenid: row.visitor_openid, visitDate: row.visit_date,
      visitCount: row.visit_count, duration: row.duration, lastVisitAt: row.last_visit_at,
    };
  }

  function toCustomer(row) {
    if (!row) return null;
    return {
      id: row.id, ownerUserId: row.owner_user_id, enterpriseId: row.enterprise_id,
      name: row.name, phone: row.phone, wechat: row.wechat, company: row.company,
      tags: JSON.parse(row.tags || '[]'), source: row.source, status: row.status,
      lastFollowAt: row.last_follow_at, nextFollowAt: row.next_follow_at,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function toVisitorAction(row) {
    if (!row) return null;
    return {
      id: row.id, cardId: row.card_id, visitorOpenid: row.visitor_openid,
      actionType: row.action_type, actionDetail: row.action_detail, duration: row.duration, createdAt: row.created_at,
    };
  }

  function toFollow(row) {
    if (!row) return null;
    return {
      id: row.id, customerId: row.customer_id, userId: row.user_id,
      content: row.content, nextFollowAt: row.next_follow_at, createdAt: row.created_at,
    };
  }

  // 全景热点表单留资（公开）：sceneId 反查租户，沉淀为客户线索
  router.post('/panorama/leads', (req, res) => {
    try {
      const { sceneId, hotspotTitle, fields = {} } = req.body || {};
      if (!sceneId) return res.status(400).json({ error: 'sceneId 必填' });
      const scene = db.prepare('SELECT id, plan_id FROM scenes WHERE id = ?').get(Number(sceneId));
      if (!scene) return res.status(404).json({ error: '场景不存在' });
      const plan = db.prepare('SELECT id, project_id FROM plans WHERE id = ?').get(scene.plan_id);
      if (!plan) return res.status(404).json({ error: '方案不存在' });
      const name = String(fields.name || '').trim().slice(0, 64);
      const phone = String(fields.phone || '').trim().slice(0, 32);
      const message = String(fields.message || '').trim().slice(0, 500);
      if (!name && !phone && !message) return res.status(400).json({ error: '请至少填写一项内容' });
      // 自定义字段（除 name/phone/message 外的键）存入 extra
      const extra = {};
      for (const [k, v] of Object.entries(fields)) {
        if (!['name', 'phone', 'message'].includes(k) && v !== undefined && v !== null && v !== '') extra[k] = String(v).slice(0, 200);
      }
      db.prepare(
        `INSERT INTO panorama_leads (tenant_id, plan_id, scene_id, hotspot_title, name, phone, message, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        plan.project_id || 0,
        plan.id,
        scene.id,
        String(hotspotTitle || '').slice(0, 128),
        name,
        phone,
        message,
        JSON.stringify(extra)
      );
      res.json({ ok: true, message: '提交成功，我们会尽快与您联系' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 设计中心万能表单提交（访客留资，归集 design_leads）
  router.post('/design/leads', (req, res) => {
    try {
      const { tenantId, formTitle, fields = [] } = req.body || {};
      if (!tenantId) return res.status(400).json({ error: '租户参数缺失' });
      const tenant = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(tenantId));
      if (!tenant) return res.status(404).json({ error: '租户不存在' });
      if (!Array.isArray(fields) || !fields.length) return res.status(400).json({ error: '表单内容为空' });
      if (fields.length > 50) return res.status(400).json({ error: '表单项过多' });
      const list = fields.slice(0, 50).map((f) => ({
        label: String(f.label || '').trim().slice(0, 64),
        value: String(f.value ?? '').trim().slice(0, 500),
      })).filter((f) => f.label && f.value);
      if (!list.length) return res.status(400).json({ error: '请至少填写一项内容' });
      db.prepare(
        `INSERT INTO design_leads (tenant_id, page_type, form_title, fields)
         VALUES (?, 'home', ?, ?)`
      ).run(
        Number(tenantId),
        String(formTitle || '留资表单').slice(0, 128),
        JSON.stringify(list)
      );
      res.json({ ok: true, message: '提交成功，我们会尽快与您联系' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 行为埋点（第三批）
  // 游客事件：cardId 反查租户；登录事件：使用用户绑定的租户
  // ============================================================
  router.post('/analytics/events', (req, res) => {
    try {
      const { events = [] } = req.body || {};
      if (!Array.isArray(events) || !events.length) return res.json({ ok: true, written: 0 });

      // 可选认证：兼容三类 token 解析租户
      //  - 客户后台 token（auth.js）：payload { uid(users.id), customerId }
      //  - C端 token（multi-auth.js）：payload { id(platform_user.id) }
      //  - 游客：无 token / 解析失败 → 走 cardId 反查
      let tenantId = 0;
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          if (payload.customerId) {
            tenantId = payload.customerId;
          } else if (payload.uid != null) {
            const cu = db.prepare('SELECT customer_id FROM users WHERE id = ?').get(payload.uid);
            if (cu && cu.customer_id) tenantId = cu.customer_id;
          }
          if (!tenantId && payload.id != null) {
            const u = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(payload.id);
            if (u) tenantId = u.customer_id || 0;
          }
        } catch { /* 无效 token 忽略，走游客逻辑 */ }
      }
      const anyCard = events.find((e) => e.cardId);
      if (!tenantId && anyCard) {
        const owner = db.prepare(
          'SELECT u.customer_id FROM card_profile cp JOIN platform_user u ON cp.user_id = u.id WHERE cp.id = ?'
        ).get(Number(anyCard.cardId));
        if (owner) tenantId = owner.customer_id || 0;
      }
      // 全景游客事件：sceneId → scenes → plans → project_id 反查租户
      const anyScene = events.find((e) => e.sceneId);
      if (!tenantId && anyScene) {
        const owner = db.prepare(
          'SELECT p.project_id AS cid FROM scenes sc JOIN plans p ON sc.plan_id = p.id WHERE sc.id = ?'
        ).get(Number(anyScene.sceneId));
        if (owner) tenantId = owner.cid || 0;
      }
      // solution 白名单：card（名片）/ panorama（全景），默认 card
      const solution = ['card', 'panorama'].includes(req.body?.solution) ? req.body.solution : 'card';
      const result = trackEvents(db, tenantId, solution, events);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 设计中心：C 端读取租户发布配置（最新风格/底部导航/首页跳转，供小程序/H5 按配置渲染）
  router.get('/design/config', authOptional, (req, res) => {
    // 租户上下文：正常登录态优先；否则校验设计中心预览签名（免登录）
    const previewTid = req.customerId ? 0 : verifyPreviewSig(req.query);
    // 公开浏览：未登录时支持 ?tid= 数字指定租户（装修配置为公开内容，供商城/全景等公开首页渲染）
    const pubTid = Number(req.query.tid) || 0;
    if (!req.customerId && !previewTid && !pubTid) return res.status(401).json({ error: '未登录' });
    const tenantId = req.customerId || previewTid || pubTid;
    const style = db.prepare('SELECT style_json FROM tenant_style_config WHERE tenant_id = ?').get(tenantId);
    const tab = db.prepare("SELECT scheme_name, tab_json FROM tenant_tab_scheme WHERE tenant_id = ? AND is_default = 1 AND enabled = 1").get(tenantId);
    const home = db.prepare('SELECT home_page, home_pages FROM tenant_home_config WHERE tenant_id = ?').get(tenantId);
    let homePages = {};
    if (home) {
      try { homePages = JSON.parse(home.home_pages || '{}'); } catch { homePages = {}; }
      // 兼容旧字段：home_pages 未含 card 时以 home_page 兜底（'card' 表示不跳转，展示 DIY 装修首页）
      if (!homePages.card && home.home_page && home.home_page !== 'card') homePages.card = home.home_page;
    }
    // 预览模式（?preview=1）：额外返回首页草稿页面组件，供 C 端「保存并预览」；
    // 首页跳转选择器支持指定 DIY 装修页面（?pageType=xxx）：读取该 page_type 的已发布页面（未发布回退草稿），
    // 与菜鸟云「首页跳转可选 DIY 页面」语义一致；未指定时按 is_home 首页渲染
    const reqPageType = String(req.query.pageType || '').trim();
    let pages = null;
    let header = null;
    const pickPage = (status) => {
      const q = reqPageType
        ? 'SELECT design_json FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = ? ORDER BY version DESC LIMIT 1'
        : 'SELECT design_json FROM tenant_page_design WHERE tenant_id = ? AND is_home = 1 AND status = ? ORDER BY version DESC LIMIT 1';
      const args = reqPageType ? [tenantId, reqPageType, status] : [tenantId, status];
      return db.prepare(q).get(...args);
    };
    if (String(req.query.preview) === '1') {
      const draft = pickPage(0);
      if (draft) {
        const j = JSON.parse(draft.design_json || '{}');
        pages = j;
        header = j.meta?.header || null;
      }
    } else {
      // 非预览：读取已发布页面组件与头部设置，供 C 端小程序/H5 渲染装修；
      // 未发布时回退到草稿（保证装修过的租户实际页面始终是装修内容，与设计中心预览一致）
      const pub = pickPage(1);
      let homeJson = null;
      if (pub) {
        homeJson = JSON.parse(pub.design_json || '{}');
      } else {
        const draft = pickPage(0);
        if (draft) homeJson = JSON.parse(draft.design_json || '{}');
      }
      if (homeJson) {
        pages = homeJson;
        header = homeJson.meta?.header || null;
      }
    }
    res.json({
      tenantId,
      style: style ? JSON.parse(style.style_json || '{}') : null,
      tab: tab ? { name: tab.scheme_name, items: JSON.parse(tab.tab_json || '[]') } : null,
      homePage: homePages.card || home?.home_page || 'card',
      homePages,
      header,
      pages,
    });
  });

  // 设计中心「全景场景」组件：按租户返回全景方案（含发布状态与封面），供小程序/H5 首页渲染
  router.get('/design/panorama-scenes', authOptional, (req, res) => {
    const previewTid = req.customerId ? 0 : verifyPreviewSig(req.query);
    if (!req.customerId && !previewTid) return res.status(401).json({ error: '未登录' });
    const tenantId = req.customerId || previewTid;
    const plans = db
      .prepare('SELECT * FROM plans WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
      .all(tenantId)
      .map((p) => {
        const scene = db
          .prepare('SELECT preview_path, image_path FROM scenes WHERE plan_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1')
          .get(p.id);
        const sceneCount = db
          .prepare('SELECT COUNT(*) AS n FROM scenes WHERE plan_id = ?')
          .get(p.id).n || 0;
        return {
          id: p.id,
          name: p.name,
          cover: p.cover_path || (scene ? scene.preview_path || scene.image_path : '') || '',
          published: Boolean(p.published),
          sceneCount,
        };
      });
    res.json({ plans });
  });

  return router;
}
