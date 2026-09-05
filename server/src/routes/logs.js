import express from 'express';
import { requireAuth } from '../auth.js';
import { queryOperationLogs } from '../db.js';

/**
 * 操作日志路由
 * GET /api/admin/logs?userId=&action=&targetType=&from=&to=&limit=&offset=
 */
export function createLogsRouter(db) {
  const router = express.Router();

  router.get('/admin/logs', requireAuth, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { logs, total } = queryOperationLogs(db, {
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      action: req.query.action || undefined,
      targetType: req.query.targetType || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit,
      offset,
    });
    res.json({ logs, total, limit, offset });
  });

  return router;
}
