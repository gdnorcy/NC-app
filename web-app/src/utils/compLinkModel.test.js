/**
 * 链接模型单元测试（🔴 反馈 #301）
 *
 * 变更：内部页面不再是「一种类型」。
 *   linkType: ''（默认=内部页面，靠链接框填路径）| 'miniapp' | 'web' | 'phone'
 *   存量 props 的 linkType='internal' 必须归一为 ''（行为不变）。
 *
 * 这组测试锁的是**数据兼容**——存量装修数据是线上真实数据，
 * 归一化错了 = 用户已配好的内部链接全部跳不动。
 */
import { describe, test, expect } from 'vitest';
import {
  LINK_TYPES, LINK_ENVS, normalizeLinkType, isExternalType,
  normalizeLink, isValidLink, linkIssue, describeLink,
} from './compLinkModel.js';

describe('normalizeLinkType：内部页面降级', () => {
  test('空值 / undefined → 内部页面（空串）', () => {
    expect(normalizeLinkType('')).toBe('');
    expect(normalizeLinkType(undefined)).toBe('');
    expect(normalizeLinkType(null)).toBe('');
  });

  test("存量 'internal' 归一为 ''（不是保留为 internal，否则两端判定分裂）", () => {
    expect(normalizeLinkType('internal')).toBe('');
  });

  test('三种外链类型原样保留', () => {
    expect(normalizeLinkType('miniapp')).toBe('miniapp');
    expect(normalizeLinkType('web')).toBe('web');
    expect(normalizeLinkType('phone')).toBe('phone');
  });

  test('未知值一律降级为内部页面（不崩、不产生无效跳转）', () => {
    expect(normalizeLinkType('weird')).toBe('');
    expect(normalizeLinkType('INTERNAL')).toBe('');
  });

  test('isExternalType 与 normalize 一致', () => {
    expect(isExternalType('')).toBe(false);
    expect(isExternalType('internal')).toBe(false);
    expect(isExternalType('miniapp')).toBe(true);
  });
});

describe('LINK_TYPES 不含「内部页面」', () => {
  test('类型选项只有三种外链', () => {
    expect(LINK_TYPES.map((t) => t.value)).toEqual(['miniapp', 'web', 'phone']);
  });

  test('选项里不含 internal / 内部页面字样', () => {
    expect(LINK_TYPES.some((t) => t.value === 'internal')).toBe(false);
    expect(LINK_TYPES.some((t) => /内部/.test(t.label))).toBe(false);
  });

  test('跳转版本选项仍是三档（正式/体验/开发）', () => {
    expect(LINK_ENVS.map((e) => e.value)).toEqual(['release', 'trial', 'develop']);
  });
});

describe('normalizeLink：归一化整个链接配置', () => {
  test('存量数据（无 linkType + 有 url）→ 内部页面 + 保留路径', () => {
    const l = normalizeLink({ url: '/pages/card/market' });
    expect(l.linkType).toBe('');
    expect(l.url).toBe('/pages/card/market');
  });

  test("存量 linkType='internal' → 归一为 ''，url 保留", () => {
    const l = normalizeLink({ url: '/pages/card/market', linkType: 'internal' });
    expect(l.linkType).toBe('');
    expect(l.url).toBe('/pages/card/market');
  });

  test('字符串裁剪空白（手机输入常带空格）', () => {
    const l = normalizeLink({ url: '  /pages/card/market  ', miniAppId: ' wx1234567890abcdef ' });
    expect(l.url).toBe('/pages/card/market');
    expect(l.miniAppId).toBe('wx1234567890abcdef');
  });

  test('非法 miniAppEnv 回落 release', () => {
    expect(normalizeLink({ miniAppEnv: 'staging' }).miniAppEnv).toBe('release');
    expect(normalizeLink({ miniAppEnv: 'trial' }).miniAppEnv).toBe('trial');
  });

  test('undefined 输入不崩', () => {
    expect(normalizeLink(undefined).url).toBe('');
    expect(normalizeLink(null).linkType).toBe('');
  });
});

describe('isValidLink / linkIssue', () => {
  test('内部页面：有 url 即有效', () => {
    expect(isValidLink({ url: '/pages/card/market' })).toBe(true);
    expect(isValidLink({ url: '' })).toBe(false);
  });

  test('内部页面无 url = 纯展示按钮（不算错误，只是没有跳转）', () => {
    expect(linkIssue({ url: '' })).toBe('未设置跳转目标');
  });

  test('外部小程序：AppID 必须合法', () => {
    expect(isValidLink({ linkType: 'miniapp', miniAppId: 'wx1234567890abcdef' })).toBe(true);
    expect(linkIssue({ linkType: 'miniapp' })).toBe('未填写小程序 AppID');
    expect(linkIssue({ linkType: 'miniapp', miniAppId: 'abc' })).toBe('AppID 格式不正确');
  });

  test('网页：必须 http(s) 开头', () => {
    expect(isValidLink({ linkType: 'web', url: 'https://a.com' })).toBe(true);
    expect(linkIssue({ linkType: 'web' })).toBe('未填写网页地址');
    expect(linkIssue({ linkType: 'web', url: 'a.com' })).toBe('网页地址须以 http:// 或 https:// 开头');
  });

  test('电话：必须有号码', () => {
    expect(isValidLink({ linkType: 'phone', url: '13800138000' })).toBe(true);
    expect(linkIssue({ linkType: 'phone' })).toBe('未填写电话号码');
    expect(linkIssue({ linkType: 'phone', url: 'abc' })).toBe('电话号码格式不正确');
  });

  test('合法链接 linkIssue 返回 null', () => {
    expect(linkIssue({ url: '/pages/card/market' })).toBeNull();
    expect(linkIssue({ linkType: 'miniapp', miniAppId: 'wx1234567890abcdef' })).toBeNull();
  });
});

describe('describeLink：回显文案', () => {
  test('内部页面回显路径', () => {
    expect(describeLink({ url: '/pages/card/market' })).toBe('/pages/card/market');
  });

  test("存量 'internal' 也按内部页面回显", () => {
    expect(describeLink({ url: '/pages/card/market', linkType: 'internal' })).toBe('/pages/card/market');
  });

  test('三种外链各自文案', () => {
    expect(describeLink({ linkType: 'miniapp', miniAppId: 'wx1234567890abcdef' })).toContain('小程序');
    expect(describeLink({ linkType: 'web', url: 'https://a.com' })).toBe('https://a.com');
    expect(describeLink({ linkType: 'phone', url: '13800138000' })).toBe('电话 13800138000');
  });
});
