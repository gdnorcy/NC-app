import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 客户管理 customers 配色收敛回归锁（2026-10-15 全站配色审计 P1 第三批）。
// 收敛前琥珀系 4 处：header hero 渐变 #ff7d00→#ff9a2e、tag.active 筛选底
// #ff7d00、customer-avatar 头像渐变、fab 渐变+琥珀阴影 rgba(255,125,0,0.4)；
// 根视图无 themeStyle。
// 收敛后：四处统一主题；**状态机四态（待跟进琥珀/跟进中蓝/已成交绿/已流失灰）
// 是真实业务状态，保留语义色不跟随主题**；follow-dot 待跟进红点保留。
//
// 锁：① 琥珀系清零；② hero/tag/头像/fab 必须主题；③ 状态四态与
//     follow-dot 语义保留；④ 根视图绑 themeStyle。

const here = import.meta.url;
const CUSTOMERS = fileURLToPath(new URL('./customers.vue', here));

const src = readFileSync(CUSTOMERS, 'utf8');

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
function styleNoComments(s) {
  return styleBlock(s).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('customers 琥珀系清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#ff9a2e', 'rgba(255,125,0', 'rgba(255, 125, 0'];
  test(`样式区禁琥珀渐变/阴影：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('#ff7d00 仅允许出现在语义位 status-tag.pending（待跟进状态）', () => {
    const hits = (css().match(/#ff7d00|var\(--brand-orange\)/g) || []).length;
    expect(hits, `#ff7d00 应仅 1 处（status-tag.pending），实际 ${hits}`).toBe(1);
    expect(ruleBlock(src, '.status-tag.pending')).toMatch(/#ff7d00|var\(--brand-orange\)/);
  });
});

describe('customers 平台 UI 强调位归主题', () => {
  test('header hero 用主题渐变', () => {
    expect(ruleBlock(src, '.header')).toContain('linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))');
  });
  test('筛选激活 tag.active 用主题色', () => {
    expect(ruleBlock(src, '.tag.active')).toContain('background: var(--design-primary);');
  });
  test('客户头像用主题渐变', () => {
    expect(ruleBlock(src, '.customer-avatar')).toContain('linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))');
  });
  test('FAB 用主题渐变 + 主题阴影', () => {
    const block = ruleBlock(src, '.fab');
    expect(block).toContain('linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))');
    expect(block).toContain('rgba(var(--design-primary-rgb, 22, 93, 255), 0.4)');
  });
  test('根视图绑 themeStyle + brandVars + brandInkVars（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="customers-page" :style="\[themeStyle, brandVars, brandInkVars\]">/);
    expect(src).toContain('const themeStyle = useDesignTheme();');
  });
});

describe('customers 语义色与中性保留', () => {
  test('状态机四态保留（真实业务状态，不跟随主题）', () => {
    expect(ruleBlock(src, '.status-tag.pending')).toContain('#fff7e6');
    expect(ruleBlock(src, '.status-tag.pending')).toMatch(/#ff7d00|var\(--brand-orange\)/);
    expect(ruleBlock(src, '.status-tag.following')).toContain('#e8f3ff');
    expect(ruleBlock(src, '.status-tag.following')).toMatch(/#165dff|var\(--primary\)/);
    expect(ruleBlock(src, '.status-tag.converted')).toContain('#e8ffea');
    expect(ruleBlock(src, '.status-tag.converted')).toContain('#00b42a');
    expect(ruleBlock(src, '.status-tag.lost')).toMatch(/#f2f3f5|var\(--bg-hover\)/);
  });
  test('follow-dot 待跟进红点保留语义红 #f5222d', () => {
    expect(ruleBlock(src, '.follow-dot')).toContain('#f5222d');
  });
  test('中性承载保留（#c9cdd4/#4e5969/#1d2129/#f2f3f5/#f7f8fa）', () => {
    for (const c of ['#c9cdd4', '#4e5969', '#1d2129', '#f2f3f5', '#f7f8fa']) {
      expect(src, `中性色 ${c} 应保留`).toMatch(new RegExp(c + '|var\\(--[a-z0-9-]+\\)'));
    }
    // 2026-10-16 方案 A：两处 SIcon 原 #86909c / #c9cdd4 → ICON_DECOR 令牌
    // （SIcon 的 color 不能吃 var()，会被烘焙进 SVG data-URI / 构建期 PNG）
    expect(src).toContain(':color="ICON_DECOR"');
  });
});
