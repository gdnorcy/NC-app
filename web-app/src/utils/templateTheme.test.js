/**
 * 名片模板主题 schema 解析回归（2026-10-08 审查）
 *
 * 本项目的信息：`|| 默认值` 是「0 值陷阱」的高发写法 —— 0 是合法配置
 * （0deg 渐变角 / 零圆角 / 零间距），用 truthy 回退会让运营**永远设不出 0**，
 * 表现为「我改成 0 了保存后又变回去」。本文件锁住这两处。
 */
import { describe, it, expect } from 'vitest';
import { parseTheme, heroRadius } from './templateTheme.js';

describe('parseTheme 零值与非法值处理', () => {
  it('🔴 bgAngle=0 必须保留 0（原 Number(x)||160 会改成 160）', () => {
    expect(parseTheme({ bgAngle: 0 }).bgAngle).toBe(0);
  });

  it('bgAngle 越界/非法回落 160', () => {
    expect(parseTheme({ bgAngle: 999 }).bgAngle).toBe(360);   // 夹上限
    expect(parseTheme({ bgAngle: -10 }).bgAngle).toBe(0);     // 夹下限
    expect(parseTheme({ bgAngle: 'abc' }).bgAngle).toBe(160); // 非法回落默认
    expect(parseTheme({}).bgAngle).toBe(160);
  });

  it('🔴 radius=0 必须保留 0（原 Number(x)||18 会改成 18，零圆角设不出来）', () => {
    expect(parseTheme({ radius: 0 }).radius).toBe(0);
    expect(heroRadius({ radius: 0 })).toBe('0rpx');
  });

  it('radius 越界/非法回落安全值', () => {
    expect(parseTheme({ radius: 999 }).radius).toBe(48);
    expect(parseTheme({ radius: 'x' }).radius).toBe(18);
    expect(parseTheme({}).radius).toBe(18);
  });

  it('heroRadius 头像分支：杂志/圆像明净走圆形，其余为 base+14 且不超过 36', () => {
    expect(heroRadius({ radius: 12 }, true)).toBe('26rpx');
    expect(heroRadius({ radius: 40 }, true)).toBe('36rpx');    // min(40+14,36)
    expect(heroRadius({ heroLayout: 'mag', radius: 12 }, true)).toBe('50%');
    expect(heroRadius({ heroLayout: 'pano3', radius: 12 }, true)).toBe('50%');
  });
});
