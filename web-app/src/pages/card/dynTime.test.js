/**
 * 🔴 回归锁：动态时间文案（#312-8「发布时间是 9 个小时前，这个时间不对」）
 *
 * 根因：服务端 created_at 是 SQLite `datetime('now')` 的 **UTC** 串，前端原来
 * `new Date(t.replace(' ','T'))` 按**本地时区**解析 → 东八区凭空多 8 小时。
 * 这里用真实 Date 跑行为测试（不是源码文本钉子），比文本断言更能防回归。
 */
import { describe, test, expect } from 'vitest';
import { parseUtc, formatDynamicTime } from './utils/dynTime.js';

/** 造一个「now 之前 secAgo 秒」的 UTC 时间串（格式与 SQLite datetime('now') 一致） */
function utcSecAgo(secAgo) {
  const d = new Date(Date.now() - secAgo * 1000);
  const p = (n) => String(n).padStart(2, '0');
  // 注意用的是 UTC 取值——服务端存的就是 UTC
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

describe('parseUtc：UTC 时间串解析', () => {
  test('无时区标记的串按 UTC 解析（不是按本地时区）', () => {
    const t = '2026-10-23 01:00:00';
    const d = parseUtc(t);
    expect(d).not.toBeNull();
    // 关键断言：UTC 01:00 的 epoch 毫秒必须等于 Date.UTC(2026,9,23,1,0,0)
    expect(d.getTime()).toBe(Date.UTC(2026, 9, 23, 1, 0, 0));
  });

  test('已是 ISO（带 Z / 带偏移）的不二次补 Z', () => {
    expect(parseUtc('2026-10-23T01:00:00Z').getTime()).toBe(Date.UTC(2026, 9, 23, 1, 0, 0));
    expect(parseUtc('2026-10-23T09:00:00+08:00').getTime()).toBe(Date.UTC(2026, 9, 23, 1, 0, 0));
  });

  test('空值 / 脏值返回 null（不能抛异常把整页打空）', () => {
    expect(parseUtc('')).toBeNull();
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc(undefined)).toBeNull();
    expect(parseUtc('not-a-date')).toBeNull();
  });
});

describe('formatDynamicTime：相对时间分档', () => {
  test('🔴 回归核心：刚发的动态不能显示「8/9 个小时前」', () => {
    // 服务端 UTC 时间，1 小时前发的 —— 旧实现会算成 9 小时前
    expect(formatDynamicTime(utcSecAgo(3600 - 5))).toBe('59分钟前');
    expect(formatDynamicTime(utcSecAgo(30))).toBe('刚刚');
    expect(formatDynamicTime(utcSecAgo(5 * 60))).toBe('5分钟前');
    const h3 = formatDynamicTime(utcSecAgo(3 * 3600));
    expect(h3).toBe('3小时前'); // 旧实现会给出「11小时前」
  });

  test('超过一天给「昨天 HH:MM」，超过两天给「M月D日」', () => {
    expect(formatDynamicTime(utcSecAgo(26 * 3600))).toMatch(/^昨天 \d{2}:\d{2}$/);
    expect(formatDynamicTime(utcSecAgo(30 * 24 * 3600))).toMatch(/^\d{1,2}月\d{1,2}日$/);
  });

  test('空值返回空串（不能渲染出「NaN分钟前」）', () => {
    expect(formatDynamicTime('')).toBe('');
    expect(formatDynamicTime(null)).toBe('');
    expect(formatDynamicTime('garbage')).toBe('');
  });

  test('服务端时钟略超前于本地（NTP 误差）时不显示负数', () => {
    expect(formatDynamicTime(utcSecAgo(-5))).toBe('刚刚');
  });
});
