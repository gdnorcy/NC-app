import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 分销中心 distribution 配色收敛回归锁（2026-10-15 全站配色审计 P1 首批）。
// 收敛前全场最杂（约 60 处色值）：hero/invite-box demo g3 青绿 #0f766e/#14b8a6、
// 提现/实底按钮/装饰 QR/申请 CTA/Tab 激活/等级徽章硬编码品牌蓝 #165dff、
// 应用图标四分橙/紫/绿/青、海报 canvas 双端各写死 #165DFF（+H5 暗阶 #0B3A8C）、
// radio prop 硬编码 #165DFF、页面底手抄 #f5f6f7。
// 收敛后：单一主题色（CTA/Tab/激活/图标底/海报/canvas）+ 语义色（已付费绿/金额进出/
// 佣金三态/获身份/门槛琥珀）+ 中性承载 + 白装饰。
//
// 锁：① demo 青绿与暗阶清零；② 平台强调位必须 --design-primary/--design-secondary；
//     ③ themeColor 喂 radio/canvas（prop 不吃 var()）；④ brandColor hero 链路接通；
//     ⑤ 语义色与中性保留。

const here = import.meta.url;
const DIST = fileURLToPath(new URL('./distribution.vue', here));

const src = readFileSync(DIST, 'utf8');

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

