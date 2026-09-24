/**
 * 运营型雷达核心服务（智能名片 · 评估修订后按阶段A实施）
 * - 事件驱动：/visitor/track 上报后按 actionType 匹配启用事件
 * - 意向分：权重 + 关键事件加成 + 频次 + 时长，归一化 0-100 持久化 card_radar_intent
 * - 高潜榜：按意向分降序（会员内，见路由 isMember 门槛）
 * - 话术：card_radar_words 时间区间匹配 + AI 兜底占位
 * - 客户池：复用 card_customer，source=radar、tags 追加 radar
 * - 推送：通道未接通时降级站内提醒（card_radar_notify），不阻塞上报链路
 * - 租户：cardId → card_profile.user_id → tenant_individuals / tenant_enterprise_employees 反查
 */

export function createRadarService(db) {
  const svc = {};

  /** cardId → 租户 customer_id（个人入驻 / 企业员工 / 无租户三态，返回 0） */
  svc.resolveTenant = (cardId) => {
    const card = db.prepare('SELECT user_id FROM card_profile WHERE id = ?').get(cardId);
    if (!card) return 0;
    const row = db.prepare(
      `SELECT COALESCE(
         (SELECT customer_id FROM tenant_individuals WHERE user_id = ? LIMIT 1),
         (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = ? LIMIT 1),
         0) AS tid`
    ).get(card.user_id, card.user_id);
    return row ? Number(row.tid) || 0 : 0;
  };

  /** 匹配启用的事件定义（按 actionType 对齐，tenant 维度，0 平台公共兜底） */
  svc.matchEvent = (tenantId, actionType) => {
    const row = db.prepare(
      'SELECT * FROM card_radar_event WHERE name = ? AND enabled = 1 AND (tenant_id = ? OR tenant_id = 0) ORDER BY tenant_id DESC LIMIT 1'
    ).get(actionType, tenantId || 0);
    return row || null;
  };

  /** 意向分：权重 × 20 + 关键事件加成 30 + 频次封顶 20 + 时长 >30s 加 10，归一化 0-100 */
  svc.computeIntent = (event, hitCount, durationSeconds) => {
    let s = (event.weight || 1) * 20;
    if (event.importance >= 2) s += 30;
    s += Math.min((hitCount || 1) * 5, 20);
    if (durationSeconds > 30) s += 10;
    return Math.max(0, Math.min(100, s));
  };

  /** 上报收口：累加命中并写意向分 */
  svc.onVisitorEvent = (tenantId, ownerUserId, visitor, event, detail = {}) => {
    const openid = visitor.openid || '';
    const userId = visitor.userId || 0;
    // 已注册访客按 user_id 关联；匿名访客只按 openid 精确匹配（visitor_user_id=0 是"未知"占位，不得参与 OR 匹配，避免串行）
    const prev = userId
      ? db.prepare(
          'SELECT * FROM card_radar_intent WHERE tenant_id = ? AND owner_user_id = ? AND (visitor_openid = ? OR visitor_user_id = ?)'
        ).get(tenantId, ownerUserId, openid, userId)
      : db.prepare(
          'SELECT * FROM card_radar_intent WHERE tenant_id = ? AND owner_user_id = ? AND visitor_openid = ?'
        ).get(tenantId, ownerUserId, openid);
    const hit = (prev ? prev.hit_count : 0) + 1;
    const score = svc.computeIntent(event, hit, detail.duration || 0);
    if (prev) {
      db.prepare("UPDATE card_radar_intent SET score = ?, hit_count = ?, last_calc_at = datetime('now') WHERE id = ?")
        .run(score, hit, prev.id);
    } else {
      db.prepare(
        'INSERT INTO card_radar_intent (tenant_id, owner_user_id, visitor_openid, visitor_user_id, score, hit_count) VALUES (?,?,?,?,?,?)'
      ).run(tenantId, ownerUserId, openid, userId, score, hit);
    }
    return { score, hit };
  };

  /** 高潜客户榜：意向分降序 */
  svc.topLeads = (tenantId, ownerUserId, limit = 20) => {
    return db.prepare(
      'SELECT * FROM card_radar_intent WHERE tenant_id = ? AND owner_user_id = ? ORDER BY score DESC, hit_count DESC LIMIT ?'
    ).all(tenantId, ownerUserId, limit);
  };

  /** 单个访客意向详情 */
  svc.intentOf = (tenantId, ownerUserId, openid) => {
    return db.prepare(
      'SELECT * FROM card_radar_intent WHERE tenant_id = ? AND owner_user_id = ? AND visitor_openid = ?'
    ).get(tenantId, ownerUserId, openid) || null;
  };

  /** 话术：先按事件 + 命中次数时间区间取静态词，无命中则 AI 兜底占位文案 */
  svc.pickWords = (tenantId, eventId, hitCount) => {
    const row = db.prepare(
      'SELECT words FROM card_radar_words WHERE tenant_id = ? AND event_id = ? AND time_start <= ? AND (time_end = 0 OR time_end >= ?) ORDER BY time_start DESC LIMIT 1'
    ).get(tenantId, eventId, hitCount, hitCount);
    if (row && row.words) return row.words;
    return '该访客近期多次查看名片，可主动联系确认合作意向。';
  };

  /** 入客户池：复用 card_customer，source=radar，tags 追加 radar；已存在仅打标 */
  svc.upsertClient = (tenantId, ownerUserId, visitor, source = 'radar') => {
    const phone = visitor.phone || '';
    const exist = phone
      ? db.prepare('SELECT * FROM card_customer WHERE owner_user_id = ? AND phone = ?').get(ownerUserId, phone)
      : null;
    if (exist) {
      const tags = JSON.parse(exist.tags || '[]');
      if (!tags.includes('radar')) tags.push('radar');
      db.prepare("UPDATE card_customer SET tags = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(tags), exist.id);
      return exist;
    }
    return db.prepare(
      'INSERT INTO card_customer (owner_user_id, name, phone, wechat, company, tags, source, status, next_follow_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(ownerUserId, visitor.name || '游客', phone, visitor.wechat || '', visitor.company || '',
      JSON.stringify(['radar']), source, 'pending', '');
  };

  /** 推送：读推送配置，通道未接通或开关关闭时降级站内提醒（card_radar_notify），不抛错不阻塞 */
  svc.sendNotify = (tenantId, ownerUserId, event, visitor) => {
    const cfg = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id = ?').get(tenantId);
    const channel = event.notice_type || 1;
    const payload = {
      openid: '',
      event: event.name,
      title: event.title,
      visitor: visitor.name || '匿名访客',
      time: new Date().toLocaleString('zh-CN'),
    };
    // 订阅/公众号通道未配置 → 站内提醒
    if (!cfg || cfg.switch !== 1 || channel === 0 ||
        (channel === 1 && !cfg.xcx_tmpid) || (channel === 2 && (!cfg.gzh_appid || !cfg.gzh_tmpid))) {
      db.prepare(
        'INSERT INTO card_radar_notify (tenant_id, owner_user_id, event_name, title, visitor_name, channel, payload, status) VALUES (?,?,?,?,?,?,?,?)'
      ).run(tenantId, ownerUserId, event.name, event.title, payload.visitor, 0, JSON.stringify(payload), 'pending');
      return { ok: true, channel: 0, degraded: true };
    }
    // 通道配置齐备时，仍先落站内提醒；实际下发由阶段 D 通道封装（wx/公众号）接管
    db.prepare(
      'INSERT INTO card_radar_notify (tenant_id, owner_user_id, event_name, title, visitor_name, channel, payload, status) VALUES (?,?,?,?,?,?,?,?)'
    ).run(tenantId, ownerUserId, event.name, event.title, payload.visitor, channel, JSON.stringify(payload), 'pending');
    return { ok: true, channel, payload };
  };

  /** 站内提醒列表（名片主） */
  svc.listNotifies = (tenantId, ownerUserId, limit = 50) => {
    return db.prepare(
      'SELECT * FROM card_radar_notify WHERE tenant_id = ? AND owner_user_id = ? ORDER BY id DESC LIMIT ?'
    ).all(tenantId, ownerUserId, limit);
  };

  /** 转发链记录：谁转发给了谁 */
  svc.trackShare = (tenantId, cardId, fromUserId, toOpenid, shareUrl) => {
    return db.prepare(
      'INSERT INTO card_radar_share (tenant_id, card_id, from_user_id, to_openid, share_url) VALUES (?,?,?,?,?)'
    ).run(tenantId, cardId, fromUserId, toOpenid || '', shareUrl || '');
  };

  /** 转发传播链列表 */
  svc.shares = (tenantId, cardId, limit = 50) => {
    return db.prepare(
      'SELECT * FROM card_radar_share WHERE tenant_id = ? AND card_id = ? ORDER BY id DESC LIMIT ?'
    ).all(tenantId, cardId, limit);
  };

  return svc;
}
