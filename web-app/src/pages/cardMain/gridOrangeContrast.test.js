import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 宫格「客户管理」橙块的白图标对比度修复。
// 原渐变起点 #ff6b35 上白图标仅 2.1:1（低于图标 3:1 底线）→ 改为 #e8590c 起点（3.4:1）。
// 本测试锁死三处来源（C 端默认 / 设计中心默认 / 调色板预设）都已替换，并验证对比度起落。

const here = import.meta.url;
const files = [
  fileURLToPath(new URL('./home.vue', here)),
  fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/PeColorPicker.vue', here)),
  fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js', here)),
];

const BAD = 'linear-gradient(135deg,#ff6b35,#ff9800)';
const GOOD = 'linear-gradient(135deg,#e8590c,#f59e0b)';

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function relLum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(c1, c2) {
  const l1 = relLum(hexToRgb(c1));
  const l2 = relLum(hexToRgb(c2));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

describe('宫格橙色块白图标对比度修复', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    test(`${f.split('/').slice(-1)[0]} 已替换为修复后橙色`, () => {
      expect(src).toContain(GOOD);
      expect(src).not.toContain(BAD);
    });
  }

  test('白图标在修复后橙起点 #e8590c 上对比度 ≥ 3:1（图标非文本底线）', () => {
    expect(contrast('#ffffff', '#e8590c')).toBeGreaterThanOrEqual(3);
  });

  test('旧橙起点 #ff6b35 白图标对比度确实 < 3:1（即原缺陷，防止被改回）', () => {
    expect(contrast('#ffffff', '#ff6b35')).toBeLessThan(3);
  });
});