describe('distribution demo 遗留色清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#0f766e', '#14b8a6', '#0B3A8C', '#e8f3ff', '#f0f7ff', 'rgba(114,46,209', 'rgba(14,165,190', '#f5f6f7'];
  test(`样式区禁 demo/杂色：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('脚本区禁 demo 青绿兜底（heroStyle/.g3 已改品牌蓝系）', () => {
    expect(src).not.toContain('#0f766e');
    expect(src).not.toContain('#14b8a6');
  });
  test('禁大写 #165DFF 硬编码（radio/canvas 已改 themeColor，仅允许小写 fallback）', () => {
    expect(src).not.toContain('#165DFF');
  });
  test('禁 --primary / --primary-deep / --theme-tint 漂移令牌', () => {
    expect(css()).not.toMatch(/var\(--primary[,)]/);
    expect(css()).not.toContain('--primary-deep');
    expect(css()).not.toContain('--theme-tint');
    expect(css()).not.toContain('rgba(22,93,255');
    expect(css()).not.toContain('rgba(22, 93, 255');
  });
  test('.g3 demo 渐变类同步主题（防内联失效露 demo 色）', () => {
    expect(ruleBlock(src, '.g3')).toContain('var(--design-primary, #165dff), var(--design-gradient, #4080ff)');
  });
  test('.dist-page 页面底用 var(--bg-page)（token 单一事实来源）', () => {
    expect(ruleBlock(src, '.dist-page')).toContain('var(--bg-page)');
  });
});

describe('distribution 平台 UI 强调位归主题', () => {
  const themed = [
    '.apply-btn',           // 申请成为分销商 CTA
    '.withdraw-btn',        // 提现按钮（白底主题字）
    '.invite-btn.solid',    // 生成海报实底按钮（白底主题字）
    '.dqr-cell.on',         // 装饰二维码格子
    '.level-item.cur',      // 当前分销等级
    '.level-cur',           // 当前等级徽章
    '.sub-tab.on',          // 直推/间推 Tab 激活
    '.tab.on',              // 佣金明细 Tab 激活
    '.poster-tpl-item.on',  // 海报模板选中
  ];
  for (const sel of themed) {
    test(`${sel} 用 --design-primary`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('var(--design-primary)');
    });
  }
  test('应用图标底色四分（橙/紫/绿/青）统一主题 tint', () => {
    for (const sel of ['.ic-orange', '.ic-purple', '.ic-green', '.ic-cyan']) {
      expect(ruleBlock(src, sel)).toContain('var(--design-secondary)');
    }
  });
  test('应用图标本身保持中性 #4e5969（类型区分靠文案）', () => {
    expect(ruleBlock(src, '.app-ic :deep(.s-icon)')).toContain('#4e5969');
  });
});

describe('distribution themeColor 与 canvas/radio 主题化', () => {
  test('themeColor computed 存在且吃 --design-primary', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
  test('根视图绑 themeStyle（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="dist-page" :style="\[navVars, themeStyle, brandVars\]">/);
  });
  test('协议 radio 绑 themeColor（prop 不吃 var()）', () => {
    expect(src).toContain(':color="themeColor"');
  });
  test('小程序 canvas 海报底色/角标字用 themeColor（canvas 只吃真实 hex）', () => {
    expect(src).toContain("ctx.setFillStyle(themeColor.value); ctx.fillRect(0, 0, W, H);");
    expect(src).toMatch(/ctx\.setFillStyle\(themeColor\.value\);\s*\n\s*ctx\.setFontSize\(12\)/);
  });
  test('H5 canvas 海报渐变用 themeColor + shadeHex 暗阶', () => {
    expect(src).toContain('g.addColorStop(0, themeColor.value); g.addColorStop(1, shadeHex(themeColor.value, -0.35));');
    expect(src).toMatch(/ctx\.fillStyle = themeColor\.value;\s*\n\s*ctx\.font = '600 24px/);
  });
});

describe('distribution 品牌 5 色 hero 链路', () => {
  test('heroStyle 品牌色优先（双参：主色+渐变）+ 品牌蓝兜底', () => {
    expect(src).toContain("heroGradient(brand.value.primary, brand.value.gradient, 'linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))')");
  });
  test('品牌 5 色从本人名片归一化取值（brandPalette，曾恒空导致 hero 永远走 fallback）', () => {
    expect(src).toContain('const cardsRes = await cardApi.getCardsSafe();');
    expect(src).toContain('Object.assign(brand.value, b);');
  });
});

describe('distribution 语义色与中性保留', () => {
  test('已付费徽章保留语义绿 #00b42a', () => {
    expect(ruleBlock(src, '.sub-paid')).toContain('#00b42a');
  });
  test('佣金金额方向保留绿/红（入账 + / 回退 -）', () => {
    expect(ruleBlock(src, '.log-amt')).toContain('#00b42a');
    expect(ruleBlock(src, '.log-amt.neg')).toContain('#f53f3f');
  });
  test('佣金状态三态保留（待入账琥珀/已结算绿/已回退红）', () => {
    expect(src).toContain('.st-p { color: #ff7d00; }');
    expect(src).toContain('.st-s { color: #00b42a; }');
    expect(src).toContain('.st-c { color: #f53f3f; }');
  });
  test('应用身份徽章保留语义（ok 绿/warn 琥珀，真实状态）', () => {
    expect(ruleBlock(src, '.app-state.ok')).toContain('#00b42a');
    expect(ruleBlock(src, '.app-state.warn')).toContain('#ff7d00');
  });
  test('门槛提示保留琥珀（与 member apply-tip 家族一致的信息提示）', () => {
    expect(ruleBlock(src, '.tip-box')).toContain('#fff8e6');
    expect(ruleBlock(src, '.tip-box')).toContain('#ad6800');
  });
  test('中性承载色保留（#1d2129/#4e5969/#c9cdd4/#e5e6eb/#f2f3f5/#a9aeb8）', () => {
    for (const c of ['#1d2129', '#4e5969', '#c9cdd4', '#e5e6eb', '#f2f3f5', '#a9aeb8']) {
      expect(src, `中性色 ${c} 应保留`).toContain(c);
    }
  });
  test('hero/invite-box 白装饰保留（rgba(255,255,255 在深渐变上）', () => {
    expect(src).toContain('rgba(255,255,255,0.25)');
    expect(src).toContain('rgba(255,255,255,0.2)');
  });
});
