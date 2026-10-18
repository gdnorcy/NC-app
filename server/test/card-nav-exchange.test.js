/**
 * 名片「导航」位置字段 + 交换/收藏自操作校验（2026-10-22）
 *
 * 背景（真实需求驱动，不是为测试而测试）：
 * - C 端详情页操作栏改成「访客视角」后，名片主人预览自己的名片时也能看到并点击
 *   「交换名片」。此前 POST /exchange 没有自操作校验（/collect 有），主人点一下就把
 *   自己写进自己的客户池 + 自己的 exchange_count +1 —— 数据自污染。本用例钉住这个口。
 * - 「导航」要唤起系统地图（uni.openLocation）必须拿到经纬度，所以位置三件套
 *   （latitude/longitude/address）要在名片本体上落库存取。uni.openLocation 对非数字
 *   坐标是**静默失败**（不报错、点了没反应），所以「脏值必须收敛成 0」要在服务端
 *   钉死——否则脏数据一旦入库，真机上表现为「点了没反应」，现场无法排查。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';

let app;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-cardnav-'));
  config.dataDir = tmpDir;
  config.uploadsDir = path.join(tmpDir, 'uploads');
  config.dbPath = path.join(tmpDir, 'panorama.db');
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  config.webDistDir = path.join(tmpDir, 'dist');
  fs.mkdirSync(config.webDistDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, 'index.html'), '<html>INDEX_ENTRY</html>');
  app = createApp();
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function wxLogin(code) {
  const res = await request(app).post('/api/card/auth/wx-login').send({ code });
  assert.equal(res.status, 200);
  return res.body.token;
}

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('名片位置字段（导航到公司）', () => {
  test('创建带经纬度 → GET 原样下发；PUT 改坐标生效；脏值收敛成 0', async () => {
    const token = await wxLogin('nav_field_1');
    const created = await request(app)
      .post('/api/card/cards')
      .set(bearer(token))
      .send({
        name: '位置甲', position: '顾问', phone: '13800001111',
        latitude: 23.1291, longitude: 113.2644, address: '广州市天河区某大厦 8 楼',
      });
    assert.equal(created.status, 200);
    const id = created.body.card.id;

    // GET /cards/:id（公开接口，访客视角看名片）——位置必须随名片一起下发
    const got = await request(app).get(`/api/card/cards/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.body.card.latitude, 23.1291, 'latitude 必须原样下发，否则 openLocation 打不开地图');
    assert.equal(got.body.card.longitude, 113.2644);
    assert.equal(got.body.card.address, '广州市天河区某大厦 8 楼');

    // PUT 改坐标
    const put = await request(app)
      .put(`/api/card/cards/${id}`)
      .set(bearer(token))
      .send({ latitude: 22.5431, longitude: 114.0579, address: '深圳市南山区某中心' });
    assert.equal(put.status, 200);
    assert.equal(put.body.card.latitude, 22.5431);
    assert.equal(put.body.card.longitude, 114.0579);
    assert.equal(put.body.card.address, '深圳市南山区某中心');

    // 🔴 脏值：'abc'/NaN 必须收敛成 0（=未设置），不能让非数字进 REAL 列
    const dirty = await request(app)
      .put(`/api/card/cards/${id}`)
      .set(bearer(token))
      .send({ latitude: 'abc', longitude: null });
    assert.equal(dirty.status, 200);
    assert.equal(dirty.body.card.latitude, 0, '脏 latitude 必须收敛成 0');
    assert.equal(dirty.body.card.longitude, 0, 'null longitude 必须收敛成 0');
  });

  test('PUT 不带位置字段时不覆盖既有坐标（PATCH 语义）', async () => {
    const token = await wxLogin('nav_field_2');
    const created = await request(app)
      .post('/api/card/cards')
      .set(bearer(token))
      .send({ name: '位置乙', latitude: 30.2741, longitude: 120.1551, address: '杭州市上城区某路 1 号' });
    assert.equal(created.status, 200);
    const id = created.body.card.id;

    // 改一个无关字段（名字），位置必须保持——create.vue 的存在编辑走 updateCard(payload)，
    // 若这里把位置清零，用户换个头像就把导航坐标丢了。
    const put = await request(app).put(`/api/card/cards/${id}`).set(bearer(token)).send({ name: '位置乙改' });
    assert.equal(put.status, 200);
    assert.equal(put.body.card.name, '位置乙改');
    assert.equal(put.body.card.latitude, 30.2741, '未传 latitude 时必须保持原值');
    assert.equal(put.body.card.longitude, 120.1551);
    assert.equal(put.body.card.address, '杭州市上城区某路 1 号');
  });

  test('未选位置的名片：toCard 下发 0 + 空地址（C 端据此走「复制地址」降级）', async () => {
    const token = await wxLogin('nav_field_3');
    const created = await request(app).post('/api/card/cards').set(bearer(token)).send({ name: '无位置丙' });
    assert.equal(created.status, 200);
    assert.equal(created.body.card.latitude, 0);
    assert.equal(created.body.card.longitude, 0);
    assert.equal(created.body.card.address, '');
  });
});

describe('名片交换/收藏自操作校验', () => {
  test('交换自己的名片 → 400，且不产生客户池/exchange 脏数据', async () => {
    const token = await wxLogin('exchange_self_1');
    const created = await request(app)
      .post('/api/card/cards')
      .set(bearer(token))
      .send({ name: '自交换甲', phone: '13800002222' });
    assert.equal(created.status, 200);
    const id = created.body.card.id;
    const before = await request(app).get(`/api/card/cards/${id}`);
    const beforeCount = before.body.card.exchangeCount;

    const self = await request(app).post('/api/card/exchange').set(bearer(token)).send({ toCardId: id });
    assert.equal(self.status, 400, '自己的名片必须拒绝交换');
    assert.match(self.body.error, /自己的名片/);

    // 关键：不能留下副作用
    const after = await request(app).get(`/api/card/cards/${id}`);
    assert.equal(after.body.card.exchangeCount, beforeCount, '被拒的自交换不能让 exchange_count+1');

    const customers = await request(app).get('/api/card/customers').set(bearer(token));
    assert.equal(customers.status, 200);
    assert.ok(
      !customers.body.customers.some((c) => c.name === '自交换甲'),
      '自己的名片不能被写进自己的客户池'
    );
  });

  test('收藏自己的名片 → 400（与交换同口径）', async () => {
    const token = await wxLogin('collect_self_1');
    const created = await request(app).post('/api/card/cards').set(bearer(token)).send({ name: '自收藏乙' });
    assert.equal(created.status, 200);
    const r = await request(app).post('/api/card/collect').set(bearer(token)).send({ cardId: created.body.card.id });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /不能收藏自己的名片/);
  });

  test('与他人交换 → 200：exchange_count+1 + 对方进我的客户池', async () => {
    const tokA = await wxLogin('exchange_pair_a');
    const tokB = await wxLogin('exchange_pair_b');
    const cardA = await request(app).post('/api/card/cards').set(bearer(tokA)).send({ name: '甲方' });
    const cardB = await request(app).post('/api/card/cards').set(bearer(tokB)).send({ name: '乙方', phone: '13800003333' });
    assert.equal(cardA.status, 200);
    assert.equal(cardB.status, 200);
    const bId = cardB.body.card.id;

    const before = await request(app).get(`/api/card/cards/${bId}`);
    const r = await request(app).post('/api/card/exchange').set(bearer(tokA)).send({ toCardId: bId, sharePhone: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    // 🔴 顺带钉住历史 bug：原实现里 `const toCard = db.prepare(...)` 把外层 toCard() 序列化函数
    //    同名遮蔽了，返回体本应是序列化后的名片对象，实际是 row 本身。这里断言序列化形态。
    assert.equal(r.body.exchangedCard.name, '乙方');
    assert.equal(r.body.exchangedCard.latitude, 0, 'exchangedCard 必须是 toCard() 的输出形态');

    const after = await request(app).get(`/api/card/cards/${bId}`);
    assert.equal(after.body.card.exchangeCount, before.body.card.exchangeCount + 1, 'exchange_count 必须 +1');

    const customers = await request(app).get('/api/card/customers').set(bearer(tokA));
    const hit = customers.body.customers.find((c) => c.name === '乙方');
    assert.ok(hit, '交换后对方应自动进我的客户池');
    assert.equal(hit.phone, '13800003333', 'sharePhone=true 时手机号应入库');
  });
});
