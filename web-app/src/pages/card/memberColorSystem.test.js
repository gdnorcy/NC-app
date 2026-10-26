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
// 1b 更新（购买路径收敛）：A 区「选择套餐」（plan-grid/plan/price/btn 系列）整体下线，
// 购买统一走租户等级 tlv 系列，主题位断言随之改钉 tlv/sign/dist。
//
// 1c 更新（2026-10-27 职责重划）：签到迁个人中心、分销入口收敛个人中心、
// 租户等级改横向档位条 → 主题位断言改钉 tlv-chip/td-no/tlv-detail，
// 并加一条「已迁走元素不得残留」的反向锁（防重复入口复辟）。
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
  test('根视图绑 themeStyle + brandVars + tabBarPad（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="member-page" :style="\[navVars, themeStyle, brandVars, tabBarPad\]">/);
  });
});

describe('member 平台 UI 强调位归主题', () => {
  // 🔴 2026-10-27 职责重划后本页元素有增删：
  //    删：.sign-btn（签到迁个人中心）/.tlv.cur/.tlv-no（纵向大卡改横向档位条）/
  //        .dist-entry/.de-icon（分销入口收敛到个人中心）
  //    增：.tlv-chip.cur（选中档位）/.tlv-detail（选中档详情卡）/.td-no（Lv 徽章）
  // 锁跟着实际结构走 —— 断言仍指向"主题位"，元素名随本次重构更新。
  const themed = [
    '.tlv-btn.buy',    // 租户等级购买（整页唯一强 CTA）
    '.tlv-chip.cur',   // 横向档位条当前选中档
    '.td-no',          // Lv 徽章
  ];
  for (const sel of themed) {
    test(`${sel} 用主题变量`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toMatch(/var\(--design-(primary|secondary)/);
    });
  }
  test('.tlv-detail 选中档详情卡走中性面（白卡 + 主题描边，不做主题色块）', () => {
    const block = ruleBlock(src, '.tlv-detail');
    expect(block).toContain('var(--white)');
    expect(block).toContain('var(--border)');
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
  test('🔴 已迁走/已删除的元素不得残留在本页（防重复入口复辟）', () => {
    // 签到 → 个人中心；分销入口 → 个人中心；纵向大卡 → 横向档位条
    // ⚠️ 只查「样式块（剥注释）+ 脚本区（剥注释）」：注释里会写"已删除 xxx"，
    //    直接对整份 src 做 toContain 会把自己的注释判为残留。
    const css = styleNoComments(src);
    const js = src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(css).not.toContain('.sign-btn');
    expect(css).not.toContain('.sign-row');
    expect(css).not.toContain('.dist-entry');
    expect(js).not.toContain('class="sign-row"');
    expect(js).not.toContain('class="dist-entry"');
    expect(js).not.toContain('goDistribution');
    expect(js).not.toContain('class="tlv"');
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
    expect(src).toMatch(/#5b5b5b|var\(--t2\)/);
  });
  test('hero/tcard 白装饰保留（rgba(255,255,255 在深色渐变卡上）', () => {
    // 注：原 .hero-badge 的 0.18 随英文等级徽章删除（2026-10-16 去重），
    // hero 徽章位不再有白装饰；tcard 权益图标底 0.12 保留
    expect(src).toContain('rgba(255,255,255,0.12)');
  });
  test('hero 图标改吃 heroInk（back）：品牌亮黄时自动转深灰，不留白图标', () => {
    // 🔴 反例（真机截图报修）：SIcon color="#ffffff" 写死 → 白图标压在 #FCB801 亮黄 hero 上消失
    // 2026-10-21 换行修复：返回键改由 PageNav 承担（与 create/cardDetail 同方案），heroInk 仍喂 PageNav color
    expect(src).not.toContain('color="#ffffff"');
    expect(src).toContain('const heroInk = computed(() => heroStyle.value.color);');
    expect(src).toContain('<PageNav title="会员中心" back bg="transparent" :color="heroInk" font-size="30rpx" />');
  });
});

describe('member 被展示对象不动', () => {
  test('租户会员卡 levelBgColor 优先（租户自配等级色=被展示对象）', () => {
    expect(src).toContain('if (c && c.levelBgColor) return { background: c.levelBgColor };');
  });
  test('hero 品牌 5 色链路保留（heroBrandStyle：渐变背景 + 可读性前景统一产出）', () => {
    expect(src).toContain("import { heroBrandStyle } from '../../utils/templateTheme.js';");
    expect(src).toContain("const heroStyle = computed(() => heroBrandStyle(brand.value, 'linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))'));");
  });
});
