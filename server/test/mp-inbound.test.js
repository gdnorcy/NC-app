/**
 * 公众号 inbound 消息：明文模式 URL 签名校验单测
 *
 * 为什么测：回调 URL 里含 appid（/api/channel/wx-message/{appid}），一旦泄漏，
 * 明文模式下任何人都能伪造粉丝消息/关注事件。所以只要请求带了 signature 就必须校验。
 *
 * 关键约定：三个参数缺任意一个 → 放行（返回 true）。
 * 微信未承诺明文模式一定会带这些参数，缺参放行是为了不误杀合法请求；
 * 但只要带了，就必须与 token 对得上。这条不能反 —— 反过来写会让线上新配置直接拒收。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WxMpService } from '../src/services/wx-mp.js';

// verifyPlainSignature 不依赖实例状态，直接按纯函数方式调用
const verify = (token, q) => WxMpService.prototype.verifyPlainSignature(token, q);

function sign(token, timestamp, nonce) {
  return crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
}

test('签名正确时通过', () => {
  const q = { timestamp: '1700000000', nonce: 'abc123' };
  q.signature = sign('myToken', q.timestamp, q.nonce);
  assert.equal(verify('myToken', q), true);
});

test('签名不匹配时拒绝（token 不一致 → 伪造请求）', () => {
  const q = { timestamp: '1700000000', nonce: 'abc123' };
  q.signature = sign('otherToken', q.timestamp, q.nonce);
  assert.equal(verify('myToken', q), false);
});

test('参数打乱顺序不影响校验（字典序排序是约定）', () => {
  const q = { timestamp: '1700000000', nonce: 'zzz999' };
  q.signature = sign('t0ken', q.timestamp, q.nonce);
  // "t0ken" < "zzz999" > "1700000000" 的实际排序由实现负责，调用方只管结果
  assert.equal(verify('t0ken', q), true);
});

test('缺参数一律放行：不误杀明文模式下不带签名的合法推送', () => {
  const q = { timestamp: '1700000000', nonce: 'abc' };
  assert.equal(verify('myToken', q), true); // 无 signature
  assert.equal(verify('myToken', { signature: 'x' }), true); // 无 timestamp/nonce
  assert.equal(verify('myToken', undefined), true);
  assert.equal(verify('', { signature: 'x', timestamp: '1', nonce: 'n' }), true); // 无 token
});

test('空串参数视为未提供（Express query 里常见空值）', () => {
  assert.equal(verify('myToken', { signature: '', timestamp: '1', nonce: 'n' }), true);
});
