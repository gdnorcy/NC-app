// 内容体系（租户后台 + C 端公开）—— 1:1 复刻菜鸟云「东莞同城通」内容：文章/组图/视频/评论/基础设置
// 管理端：/api/customer/content/*（requireTenant，数据按 customer_id 隔离）
// C 端公开：/api/card/content/*（checkTenantAccess + tid 租户参数）
import { Router } from 'express';
import { tenantState, hasSolution, checkTenantAccess } from '../tenant.js';
import { addOperationLog } from '../db.js';

function parseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export function createContentRouter(db) {
  const router = Router();

  // ---------- 管理端中间件 ----------
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
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
    req.enterpriseId = user.enterpriseId || user.enterprise_id || null;
    next();
  }

  function assertWritable(req, res) {
    if (req.tenantReadonly) {
      res.status(403).json({ error: '服务已到期，当前为只读模式' });
      return false;
    }
    return true;
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

  // ================= 文章分类 =================
  router.get('/article-cates', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const list = db.prepare('SELECT * FROM content_article_cate WHERE customer_id = ? ORDER BY sort_order DESC, id ASC').all(cid);
      const level1 = list.filter((c) => c.pid === 0);
      const level2 = list.filter((c) => c.pid !== 0);
      const tree = level1.map((c) => ({ ...c, children: level2.filter((s) => s.pid === c.id) }));
      res.json({ list, tree, total: list.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/article-cates', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body || {};
      if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: '分类名称不能为空' });
      const r = db.prepare(`INSERT INTO content_article_cate
        (customer_id, pid, name, image, intro, sort_order, status, page_size, img_ratio, plate_style,
         share_title, share_img, member_view, pc_enable, ad_header, ad_footer)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cid, Number(b.pid) || 0, String(b.name).trim(), b.image || '', b.intro || '',
        Number(b.sortOrder) ?? 0, b.status === undefined ? 1 : Number(b.status),
        Number(b.pageSize) || 10, b.imgRatio || '1:1', b.plateStyle || 'one_big',
        b.shareTitle || '', b.shareImg || '',
        b.memberView ? 1 : 0, b.pcEnable === undefined ? 1 : (b.pcEnable ? 1 : 0),
        b.adHeader || '', b.adFooter || ''
      );
      audit(req, 'content_article_cate_add', 'content_article_cate', r.lastInsertRowid, `新增文章分类 ${b.name}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/article-cates/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const cat = db.prepare('SELECT * FROM content_article_cate WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      const b = req.body || {};
      db.prepare(`UPDATE content_article_cate SET
        pid = ?, name = ?, image = ?, intro = ?, sort_order = ?, status = ?, page_size = ?,
        img_ratio = ?, plate_style = ?, share_title = ?, share_img = ?, member_view = ?,
        pc_enable = ?, ad_header = ?, ad_footer = ?, updated_at = datetime('now') WHERE id = ?`).run(
        Number(b.pid) ?? cat.pid, b.name !== undefined ? String(b.name).trim() : cat.name,
        b.image !== undefined ? b.image : cat.image, b.intro !== undefined ? b.intro : cat.intro,
        b.sortOrder !== undefined ? Number(b.sortOrder) : cat.sort_order,
        b.status !== undefined ? Number(b.status) : cat.status,
        b.pageSize !== undefined ? Number(b.pageSize) : cat.page_size,
        b.imgRatio !== undefined ? b.imgRatio : cat.img_ratio,
        b.plateStyle !== undefined ? b.plateStyle : cat.plate_style,
        b.shareTitle !== undefined ? b.shareTitle : cat.share_title,
        b.shareImg !== undefined ? b.shareImg : cat.share_img,
        b.memberView !== undefined ? (b.memberView ? 1 : 0) : cat.member_view,
        b.pcEnable !== undefined ? (b.pcEnable ? 1 : 0) : cat.pc_enable,
        b.adHeader !== undefined ? b.adHeader : cat.ad_header,
        b.adFooter !== undefined ? b.adFooter : cat.ad_footer,
        cat.id
      );
      audit(req, 'content_article_cate_edit', 'content_article_cate', cat.id, `编辑文章分类 ${cat.name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/article-cates/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const cat = db.prepare('SELECT * FROM content_article_cate WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      // 有文章挂在该分类下时禁止删除（含二级）
      const used = db.prepare("SELECT COUNT(*) AS n FROM content_article WHERE customer_id = ? AND cate_ids LIKE ?").get(cid, `%${cat.id}%`)?.n || 0;
      const child = db.prepare('SELECT COUNT(*) AS n FROM content_article_cate WHERE customer_id = ? AND pid = ?').get(cid, cat.id)?.n || 0;
      if (used > 0 || child > 0) return res.status(400).json({ error: used > 0 ? '该分类下存在文章，无法删除' : '该分类下存在子分类，请先删除子分类' });
      db.prepare('DELETE FROM content_article_cate WHERE id = ?').run(cat.id);
      audit(req, 'content_article_cate_delete', 'content_article_cate', cat.id, `删除文章分类 ${cat.name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 文章 =================
  // 推广二维码（微信/H5 共用；链接 /pagesReads/showArt/showArt?id=）
  // 注意：必须定义在 GET /articles/:id 之前，避免被 :id 参数路由抢占
  router.get('/articles/qr', requireTenant, async (req, res) => {
    try {
      const { id } = req.query;
      const a = db.prepare('SELECT id, title FROM content_article WHERE id = ? AND customer_id = ?').get(Number(id) || 0, req.customerId);
      if (!a) return res.status(404).json({ error: '文章不存在' });
      let QRCode;
      try { ({ default: QRCode } = await import('qrcode')); } catch { /* qrcode 库缺失时降级 */ }
      if (!QRCode) return res.status(200).json({ qr: '' });
      const link = `${req.protocol}://${req.get('host')}/card/#/pagesReads/showArt/showArt?id=${a.id}`;
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
      res.json({ qr, link });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/articles', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const { status, cateId, keyword, from, to, sort } = req.query;
      const where = ['customer_id = ?'];
      const params = [cid];
      if (status !== undefined && status !== '') { where.push('status = ?'); params.push(Number(status)); }
      if (keyword) { where.push('title LIKE ?'); params.push(`%${keyword}%`); }
      if (cateId && Number(cateId) > 0) { where.push('cate_ids LIKE ?'); params.push(`%${cateId}%`); }
      if (from) { where.push('update_at >= ?'); params.push(from); }
      if (to) { where.push('update_at <= ?'); params.push(to); }
      const order = sort === 'sort' ? 'sort_order DESC, id DESC' : 'update_at DESC, id DESC';
      const rows = db.prepare(`SELECT * FROM content_article WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...params);
      // 主分类名
      const cats = db.prepare('SELECT id, name FROM content_article_cate WHERE customer_id = ?').all(cid);
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      const list = rows.map((a) => {
        const ids = parseJson(a.cate_ids, []);
        return { ...a, cateNames: ids.map((i) => catMap[i]).filter(Boolean), mainCateName: catMap[ids[0]] || '' };
      });
      res.json({ list, total: list.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/articles/:id', requireTenant, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM content_article WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!a) return res.status(404).json({ error: '文章不存在' });
      const cats = db.prepare('SELECT id, name FROM content_article_cate WHERE customer_id = ?').all(req.customerId);
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      const ids = parseJson(a.cate_ids, []);
      res.json({ ...a, cateNames: ids.map((i) => catMap[i]).filter(Boolean), cateOptions: cats.map((c) => ({ id: c.id, name: c.name })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/articles', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: '文章标题不能为空' });
      const cateIds = Array.isArray(b.cateIds) ? b.cateIds : [];
      const r = db.prepare(`INSERT INTO content_article
        (customer_id, status, sort_order, cate_ids, title, thumb, carousel, update_at, views, intro, detail,
         title_show, time_show, poster_bg, share_title, share_img_mode, share_img, visit_show, like_show, collect_show,
         relate_title, relate_ids, show_content, videos, audio_title, audio_url, audio_mode, audio_play_mode, audio_play_form,
         dist_rule, commission_type, commission_levels, recommend, jump_url, comment_mode, share_mode, share_style, points, points_limit,
         pay_amount, super_form, form_show, files, file_show)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cid, b.status === undefined ? 1 : Number(b.status), Number(b.sortOrder) || 0,
        JSON.stringify(cateIds), String(b.title).trim(), b.thumb || '', JSON.stringify(b.carousel || []),
        b.updateAt || '', Number(b.views) || 0, b.intro || '', b.detail || '',
        b.titleShow === undefined ? 1 : Number(b.titleShow), b.timeShow === undefined ? 1 : Number(b.timeShow),
        b.posterBg || '', b.shareTitle || '', b.shareImgMode || 'thumb', b.shareImg || '',
        b.visitShow === undefined ? 1 : Number(b.visitShow), b.likeShow === undefined ? 1 : Number(b.likeShow),
        b.collectShow === undefined ? 1 : Number(b.collectShow),
        b.relateTitle || '推荐阅读', JSON.stringify(b.relateIds || []), b.showContent || 'goods',
        JSON.stringify(b.videos || []), b.audioTitle || '', b.audioUrl || '', b.audioMode || 'normal',
        b.audioPlayMode || 'click', b.audioPlayForm || 'once',
        b.distRule || 'close', b.commissionType || 'percent', JSON.stringify(Array.isArray(b.commissionLevels) ? b.commissionLevels : []),
        b.recommend ? 1 : 0, b.jumpUrl || '', b.commentMode || 'default',
        b.shareMode || 'default', b.shareStyle || 'popup', Number(b.points) || 0, Number(b.pointsLimit) || 0,
        Number(b.payAmount) || 0, b.superForm || '', b.formShow || 'pay', JSON.stringify(b.files || []), b.fileShow || 'pay'
      );
      audit(req, 'content_article_add', 'content_article', r.lastInsertRowid, `新增文章 ${b.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/articles/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const a = db.prepare('SELECT * FROM content_article WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!a) return res.status(404).json({ error: '文章不存在' });
      const b = req.body || {};
      const set = [];
      const vals = [];
      const cols = [
        ['status', 'status'], ['sort_order', 'sortOrder'], ['cate_ids', 'cateIds'], ['title', 'title'],
        ['thumb', 'thumb'], ['carousel', 'carousel'], ['update_at', 'updateAt'], ['views', 'views'],
        ['intro', 'intro'], ['detail', 'detail'], ['title_show', 'titleShow'], ['time_show', 'timeShow'],
        ['poster_bg', 'posterBg'], ['share_title', 'shareTitle'], ['share_img_mode', 'shareImgMode'],
        ['share_img', 'shareImg'], ['visit_show', 'visitShow'], ['like_show', 'likeShow'], ['collect_show', 'collectShow'],
        ['relate_title', 'relateTitle'], ['relate_ids', 'relateIds'], ['show_content', 'showContent'],
        ['videos', 'videos'], ['audio_title', 'audioTitle'], ['audio_url', 'audioUrl'], ['audio_mode', 'audioMode'],
        ['audio_play_mode', 'audioPlayMode'], ['audio_play_form', 'audioPlayForm'], ['dist_rule', 'distRule'],
        ['commission_type', 'commissionType'], ['commission_levels', 'commissionLevels'],
        ['recommend', 'recommend'], ['jump_url', 'jumpUrl'], ['comment_mode', 'commentMode'],
        ['share_mode', 'shareMode'], ['share_style', 'shareStyle'], ['points', 'points'], ['points_limit', 'pointsLimit'],
        ['pay_amount', 'payAmount'], ['super_form', 'superForm'], ['form_show', 'formShow'], ['files', 'files'],
        ['file_show', 'fileShow'],
      ];
      for (const [col, key] of cols) {
        if (b[key] === undefined) continue;
        if (col === 'cate_ids' || col === 'carousel' || col === 'relate_ids' || col === 'videos' || col === 'files' || col === 'commission_levels') {
          set.push(`${col} = ?`); vals.push(JSON.stringify(Array.isArray(b[key]) ? b[key] : []));
        } else {
          set.push(`${col} = ?`); vals.push(b[key]);
        }
      }
      set.push("updated_at = datetime('now')");
      db.prepare(`UPDATE content_article SET ${set.join(', ')} WHERE id = ?`).run(...vals, a.id);
      audit(req, 'content_article_edit', 'content_article', a.id, `编辑文章 ${a.title}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/articles/:id/duplicate', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const a = db.prepare('SELECT * FROM content_article WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!a) return res.status(404).json({ error: '文章不存在' });
      const r = db.prepare(`INSERT INTO content_article (customer_id, status, sort_order, cate_ids, title, thumb, carousel,
        update_at, views, intro, detail, title_show, time_show, poster_bg, share_title, share_img_mode, share_img,
        visit_show, like_show, collect_show, relate_title, relate_ids, show_content, videos, audio_title, audio_url,
        audio_mode, audio_play_mode, audio_play_form, dist_rule, commission_type, commission_levels, recommend, jump_url,
        comment_mode, share_mode, share_style, points, points_limit, pay_amount, super_form, form_show, files, file_show)
        SELECT customer_id, status, sort_order, cate_ids, title, thumb, carousel, update_at, views, intro, detail,
        title_show, time_show, poster_bg, share_title, share_img_mode, share_img, visit_show, like_show, collect_show,
        relate_title, relate_ids, show_content, videos, audio_title, audio_url, audio_mode, audio_play_mode, audio_play_form,
        dist_rule, commission_type, commission_levels, recommend, jump_url, comment_mode, share_mode, share_style,
        points, points_limit, pay_amount, super_form, form_show, files, file_show FROM content_article WHERE id = ?`).run(a.id);
      audit(req, 'content_article_copy', 'content_article', r.lastInsertRowid, `复制文章 ${a.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/articles/batch', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const { ids = [], action } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择文章' });
      if (action === 'delete') {
        const ph = ids.map(() => '?').join(',');
        db.prepare(`DELETE FROM content_article WHERE customer_id = ? AND id IN (${ph})`).run(cid, ...ids);
      } else if (action === 'onsale' || action === 'offsale') {
        const st = action === 'onsale' ? 1 : 0;
        const ph = ids.map(() => '?').join(',');
        db.prepare(`UPDATE content_article SET status = ?, updated_at = datetime('now') WHERE customer_id = ? AND id IN (${ph})`).run(st, cid, ...ids);
      } else {
        return res.status(400).json({ error: '未知批量操作' });
      }
      audit(req, `content_article_batch_${action}`, 'content_article', 0, `批量${action} ${ids.length} 篇文章`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/articles/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const a = db.prepare('SELECT * FROM content_article WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!a) return res.status(404).json({ error: '文章不存在' });
      db.prepare('DELETE FROM content_article WHERE id = ?').run(a.id);
      audit(req, 'content_article_delete', 'content_article', a.id, `删除文章 ${a.title}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 文章评论（文章/视频/音频） =================
  router.get('/comments', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const { type, keyword } = req.query;
      const where = ['customer_id = ?'];
      const params = [cid];
      if (type) { where.push('content_type = ?'); params.push(type); }
      if (keyword) { where.push('content LIKE ? OR title LIKE ?'); params.push(`%${keyword}%`, `%${keyword}%`); }
      const rows = db.prepare(`SELECT * FROM content_comment WHERE ${where.join(' AND ')} ORDER BY id DESC`).all(...params);
      res.json({ list: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/comments/:id/audit', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const c = db.prepare('SELECT * FROM content_comment WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!c) return res.status(404).json({ error: '评论不存在' });
      db.prepare('UPDATE content_comment SET is_audit = ? WHERE id = ?').run(req.body?.isAudit ? 1 : 0, c.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/comments/batch-delete', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const { ids = [] } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择评论' });
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM content_comment WHERE customer_id = ? AND id IN (${ph})`).run(req.customerId, ...ids);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/comments/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      db.prepare('DELETE FROM content_comment WHERE id = ? AND customer_id = ?').run(Number(req.params.id), req.customerId);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 组图分类 =================
  router.get('/pic-cates', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const list = db.prepare('SELECT * FROM content_pic_cate WHERE customer_id = ? ORDER BY sort_order DESC, id ASC').all(cid);
      const level1 = list.filter((c) => c.pid === 0);
      const level2 = list.filter((c) => c.pid !== 0);
      const tree = level1.map((c) => ({ ...c, children: level2.filter((s) => s.pid === c.id) }));
      res.json({ list, tree, total: list.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/pic-cates', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body || {};
      if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: '分类名称不能为空' });
      const r = db.prepare(`INSERT INTO content_pic_cate (customer_id, pid, name, image, intro, sort_order, status,
        page_size, plate_style, share_title, share_img, member_view, pc_enable) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cid, Number(b.pid) || 0, String(b.name).trim(), b.image || '', b.intro || '',
        Number(b.sortOrder) || 0, b.status === undefined ? 1 : Number(b.status),
        Number(b.pageSize) || 10, b.plateStyle || 'style1', b.shareTitle || '', b.shareImg || '',
        b.memberView ? 1 : 0, b.pcEnable === undefined ? 1 : (b.pcEnable ? 1 : 0)
      );
      audit(req, 'content_pic_cate_add', 'content_pic_cate', r.lastInsertRowid, `新增组图分类 ${b.name}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/pic-cates/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const cat = db.prepare('SELECT * FROM content_pic_cate WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      const b = req.body || {};
      db.prepare(`UPDATE content_pic_cate SET pid = ?, name = ?, image = ?, intro = ?, sort_order = ?, status = ?,
        page_size = ?, plate_style = ?, share_title = ?, share_img = ?, member_view = ?, pc_enable = ?,
        updated_at = datetime('now') WHERE id = ?`).run(
        Number(b.pid) ?? cat.pid, b.name !== undefined ? String(b.name).trim() : cat.name,
        b.image !== undefined ? b.image : cat.image, b.intro !== undefined ? b.intro : cat.intro,
        b.sortOrder !== undefined ? Number(b.sortOrder) : cat.sort_order,
        b.status !== undefined ? Number(b.status) : cat.status,
        b.pageSize !== undefined ? Number(b.pageSize) : cat.page_size,
        b.plateStyle !== undefined ? b.plateStyle : cat.plate_style,
        b.shareTitle !== undefined ? b.shareTitle : cat.share_title,
        b.shareImg !== undefined ? b.shareImg : cat.share_img,
        b.memberView !== undefined ? (b.memberView ? 1 : 0) : cat.member_view,
        b.pcEnable !== undefined ? (b.pcEnable ? 1 : 0) : cat.pc_enable,
        cat.id
      );
      audit(req, 'content_pic_cate_edit', 'content_pic_cate', cat.id, `编辑组图分类 ${cat.name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/pic-cates/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const cat = db.prepare('SELECT * FROM content_pic_cate WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!cat) return res.status(404).json({ error: '分类不存在' });
      const used = db.prepare('SELECT COUNT(*) AS n FROM content_pic WHERE customer_id = ? AND cate_id = ?').get(cid, cat.id)?.n || 0;
      const child = db.prepare('SELECT COUNT(*) AS n FROM content_pic_cate WHERE customer_id = ? AND pid = ?').get(cid, cat.id)?.n || 0;
      if (used > 0 || child > 0) return res.status(400).json({ error: used > 0 ? '该分类下存在组图，无法删除' : '该分类下存在子分类，请先删除子分类' });
      db.prepare('DELETE FROM content_pic_cate WHERE id = ?').run(cat.id);
      audit(req, 'content_pic_cate_delete', 'content_pic_cate', cat.id, `删除组图分类 ${cat.name}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 组图 =================
  router.get('/pics', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const { status, cateId, keyword } = req.query;
      const where = ['customer_id = ?'];
      const params = [cid];
      if (status !== undefined && status !== '') { where.push('status = ?'); params.push(Number(status)); }
      if (cateId && Number(cateId) > 0) { where.push('cate_id = ?'); params.push(Number(cateId)); }
      if (keyword) { where.push('title LIKE ?'); params.push(`%${keyword}%`); }
      const rows = db.prepare(`SELECT * FROM content_pic WHERE ${where.join(' AND ')} ORDER BY sort_order DESC, id DESC`).all(...params);
      const cats = db.prepare('SELECT id, name FROM content_pic_cate WHERE customer_id = ?').all(cid);
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      res.json({ list: rows.map((p) => ({ ...p, cateName: catMap[p.cate_id] || '' })), total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/pics/:id', requireTenant, (req, res) => {
    try {
      const p = db.prepare('SELECT * FROM content_pic WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!p) return res.status(404).json({ error: '组图不存在' });
      const cats = db.prepare('SELECT id, name FROM content_pic_cate WHERE customer_id = ?').all(req.customerId);
      res.json({ ...p, cateOptions: cats.map((c) => ({ id: c.id, name: c.name })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/pics', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: '标题不能为空' });
      if (!b.cateId) return res.status(400).json({ error: '请选择所属分类' });
      const r = db.prepare(`INSERT INTO content_pic (customer_id, cate_id, title, views, show_style, thumb, images,
        sort_order, status, recommend, bg_mode, share_points, points, points_limit, share_title, share_img)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cid, Number(b.cateId), String(b.title).trim(), Number(b.views) || 0, b.showStyle || 'single',
        b.thumb || '', JSON.stringify(b.images || []), Number(b.sortOrder) || 0,
        b.status === undefined ? 1 : Number(b.status), b.recommend ? 1 : 0, b.bgMode ? 1 : 0,
        b.sharePoints ? 1 : 0, Number(b.points) || 0, Number(b.pointsLimit) || 0,
        b.shareTitle || '', b.shareImg || ''
      );
      audit(req, 'content_pic_add', 'content_pic', r.lastInsertRowid, `新增组图 ${b.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/pics/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const p = db.prepare('SELECT * FROM content_pic WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!p) return res.status(404).json({ error: '组图不存在' });
      const b = req.body || {};
      db.prepare(`UPDATE content_pic SET cate_id = ?, title = ?, views = ?, show_style = ?, thumb = ?, images = ?,
        sort_order = ?, status = ?, recommend = ?, bg_mode = ?, share_points = ?, points = ?, points_limit = ?,
        share_title = ?, share_img = ?, updated_at = datetime('now') WHERE id = ?`).run(
        Number(b.cateId) ?? p.cate_id, b.title !== undefined ? String(b.title).trim() : p.title,
        b.views !== undefined ? Number(b.views) : p.views, b.showStyle || p.show_style,
        b.thumb !== undefined ? b.thumb : p.thumb, JSON.stringify(b.images !== undefined ? b.images : parseJson(p.images, [])),
        b.sortOrder !== undefined ? Number(b.sortOrder) : p.sort_order,
        b.status !== undefined ? Number(b.status) : p.status, b.recommend !== undefined ? (b.recommend ? 1 : 0) : p.recommend,
        b.bgMode !== undefined ? (b.bgMode ? 1 : 0) : p.bg_mode,
        b.sharePoints !== undefined ? (b.sharePoints ? 1 : 0) : p.share_points,
        b.points !== undefined ? Number(b.points) : p.points, b.pointsLimit !== undefined ? Number(b.pointsLimit) : p.points_limit,
        b.shareTitle !== undefined ? b.shareTitle : p.share_title,
        b.shareImg !== undefined ? b.shareImg : p.share_img,
        p.id
      );
      audit(req, 'content_pic_edit', 'content_pic', p.id, `编辑组图 ${p.title}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/pics/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const p = db.prepare('SELECT * FROM content_pic WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!p) return res.status(404).json({ error: '组图不存在' });
      db.prepare('DELETE FROM content_pic WHERE id = ?').run(p.id);
      audit(req, 'content_pic_delete', 'content_pic', p.id, `删除组图 ${p.title}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 视频 =================
  router.get('/videos', requireTenant, (req, res) => {
    try {
      const cid = req.customerId;
      const { beOnline, keyword } = req.query;
      const where = ['customer_id = ?'];
      const params = [cid];
      if (beOnline !== undefined && beOnline !== '') { where.push('be_online = ?'); params.push(Number(beOnline)); }
      if (keyword) { where.push('title LIKE ?'); params.push(`%${keyword}%`); }
      const rows = db.prepare(`SELECT * FROM content_video WHERE ${where.join(' AND ')} ORDER BY sort_order DESC, id DESC`).all(...params);
      res.json({ list: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/videos/:id', requireTenant, (req, res) => {
    try {
      const v = db.prepare('SELECT * FROM content_video WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!v) return res.status(404).json({ error: '视频不存在' });
      res.json(v);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/videos', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: '视频标题不能为空' });
      const r = db.prepare(`INSERT INTO content_video (customer_id, status, be_online, sort_order, title, cover, intro,
        video_url, recommend, views, likes, forwards, share_title, share_img) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cid, b.status === undefined ? 1 : Number(b.status), b.beOnline === undefined ? 1 : Number(b.beOnline),
        Number(b.sortOrder) || 0, String(b.title).trim(), b.cover || '', b.intro || '',
        b.videoUrl || '', b.recommend ? 1 : 0, Number(b.views) || 0, Number(b.likes) || 0,
        Number(b.forwards) || 0, b.shareTitle || '', b.shareImg || ''
      );
      audit(req, 'content_video_add', 'content_video', r.lastInsertRowid, `新增视频 ${b.title}`);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/videos/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const v = db.prepare('SELECT * FROM content_video WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!v) return res.status(404).json({ error: '视频不存在' });
      const b = req.body || {};
      db.prepare(`UPDATE content_video SET status = ?, be_online = ?, sort_order = ?, title = ?, cover = ?, intro = ?,
        video_url = ?, recommend = ?, views = ?, likes = ?, forwards = ?, share_title = ?, share_img = ?,
        updated_at = datetime('now') WHERE id = ?`).run(
        b.status !== undefined ? Number(b.status) : v.status,
        b.beOnline !== undefined ? Number(b.beOnline) : v.be_online,
        b.sortOrder !== undefined ? Number(b.sortOrder) : v.sort_order,
        b.title !== undefined ? String(b.title).trim() : v.title,
        b.cover !== undefined ? b.cover : v.cover, b.intro !== undefined ? b.intro : v.intro,
        b.videoUrl !== undefined ? b.videoUrl : v.video_url,
        b.recommend !== undefined ? (b.recommend ? 1 : 0) : v.recommend,
        b.views !== undefined ? Number(b.views) : v.views, b.likes !== undefined ? Number(b.likes) : v.likes,
        b.forwards !== undefined ? Number(b.forwards) : v.forwards,
        b.shareTitle !== undefined ? b.shareTitle : v.share_title,
        b.shareImg !== undefined ? b.shareImg : v.share_img,
        v.id
      );
      audit(req, 'content_video_edit', 'content_video', v.id, `编辑视频 ${v.title}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/videos/batch-offline', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const { ids = [] } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择视频' });
      const ph = ids.map(() => '?').join(',');
      db.prepare(`UPDATE content_video SET be_online = 0, updated_at = datetime('now') WHERE customer_id = ? AND id IN (${ph})`).run(req.customerId, ...ids);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/videos/:id', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const v = db.prepare('SELECT * FROM content_video WHERE id = ? AND customer_id = ?').get(Number(req.params.id), req.customerId);
      if (!v) return res.status(404).json({ error: '视频不存在' });
      db.prepare('DELETE FROM content_video WHERE id = ?').run(v.id);
      audit(req, 'content_video_delete', 'content_video', v.id, `删除视频 ${v.title}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= 基础设置 =================
  router.get('/settings', requireTenant, (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM content_setting WHERE customer_id = ?').get(req.customerId)
        || { customer_id: req.customerId, article_share_title: '', article_share_img: '', pic_share_title: '', pic_share_img: '',
             ai_enable: 0, ai_api_url: '', ai_api_key: '', ai_model: '', collect_enable: 0, collect_api_key: '' };
      res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/settings', requireTenant, (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const b = req.body || {};
      db.prepare(`INSERT INTO content_setting (customer_id, article_share_title, article_share_img, pic_share_title,
        pic_share_img, ai_enable, ai_api_url, ai_api_key, ai_model, collect_enable, collect_api_key, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
        ON CONFLICT(customer_id) DO UPDATE SET article_share_title = excluded.article_share_title,
        article_share_img = excluded.article_share_img, pic_share_title = excluded.pic_share_title,
        pic_share_img = excluded.pic_share_img, ai_enable = excluded.ai_enable, ai_api_url = excluded.ai_api_url,
        ai_api_key = excluded.ai_api_key, ai_model = excluded.ai_model, collect_enable = excluded.collect_enable,
        collect_api_key = excluded.collect_api_key, updated_at = datetime('now')`).run(
        cid, b.articleShareTitle || '', b.articleShareImg || '', b.picShareTitle || '', b.picShareImg || '',
        b.aiEnable ? 1 : 0, b.aiApiUrl || '', b.aiApiKey || '', b.aiModel || '',
        b.collectEnable ? 1 : 0, b.collectApiKey || ''
      );
      audit(req, 'content_setting_edit', 'content_setting', 0, '更新内容基础设置');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ================= AI 生成文章（需配置大模型接口；未配置时返回明确提示） =================
  router.post('/articles/ai-generate', requireTenant, async (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const setting = db.prepare('SELECT * FROM content_setting WHERE customer_id = ?').get(cid);
      if (!setting || !setting.ai_enable || !setting.ai_api_url || !setting.ai_api_key) {
        return res.status(400).json({ error: '未配置 AI 生成文章能力，请在「基础设置」中配置大模型接口（接口地址/API Key/模型）并开启开关' });
      }
      const { topic, count = 1 } = req.body || {};
      if (!topic || !String(topic).trim()) return res.status(400).json({ error: '请输入文章主题' });
      // 兼容 OpenAI / DeepSeek / 通义等 chat/completions 协议
      const payload = {
        model: setting.ai_model || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一位企业内容运营编辑。请根据主题生成文章，严格输出 JSON 数组，每项包含 title(标题)、intro(简介≤50字)、detail(正文HTML，使用<p>段落，300字左右)。' },
          { role: 'user', content: `主题：${topic}，生成 ${count} 篇` },
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let r;
      try {
        r = await fetch(setting.ai_api_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setting.ai_api_key}` },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(timer); }
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        return res.status(502).json({ error: `AI 接口调用失败（${r.status}）：${errText.slice(0, 200)}` });
      }
      const data = await r.json();
      const raw = data?.choices?.[0]?.message?.content || '';
      let list = [];
      try {
        const parsed = JSON.parse(raw);
        list = Array.isArray(parsed) ? parsed : (parsed.articles || parsed.list || []);
      } catch {
        // 非 JSON 时尝试提取正文第一段作为简介
        list = [{ title: String(topic).trim(), intro: raw.slice(0, 60), detail: raw.replace(/\n/g, '<p>').replace(/(<p>)+/g, '<p>') }];
      }
      res.json({ list: list.slice(0, Math.min(count || 1, 5)) });
    } catch (e) {
      if (e.name === 'AbortError') return res.status(504).json({ error: 'AI 接口请求超时，请检查接口地址或稍后重试' });
      res.status(500).json({ error: e.message });
    }
  });

  // ================= 文章采集（需配置采集 API Key；返回采集条目供选择入库） =================
  router.post('/articles/collect', requireTenant, async (req, res) => {
    try {
      if (!assertWritable(req, res)) return;
      const cid = req.customerId;
      const setting = db.prepare('SELECT * FROM content_setting WHERE customer_id = ?').get(cid);
      if (!setting || !setting.collect_enable || !setting.collect_api_key) {
        return res.status(400).json({ error: '未配置文章采集能力，请在「基础设置」中配置采集 API Key 并开启开关' });
      }
      const { url, title } = req.body || {};
      if (!url) return res.status(400).json({ error: '请输入要采集的文章链接' });
      // 采集接口：POST 采集服务，body {url, apiKey}；返回 {title, intro, detail, thumb}
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let r;
      try {
        r = await fetch('https://collect.zeroclass.cn/api/collect-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: String(url).trim(), apiKey: setting.collect_api_key }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(timer); }
      if (!r.ok) return res.status(502).json({ error: `采集服务调用失败（${r.status}）` });
      const data = await r.json();
      res.json({
        title: data?.title || title || '采集文章',
        intro: data?.intro || '',
        detail: data?.detail || '',
        thumb: data?.thumb || '',
      });
    } catch (e) {
      if (e.name === 'AbortError') return res.status(504).json({ error: '采集请求超时，请稍后重试' });
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

// ================= C 端公开读取（/api/card/content，tid 租户） =================
export function createContentPublicRouter(db) {
  const router = Router();

  function resolveTenant(req, res) {
    const tid = Number(req.query.tid || req.body?.tid);
    const access = checkTenantAccess(db, tid, null, 'mini');
    if (access) {
      res.status(access.status).json({ error: access.error });
      return null;
    }
    return tid;
  }

  // 文章分类（含数量）
  router.get('/article-cates', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const cats = db.prepare('SELECT * FROM content_article_cate WHERE customer_id = ? AND status = 1 ORDER BY sort_order DESC, id ASC').all(cid);
      const countBy = {};
      for (const a of db.prepare('SELECT cate_ids FROM content_article WHERE customer_id = ? AND status = 1').all(cid)) {
        for (const id of parseJson(a.cate_ids, [])) countBy[id] = (countBy[id] || 0) + 1;
      }
      const level1 = cats.filter((c) => c.pid === 0).map((c) => ({ ...c, count: countBy[c.id] || 0 }));
      const level2 = cats.filter((c) => c.pid !== 0);
      const tree = level1.map((c) => ({ ...c, children: level2.filter((s) => s.pid === c.id).map((s) => ({ ...s, count: countBy[s.id] || 0 })) }));
      res.json({ list: level1, tree, total: level1.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 文章列表（分类/推荐/搜索）
  router.get('/articles', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const { cateId, recommend, keyword, page = 1, pageSize = 10 } = req.query;
      const where = ['customer_id = ?', 'status = 1'];
      const params = [cid];
      if (cateId && Number(cateId) > 0) { where.push('cate_ids LIKE ?'); params.push(`%${cateId}%`); }
      if (recommend) { where.push('recommend = 1'); }
      if (keyword) { where.push('title LIKE ?'); params.push(`%${keyword}%`); }
      const total = db.prepare(`SELECT COUNT(*) AS n FROM content_article WHERE ${where.join(' AND ')}`).get(...params)?.n || 0;
      const rows = db.prepare(`SELECT id, title, thumb, intro, views, likes, collects, recommend, update_at, created_at,
        cate_ids, poster_bg, visit_show FROM content_article WHERE ${where.join(' AND ')} ORDER BY sort_order DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, Number(pageSize) || 10, (Number(page) - 1) * (Number(pageSize) || 10));
      const cats = db.prepare('SELECT id, name FROM content_article_cate WHERE customer_id = ?').all(cid);
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      const list = rows.map((a) => {
        const ids = parseJson(a.cate_ids, []);
        return { ...a, mainCateName: catMap[ids[0]] || '' };
      });
      res.json({ list, total, page: Number(page) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 文章详情（浏览量 +1；含关联文章/推荐商品/评论）
  router.get('/articles/:id', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const a = db.prepare('SELECT * FROM content_article WHERE id = ? AND customer_id = ? AND status = 1').get(Number(req.params.id), cid);
      if (!a) return res.status(404).json({ error: '文章不存在或已下架' });
      db.prepare('UPDATE content_article SET views = views + 1 WHERE id = ?').run(a.id);
      const ids = parseJson(a.relate_ids, []);
      const relate = ids.length
        ? db.prepare(`SELECT id, title, thumb FROM content_article WHERE customer_id = ? AND status = 1 AND id IN (${ids.map(() => '?').join(',')})`).all(cid, ...ids)
        : [];
      // 推荐商品（展示内容=推荐商品：读取商品体系 recommend 商品）
      let recommendGoods = [];
      if (a.show_content === 'goods') {
        try {
          recommendGoods = db.prepare(`SELECT id, title, thumb, price, market_price, real_sales, fake_sales FROM goods
            WHERE customer_id = ? AND status = 'sell' AND recommend = 1 ORDER BY sort_order DESC, id DESC LIMIT 6`).all(cid);
        } catch { /* 商品表不存在时忽略 */ }
      }
      const cats = db.prepare('SELECT id, name FROM content_article_cate WHERE customer_id = ?').all(cid);
      const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      const cateIds = parseJson(a.cate_ids, []);
      const comments = db.prepare('SELECT id, content, created_at FROM content_comment WHERE customer_id = ? AND content_id = ? AND content_type = ? AND is_audit = 1 ORDER BY id DESC LIMIT 50').all(cid, a.id, 'article');
      const setting = db.prepare('SELECT article_share_title, article_share_img FROM content_setting WHERE customer_id = ?').get(cid);
      res.json({
        ...a,
        mainCateName: catMap[cateIds[0]] || '',
        cateNames: cateIds.map((i) => catMap[i]).filter(Boolean),
        relate, recommendGoods, comments,
        defaultShareTitle: setting?.article_share_title || '',
        defaultShareImg: setting?.article_share_img || '',
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 文章点赞/收藏（幂等切换）
  router.post('/articles/:id/action', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const a = db.prepare('SELECT id FROM content_article WHERE id = ? AND customer_id = ?').get(Number(req.params.id), cid);
      if (!a) return res.status(404).json({ error: '文章不存在' });
      const { type } = req.body || {};
      if (type === 'like') db.prepare('UPDATE content_article SET likes = likes + 1 WHERE id = ?').run(a.id);
      if (type === 'collect') db.prepare('UPDATE content_article SET collects = collects + 1 WHERE id = ?').run(a.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 评论列表（文章/视频，公开）
  router.get('/comments', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const { articleId, contentId, contentType = 'article', page = 1, pageSize = 20 } = req.query;
      const cid2 = Number(contentId || articleId || 0);
      if (!cid2) return res.json({ list: [], total: 0, page: 1 });
      const total = db.prepare('SELECT COUNT(*) AS n FROM content_comment WHERE customer_id = ? AND content_id = ? AND content_type = ? AND is_audit = 1').get(cid, cid2, contentType)?.n || 0;
      const rows = db.prepare(`SELECT id, content, nickname, created_at FROM content_comment
        WHERE customer_id = ? AND content_id = ? AND content_type = ? AND is_audit = 1
        ORDER BY id DESC LIMIT ? OFFSET ?`).all(cid, cid2, contentType, Number(pageSize) || 20, (Number(page) - 1) * (Number(pageSize) || 20));
      res.json({ list: rows, total, page: Number(page) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 提交评论（文章/视频/音频；兼容 articleId 字段）
  router.post('/comments', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const { contentId, articleId, content = '', contentType = 'article', nickname = '' } = req.body || {};
      const cid2 = Number(contentId || articleId || 0);
      if (!cid2 || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
      if (content.trim().length > 500) return res.status(400).json({ error: '评论内容不能超过500字' });
      let title = '';
      const tbl = contentType === 'video' ? 'content_video' : 'content_article';
      const row = db.prepare(`SELECT id, title FROM ${tbl} WHERE id = ? AND customer_id = ?`).get(cid2, cid);
      if (row) title = row.title;
      db.prepare('INSERT INTO content_comment (customer_id, content_id, content_type, title, content, nickname, is_audit) VALUES (?,?,?,?,?,?,1)')
        .run(cid, cid2, contentType, title, String(content).trim(), String(nickname || '').slice(0, 20));
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 组图分类
  router.get('/pic-cates', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const cats = db.prepare('SELECT * FROM content_pic_cate WHERE customer_id = ? AND status = 1 ORDER BY sort_order DESC, id ASC').all(cid);
      const countBy = {};
      for (const p of db.prepare('SELECT cate_id FROM content_pic WHERE customer_id = ? AND status = 1').all(cid)) {
        countBy[p.cate_id] = (countBy[p.cate_id] || 0) + 1;
      }
      const level1 = cats.filter((c) => c.pid === 0).map((c) => ({ ...c, count: countBy[c.id] || 0 }));
      const level2 = cats.filter((c) => c.pid !== 0);
      const tree = level1.map((c) => ({ ...c, children: level2.filter((s) => s.pid === c.id).map((s) => ({ ...s, count: countBy[s.id] || 0 })) }));
      res.json({ list: level1, tree, total: level1.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 组图列表
  router.get('/pics', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const { cateId, page = 1, pageSize = 10 } = req.query;
      const where = ['customer_id = ?', 'status = 1'];
      const params = [cid];
      if (cateId && Number(cateId) > 0) { where.push('cate_id = ?'); params.push(Number(cateId)); }
      const total = db.prepare(`SELECT COUNT(*) AS n FROM content_pic WHERE ${where.join(' AND ')}`).get(...params)?.n || 0;
      const rows = db.prepare(`SELECT id, cate_id, title, views, show_style, thumb, images, recommend, created_at FROM content_pic
        WHERE ${where.join(' AND ')} ORDER BY sort_order DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, Number(pageSize) || 10, (Number(page) - 1) * (Number(pageSize) || 10));
      res.json({ list: rows, total, page: Number(page) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 组图详情（浏览量 +1）
  router.get('/pics/:id', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const p = db.prepare('SELECT * FROM content_pic WHERE id = ? AND customer_id = ? AND status = 1').get(Number(req.params.id), cid);
      if (!p) return res.status(404).json({ error: '组图不存在或已下架' });
      db.prepare('UPDATE content_pic SET views = views + 1 WHERE id = ?').run(p.id);
      const setting = db.prepare('SELECT pic_share_title, pic_share_img FROM content_setting WHERE customer_id = ?').get(cid);
      res.json({ ...p, defaultShareTitle: setting?.pic_share_title || '', defaultShareImg: setting?.pic_share_img || '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 视频列表
  router.get('/videos', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const { page = 1, pageSize = 10 } = req.query;
      const total = db.prepare('SELECT COUNT(*) AS n FROM content_video WHERE customer_id = ? AND be_online = 1').get(cid)?.n || 0;
      const rows = db.prepare(`SELECT id, title, cover, intro, views, likes, forwards, recommend, created_at FROM content_video
        WHERE customer_id = ? AND be_online = 1 ORDER BY sort_order DESC, id DESC LIMIT ? OFFSET ?`)
        .all(cid, Number(pageSize) || 10, (Number(page) - 1) * (Number(pageSize) || 10));
      res.json({ list: rows, total, page: Number(page) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 视频详情（浏览量 +1；视频地址仅返回 mp4/直链）
  router.get('/videos/:id', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const v = db.prepare('SELECT * FROM content_video WHERE id = ? AND customer_id = ? AND be_online = 1').get(Number(req.params.id), cid);
      if (!v) return res.status(404).json({ error: '视频不存在或已下线' });
      db.prepare('UPDATE content_video SET views = views + 1 WHERE id = ?').run(v.id);
      res.json(v);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 内容基础设置（C 端分享默认值）
  router.get('/settings', (req, res) => {
    const cid = resolveTenant(req, res);
    if (!cid) return;
    try {
      const row = db.prepare('SELECT article_share_title, article_share_img, pic_share_title, pic_share_img FROM content_setting WHERE customer_id = ?').get(cid)
        || { article_share_title: '', article_share_img: '', pic_share_title: '', pic_share_img: '' };
      res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
