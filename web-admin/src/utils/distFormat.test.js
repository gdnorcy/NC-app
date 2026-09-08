import { describe, it, expect } from 'vitest';
import { fen, sourceLabel, logTypeLabel, logTypeTag, statusLabel, withdrawLabel, withdrawTag } from './distFormat.js';

describe('distFormat 分销格式化工具', () => {
  it('fen：分转元保留两位小数', () => {
    expect(fen(500)).toBe('5.00');
    expect(fen(0)).toBe('0.00');
    expect(fen(12345)).toBe('123.45');
    expect(fen(undefined)).toBe('0.00');
    expect(fen(null)).toBe('0.00');
  });

  it('sourceLabel：绑定来源映射', () => {
    expect(sourceLabel('card')).toBe('名片');
    expect(sourceLabel('market')).toBe('集市');
    expect(sourceLabel('qrcode')).toBe('推广码');
    expect(sourceLabel('unknown')).toBe('unknown');
    expect(sourceLabel('')).toBe('-');
  });

  it('logTypeLabel：收益类型映射', () => {
    expect(logTypeLabel('level1')).toBe('一级佣金');
    expect(logTypeLabel('level2')).toBe('二级佣金');
    expect(logTypeLabel('partner')).toBe('合伙人分红');
    expect(logTypeLabel('share_all')).toBe('全民股东');
    expect(logTypeLabel('share_cat')).toBe('类目股东');
    expect(logTypeLabel('share_area')).toBe('区域股东');
  });

  it('logTypeTag：类型标签色', () => {
    expect(logTypeTag('level2')).toBe('info');
    expect(logTypeTag('level1')).toBe('primary');
  });

  it('statusLabel：收益状态映射', () => {
    expect(statusLabel('pending')).toBe('待结算');
    expect(statusLabel('settled')).toBe('已结算');
    expect(statusLabel('charged_back')).toBe('已扣回');
    expect(statusLabel('x')).toBe('x');
  });

  it('withdrawLabel / withdrawTag：提现状态', () => {
    expect(withdrawLabel('pending')).toBe('待审核');
    expect(withdrawLabel('approved')).toBe('待打款');
    expect(withdrawLabel('rejected')).toBe('已驳回');
    expect(withdrawLabel('done')).toBe('已完成');
    expect(withdrawTag('pending')).toBe('warning');
    expect(withdrawTag('done')).toBe('success');
  });
});
