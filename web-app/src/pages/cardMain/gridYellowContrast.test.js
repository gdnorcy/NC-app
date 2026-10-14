import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 宫格「会员中心」配色的两次演进，本测试锁最终态：
//   ① 2026-10-08 对比度修复：黄块起点 #ffb300（白图标 1.79:1）→ 深金 #cc7a00（3.31:1）；
//   ② 2026-10-14 配色收敛：9 彩 → 4 业务域，会员中心与客户管理/分销中心同用**经营域橙**
//      #e8590c→#f59e0b（3.4:1），金整体退出宫格默认位（用户确认「宫格可自己配，不跟随租户」，
//      调色板仍保留深金供自选）。
// 禁回潮：浅金 #ffb300 系（白图标 1.79:1）不得出现在任何宫格默认位；预设如含金只用深金。
// 与 gridOrangeContrast.test.js（经营域橙）/ gridDomainPalette.test.js（4 域一致性）分工锁死。

const here = import.meta.url;
const gridFiles = [
  fileURLToPath(new URL('./home.vue', here)),
  fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js', here)),
];
const pickerFile = fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/PeColorPicker.vue', here));

const BAD_LIGHT_GOLD = 'linear-gradient(135deg,#ffb300,#ff8f00)'; // 白图标 1.79:1
const DEEP_GOLD = 'linear-gradient(135deg,#cc7a00,#f0a500)';      // 白图标 3.31:1（仅预设备选）
const BIZ_ORANGE = 'linear-gradient(135deg,#e8590c,#f59e0b)';     // 经营域（会员中心新归属）

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

describe('宫格金色块演进：退出默认位 + 浅金禁回潮', () => {
  for (const f of gridFiles) {
    const src = readFileSync(f, 'utf8');
    test(`${f.split('/').slice(-1)[0]} 会员中心已随 4 域收敛改用经营域橙`, () => {
      expect(src).toContain(BIZ_ORANGE);
    });
    test(`${f.split('/').slice(-1)[0]} 宫格默认位不再持有金色（浅金/深金都退出）`, () => {
      expect(src).not.toContain(BAD_LIGHT_GOLD);
      expect(src).not.toContain(DEEP_GOLD);
    });
  }

  const picker = readFileSync(pickerFile, 'utf8');
  test('调色板预设不含浅金 #ffb300 系（1.79:1 不达标）', () => {
    expect(picker).not.toContain(BAD_LIGHT_GOLD);
  });
  test('调色板预设如保留金，只用深金 #cc7a00（3.31:1 达标，供用户自选）', () => {
    expect(picker).toContain(DEEP_GOLD);
  });

  test('白图标在浅金起点 #ffb300 上对比度 < 3:1（原缺陷，防止被改回）', () => {
    expect(contrast('#ffffff', '#ffb300')).toBeLessThan(3);
  });
  test('白图标在深金起点 #cc7a00 上对比度 ≥ 3:1（预设金只用深金的依据）', () => {
    expect(contrast('#ffffff', '#cc7a00')).toBeGreaterThanOrEqual(3);
  });
});
