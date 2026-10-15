import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 品牌 5 色链路接通不变量（2026-10-15 修复「设置无效」）：
// distWallet/distPartner/distShareCat/distShareArea/distShareAll 五页曾 brandColor=ref('') 恒空 → hero 永远走 fallback。
// 现统一：brand palette ref + fetchBrandPalette 在 onShow 取值 + heroGradient 三参调用。
const here = import.meta.url;

const PAGES = [
  'distWallet', 'distPartner', 'distShareCat', 'distShareArea', 'distShareAll',
];

function src(name) {
  return readFileSync(fileURLToPath(new URL(`./${name}.vue`, here)), 'utf8');
}

describe('分销/分享各页品牌 5 色接通（恒空 bug 不再复现）', () => {
  for (const p of PAGES) {
    const s = src(p);
    test(`${p}：导入 fetchBrandPalette`, () => {
      expect(s).toContain("import { fetchBrandPalette, useBrandOverride } from '../../utils/brand.js';");
    });
    test(`${p}：brand palette ref（5 色）`, () => {
      expect(s).toContain("const brand = ref({ primary: '', gradient: '', secondary: '', text: '', subText: '' });");
    });
    test(`${p}：heroStyle 走 heroBrandStyle（品牌渐变背景 + 可读性前景统一裁决）`, () => {
      // 🔴 反例（曾踩）：heroStyle 只下发 background，前景由 CSS/SIcon 写死 #fff
      //   → 品牌色一旦是亮黄（#FCB801）就变成白字白图标压黄底，对比度仅 1.67。
      //   统一出口 heroBrandStyle 同时产出 background + color（深浅自动）。
      expect(s).toContain("import { heroBrandStyle } from '../../utils/templateTheme.js';");
      expect(s).toContain('const heroStyle = computed(() => heroBrandStyle(brand.value,');
      // hero 内图标/悬浮导航须吃同一前景（SIcon 不吃 var()，必须喂真实 hex）
      expect(s).toContain('const heroInk = computed(() => heroStyle.value.color);');
      expect(s).not.toContain('color="#ffffff"');
    });
    test(`${p}：onShow 调 loadBrand 取值`, () => {
      expect(s).toContain('loadBrand();');
      expect(s).toContain("const b = await fetchBrandPalette();");
      expect(s).toContain('Object.assign(brand.value, b);');
    });
  }
});
