import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMpBindState } from '../src/routes/customer.js';

// 回归：空记录（生产曾出现 appid/app_secret/account_type 全空的 mp 行）
// 必须算作「未接入」，否则绑定入口被永久隐藏、又同时灰掉服务号功能。
test('空记录（全空）→ 未接入、bindMode=none', () => {
  const ch = { id: 4, appid: '', app_secret: '', auth_status: 'none', account_type: '' };
  const s = computeMpBindState(ch);
  assert.equal(s.bound, false);
  assert.equal(s.bindMode, 'none');
});

test('无 channel_apps 记录 → 未接入', () => {
  const s = computeMpBindState(null);
  assert.equal(s.bound, false);
  assert.equal(s.bindMode, 'none');
});

test('手动对接（有 AppSecret）→ 已接入、bindMode=manual', () => {
  const ch = { id: 4, appid: 'gh_test', app_secret: 'enc', auth_status: 'none', account_type: 'service' };
  const s = computeMpBindState(ch);
  assert.equal(s.bound, true);
  assert.equal(s.bindMode, 'manual');
});

test('开放平台已授权 → 已接入、bindMode=open（优先于 manual）', () => {
  const ch = { id: 4, appid: 'gh_test', app_secret: 'enc', auth_status: 'authorized', account_type: 'service' };
  const s = computeMpBindState(ch);
  assert.equal(s.bound, true);
  assert.equal(s.bindMode, 'open');
});

test('开放平台已授权但无 AppSecret → 仍已接入、bindMode=open', () => {
  const ch = { id: 4, appid: '', app_secret: '', auth_status: 'authorized', account_type: '' };
  const s = computeMpBindState(ch);
  assert.equal(s.bound, true);
  assert.equal(s.bindMode, 'open');
});
