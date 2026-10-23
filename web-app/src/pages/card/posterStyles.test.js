/**
 * 🔴 回归锁：#312-13 分享海报「①文字叠在一起 ②要多款风格可选」
 *
 * 反馈 → 修法：
 *  1  叠字根因：原 drawPoster 里「经营领域」文字基线 y=285，「需求标签 chips」矩形
 *     y=260..300（文字基线 288）——两行内容画进了同一区间。
 *     修复：绘制逻辑整体迁到 posterStyles.js，每款风格的行 y 区间两两不重叠
 *     （本文件按数值钉死），头部渐变高度 330 → 370。
 *  2  新增 4 款风格（classic 经典商务 / dark 曜石深色 / minimal 极简白 / gradient
 *     渐变全屏），弹层内风格条切换即重绘，选择持久化 cardPosterStyle。
 *  3  画布实例约束（getCurrentInstance 顶层取一次等）由 posterCanvas.test.js 继续把守，
 *     本次重构必须保持不破。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';
import { POSTER_STYLES, drawPosterByStyle } from './posterStyles.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const stylesSrc = () => stripComments(read('./posterStyles.js'));
const myCardSrc = () => stripComments(read('./myCard.vue'));

describe('海报风格注册表', () => {
  test('4 款风格齐全且带中文标签', () => {
    expect(POSTER_STYLES.map((s) => s.key)).toEqual(['classic', 'dark', 'minimal', 'gradient']);
    expect(POSTER_STYLES.map((s) => s.label)).toEqual(['经典商务', '曜石深色', '极简白', '渐变全屏']);
  });

  test('drawPosterByStyle 未知风格回落 classic（不抛错）', () => {
    const calls = [];
    const ctx = new Proxy({}, {
      get(t, prop) {
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        return (...args) => { calls.push([prop, args]); };
      },
      set() { return true; },
    });
    expect(() => drawPosterByStyle(ctx, { card: { name: '张三' }, styleKey: 'nope' })).not.toThrow();
    expect(calls.some(([m]) => m === 'fillRect')).toBe(true);
  });
});

describe('叠字修复：每款风格行 y 区间两两不重叠', () => {
  test('classic：经营领域基线 282 < chips 顶 296（头部高度 370）', () => {
    const s = stylesSrc();
    expect(s).toMatch(/const HEAD_H = 370;/);
    expect(s).toMatch(/drawLine\(ctx, c\.businessField \|\| '', 48, 282,/);
    expect(s).toMatch(/drawChips\(ctx, d\.tags, 48, 296, 40,/);
    // chips 矩形顶 296 必须在经营领域基线 282 之下（留出行距）
    expect(296).toBeGreaterThan(282);
  });

  test('dark：经营领域基线 372 < chips 顶 396；二维码白垫板存在', () => {
    const s = stylesSrc();
    expect(s).toMatch(/drawLine\(ctx, c\.businessField \|\| '', 48, 372,/);
    expect(s).toMatch(/drawChips\(ctx, d\.tags, 48, 396, 40,/);
    expect(s).toMatch(/drawQrPanel\(ctx, qr, W \/ 2 - 170, 500, 340/);
    expect(396).toBeGreaterThan(372);
  });

  test('minimal：经营领域基线 380 < chips 顶 404', () => {
    const s = stylesSrc();
    expect(s).toMatch(/drawLine\(ctx, c\.businessField \|\| '', 48, 380,/);
    expect(s).toMatch(/drawChips\(ctx, d\.tags, 48, 404, 40,/);
    expect(404).toBeGreaterThan(380);
  });

  test('gradient：经营领域基线 444 < chips 顶 470', () => {
    const s = stylesSrc();
    expect(s).toMatch(/drawLine\(ctx, c\.businessField \|\| '', W \/ 2, 444,/);
    expect(s).toMatch(/fillRound\(ctx, tx, 470, tw, 40,/);
    expect(470).toBeGreaterThan(444);
  });

  test('chips 行必须带溢出守卫（fitText 截字 + 超 maxRight 停画），禁止无脑连排', () => {
    const s = stylesSrc();
    expect(s).toMatch(/const label = fitText\(ctx, t, maxRight - tx - padX \* 2 - gap\);/);
    expect(s).toMatch(/if \(tx \+ tw > maxRight\) return;/);
  });
});

describe('myCard 风格选择接入', () => {
  test('导入风格库并暴露给模板', () => {
    const s = myCardSrc();
    expect(s).toMatch(/import \{ POSTER_STYLES, drawPosterByStyle \} from '\.\/posterStyles\.js';/);
    expect(s).toMatch(/const posterStyles = POSTER_STYLES;/);
  });

  test('弹层有风格条（v-for + active 态 + 点击切换）', () => {
    const s = read('./myCard.vue');
    expect(s).toMatch(/v-for="s in posterStyles"/);
    expect(s).toMatch(/:class="\{ active: posterStyleKey === s\.key \}"/);
    expect(s).toMatch(/@click="onPosterStyleChange\(s\.key\)"/);
  });

  test('切换风格走重绘而非重取码，且选择持久化 cardPosterStyle', () => {
    const s = myCardSrc();
    expect(s).toMatch(/function onPosterStyleChange\(k\) \{/);
    expect(s).toMatch(/uni\.setStorageSync\('cardPosterStyle', k\)/);
    expect(s).toMatch(/try \{ posterStyleSaved = uni\.getStorageSync\('cardPosterStyle'\) \|\| 'classic'; \} catch \(e\) \{\}/);
  });

  test('renderPoster 按所选风格绘制（styleKey: posterStyleKey.value）且头像过 absUrl', () => {
    const s = myCardSrc();
    expect(s).toMatch(/styleKey: posterStyleKey\.value/);
    expect(s).toMatch(/loadImage\(canvas, absUrl\(c\.avatar\)\)/);
    expect(s).toMatch(/posterQrData = qrData;/);
    expect(s).toMatch(/posterDrawData = \{ c, primary, gradient, ink \};/);
  });

  test('二维码白垫板只用于深底风格，classic（浅底）直接铺码', () => {
    const s = stylesSrc();
    // classic 用裸 drawImage，dark/gradient 用 drawQrPanel；minimal 二维码画在白底上裸铺
    const classic = s.slice(s.indexOf('function drawClassic'), s.indexOf('function drawDark'));
    expect(classic).toMatch(/ctx\.drawImage\(qr, W \/ 2 - 190, 530, 380, 380\)/);
    expect(classic).not.toMatch(/drawQrPanel/);
  });
});
