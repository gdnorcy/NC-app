import { describe, it, expect } from 'vitest';
import {
  PLATE_PROVINCES,
  PLATE_LETTERS,
  PLATE_DIGITS,
  plateKeyType,
  provinceRows,
  letterRows,
  alphaKeyboard,
} from './plateKeyboard.js';

describe('车牌软键盘字符集与布局', () => {
  it('省份简称含 31 省市区 + 使/领 = 33 个，且无重复', () => {
    expect(PLATE_PROVINCES.length).toBe(33);
    expect(new Set(PLATE_PROVINCES).size).toBe(33);
    expect(PLATE_PROVINCES).toContain('京');
    expect(PLATE_PROVINCES).toContain('粤');
    expect(PLATE_PROVINCES).toContain('使');
    expect(PLATE_PROVINCES).toContain('领');
  });

  it('字母排除 I/O（避免与 1/0 混淆），共 24 个', () => {
    expect(PLATE_LETTERS).not.toContain('I');
    expect(PLATE_LETTERS).not.toContain('O');
    expect(PLATE_LETTERS.length).toBe(24);
    expect(PLATE_LETTERS[0]).toBe('A');
    expect(PLATE_LETTERS[PLATE_LETTERS.length - 1]).toBe('Z');
  });

  it('数字为 0-9', () => {
    expect(PLATE_DIGITS.join('')).toBe('0123456789');
  });

  it('键盘类型按格索引：0=省份，1=字母，>=2=字母数字', () => {
    expect(plateKeyType(0)).toBe('province');
    expect(plateKeyType(1)).toBe('letter');
    expect(plateKeyType(2)).toBe('alnum');
    expect(plateKeyType(7)).toBe('alnum');
  });

  it('省份键盘每行最多 9 个，铺满全部省份且无遗漏', () => {
    const rows = provinceRows();
    expect(rows.every((r) => r.length <= 9)).toBe(true);
    expect(rows.flat().length).toBe(PLATE_PROVINCES.length);
  });

  it('字母键盘每行 8 个', () => {
    const rows = letterRows();
    expect(rows.every((r) => r.length === 8)).toBe(true);
    expect(rows.flat().length).toBe(PLATE_LETTERS.length);
  });

  it('字母数字键盘返回字母行 + 数字行', () => {
    const kb = alphaKeyboard();
    expect(kb.letterRows.flat().length).toBe(PLATE_LETTERS.length);
    expect(kb.digitRow.join('')).toBe('0123456789');
  });
});
