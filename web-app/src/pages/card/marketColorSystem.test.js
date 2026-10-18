import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 人脉集市 market 配色收敛回归锁（2026-10-14 全站配色审计第四批，P0）。
// 集市页收敛前是全场最杂：一页 8 种色相（主题青 hero / 微信绿 CTA+Tab+开关 /
// 藏蓝徽章+头像+公告 / 紫企业头像 / 琥珀需求标签 / 红置顶+红点 / 中性灰）。
// 收敛后：单一主题色（含 hero/CTA/Tab/筛选/头像/徽章）+ 语义红仅两处 + 中性承载。
//
// 锁：① 装饰位禁微信绿 #07c160 / 藏蓝 #1d4e8f / 紫 #7c3aed / 琥珀 #f59e0b 及其底色；
//     ② CTA/Tab/筛选/头像/徽章必须 --design-primary；③ 语义色克制（红点/置顶/已完成置灰）；
//     ④ 根视图绑 themeStyle + switch 绑 themeColor（prop 不吃 var()）。

const here = import.meta.url;
const MARKET = fileURLToPath(new URL('./market.vue', here));

const src = readFileSync(MARKET, 'utf8');

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

describe('market 装饰性杂色清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#07c160', '#1d4e8f', '#7c3aed', '#f59e0b', '#fef3e2', '#e9f1fb', '#2e6bb8', '#9d5cff', '#2fd47d', '#e6f9ef', '#f3eeff'];
  test(`样式区禁杂色：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('禁 --primary / --success 装饰位令牌', () => {
    expect(css()).not.toMatch(/var\(--primary[,)]/);
    expect(css()).not.toContain('var(--success)');
  });
  test('switch 不再硬编码微信绿，改绑 themeColor', () => {
    expect(src).toContain(':color="themeColor"');
    expect(src).not.toContain('color="#07c160"');
  });
});

describe('market 平台 UI 强调位归主题', () => {
  const themed = [
    '.filter-chip.on',           // 筛选激活
    '.filter-chip.has-need.on',  // 有需求筛选激活
    '.sc-pill.on',               // 同城 pill 激活
    '.badge-new',                // 新徽章
    '.rank-no.top',              // 排行榜 Top
    '.m-exchange',               // 主列表交换 CTA
    '.b-exchange',               // 横幅卡交换 CTA
    '.exchange-btn',             // 折叠面板交换 CTA
    '.c-tab.on',                 // Tab 激活文字
    '.notice-text',              // 公告文字
  ];
  for (const sel of themed) {
    test(`${sel} 用 --design-primary`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('var(--design-primary');
    });
  }
  test('Tab 激活下划线 ::after 用 --design-primary', () => {
    const block = ruleBlock(src, '.c-tab.on::after');
    expect(block).toContain('var(--design-primary');
  });

  test('身份头像三分统一主题渐变（个人/企业/员工不再蓝紫绿三色相）', () => {
    for (const sel of ['.avatar-individual', '.avatar-enterprise', '.avatar-employee']) {
      const block = ruleBlock(src, sel);
      expect(block).toContain('var(--design-primary, #165dff), var(--design-gradient, #4080ff)');
    }
  });
  test('身份类型徽章三分统一主题 tint', () => {
    for (const sel of ['.type-individual', '.type-enterprise', '.type-employee']) {
      const block = ruleBlock(src, sel);
      expect(block).toContain('rgba(var(--design-primary-rgb');
      expect(block).toContain('var(--design-primary, #165dff)');
    }
  });
  test('需求标签（need-tag/tag-need）主题 tint，不再是琥珀', () => {
    for (const sel of ['.need-tag', '.tag-need']) {
      const block = ruleBlock(src, sel);
      expect(block).toContain('rgba(var(--design-primary-rgb');
      expect(block).toContain('var(--design-primary, #165dff)');
    }
  });
  test('公告条底/表单类底色用主题 rgb（禁硬编码 rgba(22,93,255）', () => {
    expect(ruleBlock(src, '.notice-bar')).toContain('rgba(var(--design-primary-rgb');
    expect(styleNoComments(src)).not.toContain('rgba(22,93,255');
    expect(styleNoComments(src)).not.toContain('rgba(22, 93, 255');
  });
});

describe('market 语义色与中性保留', () => {
  test('未读红点与置顶徽章保留语义红 #ff4d4f', () => {
    expect(ruleBlock(src, '.red-dot')).toContain('#ff4d4f');
    expect(ruleBlock(src, '.badge-top')).toContain('#ff4d4f');
  });
  test('已完成态置灰 #9a9a9a 保留（交换完成是真实状态）', () => {
    expect(ruleBlock(src, '.m-exchange.done')).toMatch(/#9a9a9a|var\(--decor-2\)/);
    expect(ruleBlock(src, '.exchange-btn.done')).toMatch(/#9a9a9a|var\(--decor-2\)/);
  });
  test('中性工具色保留（#9a9a9a/#5b5b5b/#1a1a1a + SIcon 走 ICON_DECOR 令牌）', () => {
    expect(src).toMatch(/#9a9a9a|var\(--decor-2\)/);
    expect(src).toMatch(/#5b5b5b|var\(--t2\)/);
    expect(src).toMatch(/#1a1a1a|var\(--t5\)/);
    // 2026-10-16 方案 A：两处 SIcon 原 #9a9a9a / #c9cdd4 → ICON_DECOR 令牌
    // （SIcon 的 color 不能吃 var()，会被烘焙进 SVG data-URI / 构建期 PNG）
    expect(src).toContain(':color="ICON_DECOR"');
  });
  test('根视图绑 themeStyle + brandVars + tabBarPad + brandInkVars（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="market-page" :style="\[themeStyle, brandVars, tabBarPad, brandInkVars\]">/);
  });
  test('themeColor computed 存在且兜底 #165dff', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
});

// 2026-10-22 用户报修：导航栏右上角「交换请求/人脉库」两枚图标太挤、容易点错，
// 方案：下沉到搜索框内右侧（保留未读红点）。此处钉住布局归属，防止又被搬回导航栏。
describe('market 图标下沉到搜索框（修「顶部太拥挤易点错」）', () => {
  test('PageNav 不再带 #right 插槽，旧 .nav-right/.nav-icon 样式死代码已删', () => {
    expect(src).not.toMatch(/<template #right>/);
    expect(src).not.toMatch(/class="nav-right"/);
    expect(src).not.toMatch(/class="nav-icon"/);
    // 🔴 只断言模板查不到样式死代码：元素删了 CSS 还在，产物里照样命中
    expect(src).not.toMatch(/\.nav-right[\s{]/);
    expect(src).not.toMatch(/\.nav-icon[\s{]/);
  });
  test('两枚图标在 search-box 内，且红点随未读计数保留', () => {
    const box = src.slice(src.indexOf('<view class="search-box">'), src.indexOf('<!-- 我的集市开关 -->'));
    expect(box).toMatch(/@click="goRequests"/);
    expect(box).toMatch(/@click="goConnections"/);
    expect(box).toMatch(/v-if="unreadCount > 0" class="red-dot"/);
  });
  test('搜索框内的图标用真实 hex（SIcon 不能吃 var()，会烘焙成黑）', () => {
    expect(src).toMatch(/<SIcon name="exchange" size="small" :color="themeColor" \/>/);
    expect(src).toMatch(/<SIcon name="market" size="small" :color="themeColor" \/>/);
  });
  test('touch 目标 ≥56rpx + 输入框 flex 收缩不挤爆行', () => {
    const block = ruleBlock(src, '.sb-icon');
    expect(block).toMatch(/width:\s*6[0-9]rpx/);
    expect(block).toMatch(/height:\s*6[0-9]rpx/);
    expect(ruleBlock(src, '.search-input')).toMatch(/flex:\s*1/);
    expect(ruleBlock(src, '.search-input')).toMatch(/min-width:\s*0/);
  });
});
