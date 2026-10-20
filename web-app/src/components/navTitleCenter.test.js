// 自绘导航「标题居中」契约测试
//
// 背景（2026-10-21 用户反馈「很多页面的标题都不是居中的」）：
//   pages.json 里大量页面 navigationStyle:'custom'，标题由三个组件自绘：
//   PageNav / DesignNav / DesignNavEw。它们原本都用 flex「左操作 / 标题 / 右操作 + 右侧
//   胶囊避让」，标题 flex:1 居中 = **按剩余空间居中**。左右两侧留白天然不等宽
//   （左：返回键≈26px；右：整块胶囊区≈94px），标题中心必然偏向返回键一侧，
//   且左右内容越不一样宽偏得越多 —— 这就是用户看到的「不居中」。
//
// 正确口径：**按屏宽居中**（微信原生 navigationBar 的做法）：
//   标题绝对定位覆盖整行（left:0/right:0 参照行的 padding box，天然包含左右 padding，
//   故居中基准 = 行宽 = 屏宽），再用 navTitleSafePad() 的**左右同值** padding 兜住重叠。
// ⚠️ 两侧必须同值：一边大一边小等于把刚才的偏移又写回来。
//
// 本测试同时校验三个组件，防止某一处改回 flex 布局而其余不同步（两端一定会漂移同源问题）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, rel), 'utf-8');

const pageNavSrc = read('./PageNav.vue');
const designNavSrc = read('./DesignNav.vue');
const designNavEwSrc = read('./DesignNavEw.vue');
const metricsSrc = read('../utils/navMetrics.js');

/** 取 <style> 块（scoped）：负向断言必须只针对样式块，否则模板里的同名类名会误命中 */
function styleBlock(src) {
  const m = src.match(/<style[^>]*>([\s\S]*)<\/style>/);
  return m ? m[1] : '';
}

/**
 * 精确取某条 CSS 规则的声明体。
 * 🔴 不能写 /\.cls \{[\s\S]*?xxx/：非贪婪匹配会跨过 `}` 吃到后面无关规则里的声明
 *    （实测 `\.dnew-title \{[\s\S]*?flex: 1;` 命中的其实是 .dnew-search-txt）——
 *    这种正则得到的「通过/失败」都是假的。必须按大括号切到本规则的 `}` 为止。
 */
function cssRule(css, selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close < 0 ? css.length : close);
}

describe('导航标题居中：统一走「屏宽居中」口径', () => {
  test('navMetrics 提供左右对称的安全区（单值，不是左右两份）', () => {
    expect(metricsSrc).toMatch(/export function navTitleSafePad\(\)/);
    // 对称的实证：非小程序端返回单一保守值56；小程序端用 max(胶囊区, 56) 一个值两侧共用
    expect(metricsSrc).toMatch(/if \(!m\.isMp\) return 56;/);
    expect(metricsSrc).toMatch(/Math\.max\(m\.capsuleRightPad \+ m\.capsuleWidth, 56\)/);
  });

  test('PageNav：标题脱离 flex 走绝对定位整行居中 + 对称安全区', () => {
    expect(pageNavSrc).toMatch(/import \{[^}]*navTitleSafePad[^}]*\} from '\.\.\/utils\/navMetrics\.js'/);
    expect(pageNavSrc).toMatch(/class="pnv-title-wrap" :style="titlePadStyle"/);
    expect(pageNavSrc).toMatch(/titlePadStyle\(\) \{\s*\n\s*const pad = navTitleSafePad\(\);/);
    expect(pageNavSrc).toMatch(/padding: '0 ' \+ pad \+ 'px'/);
    // 行要有定位上下文，标题才能以此为包含块
    expect(cssRule(styleBlock(pageNavSrc), '.pnv-bar')).toContain('position: relative');
    expect(cssRule(styleBlock(pageNavSrc), '.pnv-title-wrap')).toContain('position: absolute');
    // 负向：标题不再参与 flex 分份（否则又变成「剩余空间居中」）
    expect(cssRule(styleBlock(pageNavSrc), '.pnv-title-wrap')).not.toContain('flex: 1');
  });

  test('DesignNav：两行标题都绝对居中，centerStyle 下发对称 padding', () => {
    expect(designNavSrc).toMatch(/import \{ getNavMetrics, navTitleSafePad \}/);
    expect(designNavSrc).toMatch(/padding: '0 ' \+ navTitleSafePad\(\) \+ 'px'/);
    expect(cssRule(styleBlock(designNavSrc), '.dn-line')).toContain('position: relative');
    expect(cssRule(styleBlock(designNavSrc), '.dn-title')).toContain('position: absolute');
    expect(cssRule(styleBlock(designNavSrc), '.dn-title')).not.toContain('flex: 1');
    // 两行（content / content2）共用同一套居中绑定
    expect(designNavSrc).toMatch(/class="dn-title" :style="centerStyle\('content'\)"/);
    expect(designNavSrc).toMatch(/class="dn-title" :style="centerStyle\('content2'\)"/);
  });

  test('DesignNavEw：标题绝对居中 + 对称安全区', () => {
    expect(designNavEwSrc).toMatch(/import \{ getNavMetrics, navTitleSafePad \}/);
    expect(designNavEwSrc).toMatch(/class="dnew-title" :style="titlePadStyle"/);
    expect(cssRule(styleBlock(designNavEwSrc), '.dnew-line')).toContain('position: relative');
    expect(cssRule(styleBlock(designNavEwSrc), '.dnew-title')).toContain('position: absolute');
    expect(cssRule(styleBlock(designNavEwSrc), '.dnew-title')).not.toContain('flex: 1');
    // Ew 的标题文本 width:100%（撑满标题层）→ flex 居中失效，必须靠 text-align 真居中
    expect(cssRule(styleBlock(designNavEwSrc), '.dnew-title-text')).toContain('text-align: center');
  });

  test('三处标题容器都不能再写不对称留白（不等宽的左右留白会把偏移重新写回来）', () => {
    // 返回键 ~26px vs 胶囊区 ~94px 的不对称是原病根：标题容器自身不得再写不对称 padding
    expect(cssRule(styleBlock(pageNavSrc), '.pnv-title-wrap')).not.toMatch(/padding:\s*0\s+\d+rpx/);
    expect(cssRule(styleBlock(designNavEwSrc), '.dnew-title')).not.toMatch(/padding:\s*0\s+\d+rpx/);
    expect(cssRule(styleBlock(designNavSrc), '.dn-title')).not.toMatch(/padding:\s*0\s+\d+rpx/);
  });

  test('标题层需点击穿透：长按左/右操作区不被标题层吃掉', () => {
    for (const [name, css] of [
      ['PageNav', styleBlock(pageNavSrc)],
      ['DesignNav', styleBlock(designNavSrc)],
      ['DesignNavEw', styleBlock(designNavEwSrc)],
    ]) {
      const cls = name === 'PageNav' ? '.pnv-title-wrap' : name === 'DesignNav' ? '.dn-title' : '.dnew-title';
      expect(cssRule(css, cls)).toContain('pointer-events: none');
      expect(cssRule(css, cls + ' > *')).toContain('pointer-events: auto');
    }
  });
});
