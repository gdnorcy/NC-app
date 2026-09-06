/**
 * 智能名片解决方案 API
 * 个人C端用户 + 企业租户 + 平台运营
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';

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
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 认证中间件
  function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
      if (!user || user.status !== 'active') return res.status(401).json({ error: '账号异常' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'token无效' });
    }
  }

  // ============================================================
  // 用户信息
  // ============================================================
  router.get('/user/profile', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE user_id = ?').get(req.user.id);
    res.json({ user: toUser(req.user), card: card ? toCard(card) : null });
  });

  router.put('/user/profile', auth, (req, res) => {
    const { nickname, avatar, phone } = req.body;
    db.prepare('UPDATE platform_user SET nickname=?, avatar=?, phone=?, updated_at=datetime("now") WHERE id=?')
      .run(nickname || req.user.nickname, avatar || req.user.avatar, phone || req.user.phone, req.user.id);
    const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(req.user.id);
    res.json({ user: toUser(user) });
  });

  // ============================================================
  // 名片 CRUD
  // ============================================================
  router.get('/cards', auth, (req, res) => {
    const cards = db.prepare('SELECT * FROM card_profile WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ cards: cards.map(toCard) });
  });

  router.get('/cards/:id', (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    if (card.status !== 'active') return res.status(404).json({ error: '名片不可用' });
    res.json({ card: toCard(card) });
  });

  router.post('/cards', auth, (req, res) => {
    const { name, position, phone, wechat, email, company, bio, businessField, avatar, isPublic } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, phone, wechat, email, company, bio, business_field, avatar, is_public)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', phone || '', wechat || '', email || '', company || '', bio || '', businessField || '', avatar || '', isPublic ? 1 : 0);
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(result.lastInsertRowid);
    res.json({ card: toCard(card) });
  });

  router.put('/cards/:id', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    const { name, position, phone, wechat, email, company, bio, businessField, avatar, isPublic, videoChannel } = req.body;
    db.prepare(
      `UPDATE card_profile SET name=?, position=?, phone=?, wechat=?, email=?, company=?, bio=?, business_field=?, avatar=?, is_public=?, video_channel=?, updated_at=datetime("now") WHERE id=?`
    ).run(name || card.name, position ?? card.position, phone ?? card.phone, wechat ?? card.wechat, email ?? card.email, company ?? card.company, bio ?? card.bio, businessField ?? card.business_field, avatar ?? card.avatar, isPublic !== undefined ? (isPublic ? 1 : 0) : card.is_public, videoChannel ?? card.video_channel, card.id);
    const updated = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(card.id);
    res.json({ card: toCard(updated) });
  });

  router.delete('/cards/:id', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    db.prepare("UPDATE card_profile SET status='deleted', updated_at=datetime('now') WHERE id=?").run(card.id);
    res.json({ ok: true });
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
          'UPDATE card_visitor SET visit_count=visit_count+1, duration=duration+?, last_visit_at=datetime("now") WHERE id=?'
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
    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.json({ today: 0, week: 0, total: 0, visitors: [] });

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const todayCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(card.id, today).c;
    const weekCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date>=?').get(card.id, weekAgo).c;
    const total = db.prepare('SELECT view_count FROM card_profile WHERE id=?').get(card.id).view_count;

    const visitors = db.prepare(
      'SELECT * FROM card_visitor WHERE card_id=? ORDER BY last_visit_at DESC LIMIT 50'
    ).all(card.id);

    res.json({ today: todayCount, week: weekCount, total, visitors: visitors.map(toVisitor) });
  });

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
      'UPDATE card_customer SET name=?, phone=?, wechat=?, company=?, tags=?, status=?, next_follow_at=?, updated_at=datetime("now") WHERE id=?'
    ).run(name || customer.name, phone ?? customer.phone, wechat ?? customer.wechat, company ?? customer.company, tags ? JSON.stringify(tags) : customer.tags, status || customer.status, nextFollowAt || null, customer.id);
    const updated = db.prepare('SELECT * FROM card_customer WHERE id=?').get(customer.id);
    res.json({ customer: toCustomer(updated) });
  });

  router.post('/customers/:id/follow', auth, (req, res) => {
    const { content, nextFollowAt } = req.body;
    if (!content) return res.status(400).json({ error: '跟进内容不能为空' });
    db.prepare('INSERT INTO card_customer_follow (customer_id, user_id, content, next_follow_at) VALUES (?,?,?,?)')
      .run(req.params.id, req.user.id, content, nextFollowAt || null);
    db.prepare('UPDATE card_customer SET last_follow_at=datetime("now"), next_follow_at=?, updated_at=datetime("now") WHERE id=?')
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
    const { content, images, visibility } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    const result = db.prepare('INSERT INTO card_dynamic (user_id, content, images, visibility) VALUES (?,?,?,?)')
      .run(req.user.id, content, JSON.stringify(images || []), visibility || 'public');
    const dynamic = db.prepare('SELECT * FROM card_dynamic WHERE id = ?').get(result.lastInsertRowid);
    res.json({ dynamic: toDynamic(dynamic) });
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
    return {
      id: row.id, userId: row.user_id, enterpriseId: row.enterprise_id, cardType: row.card_type,
      name: row.name, position: row.position, phone: row.phone, wechat: row.wechat, email: row.email,
      company: row.company, bio: row.bio, businessField: row.business_field, avatar: row.avatar,
      templateId: row.template_id, videoChannel: row.video_channel, isPublic: !!row.is_public,
      viewCount: row.view_count, exchangeCount: row.exchange_count, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at,
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

  function toDynamic(row) {
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, cardId: row.card_id, content: row.content,
      images: JSON.parse(row.images || '[]'), visibility: row.visibility,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function toVisitorAction(row) {
    if (!row) return null;
    return {
      id: row.id, cardId: row.card_id, visitorOpenid: row.visitor_openid,
      actionType: row.action_type, duration: row.duration, createdAt: row.created_at,
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

  return router;
}
