import express from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { getAllSettings, setSettingsBatch, addOperationLog } from '../db.js';

/**
 * 通用设置路由
 * GET  /api/admin/settings          -> 全部设置（key-value）
 * PUT  /api/admin/settings          -> 批量更新（body: { key: value, ... }）
 * GET  /api/settings/public         -> 公开设置（站点名称、版权等，前台用）
 */

// 公开可暴露的设置 key 前缀
const PUBLIC_PREFIXES = ['site.', 'copyright.'];

export function createSettingsRouter(db) {
  const router = express.Router();

  // 公开：前台需要的设置
  router.get('/settings/public', (_req, res) => {
    const all = getAllSettings(db);
    const pub = {};
    for (const [k, v] of Object.entries(all)) {
      if (PUBLIC_PREFIXES.some((p) => k.startsWith(p))) pub[k] = v;
    }
    res.json({ settings: pub });
  });

  // 管理：全部设置
  router.get('/admin/settings', requireAuth, (_req, res) => {
    res.json({ settings: getAllSettings(db) });
  });

  // 管理：批量更新
  router.put('/admin/settings', requireAuth, requireRole('admin'), (req, res) => {
    const pairs = Object.entries(req.body || {});
    if (!pairs.length) return res.status(400).json({ error: '没有要更新的设置' });
    // 安全：禁止更新某些 key
    const blocked = ['security.masterKey'];
    const filtered = pairs.filter(([k]) => !blocked.includes(k));
    setSettingsBatch(db, filtered);
    addOperationLog(db, {
      userId: req.user?.uid,
      username: req.user?.username,
      action: 'update_settings',
      targetType: 'settings',
      detail: `更新 ${filtered.length} 项设置: ${filtered.map(([k]) => k).join(', ')}`,
      ip: req.ip,
    });
    res.json({ ok: true, settings: getAllSettings(db) });
  });

  return router;
}
