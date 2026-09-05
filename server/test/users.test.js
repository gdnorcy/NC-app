import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';

function setupEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-users-'));
  const uploadsDir = path.join(tmp, 'uploads');
  const dbPath = path.join(tmp, 'test.db');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const prev = { ...config };
  Object.assign(config, {
    dataDir: tmp,
    uploadsDir,
    dbPath,
    webDistDir: path.join(tmp, 'web-dist'),
    adminUser: 'admin',
    adminPass: 'admin123',
  });
  return { tmp, dbPath, prev };
}

function restoreEnv(prev) {
  Object.assign(config, prev);
}

async function login(app, username = 'admin', password = 'admin123') {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.token;
}

test('用户管理：admin 登录返回 token + user', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'admin');
    assert.equal(res.body.user.username, 'admin');
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：错误密码返回 401', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    assert.equal(res.status, 401);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：用户列表', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.users.length, 1);
    assert.equal(res.body.users[0].username, 'admin');
    assert.ok(!res.body.users[0].password_hash, '不应返回密码哈希');
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：创建子账号', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'editor1', password: 'pass123456', role: 'operator' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'editor1');
    assert.equal(res.body.user.role, 'operator');
    // 新用户可登录
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'editor1', password: 'pass123456' });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.role, 'operator');
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：editor 不能访问用户管理（403）', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const adminToken = await login(app);
    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'editor2', password: 'pass123456', role: 'operator' });
    const editorToken = await login(app, 'editor2', 'pass123456');
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${editorToken}`);
    assert.equal(res.status, 403);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：未登录访问用户管理（401）', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const res = await request(app).get('/api/admin/users');
    assert.equal(res.status, 401);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：编辑用户角色', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    const createRes = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'user3', password: 'pass123456', role: 'operator' });
    const uid = createRes.body.user.id;
    const res = await request(app)
      .put(`/api/admin/users/${uid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'operator' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'operator');
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：重置密码', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    const createRes = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'user4', password: 'oldpass123', role: 'operator' });
    const uid = createRes.body.user.id;
    const resetRes = await request(app)
      .post(`/api/admin/users/${uid}/reset-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'newpass456' });
    assert.equal(resetRes.status, 200);
    // 旧密码登录失败
    const oldLogin = await request(app).post('/api/auth/login').send({ username: 'user4', password: 'oldpass123' });
    assert.equal(oldLogin.status, 401);
    // 新密码登录成功
    const newLogin = await request(app).post('/api/auth/login').send({ username: 'user4', password: 'newpass456' });
    assert.equal(newLogin.status, 200);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：删除用户', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    const createRes = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'user5', password: 'pass123456', role: 'operator' });
    const uid = createRes.body.user.id;
    const delRes = await request(app).delete(`/api/admin/users/${uid}`).set('Authorization', `Bearer ${token}`);
    assert.equal(delRes.status, 200);
    const listRes = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    assert.equal(listRes.body.users.length, 1);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：不能删除自己', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    const res = await request(app).delete('/api/admin/users/1').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 400);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：不能删除最后一个 admin', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    // 创建第二个 admin
    const createRes = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'admin2', password: 'pass123456', role: 'admin' });
    const uid2 = createRes.body.user.id;
    // 先禁用 admin2（这样只剩 admin 一个 active admin）
    await request(app).put(`/api/admin/users/${uid2}`).set('Authorization', `Bearer ${token}`).send({ status: 'disabled' });
    // 尝试删除 admin（唯一 active admin）应失败
    const res = await request(app).delete('/api/admin/users/1').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 400);
  } finally {
    restoreEnv(prev);
  }
});

test('用户管理：重复用户名返回 409', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const token = await login(app);
    await request(app).post('/api/admin/users').set('Authorization', `Bearer ${token}`).send({ username: 'dup', password: 'pass123456' });
    const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${token}`).send({ username: 'dup', password: 'pass123456' });
    assert.equal(res.status, 409);
  } finally {
    restoreEnv(prev);
  }
});

