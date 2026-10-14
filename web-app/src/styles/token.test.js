// 视觉令牌回归测试 —— 锁定「智能名片视觉评测报告」(docs/card-visual-audit.html) 的对比度结论。
// 防止有人把 $t3 / $t4 改回 #86909c / #9a9a9a（WCAG 2.1 仅 ~2.8:1，不达标）。
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(fileURLToPath(new URL('./token.scss', import.meta.url)), 'utf-8');

// ---- WCAG 2.1 相对亮度 + 对比度 ----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function relLum([r, g, b]) {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(hex1, hex2) {
  const L1 = relLum(hexToRgb(hex1));
  const L2 = relLum(hexToRgb(hex2));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

const INK = '#5c6470';

describe('视觉令牌：可读次要文字对比度', () => {
  it('ink-3 (#5c6470) 在白底上 >= 4.5:1 (报告实测 5.78)', () => {
    expect(contrast(INK, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
  it('ink-3 (#5c6470) 在浅灰底 #f2f3f5 上 >= 4.5:1 (报告实测 5.39)', () => {
    expect(contrast(INK, '#f2f3f5')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('视觉令牌：源码定义锁定', () => {
  it('$t3 / $t4 已收敛为可读次要色 #5c6470（旧值 #86909c / #9a9a9a 不达标）', () => {
    expect(SRC).toContain('$t3: #5c6470;');
    expect(SRC).toContain('$t4: #5c6470;');
  });
  it('$ink-3 别名存在且为 #5c6470', () => {
    expect(SRC).toContain('$ink-3: #5c6470;');
  });
  it('卡片阴影 / 弱描边 token 已暴露为 CSS 变量', () => {
    expect(SRC).toContain('--card-shadow:');
    expect(SRC).toContain('--card-border:');
  });
  it('强调边框已提亮：#c9cdd4 不再使用，改为 #e5e6eb', () => {
    expect(SRC).not.toContain('$border-strong: #c9cdd4;');
    expect(SRC).toContain('$border-strong: #e5e6eb;');
  });
});
