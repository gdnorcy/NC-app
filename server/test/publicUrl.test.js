/**
 * 对外基址 publicBaseUrl 单测
 *
 * 为什么测：这是「回调 URL 拼成 http 而不是 https」这类事故的收口点。
 * 公网站点普遍是 nginx 做 TLS 终止 + 80 端口 301 到 https，拼错协议 = 微信后台握手直接非 200，
 * 而报错信息完全不会提示"你的 URL 协议写错了"，排查成本极高。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicBaseUrl, absoluteUrl } from '../src/utils/publicUrl.js';

function fakeReq(headers = {}, protocol = 'http', host = '127.0.0.1:3000') {
  return { headers, protocol, get: (k) => (k.toLowerCase() === 'host' ? host : undefined) };
}

test('有 X-Forwarded-Proto 时以它为准（TLS 终止在 nginx 这一层的典型形态）', () => {
  const req = fakeReq({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'zero.example.com' });
  assert.equal(publicBaseUrl(req), 'https://zero.example.com');
});

test('没有反代头时退回真实协议 + Host（本地 http 开发不能被误改成 https）', () => {
  const req = fakeReq({}, 'http', 'localhost:3000');
  assert.equal(publicBaseUrl(req), 'http://localhost:3000');
});

test('多层代理时取第一个 Proto/Host（XFP 是逗号分隔链）', () => {
  const req = fakeReq({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'a.example.com, b.internal' });
  assert.equal(publicBaseUrl(req), 'https://a.example.com');
});

test('PUBLIC_BASE_URL 优先级最高，且容忍尾部斜杠', () => {
  const prev = process.env.PUBLIC_BASE_URL;
  try {
    process.env.PUBLIC_BASE_URL = 'https://ops.example.com/';
    assert.equal(publicBaseUrl(fakeReq({ 'x-forwarded-proto': 'http' }, 'http', 'x')), 'https://ops.example.com');
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
  }
});

test('absoluteUrl 路径拼接兼容带/不带前导斜杠', () => {
  const req = fakeReq({ 'x-forwarded-proto': 'https' }, 'http', 'example.com');
  assert.equal(absoluteUrl(req, '/api/channel/wx-message/wx1'), 'https://example.com/api/channel/wx-message/wx1');
  assert.equal(absoluteUrl(req, 'api/x'), 'https://example.com/api/x');
  assert.equal(absoluteUrl(req), 'https://example.com');
});

test('僵尸值防御：req 为空时不抛异常', () => {
  assert.equal(publicBaseUrl(undefined), 'http://');
  assert.doesNotThrow(() => absoluteUrl(null, '/x'));
});
