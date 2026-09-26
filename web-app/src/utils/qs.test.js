import { describe, it, expect } from 'vitest';
import { qsStringify, qsParse } from './qs.js';

describe('qsStringify（跨端安全 query 序列化）', () => {
  it('空对象 → 空串', () => {
    expect(qsStringify({})).toBe('');
    expect(qsStringify(null)).toBe('');
  });

  it('单参数', () => {
    expect(qsStringify({ tid: '1' })).toBe('tid=1');
  });

  it('多参数按插入序 & 连接', () => {
    expect(qsStringify({ tid: '1', pageType: 'mall-home' })).toBe('tid=1&pageType=mall-home');
  });

  it('特殊字符 URL 编码', () => {
    expect(qsStringify({ q: 'a b&c' })).toBe('q=a%20b%26c');
  });

  it('空值/null 值安全', () => {
    expect(qsStringify({ a: '', b: null })).toBe('a=&b=');
  });
});

describe('qsParse（跨端安全 query 解析）', () => {
  it('空串/无 ? → 空对象', () => {
    expect(qsParse('')).toEqual({});
    expect(qsParse(null)).toEqual({});
  });

  it('解析不带前导 ? 的 query', () => {
    expect(qsParse('tid=1&pageType=mall-home')).toEqual({ tid: '1', pageType: 'mall-home' });
  });

  it('兼容前导 ?', () => {
    expect(qsParse('?tid=1')).toEqual({ tid: '1' });
  });

  it('解码特殊字符', () => {
    expect(qsParse('q=a%20b%26c')).toEqual({ q: 'a b&c' });
  });

  it('无值参数 → 空串', () => {
    expect(qsParse('preview&tid=1')).toEqual({ preview: '', tid: '1' });
  });
});
