/**
 * 智能名片运营型雷达后台管理（阶段B）
 * 路径：/api/admin/radar（requireAuth 外层保护）
 * 平台级管理：雷达事件 / 话术库 / 推送模板配置 / 收藏管理
 * 仿 appsAdmin 工厂模式；事件与话术以 tenant_id=0（平台公共）为主，租户级覆盖在 C 端配置
 */
import { Router } from 'express';
import { addOperationLog } from '../db.js';

export function createRadarAdminRouter(db) {
  const router = Router();

  // 事件列表（平台公共 tenant_id=0；可按 enabled/关键字过滤）
  router.get('/events', (req, res) => {
    const rows = db.prepare(
      `SELECT * FROM card_radar_event WHERE tenant_id=0
       ORDER BY sort_order ASC, id ASC`
    ).all();
    res.json({ events: rows });
  });

  // 新建事件
  router.post('/events', (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ error: '事件标识不能为空' });
      const title = String(b.title || name).trim().slice(0, 32);
      const dup = db.prepare('SELECT id FROM card_radar_event WHERE tenant_id=0 AND name=?').get(name);
      if (dup) return res.status(400).json({ error: '事件标识已存在' });
      const r = db.prepare(
        `INSERT INTO card_radar_event (tenant_id, name, title, icon, sort_order, enabled, is_show_ai, notice_type, importance, weight)
         VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(name, title, String(b.icon || '').slice(0, 32), Number(b.sortOrder) || 0,
        b.enabled === false ? 0 : 1, b.isShowAi === false ? 0 : 1,
        Number(b.noticeType) || 1, Number(b.importance) || 1, Number(b.weight) || 1);
      addOperationLog(db, { userId: req.user?.id, username: req.user?.username, action: 'create_radar_event', targetType: 'radar_event', targetId: r.lastInsertRowid, detail: `创建雷达事件: ${title}`, ip: req.ip });
      res.status(201).json({ event: db.prepare('SELECT * FROM card_radar_event WHERE id=?').get(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 更新事件（title/icon/排序/开关/是否计入AI/推送方式/重要级/权重）
  router.put('/events/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const ev = db.prepare('SELECT * FROM card_radar_event WHERE id=? AND tenant_id=0').get(id);
      if (!ev) return res.status(404).json({ error: '事件不存在' });
      const b = req.body || {};
      db.prepare(
        `UPDATE card_radar_event SET title=?, icon=?, sort_order=?, enabled=?, is_show_ai=?, notice_type=?, importance=?, weight=?, updated_at=datetime('now') WHERE id=?`
      ).run(
        b.title !== undefined ? String(b.title).trim().slice(0, 32) : ev.title,
        b.icon !== undefined ? String(b.icon).slice(0, 32) : ev.icon,
        b.sortOrder !== undefined ? Number(b.sortOrder) || 0 : ev.sort_order,
        b.enabled !== undefined ? (b.enabled ? 1 : 0) : ev.enabled,
        b.isShowAi !== undefined ? (b.isShowAi ? 1 : 0) : ev.is_show_ai,
        b.noticeType !== undefined ? Number(b.noticeType) || 0 : ev.notice_type,
        b.importance !== undefined ? Number(b.importance) || 1 : ev.importance,
        b.weight !== undefined ? Number(b.weight) || 1 : ev.weight,
        id,
      );
      addOperationLog(db, { userId: req.user?.id, username: req.user?.username, action: 'update_radar_event', targetType: 'radar_event', targetId: id, detail: `更新雷达事件: ${ev.title}`, ip: req.ip });
      res.json({ event: db.prepare('SELECT * FROM card_radar_event WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除事件（连同其平台级话术一并清理）
  router.delete('/events/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const ev = db.prepare('SELECT * FROM card_radar_event WHERE id=? AND tenant_id=0').get(id);
      if (!ev) return res.status(404).json({ error: '事件不存在' });
      db.prepare('DELETE FROM card_radar_words WHERE tenant_id=0 AND event_id=?').run(id);
      db.prepare('DELETE FROM card_radar_event WHERE id=?').run(id);
      addOperationLog(db, { userId: req.user?.id, username: req.user?.username, action: 'delete_radar_event', targetType: 'radar_event', targetId: id, detail: `删除雷达事件: ${ev.title}`, ip: req.ip });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 话术列表（按事件分组，仅平台级 tenant_id=0）
  router.get('/words', (req, res) => {
    const events = db.prepare('SELECT * FROM card_radar_event WHERE tenant_id=0 ORDER BY sort_order ASC, id ASC').all();
    const groups = events.map((ev) => ({
      eventId: ev.id, name: ev.name, title: ev.title, icon: ev.icon, importance: ev.importance, weight: ev.weight, enabled: ev.enabled,
      words: db.prepare('SELECT id, time_start, time_end, words FROM card_radar_words WHERE tenant_id=0 AND event_id=? ORDER BY time_start ASC, id ASC').all(ev.id),
    }));
    res.json({ groups });
  });

  // 新增话术
  router.post('/words', (req, res) => {
    try {
      const b = req.body || {};
      const eventId = Number(b.eventId);
      const ev = db.prepare('SELECT * FROM card_radar_event WHERE id=? AND tenant_id=0').get(eventId);
      if (!ev) return res.status(404).json({ error: '事件不存在' });
      const words = String(b.words || '').trim();
      if (!words) return res.status(400).json({ error: '话术内容不能为空' });
      const r = db.prepare(
        'INSERT INTO card_radar_words (tenant_id, event_id, time_start, time_end, words) VALUES (0, ?, ?, ?, ?)'
      ).run(eventId, Number(b.timeStart) || 0, Number(b.timeEnd) || 0, words.slice(0, 500));
      res.status(201).json({ word: db.prepare('SELECT * FROM card_radar_words WHERE id=?').get(r.lastInsertRowid) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑话术
  router.put('/words/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const w = db.prepare('SELECT * FROM card_radar_words WHERE id=? AND tenant_id=0').get(id);
      if (!w) return res.status(404).json({ error: '话术不存在' });
      const b = req.body || {};
      const words = b.words !== undefined ? String(b.words).trim().slice(0, 500) : w.words;
      if (!words) return res.status(400).json({ error: '话术内容不能为空' });
      db.prepare('UPDATE card_radar_words SET time_start=?, time_end=?, words=? WHERE id=?').run(
        b.timeStart !== undefined ? Number(b.timeStart) || 0 : w.time_start,
        b.timeEnd !== undefined ? Number(b.timeEnd) || 0 : w.time_end,
        words, id,
      );
      res.json({ word: db.prepare('SELECT * FROM card_radar_words WHERE id=?').get(id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除话术
  router.delete('/words/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const w = db.prepare('SELECT id FROM card_radar_words WHERE id=? AND tenant_id=0').get(id);
      if (!w) return res.status(404).json({ error: '话术不存在' });
      db.prepare('DELETE FROM card_radar_words WHERE id=?').run(id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 推送模板配置（平台级 tenant_id=0 全局默认；租户 C 端可按需覆盖）
  router.get('/push-config', (_req, res) => {
    const cfg = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id=0').get();
    res.json({ config: cfg ? {
      switch: cfg.switch, xcxTmpid: cfg.xcx_tmpid, gzhAppid: cfg.gzh_appid, gzhTmpid: cfg.gzh_tmpid,
    } : { switch: 0, xcxTmpid: '', gzhAppid: '', gzhTmpid: '' } });
  });

  // 保存推送模板配置（平台级 upsert）
  router.post('/push-config', (req, res) => {
    try {
      const b = req.body || {};
      const exists = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id=0').get();
      if (exists) {
        db.prepare(`UPDATE card_radar_push_config SET switch=?, xcx_tmpid=?, gzh_appid=?, gzh_tmpid=?, updated_at=datetime('now') WHERE tenant_id=0`)
          .run(b.switch !== undefined ? (b.switch ? 1 : 0) : exists.switch,
            b.xcxTmpid !== undefined ? String(b.xcxTmpid).slice(0, 128) : exists.xcx_tmpid,
            b.gzhAppid !== undefined ? String(b.gzhAppid).slice(0, 128) : exists.gzh_appid,
            b.gzhTmpid !== undefined ? String(b.gzhTmpid).slice(0, 128) : exists.gzh_tmpid);
      } else {
        db.prepare('INSERT INTO card_radar_push_config (tenant_id, switch, xcx_tmpid, gzh_appid, gzh_tmpid) VALUES (0,?,?,?,?)')
          .run(b.switch ? 1 : 0, String(b.xcxTmpid || '').slice(0, 128), String(b.gzhAppid || '').slice(0, 128), String(b.gzhTmpid || '').slice(0, 128));
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 收藏管理：全平台收藏列表（分页 + 名片/用户信息）
  router.get('/collects', (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const total = db.prepare('SELECT COUNT(*) c FROM card_collect').get().c;
    const rows = db.prepare(
      `SELECT c.*, cp.name AS card_name, cp.user_id AS owner_user_id, u.nickname AS collector_name
       FROM card_collect c
       LEFT JOIN card_profile cp ON cp.id = c.card_id
       LEFT JOIN platform_user u ON u.id = c.user_id
       ORDER BY c.id DESC LIMIT ? OFFSET ?`
    ).all(pageSize, (page - 1) * pageSize);
    res.json({ collects: rows, total, page, pageSize });
  });

  // 删除收藏记录
  router.delete('/collects/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT id FROM card_collect WHERE id=?').get(id);
      if (!row) return res.status(404).json({ error: '收藏记录不存在' });
      db.prepare('DELETE FROM card_collect WHERE id=?').run(id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
