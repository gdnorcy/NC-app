import { describe, it, expect } from 'vitest';
import { genMpToken, genMpEncodingAESKey, isValidMpToken, isValidMpAesKey, MP_TOKEN_LEN, MP_AES_KEY_LEN } from './mpSecrets.js';

describe('微信公众号服务器配置密钥生成', () => {
  it('Token 长度 32 且为纯字母数字（满足 3-32 官方口径）', () => {
    for (let i = 0; i < 50; i++) {
      const t = genMpToken();
      expect(t).toHaveLength(MP_TOKEN_LEN);
      expect(isValidMpToken(t)).toBe(true);
    }
  });

  it('EncodingAESKey 长度 43 且字符集限定 A-Z a-z 0-9', () => {
    for (let i = 0; i < 50; i++) {
      const k = genMpEncodingAESKey();
      expect(k).toHaveLength(MP_AES_KEY_LEN);
      expect(isValidMpAesKey(k)).toBe(true);
    }
  });

  it('连续生成不重复（不是把同一个值反复吐出来）', () => {
    const set = new Set([genMpToken(), genMpToken(), genMpEncodingAESKey(), genMpEncodingAESKey()]);
    expect(set.size).toBe(4);
  });

  it('Token 校验：过短 / 超长 / 含下划线或短横线一律不合法', () => {
    expect(isValidMpToken('ab')).toBe(false); // 少于 3
    expect(isValidMpToken('abc')).toBe(true); // 临界
    expect(isValidMpToken('a'.repeat(32))).toBe(true); // 临界
    expect(isValidMpToken('a'.repeat(33))).toBe(false); // 超长
    expect(isValidMpToken('abc_def')).toBe(false); // 下划线不在字符集
    expect(isValidMpToken('abc-def')).toBe(false);
    expect(isValidMpToken('')).toBe(false);
  });

  it('EncodingAESKey 校验：留空（明文模式）合法，位数不对或含非法字符不合法', () => {
    expect(isValidMpAesKey('')).toBe(true);
    expect(isValidMpAesKey('a'.repeat(42))).toBe(false);
    expect(isValidMpAesKey('a'.repeat(43))).toBe(true);
    expect(isValidMpAesKey('a'.repeat(44))).toBe(false);
    expect(isValidMpAesKey('a'.repeat(42) + '_')).toBe(false);
  });
});
