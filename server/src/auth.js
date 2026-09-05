import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function createAuthRouter() {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === config.adminUser && password === config.adminPass) {
      const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
      return res.json({ token });
    }
    return res.status(401).json({ error: '用户名或密码错误' });
  });

  return router;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}
