import { describe, it, expect } from 'vitest';
import { buildGlobalHomeRedirect } from './globalHome.js';

describe('buildGlobalHomeRedirect（冷启动首页联动决策）', () => {
  it('无 homePageUrl → 不跳转', () => {
    expect(buildGlobalHomeRedirect('', '1', 'pages/cardMain/login')).toBe('');
    expect(buildGlobalHomeRedirect(null, '1', 'pages/cardMain/login')).toBe('');
  });

  it('有配置无 tid → 原样跳转目标', () => {
    expect(buildGlobalHomeRedirect('/pages/mall/index?pageType=mall-home', '', 'pages/cardMain/login'))
      .toBe('/pages/mall/index?pageType=mall-home');
  });

  it('有配置有 tid → 拼接 tid（已有 ? 用 &）', () => {
    expect(buildGlobalHomeRedirect('/pages/mall/index?pageType=mall-home', '1', 'pages/cardMain/login'))
      .toBe('/pages/mall/index?pageType=mall-home&tid=1');
  });

  it('目标无查询参数 → 用 ?tid= 拼接', () => {
    expect(buildGlobalHomeRedirect('/pages/cardMain/home?pageType=home', '9', 'pages/cardMain/login'))
      .toBe('/pages/cardMain/home?pageType=home&tid=9');
  });

  it('当前页即目标页 → 不跳转（防死循环）', () => {
    expect(buildGlobalHomeRedirect('/pages/mall/index?pageType=mall-home', '', 'pages/mall/index'))
      .toBe('');
    expect(buildGlobalHomeRedirect('/pages/mall/index?pageType=mall-home', '', '/pages/mall/index'))
      .toBe('');
  });

  it('当前页带 tid 参数仍视为目标页', () => {
    expect(buildGlobalHomeRedirect('/pages/cardMain/home?pageType=home', '1', 'pages/cardMain/home'))
      .toBe('');
  });
});
