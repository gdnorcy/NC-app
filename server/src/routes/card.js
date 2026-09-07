/**
 * 智能名片解决方案 API
 * 个人C端用户 + 企业租户 + 平台运营
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { checkTenantAccess } from '../tenant.js';
import { trackEvents } from '../services/analytics.js';

export function createCardRouter(db, wxService) {
  const router = Router();

  // ============================================================
  // 微信授权登录/注册
  // ============================================================
  router.post('/auth/wx-login', async (req, res) => {
    try {
      const { code, parentId } = req.body;
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
        // 分销关系绑定
        let pid = null, gpid = null;
        if (parentId) {
          const parent = db.prepare('SELECT id, parent_id FROM platform_user WHERE id = ?').get(parentId);
          if (parent) {
            pid = parent.id;
            gpid = parent.parent_id || null;
          }
        }
        const result = db.prepare(
          'INSERT INTO platform_user (openid, unionid, nickname, avatar, parent_id, grandparent_id) VALUES (?,?,?,?,?,?)'
        ).run(openid, unionid, '微信用户', '', pid, gpid);
        user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(result.lastInsertRowid);
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
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何租户，禁止访问' });
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
  // 名片模板（C 端套用：平台公共 enabled + 本租户私有）
  // ============================================================
  router.get('/templates', auth, (req, res) => {
    try {
      const rows = db.prepare(
        'SELECT * FROM card_templates WHERE (tenant_id = 0 AND enabled = 1) OR (tenant_id = ? AND enabled = 1) ORDER BY tenant_id, sort_order, id DESC'
      ).all(req.customerId || 0);
      res.json({ templates: rows.map((t) => ({ id: t.id, name: t.name, cover: t.cover, description: t.description, themeConfig: (() => { try { return JSON.parse(t.theme_config); } catch { return {}; } })(), tenantId: t.tenant_id })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
      ct.theme_config as template_theme
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

  router.post('/cards', auth, (req, res) => {
    const { name, position, phone, wechat, email, company, bio, businessField, needTags, avatar, isPublic, templateId } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, phone, wechat, email, company, bio, business_field, need_tags, avatar, is_public, template_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', phone || '', wechat || '', email || '', company || '', bio || '', businessField || '', Array.isArray(needTags) ? JSON.stringify(needTags) : (needTags || ''), avatar || '', isPublic ? 1 : 0, templateId || '');
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(result.lastInsertRowid);
    res.json({ card: toCard(card) });
  });

  // 创建名片+入驻申请（合并流程）
  router.post('/cards/create-with-apply', auth, (req, res) => {
    const { name, position, city, phone, wechat, email, bio, businessField, avatar, isPublic, videoChannel,
            slogan, tags, templateId,
            bindCode, applyType, enterpriseName, industry } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });

    // 1. 创建名片
    const cardType = applyType === 'enterprise' ? 'company' : 'personal';
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, city, phone, wechat, email, bio, business_field, avatar, is_public, video_channel, card_type, slogan, tags, template_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', city || '', phone || '', wechat || '', email || '', bio || '', businessField || '', avatar || '', isPublic ? 1 : 0, videoChannel || '', cardType, slogan || '', tags || '', templateId || '');
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
    const { name, position, city, phone, wechat, email, company, bio, businessField, needTags, avatar, isPublic, videoChannel, slogan, tags, templateId } = req.body;
    // 模板存在性校验（公共或本租户）
    if (templateId !== undefined && templateId) {
      const tpl = db.prepare('SELECT id FROM card_templates WHERE id = ? AND ((tenant_id = 0 AND enabled = 1) OR tenant_id = ?)').get(templateId, req.customerId || 0);
      if (!tpl) return res.status(400).json({ error: '模板不存在或不可用' });
    }
    db.prepare(
      `UPDATE card_profile SET name=?, position=?, city=?, phone=?, wechat=?, email=?, company=?, bio=?, business_field=?, need_tags=?, avatar=?, is_public=?, video_channel=?, slogan=?, tags=?, template_id=?, updated_at=datetime('now') WHERE id=?`
    ).run(name || card.name, position ?? card.position, city ?? card.city, phone ?? card.phone, wechat ?? card.wechat, email ?? card.email, company ?? card.company, bio ?? card.bio, businessField ?? card.business_field, needTags !== undefined ? (Array.isArray(needTags) ? JSON.stringify(needTags) : needTags) : card.need_tags, avatar ?? card.avatar, isPublic !== undefined ? (isPublic ? 1 : 0) : card.is_public, videoChannel ?? card.video_channel, slogan ?? card.slogan, tags ?? card.tags, templateId !== undefined ? templateId : card.template_id, card.id);
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
  // 分销
  // ============================================================
  router.get('/distribution/summary', auth, (req, res) => {
    const totalCommission = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM distribution_commission WHERE user_id=? AND status='settled'").get(req.user.id).s;
    const pendingCommission = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM distribution_commission WHERE user_id=? AND status='pending'").get(req.user.id).s;
    const firstLevel = db.prepare('SELECT COUNT(*) as c FROM platform_user WHERE parent_id=?').get(req.user.id).c;
    const secondLevel = db.prepare('SELECT COUNT(*) as c FROM platform_user WHERE grandparent_id=?').get(req.user.id).c;
    res.json({ totalCommission, pendingCommission, firstLevel, secondLevel });
  });

  router.get('/distribution/commissions', auth, (req, res) => {
    const commissions = db.prepare('SELECT * FROM distribution_commission WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    res.json({ commissions: commissions.map(toCommission) });
  });

  router.get('/distribution/team', auth, (req, res) => {
    const firstLevel = db.prepare('SELECT id, nickname, avatar, created_at FROM platform_user WHERE parent_id=? ORDER BY created_at DESC').all(req.user.id);
    const secondLevel = db.prepare('SELECT id, nickname, avatar, created_at FROM platform_user WHERE grandparent_id=? ORDER BY created_at DESC').all(req.user.id);
    res.json({
      firstLevel: firstLevel.map(u => ({ id: u.id, nickname: u.nickname, avatar: u.avatar, createdAt: u.created_at })),
      secondLevel: secondLevel.map(u => ({ id: u.id, nickname: u.nickname, avatar: u.avatar, createdAt: u.created_at })),
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
      templateId: row.template_id, templateTheme, videoChannel: row.video_channel, isPublic: !!row.is_public,
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

  function toCommission(row) {
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, fromUserId: row.from_user_id,
      level: row.level, amount: row.amount, orderId: row.order_id,
      status: row.status, createdAt: row.created_at, settledAt: row.settled_at,
    };
  }


  // ============================================================
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

  return router;
}
