/**
 * 登录入口参数判定测试（2026-10-06）
 * 背景：login 页既是冷启动首页又是真实登录页，主动跳登录必须带 manual=1 让冷启动让路，
 * 否则用户刚到登录页就被 reLaunch 弹走（「点登录没反应」）。
 */
import { describe, it, expect } from 'vitest';
import { isManualEntry, safeRedirect, loginEntryUrl, LOGIN_PATH } from './loginEntry.js';

describe('isManualEntry', () => {
  it('manual=1 → 人为进入，跳过冷启动首页联动', () => {
    expect(isManualEntry({ manual: '1' })).toBe(true);
  });

  it('无 manual / manual=0 → 走冷启动联动', () => {
    expect(isManualEntry({})).toBe(false);
    expect(isManualEntry({ manual: '0' })).toBe(false);
    expect(isManualEntry({ manual: '' })).toBe(false);
    // 数字 1 也认：H5 hash 路由与小程序 getCurrentPages().options 的 query 值类型不一致，
    // 严格 === '1' 会在某一端失效 → 登录页又被弹走
    expect(isManualEntry({ manual: 1 })).toBe(true);
  });

  it('无参数 / undefined 容错', () => {
    expect(isManualEntry()).toBe(false);
    expect(isManualEntry(null)).toBe(false);
  });
});

describe('safeRedirect', () => {
  it('接受站内绝对路径', () => {
    expect(safeRedirect('/pages/card/myCard')).toBe('/pages/card/myCard');
    expect(safeRedirect('/pages/card/cardDetail?id=7')).toBe('/pages/card/cardDetail?id=7');
  });

  it('拒绝协议相对地址（防外链）与相对路径', () => {
    expect(safeRedirect('//evil.com/x')).toBe('');
    expect(safeRedirect('pages/card/myCard')).toBe('');
    expect(safeRedirect('http://evil.com')).toBe('');
    expect(safeRedirect('')).toBe('');
    expect(safeRedirect(undefined)).toBe('');
  });
});

describe('loginEntryUrl', () => {
  it('无 redirect → 只带 manual=1', () => {
    expect(loginEntryUrl()).toBe('/pages/cardMain/login?manual=1');
    expect(loginEntryUrl(LOGIN_PATH)).toBe('/pages/cardMain/login?manual=1');
  });

  it('有 redirect → manual=1 + encode 后的站内路径', () => {
    const u = loginEntryUrl(LOGIN_PATH, '/pages/card/myCard');
    expect(u).toBe('/pages/cardMain/login?manual=1&redirect=%2Fpages%2Fcard%2FmyCard');
    expect(decodeURIComponent(u.split('redirect=')[1])).toBe('/pages/card/myCard');
  });

  it('非法 redirect 被丢弃，不会拼进 URL（防注入外链）', () => {
    expect(loginEntryUrl(LOGIN_PATH, '//evil.com/x')).toBe('/pages/cardMain/login?manual=1');
    expect(loginEntryUrl(LOGIN_PATH, 'javascript:alert(1)')).toBe('/pages/cardMain/login?manual=1');
  });

  it('自定义 loginPath 生效（mall/payment 等独立登录页）', () => {
    expect(loginEntryUrl('/pages/mall/login')).toBe('/pages/mall/login?manual=1');
  });
});