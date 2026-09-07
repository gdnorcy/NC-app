import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuditTitle } from '../src/services/wx-component.js';

// ============================================================
// 小程序审核标题解析：租户品牌名优先，空则回退默认
// ============================================================
describe('resolveAuditTitle', () => {
  it('有品牌名时使用品牌名', () => {
    assert.equal(resolveAuditTitle('东莞零壹科技'), '东莞零壹科技');
  });

  it('空/未定义回退默认「360全景展示」', () => {
    assert.equal(resolveAuditTitle(''), '360全景展示');
    assert.equal(resolveAuditTitle(null), '360全景展示');
    assert.equal(resolveAuditTitle(undefined), '360全景展示');
  });

  it('纯空白/非字符串输入安全回退', () => {
    assert.equal(resolveAuditTitle('   '), '360全景展示');
    assert.equal(resolveAuditTitle(0), '360全景展示');
  });

  it('品牌名首尾空白被去除', () => {
    assert.equal(resolveAuditTitle('  零壹云  '), '零壹云');
  });
});
