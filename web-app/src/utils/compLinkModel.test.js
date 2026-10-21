/**
 * 链接模型单元测试（🔴 反馈 #321）
 *
 * #321 变更：内部链接**恢复为一等类型**（#321 推翻 #301）。
 *   linkType: 'internal' | 'miniapp' | 'web' | 'phone'
 *   🔴 归一化必须**同时吸收两个「内部页面」写法**：''（未设 / #301 期间新建）
 *      与 'internal'（原始值）。存量数据两种都有，只归一其一会分裂。
 *
 * 这组测试锁的是**数据兼容**——存量装修数据是线上真实数据，
 * 归一化错了 = 用户已配好的内部链接全部跳不动。
 */
import { describe, test, expect } from 'vitest';
import {
  LINK_TYPES, LINK_ENVS, LINK_INTERNAL, normalizeLinkType, isExternalType,
  normalizeLink, isValidLink, linkIssue, describeLink,
} from './compLinkModel.js';

describe('normalizeLinkType：内部链接是一等类型', () => {
  test('空值 / undefined → internal（内部链接是一等类型，不是「没选」）', () => {
    expect(normalizeLinkType('')).toBe('internal');
    expect(normalizeLinkType(undefined)).toBe('internal');
    expect(normalizeLinkType(null)).toBe('internal');
  });

  test("存量 'internal' 保持 internal（UI 上四个选项里要有一个是亮的）", () => {
    expect(normalizeLinkType('internal')).toBe('internal');
    expect(normalizeLinkType(LINK_INTERNAL)).toBe('internal');
  });

  test('三种外链类型原样保留', () => {
    expect(normalizeLinkType('miniapp')).toBe('miniapp');
    expect(normalizeLinkType('web')).toBe('web');
    expect(normalizeLinkType('phone')).toBe('phone');
  });

  test('未知值一律降级为内部链接（不崩、不产生无效跳转）', () => {
    expect(normalizeLinkType('weird')).toBe('internal');
    expect(normalizeLinkType('INTERNAL')).toBe('internal');
  });

  test('isExternalType 与 normalize 一致', () => {
    expect(isExternalType('')).toBe(false);
    expect(isExternalType('internal')).toBe(false);
    expect(isExternalType('miniapp')).toBe(true);
    expect(isExternalType('web')).toBe(true);
    expect(isExternalType('phone')).toBe(true);
  });
});

describe('LINK_TYPES 含「内部链接」', () => {
  test('类型选项四种，内部链接排第一（= 默认选中项）', () => {
    expect(LINK_TYPES.map((t) => t.value)).toEqual(['internal', 'miniapp', 'web', 'phone']);
  });

  test('🔴 default 与 options[0].value 必须同值（admin 表单引擎会取options[0]）', () => {
    // admin 的 addListItem/listVal 在值为空时取 options[0].value。
    // 若 default 与 options[0] 不同值，UI 显示的默认值与实际存进去的值会分裂。
    expect(LINK_TYPES[0].value).toBe(LINK_INTERNAL);
  });

  test('跳转版本选项仍是三档（正式/体验/开发）', () => {
    expect(LINK_ENVS.map((e) => e.value)).toEqual(['release', 'trial', 'develop']);
  });
});

describe('normalizeLink：归一化整个链接配置', () => {
  test('存量数据（无 linkType + 有 url）→ 内部链接 + 保留路径', () => {
    const l = normalizeLink({ url: '/pages/card/market' });
    expect(l.linkType).toBe('internal');
    expect(l.url).toBe('/pages/card/market');
  });

  test("存量 linkType='internal' → 保持 internal，url 保留", () => {
    const l = normalizeLink({ url: '/pages/card/market', linkType: 'internal' });
    expect(l.linkType).toBe('internal');
    expect(l.url).toBe('/pages/card/market');
  });

  test("🔴 #301 期间新建的空串 linkType 也归一为 internal（线上真实数据）", () => {
    expect(normalizeLink({ url: '/pages/card/market', linkType: '' }).linkType).toBe('internal');
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
    expect(normalizeLink(null).linkType).toBe('internal');
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
