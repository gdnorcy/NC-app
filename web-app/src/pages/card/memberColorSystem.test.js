import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 会员中心 member 配色收敛回归锁（2026-10-14 全站配色审计第五批，P0 收尾）。
// 本页背景：myCard/home/cardDetail/market 四页收敛后，member 大部分位早已主题化
// （提交 10acd56 起等级色就被用户主动改成主题色——「等级色保留」在本页无对应物），
// 残留三处漂移：① themeColor 喂 SIcon 吃 --design-subtext（租户可配文字辅色，
// 配了图标色就与其他四页不一致）；② hero/cardBg 兜底还是 demo g3 青绿渐变
// （#0f766e/#14b8a6/#2f6bff/#5b8cff），与品牌蓝系兜底惯例不符。
// 收敛后：单一主题色 + 中性承载 + 语义三态（待审/通过/驳回）克制。
//
// 锁：① demo 青绿/蓝兜底清零；② themeColor 必须 --design-primary；
//     ③ CTA/选中/徽章/卡片全部主题位；④ 语义三态与中性保留；
//     ⑤ 根视图绑 themeStyle；⑥ 租户 levelBgColor（被展示对象）优先级不动。

const here = import.meta.url;
const MEMBER = fileURLToPath(new URL('./member.vue', here));

const src = readFileSync(MEMBER, 'utf8');

// 从 <style> 块提取单条规则（注释里的历史色值说明不参与断言）
function styleBlock(s) {
  const m = s.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}
function ruleBlock(s, sel) {
  const css = styleBlock(s);
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}');
  const m = css.match(re);
  return m ? m[0] : '';
}

// 剥离 CSS 注释后的样式文本（防注释里的「收敛前 #xxxxxx」历史说明误伤）
function styleNoComments(s) {
  return styleBlock(s).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('member demo 遗留兜底色清零', () => {
  const css = () => styleNoComments(src);
  // demo g3 青绿渐变 + 旧会员卡默认蓝（均非品牌蓝系）
  const banned = ['#0f766e', '#14b8a6', '#2f6bff', '#5b8cff'];
  test(`样式区禁 demo 兜底色：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('脚本区禁 demo 兜底色（heroStyle/cardBg fallback 已改品牌蓝系）', () => {
    for (const c of banned) {
      expect(src, `脚本区不得残留 ${c}`).not.toContain(c);
    }
  });
  test('hero CSS 兜底与内联一致：--design-primary 回落品牌蓝 #165dff', () => {
    expect(ruleBlock(src, '.hero.g3')).toContain('var(--design-primary, #165dff), var(--design-gradient, #4080ff)');
  });
  test('禁 --primary / --primary-deep / --theme-tint 漂移令牌', () => {
    expect(css()).not.toMatch(/var\(--primary[,)]/);
    expect(css()).not.toContain('--primary-deep');
    expect(css()).not.toContain('--theme-tint');
    expect(css()).not.toContain('rgba(22,93,255');
    expect(css()).not.toContain('rgba(22, 93, 255');
  });
});

describe('member themeColor 与其余四页对齐', () => {
  test('themeColor 吃 --design-primary（勿回退 --design-subtext：租户可配文字辅色会漂移）', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
  test('根视图绑 themeStyle（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="member-page" :style="\[navVars, themeStyle, brandVars\]">/);
  });
});

describe('member 平台 UI 强调位归主题', () => {
  const themed = [
    '.btn.buy',        // 套餐购买 CTA（整页唯一强 CTA）
    '.btn.on',         // 当前套餐态
    '.price',          // 价格
    '.cur-tag',        // 「· 当前」标签
    '.hot-tag',        // 最受欢迎角标（实底白字）
    '.plan.hot',       // 金牌套餐边框（用户 10acd56 主动改主题色）
    '.plan.sel',       // 点选高亮
    '.sign-btn',       // 签到 CTA
    '.tlv-btn.buy',    // 租户等级购买
    '.tlv.cur',        // 当前租户等级
    '.tlv-no',         // Lv 徽章
    '.dist-entry',     // 分销入口卡
    '.de-icon',        // 分销图标底
  ];
  for (const sel of themed) {
    test(`${sel} 用主题变量`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toMatch(/var\(--design-(primary|secondary)/);
    });
  }
  test('plan 选中/热门阴影用主题 rgb（禁硬编码 rgba）', () => {
    expect(ruleBlock(src, '.plan.hot')).toContain('rgba(var(--design-primary-rgb');
    expect(ruleBlock(src, '.plan.sel')).toContain('rgba(var(--design-primary-rgb');
  });
  test('tcard 阴影用主题 rgb', () => {
    expect(ruleBlock(src, '.tcard')).toContain('rgba(var(--design-primary-rgb');
  });
  test('tlv-btn.apply 次级样式（辅助底+主色字+主题描边）', () => {
    const block = ruleBlock(src, '.tlv-btn.apply');
    expect(block).toContain('var(--design-secondary)');
    expect(block).toContain('var(--design-primary)');
    expect(block).toContain('rgba(var(--design-primary-rgb');
  });
});

describe('member 语义色与中性保留', () => {
  test('申请状态三态保留语义色（待审琥珀/通过绿/驳回红）', () => {
    const pending = ruleBlock(src, '.apply-tip.st-pending');
    expect(pending).toContain('#fff7e6');
    expect(pending).toContain('#ad6800');
    const approved = ruleBlock(src, '.apply-tip.st-approved');
    expect(approved).toContain('#e7f7ee');
    expect(approved).toContain('#07893c');
    const rejected = ruleBlock(src, '.apply-tip.st-rejected');
    expect(rejected).toContain('#fdecec');
    expect(rejected).toContain('#b42318');
  });
  test('中性工具色 #5b5b5b 保留（权益列表正文）', () => {
    expect(src).toContain('#5b5b5b');
  });
  test('hero/tcard 白装饰保留（rgba(255,255,255 在深色渐变卡上）', () => {
    expect(src).toContain('rgba(255,255,255,0.18)');
    expect(src).toContain('rgba(255,255,255,0.12)');
  });
  test('hero 白色图标保留（back / crown 在主题渐变上）', () => {
    expect(src).toContain('color="#ffffff"');
  });
});

describe('member 被展示对象不动', () => {
  test('租户会员卡 levelBgColor 优先（租户自配等级色=被展示对象）', () => {
    expect(src).toContain('if (c && c.levelBgColor) return { background: c.levelBgColor };');
  });
  test('hero 品牌 5 色 heroGradient(brand.value.primary, brand.value.gradient) 优先链路保留', () => {
    expect(src).toContain('heroGradient(brand.value.primary, brand.value.gradient');
  });
});
