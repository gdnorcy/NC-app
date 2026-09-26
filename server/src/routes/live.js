// 小程序直播（租户后台）—— 1:1 复刻菜鸟云「微信直播」：直播列表 / 商品同步 / 商品审核
// 数据严格按 customer_id 隔离；应用授权由 hasSolution('live') 驱动（演示方案自动开通）
import { Router } from 'express';
import { tenantState, hasSolution, checkTenantAccess } from '../tenant.js';
import { addOperationLog } from '../db.js';
import { config } from '../config.js';
import { createWechatLiveService } from '../services/wechatLive.js';

const LIVE_STATUSES = ['直播中', '未开始', '已结束', '禁播', '暂停中', '异常', '已过期'];

export function createLiveRouter(db, deps = {}) {
  const router = Router();
  const wx = deps.wechatLive || createWechatLiveService(db);

  function requireTenant(req, res, next) {
    const user = req.user;
    if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
      return res.status(403).json({ error: '无权访问客户后台' });
    }
    if (!user.customerId) {
      return res.status(403).json({ error: '账号未关联客户项目' });
    }
    const state = tenantState(db, user.customerId, { ctx: 'admin' });
    if (state.missing) return res.status(404).json({ error: '客户项目不存在' });
    if (!state.active) {
      if (state.readonly && req.method === 'GET') {
        req.customerId = user.customerId;
        req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
    req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
    next();
  }

  function audit(req, action, targetType, targetId, detail) {
    try {
      addOperationLog(db, {
        userId: req.user?.uid ?? req.user?.id ?? null,
        username: req.user?.username ?? req.user?.phone ?? 'tenant-user',
        action, targetType, targetId,
        detail: `[租户#${req.customerId}] ${detail}`,
        ip: req.ip,
      });
    } catch { /* 日志失败不阻断主流程 */ }
  }

  // 小程序直播应用授权校验
  function requireLiveApp(req, res, next) {
    if (!hasSolution(db, req.customerId, 'live')) {
      return res.status(403).json({ error: '未开通「小程序直播」应用，请联系平台管理员开通' });
    }
    next();
  }

  function assertWritable(req, res) {
    if (req.tenantReadonly) {
      res.status(403).json({ error: '服务已到期，当前为只读模式' });
      return false;
    }
    return true;
  }

  const fen2yuan = (fen) => (fen ?? 0) / 100;

  // ---------- 直播列表 ----------
  router.get('/rooms', requireTenant, requireLiveApp, (req, res) => {
    const cid = req.customerId;
    const { keyword = '', status = '', startDate = '', endDate = '', page = 1, pageSize = 10 } = req.query;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const conds = ['customer_id = ?'];
    const args = [cid];
    if (keyword) {
      conds.push('(name LIKE ? OR anchor_name LIKE ?)');
      args.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
      conds.push('status = ?');
      args.push(status);
    }
    if (startDate) {
      conds.push('start_time >= ?');
      args.push(startDate);
    }
    if (endDate) {
      conds.push('end_time <= ?');
      args.push(endDate);
    }
    const where = conds.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM live_rooms WHERE ${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM live_rooms WHERE ${where} ORDER BY sort DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...args, ps, (p - 1) * ps);
    res.json({ rows, total, page: p, pageSize: ps });
  });

  // 创建直播间：调微信接口创建 → 回填本地库（字段 1:1 对齐菜鸟云「创建直播间」）
  router.post('/rooms', requireTenant, requireLiveApp, async (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const b = req.body || {};
    if (!b.name || String(b.name).trim().length < 3) return res.status(400).json({ error: '直播名称最短3个汉字' });
    if (!b.startTime || !b.endTime) return res.status(400).json({ error: '请填写开始时间和结束时间' });
    const start = new Date(b.startTime);
    const end = new Date(b.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return res.status(400).json({ error: '时间格式不正确' });
    if (end - start < 30 * 60 * 1000) return res.status(400).json({ error: '开播时间和结束时间间隔不得短于30分钟' });
    if (end - start > 24 * 60 * 60 * 1000) return res.status(400).json({ error: '开播时间和结束时间间隔不得超过24小时' });
    if (!b.anchorName) return res.status(400).json({ error: '请填写主播昵称' });
    if (!b.anchorWechat) return res.status(400).json({ error: '请填写主播微信' });

    try {
      // 调微信创建（失败时明确提示，不落库）
      const wxRes = await wx.createRoom(cid, {
        name: b.name.trim(),
        backgroundImg: b.backgroundImg || '',
        coverImg: b.coverImg || '',
        startTime: b.startTime,
        endTime: b.endTime,
        anchorName: b.anchorName.trim(),
        anchorWechat: b.anchorWechat.trim(),
        liveType: b.liveType || 'phone',
        likeEnabled: b.likeEnabled !== 0,
        shelfEnabled: b.shelfEnabled !== 0,
        commentEnabled: b.commentEnabled !== 0,
        replayEnabled: b.replayEnabled === 1,
        shareEnabled: b.shareEnabled !== 0,
        serviceEnabled: b.serviceEnabled === 1,
      });
      const roomId = wxRes.roomId;
      const pushAddr = wxRes.push_addr || wxRes.pushAddr || '';
      const pushCode = wxRes.push_code || wxRes.pushCode || '';
      const info = db.prepare(`INSERT INTO live_rooms
        (customer_id, room_id, name, anchor_name, anchor_wechat, background_img, cover_img, share_img,
         start_time, end_time, live_type, push_addr, push_code, like_enabled, shelf_enabled, comment_enabled, replay_enabled, share_enabled, service_enabled)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cid, roomId ?? null, b.name.trim(), b.anchorName.trim(), b.anchorWechat.trim(),
        b.backgroundImg || '', b.coverImg || '', b.shareImg || '',
        b.startTime, b.endTime, b.liveType || 'phone',
        pushAddr, pushCode,
        b.likeEnabled !== 0 ? 1 : 0, b.shelfEnabled !== 0 ? 1 : 0, b.commentEnabled !== 0 ? 1 : 0,
        b.replayEnabled === 1 ? 1 : 0, b.shareEnabled !== 0 ? 1 : 0, b.serviceEnabled === 1 ? 1 : 0,
      );
      audit(req, 'create_live_room', 'live_room', info.lastInsertRowid, `创建直播间: ${b.name.trim()}`);
      res.json({ ok: true, id: info.lastInsertRowid, roomId: roomId ?? null, pushAddr, pushCode });
    } catch (e) {
      res.status(502).json({ error: e.message || '创建直播间失败' });
    }
  });

  // 编辑直播间（本地维护展示信息；1:1 对齐菜鸟云「编辑」表单）
  router.put('/rooms/:id', requireTenant, requireLiveApp, (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM live_rooms WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '直播间不存在' });
    const b = req.body || {};
    db.prepare(`UPDATE live_rooms SET
        name=?, room_id=?, anchor_name=?, thumbnail=?, background_img=?, share_img=?, cover_img=?,
        start_time=?, end_time=?, list_display=?, recommend=?, live_type=?, sort=?,
        replay_enabled=?, share_enabled=?, service_enabled=?, updated_at=datetime('now')
      WHERE id=? AND customer_id=?`).run(
      b.name ?? row.name, b.roomId ?? row.room_id, b.anchorName ?? row.anchor_name,
      b.thumbnail ?? row.thumbnail, b.backgroundImg ?? row.background_img,
      b.shareImg ?? row.share_img, b.coverImg ?? row.cover_img,
      b.startTime ?? row.start_time, b.endTime ?? row.end_time,
      b.listDisplay !== undefined ? (b.listDisplay ? 1 : 0) : row.list_display,
      b.recommend !== undefined ? (b.recommend ? 1 : 0) : row.recommend,
      b.liveType ?? row.live_type,
      b.sort !== undefined ? Number(b.sort) || 0 : row.sort,
      b.replayEnabled !== undefined ? (b.replayEnabled ? 1 : 0) : row.replay_enabled,
      b.shareEnabled !== undefined ? (b.shareEnabled ? 1 : 0) : row.share_enabled,
      b.serviceEnabled !== undefined ? (b.serviceEnabled ? 1 : 0) : row.service_enabled,
      id, cid,
    );
    audit(req, 'update_live_room', 'live_room', id, `编辑直播间: ${b.name ?? row.name}`);
    res.json({ ok: true });
  });

  // 删除直播间（同步删除微信侧房间 + 本地记录）
  router.delete('/rooms/:id', requireTenant, requireLiveApp, (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM live_rooms WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '直播间不存在' });
    try {
      if (row.room_id) {
        wx.deleteRoom(cid, row.room_id).catch(() => {});
      }
    } catch { /* 微信删除失败不阻断本地删除 */ }
    db.prepare('DELETE FROM live_rooms WHERE id = ? AND customer_id = ?').run(id, cid);
    audit(req, 'delete_live_room', 'live_room', id, `删除直播间: ${row.name}`);
    res.json({ ok: true });
  });

  // 同步直播列表：调微信接口拉取直播间 → 覆盖式写入本地（room_id 相同则更新，不同则新增）
  router.post('/rooms/sync', requireTenant, requireLiveApp, async (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    try {
      const rooms = await wx.fetchRooms(cid, { start: 0, limit: 100 });
      const ins = db.prepare(`INSERT INTO live_rooms (customer_id, room_id, name, anchor_name, start_time, end_time, status, source)
        VALUES (?,?,?,?,?,?,?,?)`);
      const upd = db.prepare(`UPDATE live_rooms SET name=?, anchor_name=?, start_time=?, end_time=?, status=?, updated_at=datetime('now') WHERE customer_id=? AND room_id=?`);
      let added = 0, updated = 0;
      for (const r of rooms) {
        const roomId = r.roomid;
        const start = r.start_time ? new Date(r.start_time * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';
        const end = r.end_time ? new Date(r.end_time * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';
        const exists = db.prepare('SELECT id FROM live_rooms WHERE customer_id = ? AND room_id = ?').get(cid, roomId);
        if (exists) {
          upd.run(r.name || '', r.anchor_name || '', start, end, r.live_status || '未开始', cid, roomId);
          updated++;
        } else {
          ins.run(cid, roomId, r.name || '', r.anchor_name || '', start, end, r.live_status || '未开始', '小程序直播');
          added++;
        }
      }
      audit(req, 'sync_live_rooms', 'live_room', null, `同步直播列表: 新增${added} 更新${updated}`);
      res.json({ ok: true, added, updated });
    } catch (e) {
      res.status(502).json({ error: e.message || '同步直播列表失败' });
    }
  });

  // 复制直播间链接（C 端落地页）
  router.get('/rooms/:id/link', requireTenant, requireLiveApp, (req, res) => {
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT room_id FROM live_rooms WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '直播间不存在' });
    const origin = req.headers.origin || `http://localhost:${config.port || 3000}`;
    res.json({ link: `${origin}/card/#/pages/cardMain/live?roomId=${row.room_id}` });
  });

  // ---------- 商品同步（直播商品库 = 审核通过商品） ----------
  router.get('/goods', requireTenant, requireLiveApp, (req, res) => {
    const cid = req.customerId;
    const { keyword = '', page = 1, pageSize = 10 } = req.query;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const conds = ['customer_id = ?'];
    const args = [cid];
    if (keyword) {
      conds.push('name LIKE ?');
      args.push(`%${keyword}%`);
    }
    const where = conds.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM live_goods WHERE ${where}`).get(...args).c;
    const rows = db.prepare(`SELECT * FROM live_goods WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...args, ps, (p - 1) * ps)
      .map(r => ({ ...r, priceYuan: fen2yuan(r.price) }));
    res.json({ rows, total, page: p, pageSize: ps });
  });

  // 同步商品列表：调微信拉取已审核商品 → 写入商品库（room 商品同样来自微信侧，覆盖）
  router.post('/goods/sync', requireTenant, requireLiveApp, async (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    try {
      const goods = await wx.fetchApprovedGoods(cid, { offset: 0, count: 100 });
      const ins = db.prepare(`INSERT OR IGNORE INTO live_goods (customer_id, goods_id, name, price, page_path, thumb, audit_status) VALUES (?,?,?,?,?,?, 'approved')`);
      let added = 0;
      for (const g of goods) {
        ins.run(cid, g.goodsId ?? 0, g.name || '', Math.round((g.price || 0) * 100), g.page_path || '', g.thumbnail || g.coverUrl || '');
        added++;
      }
      audit(req, 'sync_live_goods', 'live_goods', null, `同步商品列表: ${added}`);
      res.json({ ok: true, added });
    } catch (e) {
      res.status(502).json({ error: e.message || '同步商品列表失败' });
    }
  });

  // 更新商品（对齐菜鸟云：审核通过的商品仅允许更新价格；此处按 name/price/page_path 更新）
  router.put('/goods/:id', requireTenant, requireLiveApp, (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM live_goods WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '商品不存在' });
    const b = req.body || {};
    db.prepare(`UPDATE live_goods SET name=?, price=?, page_path=?, updated_at=datetime('now') WHERE id=? AND customer_id=?`)
      .run(b.name ?? row.name, b.price !== undefined ? Math.round(Number(b.price) * 100) : row.price, b.pagePath ?? row.page_path, id, cid);
    audit(req, 'update_live_goods', 'live_goods', id, `更新直播商品: ${b.name ?? row.name}`);
    res.json({ ok: true });
  });

  // 删除商品（删除后直播间上架商品同步删除，不可恢复）
  router.delete('/goods/:id', requireTenant, requireLiveApp, (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM live_goods WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '商品不存在' });
    db.prepare('DELETE FROM live_goods WHERE id = ? AND customer_id = ?').run(id, cid);
    audit(req, 'delete_live_goods', 'live_goods', id, `删除直播商品: ${row.name}`);
    res.json({ ok: true });
  });

  // ---------- 商品审核（本地商品 → 提交审核 → 商品库） ----------
  // 本地待审核商品：我方 goods 表中未进入 live_goods（或审核失败）的商品
  router.get('/goods/source', requireTenant, requireLiveApp, (req, res) => {
    const cid = req.customerId;
    const { keyword = '', page = 1, pageSize = 10 } = req.query;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(50, Math.max(1, Number(pageSize) || 10));
    // 我方商品表列名探测（goods.name / goods.price）
    const hasGoods = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goods'").get();
    if (!hasGoods) return res.json({ rows: [], total: 0, page: p, pageSize: ps });
    const conds = ['g.status != ?'];
    const args = ['deleted'];
    if (keyword) {
      conds.push('g.name LIKE ?');
      args.push(`%${keyword}%`);
    }
    // 关联审核状态
    const where = conds.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) c FROM goods g LEFT JOIN live_goods lg ON lg.customer_id = ? AND lg.goods_id = g.id WHERE ${where}`).get(cid, ...args).c;
    const rows = db.prepare(`SELECT g.id AS goods_id, g.title AS name, g.price, g.images, COALESCE(lg.audit_status,'pending') AS audit_status, lg.id AS live_id
      FROM goods g LEFT JOIN live_goods lg ON lg.customer_id = ? AND lg.goods_id = g.id
      WHERE ${where} ORDER BY g.id DESC LIMIT ? OFFSET ?`).all(cid, ...args, ps, (p - 1) * ps)
      .map(r => {
        let thumb = '';
        try { const arr = JSON.parse(r.images || '[]'); thumb = Array.isArray(arr) && arr.length ? arr[0] : ''; } catch {}
        return { ...r, thumb, priceYuan: Number(r.price), pagePath: `pagesGoods/showProMore/showProMore?id=${r.goods_id}` };
      });
    res.json({ rows, total, page: p, pageSize: ps });
  });

  // 提交审核：本地商品 → live_goods（pending）→ 调微信提交 → 更新审核状态
  router.post('/goods/:id/audit', requireTenant, requireLiveApp, async (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const gid = Number(req.params.id);
    const goods = db.prepare('SELECT * FROM goods WHERE id = ?').get(gid);
    if (!goods) return res.status(404).json({ error: '商品不存在' });
    // 已审核通过/待审核中不允许重复提交
    const exist = db.prepare('SELECT * FROM live_goods WHERE customer_id = ? AND goods_id = ?').get(cid, gid);
    if (exist && exist.audit_status === 'approved') return res.status(400).json({ error: '该商品已审核通过，无需重复提交' });
    if (exist && exist.audit_status === 'pending') return res.status(400).json({ error: '该商品正在审核中' });
    // 组装微信审核商品信息（goods.price 为元 → 分）
    let thumb = '';
    try { const arr = JSON.parse(goods.images || '[]'); thumb = Array.isArray(arr) && arr.length ? arr[0] : ''; } catch {}
    const wxInfo = {
      goodsId: gid,
      name: goods.title,
      price: Math.round(Number(goods.price) * 100),
      url: `pagesGoods/showProMore/showProMore?id=${gid}`,
      coverImgUrl: thumb,
    };
    let auditId = '';
    try {
      const data = await wx.submitGoodsAudit(cid, [wxInfo]);
      auditId = data && (data.auditId || (data.data && data.data.audit_id)) || '';
    } catch (e) {
      return res.status(502).json({ error: e.message || '提交微信审核失败' });
    }
    const insId = exist
      ? db.prepare(`UPDATE live_goods SET name=?, price=?, page_path=?, thumb=?, audit_id=?, audit_status='pending', updated_at=datetime('now') WHERE id=?`).run(goods.title, wxInfo.price, wxInfo.url, thumb, auditId, exist.id).lastInsertRowid
      : db.prepare(`INSERT INTO live_goods (customer_id, goods_id, name, price, page_path, thumb, audit_id, audit_status) VALUES (?,?,?,?,?,?,?, 'pending')`).run(cid, gid, goods.title, wxInfo.price, wxInfo.url, thumb, auditId).lastInsertRowid;
    audit(req, 'submit_live_goods_audit', 'live_goods', insId, `提交直播商品审核: ${goods.title}`);
    res.json({ ok: true, id: insId });
  });

  // 同步审核状态：待审核商品调微信查询 → 更新（审核通过进入商品库展示）
  router.post('/goods/audit-status', requireTenant, requireLiveApp, async (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    try {
      const pendings = db.prepare("SELECT * FROM live_goods WHERE customer_id = ? AND audit_status = 'pending'").all(cid);
      const auditIds = pendings.map(g => g.audit_id).filter(Boolean);
      if (!auditIds.length) return res.json({ ok: true, updated: 0 });
      const data = await wx.fetchGoodsAuditStatus(cid, auditIds);
      let updated = 0;
      const map = data.statuses || data.goods || [];
      for (const st of map) {
        const auditId = st.audit_id;
        if (!auditId) continue;
        const g = pendings.find(x => x.audit_id === auditId);
        if (!g) continue;
        const status = st.status === 2 ? 'approved' : (st.status === 3 ? 'failed' : 'pending');
        if (status !== 'pending') {
          db.prepare("UPDATE live_goods SET audit_status=?, updated_at=datetime('now') WHERE id=?").run(status, g.id);
          updated++;
        }
      }
      audit(req, 'sync_live_goods_audit', 'live_goods', null, `同步审核状态: ${updated}`);
      res.json({ ok: true, updated });
    } catch (e) {
      res.status(502).json({ error: e.message || '同步审核状态失败' });
    }
  });

  // 重新提交审核（审核失败的商品）
  router.post('/goods/:id/reaudit', requireTenant, requireLiveApp, async (req, res) => {
    if (!assertWritable(req, res)) return;
    const cid = req.customerId;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM live_goods WHERE id = ? AND customer_id = ?').get(id, cid);
    if (!row) return res.status(404).json({ error: '商品不存在' });
    try {
      const data = await wx.submitGoodsAudit(cid, [{
        goodsId: row.goods_id,
        name: row.name,
        price: row.price,
        url: row.page_path,
        coverImgUrl: row.thumb,
      }]);
      const auditId = data && (data.auditId || (data.data && data.data.audit_id)) || '';
      db.prepare("UPDATE live_goods SET audit_id=?, audit_status='pending', updated_at=datetime('now') WHERE id=? AND customer_id=?").run(auditId, id, cid);
    } catch (e) {
      return res.status(502).json({ error: e.message || '重新提交微信审核失败' });
    }
    audit(req, 'reauth_live_goods', 'live_goods', id, `重新提交直播商品审核: ${row.name}`);
    res.json({ ok: true });
  });

  return router;
}

// ============================================================
// 小程序直播 C 端公开路由（/api/card/live）：装修页 live-list / channel-live 数据源
// 租户校验：checkTenantAccess(tid) + live 应用开通校验；只返回列表展示字段
// ============================================================
export function createLivePublicRouter(db) {
  const router = Router();

  function resolveTenant(req, res) {
    const tid = Number(req.query.tid || req.body?.tid);
    const access = checkTenantAccess(db, tid, 'live', 'mini');
    if (access) {
      res.status(access.status).json({ error: access.error });
      return null;
    }
    return tid;
  }

  /** 直播间列表（C 端）：list_display=1 的直播间，按推荐 + sort 排序；已结束/禁播/已过期不展示 */
  router.get('/rooms', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    const { page = 1, pageSize = 20 } = req.query;
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const HIDE_STATUS = ['已结束', '禁播', '已过期'];
    const rows = db.prepare(
      `SELECT * FROM live_rooms WHERE customer_id = ? AND list_display = 1 ORDER BY recommend DESC, sort DESC, id DESC LIMIT ? OFFSET ?`
    ).all(cid, ps, (p - 1) * ps);
    const list = rows
      .filter((r) => !HIDE_STATUS.includes(r.status))
      .map((r) => ({
        id: r.id,
        roomId: r.room_id || null,
        title: r.name,
        anchor: r.anchor_name,
        cover: r.cover_img || r.thumbnail || '',
        shareImg: r.share_img || '',
        startTime: r.start_time,
        endTime: r.end_time,
        status: r.status,
        recommend: r.recommend,
        liveType: r.live_type,
        viewer: r.view_count,
        likeEnabled: r.like_enabled,
        replayEnabled: r.replay_enabled,
      }));
    const total = db.prepare(`SELECT COUNT(*) c FROM live_rooms WHERE customer_id = ? AND list_display = 1`).get(cid).c;
    res.json({ list, total, page: p, pageSize: ps });
  });

  return router;
}