test('手机号注册：发送验证码 + 注册 + 登录', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    // 发送验证码
    const smsRes = await request(app).post('/api/auth/sms-code').send({ phone: '13900139000', purpose: 'register' });
    assert.equal(smsRes.status, 200);
    assert.ok(smsRes.body.devCode, 'mock 环境应返回 devCode');
    // 注册
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ phone: '13900139000', code: smsRes.body.devCode, password: 'regpass123', username: '注册用户' });
    assert.equal(regRes.status, 200);
    assert.equal(regRes.body.user.role, 'operator');
    assert.equal(regRes.body.user.phone, '13900139000');
    assert.ok(regRes.body.token);
    // 登录
    const loginRes = await request(app).post('/api/auth/login').send({ username: '13900139000', password: 'regpass123' });
    assert.equal(loginRes.status, 200);
  } finally {
    restoreEnv(prev);
  }
});

test('手机号注册：错误验证码返回 400', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    await request(app).post('/api/auth/sms-code').send({ phone: '13900139001', purpose: 'register' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ phone: '13900139001', code: '000000', password: 'regpass123' });
    assert.equal(res.status, 400);
  } finally {
    restoreEnv(prev);
  }
});

test('手机号注册：重复手机号返回 409', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const smsReg = await request(app).post('/api/auth/sms-code').send({ phone: '13900139002', purpose: 'register' });
    await request(app).post('/api/auth/register').send({ phone: '13900139002', code: smsReg.body.devCode, password: 'pass123456' });
    // 直接插一条新验证码（绕过 60 秒限频）
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare("INSERT INTO sms_codes (phone, code, purpose, expires_at) VALUES (?, '123456', 'register', ?)").run('13900139002', expires);
    const res = await request(app).post('/api/auth/register').send({ phone: '13900139002', code: '123456', password: 'pass123456' });
    assert.equal(res.status, 409);
  } finally {
    restoreEnv(prev);
  }
});

test('手机号登录：验证码登录', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    // 先注册
    const smsReg = await request(app).post('/api/auth/sms-code').send({ phone: '13900139003', purpose: 'register' });
    await request(app).post('/api/auth/register').send({ phone: '13900139003', code: smsReg.body.devCode, password: 'pass123456' });
    // 发送登录验证码
    const smsLogin = await request(app).post('/api/auth/sms-code').send({ phone: '13900139003', purpose: 'login' });
    assert.equal(smsLogin.status, 200);
    // 验证码登录
    const res = await request(app).post('/api/auth/login-phone').send({ phone: '13900139003', code: smsLogin.body.devCode });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  } finally {
    restoreEnv(prev);
  }
});

test('手机号登录：未注册手机号返回 404', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const sms = await request(app).post('/api/auth/sms-code').send({ phone: '13900139999', purpose: 'login' });
    const res = await request(app).post('/api/auth/login-phone').send({ phone: '13900139999', code: sms.body.devCode });
    assert.equal(res.status, 404);
  } finally {
    restoreEnv(prev);
  }
});

test('验证码：60 秒限频', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const r1 = await request(app).post('/api/auth/sms-code').send({ phone: '13800138000', purpose: 'register' });
    assert.equal(r1.status, 200);
    const r2 = await request(app).post('/api/auth/sms-code').send({ phone: '13800138000', purpose: 'register' });
    assert.equal(r2.status, 429);
  } finally {
    restoreEnv(prev);
  }
});

test('存储配置：editor 无权限（403）', async () => {
  const { dbPath, prev } = setupEnv();
  try {
    const db = createDb(dbPath);
    const app = createApp({ db });
    const adminToken = await login(app);
    await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken}`).send({ username: 'ed', password: 'pass123456', role: 'operator' });
    const edToken = await login(app, 'ed', 'pass123456');
    const res = await request(app).get('/api/admin/storage').set('Authorization', `Bearer ${edToken}`);
    assert.equal(res.status, 403);
  } finally {
    restoreEnv(prev);
  }
});
