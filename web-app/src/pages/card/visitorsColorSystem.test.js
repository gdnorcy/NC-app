import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 访客雷达 visitors 配色收敛回归锁（2026-10-15 全站配色审计 P1 第二批）。
// 收敛前是微信绿重灾区：6 处 SIcon 硬编码 #07c160（锁/权益/统计图标）、
// lock-icon/v-act/lead-ai/lead-rank.hot 四处 rgba(7,193,96) tint、btn-main 主 CTA
// 微信绿底、v-av 兜底 #e7f7ee、rstat .sub 文字 --success；另有硬编码品牌蓝
// #165DFF（峰值柱）/ #2e6bb8（tl-dot.blue/v-tag.blue/btn-main.blue）/
// #e9f1fb（v-tag.blue 底）/ rgba(22,93,255)（tbar-fill/lead-lv.blue）；
// 且全页无 themeStyle/themeColor（--design-* 一个都没消费）。
// 收敛后：单一主题色（CTA/图表/徽章/操作钮/图标）+ 语义绿仅成果态
// （高意向/已交换名片/交换名片时间线）+ 中性承载。
//
// 锁：① 微信绿与硬编码蓝清零（语义绿 v-tag.green 保留除外）；
//     ② themeStyle/themeColor 接入；③ 平台强调位必须 --design-primary；
//     ④ 语义绿/未读红/中性保留；⑤ 后端 tagColor/levelColor 内联不动。

const here = import.meta.url;
const VISITORS = fileURLToPath(new URL('./visitors.vue', here));

const src = readFileSync(VISITORS, 'utf8');

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

describe('visitors 微信绿与硬编码蓝清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#07c160', 'rgba(7, 193, 96', '#e9f1fb', '#2e6bb8', '#165DFF', 'rgba(22, 93, 255', 'rgba(22,93,255'];
  test(`样式区禁微信绿/硬编码蓝：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('#e7f7ee 仅允许出现在语义位 v-tag.green（成果态）', () => {
    const hits = css().split('#e7f7ee').length - 1;
    expect(hits, `#e7f7ee 应仅 1 处（v-tag.green），实际 ${hits}`).toBe(1);
    expect(ruleBlock(src, '.v-tag.green')).toContain('#e7f7ee');
  });
  test('rgba(7,193,96 无空格变体仅允许出现在语义位 lead-lv.green', () => {
    const hits = css().split('rgba(7,193,96').length - 1;
    expect(hits, `rgba(7,193,96 应仅 1 处（lead-lv.green），实际 ${hits}`).toBe(1);
    expect(ruleBlock(src, '.lead-lv.green')).toContain('rgba(7,193,96,.1)');
  });
  test('模板区禁 SIcon 硬编码微信绿', () => {
    expect(src).not.toContain('color="#07c160"');
    expect(src.match(/:color="themeColor"/g) || [], '应为 6 处 SIcon 绑 themeColor').toHaveLength(6);
  });
  test('禁 --primary / --primary-deep / --theme-tint 漂移令牌', () => {
    expect(css()).not.toMatch(/var\(--primary[,)]/);
    expect(css()).not.toContain('--primary-deep');
    expect(css()).not.toContain('--theme-tint');
  });
});

describe('visitors 主题注入', () => {
  test('themeColor computed 存在且吃 --design-primary', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
  test('根视图绑 themeStyle + brandVars + tabBarPad（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="radar-page" :style="\[themeStyle, brandVars, tabBarPad\]">/);
  });
});

describe('visitors 平台 UI 强调位归主题', () => {
  const themed = [
    '.btn-main',        // 主 CTA（立即解锁/转为客户/保存并转为客户）
    '.btn-main.blue',   // 弹层次要钮（次级样式）
    '.tbar-fill',       // 趋势柱
    '.tbar-fill.hot',   // 峰值柱
    '.v-act .btn',      // 访客行「转为客户」操作钮
    '.v-tag.blue',      // 行为标签（观看视频）
    '.lead-ai',         // AI 意向报告徽章
    '.lead-rank.hot',   // Top3 排名装饰
    '.lead-lv.blue',    // 中意向等级
    '.li-dot.blue',     // 意向详情行为圆点
    '.tl-dot.blue',     // 时间线行为圆点
    '.lock-icon',       // 锁定页雷达图标底
    '.rstat .sub',      // 统计卡副文
    '.v-av',            // 访客头像兜底（tagColor 内联优先）
  ];
  for (const sel of themed) {
    test(`${sel} 用主题变量`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toMatch(/var\(--design-(primary|secondary|primary-rgb|text)/);
    });
  }
  test('主 CTA 实底主题色白字，次级钮 secondary 底主色字（唯一强 CTA 原则）', () => {
    expect(ruleBlock(src, '.btn-main')).toContain('background: var(--design-primary);');
    expect(ruleBlock(src, '.btn-main')).toContain('color: var(--design-text, #fff);');
    const blue = ruleBlock(src, '.btn-main.blue');
    expect(blue).toContain('var(--design-secondary)');
    expect(blue).toContain('var(--design-primary)');
  });
});

describe('visitors 语义色与中性保留', () => {
  test('成果态语义绿保留：v-tag.green / lead-lv.green / tl-dot.green / li-dot.green', () => {
    const green = ruleBlock(src, '.v-tag.green');
    expect(green).toContain('#e7f7ee');
    expect(green).toContain('#0b8f4a');
    expect(ruleBlock(src, '.lead-lv.green')).toContain('var(--success)');
    expect(ruleBlock(src, '.tl-dot.green')).toContain('var(--success)');
    expect(ruleBlock(src, '.li-dot.green')).toContain('var(--success)');
  });
  test('未读红点保留语义红 #ff4d4f', () => {
    expect(ruleBlock(src, '.v-av .red')).toContain('#ff4d4f');
  });
  test('低意向灰与中性承载保留', () => {
    expect(ruleBlock(src, '.lead-lv.gray')).toContain('var(--bg-hover)');
    for (const c of ['#5b5b5b', '#c9cdd3', '#4E5969', '#1D2129', '#f0f0f0']) {
      expect(src, `中性色 ${c} 应保留`).toMatch(new RegExp(c + '|var\\(--[a-z0-9-]+\\)'));
    }
    // 2026-10-16 方案 A：空态大图标原 #c9cdd4 → ICON_DECOR 令牌
    // （SIcon 的 color 不能吃 var()，会被烘焙进 SVG data-URI / 构建期 PNG）
    expect(src).toContain(':color="ICON_DECOR"');
  });
  test('时间线/意向详情白图标保留（color="#ffffff" 在彩色圆点上）', () => {
    expect(src.match(/color="#ffffff"/g) || []).toHaveLength(2);
  });
});

describe('visitors 被展示对象不动', () => {
  test('后端下发的 tagColor/levelColor 内联优先（头像底/等级分色）', () => {
    expect(src).toContain(":style=\"{ background: v.tagColor + '22', color: v.tagColor }\"");
    expect(src).toContain(":style=\"{ color: v.levelColor }\"");
  });
});
