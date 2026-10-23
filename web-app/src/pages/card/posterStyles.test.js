/**
 * 🔴 回归锁：#312-15 分享海报重构（删旧 4 款、换 5 款候选 v2）
 *
 * 关键不变量：
 *  1  风格注册表 = [cream, misty, sakura, mint, obsidian]（用户选的 5 款，原 4 款删除）。
 *  2  名片不显示地区（东莞）：infoLine 只返回 company，全文不得出现 c.city。
 *  3  cream / obsidian 顶部横线已去除（不得再 drawImage/fillRect 顶部小杠）。
 *  4  电话改用高亮胶囊条 phonePill（不再有 footerPhone 页脚小灰字）。
 *  5  行 y 区间两两不重叠（钉死常量顺序）。
 *  6  chips 必须带溢出守卫。
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

describe('海报风格注册表（#312-15：5 款候选 v2，原 4 款删除）', () => {
  test('5 款风格齐全且带中文标签', () => {
    expect(POSTER_STYLES.map((s) => s.key)).toEqual(['cream', 'misty', 'sakura', 'mint', 'obsidian']);
    expect(POSTER_STYLES.map((s) => s.label)).toEqual(['奶油暖白', '晨雾蓝', '樱粉柔光', '薄荷清新', '曜石黑金']);
  });

  test('旧 4 款 classic/dark/minimal/gradient 已彻底移除', () => {
    const s = stylesSrc();
    expect(s).not.toMatch(/function drawClassic/);
    expect(s).not.toMatch(/function drawDark/);
    expect(s).not.toMatch(/function drawMinimal/);
    expect(s).not.toMatch(/function drawGradient/);
    expect(s).not.toMatch(/drawClassic: drawClassic/);
  });

  test('drawPosterByStyle 未知风格回落 cream（不抛错）', () => {
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

describe('#312-15 名片不显示地区（东莞）+ 顶部横线去除 + 电话胶囊条', () => {
  test('infoLine 只返回公司，全文不得出现 c.city', () => {
    const s = stylesSrc();
    expect(s).not.toMatch(/c\.city/);
    expect(s).toMatch(/function infoLine\(c\) \{\s*return c\.company \|\| '';\s*\}/);
  });

  test('cream 顶部横线（原 fillRound 顶杠）已去除，仅保留阴影白卡', () => {
    const s = stylesSrc();
    const cream = s.slice(s.indexOf('function drawCream'), s.indexOf('function drawMisty'));
    expect(cream).not.toMatch(/fillRound\(ctx, 50, 90, W - 100, 16, 8, '#B08968'\)/);
    expect(cream).toMatch(/fillRound\(ctx, 50, 90, W - 100, 840, 36, '#FFFFFF'\)/);
  });

  test('obsidian 顶部小金杠 fillRect(48, 96, 60, 8) 已去除，保留右上光晕', () => {
    const s = stylesSrc();
    const obsidian = s.slice(s.indexOf('function drawObsidian'), s.indexOf('const DRAWERS'));
    expect(obsidian).not.toMatch(/fillRect\(48, 96, 60, 8\)/);
    expect(obsidian).toMatch(/arc\(550, 40, 240/);
  });

  test('电话用高亮胶囊条 phonePill，footerPhone 已删除', () => {
    const s = stylesSrc();
    expect(s).toMatch(/function phonePill\(/);
    expect(s).not.toMatch(/function footerPhone/);
    expect(s).toMatch(/phonePill\(ctx, c, \{/);
  });
});

describe('叠字修复：每行 y 区间两两不重叠（钉死常量顺序）', () => {
  test('共用纵向节奏常量顺序正确', () => {
    const s = stylesSrc();
    expect(s).toMatch(/const NAME_Y = 360, POS_Y = 414, ORG_Y = 458, FIELD_Y = 502, CHIPS_Y = 530, PILL_Y = 606, QR_Y = 696/);
    expect(502).toBeLessThan(530);
    expect(530 + 40).toBeLessThan(606);
    expect(606 + 56).toBeLessThan(696);
  });

  test('cream/mint 走 bodyCard：文本与 chips/胶囊/二维码各行不重叠', () => {
    const s = stylesSrc();
    const body = s.slice(s.indexOf('function bodyCard'), s.indexOf('function drawCream'));
    // 领域 FIELD_Y=502 < chips CHIPS_Y=530；chips 540 末 < 胶囊 PILL_Y=606
    expect(body).toMatch(/drawLine\(ctx, c\.businessField \|\| '', X, FIELD_Y,/);
    expect(body).toMatch(/drawChips\(ctx, tags, X, CHIPS_Y, 40,/);
    expect(body).toMatch(/phonePill\(ctx, c, \{ x: X, y: PILL_Y,/);
    expect(body).toMatch(/qrWithGuide\(ctx, d, t, X, QR_Y, 200,/);
  });

  test('obsidian 各行不重叠（领域460 < chips492 < 胶囊562 < 二维码650）', () => {
    const s = stylesSrc();
    const obsidian = s.slice(s.indexOf('function drawObsidian'), s.indexOf('const DRAWERS'));
    expect(obsidian).toMatch(/drawLine\(ctx, c\.businessField \|\| '', 48, 460,/);
    expect(obsidian).toMatch(/drawChips\(ctx, tags, 48, 492, 40,/);
    expect(obsidian).toMatch(/phonePill\(ctx, c, \{ x: 48, y: 562,/);
    expect(obsidian).toMatch(/drawQrPanel\(ctx, qr, 48, 650, 280, 24, 22\)/);
    expect(492).toBeLessThan(562);
    expect(562 + 56).toBeLessThan(650);
  });

  test('chips 行必须带溢出守卫（fitText 截字 + 超 maxRight 停画），禁止无脑连排', () => {
    const s = stylesSrc();
    expect(s).toMatch(/const label = fitText\(ctx, t, maxRight - tx - padX \* 2 - gap\);/);
    expect(s).toMatch(/if \(tx \+ tw > maxRight\) return;/);
  });
});

describe('myCard 风格选择接入（#312-15 折叠+横滑轮播，仿动态）', () => {
  test('导入风格库并暴露给模板', () => {
    const s = myCardSrc();
    expect(s).toMatch(/import \{ POSTER_STYLES, drawPosterByStyle \} from '\.\/posterStyles\.js';/);
    expect(s).toMatch(/const posterStyles = POSTER_STYLES;/);
  });

  test('风格选择器是 swiper 折叠轮播（非旧 scroll-view 文本条）', () => {
    const s = read('./myCard.vue');
    expect(s).toMatch(/class="ps-swiper"/);
    expect(s).toMatch(/:current="currentStyleIndex"/);
    expect(s).toMatch(/@change="onPosterSwipe"/);
    expect(s).toMatch(/v-for="s in posterStyles"/);
    expect(s).toMatch(/:class="\{ active: posterStyleKey === s\.key \}"/);
    expect(s).toMatch(/@click="onPosterStyleChange\(s\.key\)"/);
  });

  test('swiper 使用折叠态 .sw-item（active 归位、非 active 缩进探出）', () => {
    const s = myCardSrc();
    expect(s).toMatch(/\.sw-item \{/);
    expect(s).toMatch(/transform: translateX\(-30%\) scale\(0\.92\)/);
    expect(s).toMatch(/\.sw-item\.active \{ transform: translateX\(0\) scale\(1\)/);
  });

  test('🔴 滑块必须是竖版小卡片（previous/next-margin≈半宽 180rpx）——真机反馈：margin 过小会把竖版海报裁成中间一条放大的糊脸大图', () => {
    const s = read('./myCard.vue');
    expect(s).toMatch(/previous-margin="180rpx"/);
    expect(s).toMatch(/next-margin="180rpx"/);
    expect(s).toMatch(/\.ps-swiper \{ margin-top: 20rpx; width: 100%; height: 500rpx; \}/);
  });

  test('onPosterSwipe 切换风格并触发缩略图渲染', () => {
    const s = myCardSrc();
    expect(s).toMatch(/function onPosterSwipe\(e\) \{/);
    expect(s).toMatch(/function buildPosterThumbs\(\) \{/);
    expect(s).toMatch(/buildPosterThumbs\(\);/);
  });

  test('切换风格走重绘而非重取码，且选择持久化 cardPosterStyle（默认 cream）', () => {
    const s = myCardSrc();
    expect(s).toMatch(/function onPosterStyleChange\(k\) \{/);
    expect(s).toMatch(/uni\.setStorageSync\('cardPosterStyle', k\)/);
    expect(s).toMatch(/try \{ posterStyleSaved = uni\.getStorageSync\('cardPosterStyle'\) \|\| 'cream'; \} catch \(e\) \{\}/);
  });

  test('renderPoster 按所选风格绘制（styleKey: posterStyleKey.value）且头像过 absUrl', () => {
    const s = myCardSrc();
    expect(s).toMatch(/styleKey: posterStyleKey\.value/);
    expect(s).toMatch(/loadImage\(canvas, absUrl\(c\.avatar\)\)/);
    expect(s).toMatch(/posterQrData = qrData;/);
    expect(s).toMatch(/posterDrawData = \{ c, primary, gradient, ink \};/);
  });
});
