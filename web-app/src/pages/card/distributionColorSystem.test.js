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
    expect(src).not.toMatch(/#165DFF|var\(--primary\)/);
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
  // 实底品牌色（背景=品牌色，文字另按 heroForeground 裁决）→ 直接用 --design-primary
  const themed = [
    '.apply-btn',           // 申请成为分销商 CTA
    '.invite-btn.solid',    // 生成海报实底按钮（内联 heroStyle 提供渐变+可读文字）
    '.level-item.cur',      // 当前分销等级（描边）
    '.poster-tpl-item.on',  // 海报模板选中（描边）
  ];
  for (const sel of themed) {
    test(`${sel} 用 --design-primary`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('var(--design-primary)');
    });
  }
  // 🔴 白底/浅底上的品牌文字 → 必须用 --brand-ink（亮黄主色在白底仅 1.75:1，写死主色等于隐形）
  const onLight = [
    '.withdraw-btn',        // 白药丸提现按钮
    '.level-cur',           // 当前等级徽章
    '.sub-tab.on',          // 直推/间推 Tab 激活
    '.tab.on',              // 佣金明细 Tab 激活
  ];
  for (const sel of onLight) {
    test(`${sel} 品牌文字走 --brand-ink（白底可读）`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('var(--brand-ink');
      expect(block).not.toMatch(/color:\s*var\(--design-primary\)/);
    });
  }
  test('浅底激活背景用 --brand-tint（不再借系统主题 --design-secondary）', () => {
    for (const sel of ['.level-item.cur', '.level-cur', '.sub-tab.on', '.tab.on']) {
      expect(ruleBlock(src, sel)).toContain('var(--brand-tint');
    }
  });
  test('应用图标浅底四分（同域色相 tint，四色互不相同）', () => {
    const DOMAIN = [
      'rgba(232,89,12,0.10)',  // 经营域（#e8590c 同相）
      'rgba(59,110,247,0.10)', // 身份域（#3b6ef7 同相）
      'rgba(10,159,143,0.10)', // 关系域（#0a9f8f 同相）
      'rgba(92,100,112,0.10)', // 工具域（#5c6470 同相）
    ];
    const sels = ['.ic-orange', '.ic-purple', '.ic-green', '.ic-cyan'];
    const got = sels.map((sel) => ruleBlock(src, sel));
    got.forEach((block, i) => {
      expect(block, `${sels[i]} 规则块应存在`).not.toBe('');
      expect(block).toContain(DOMAIN[i]);
    });
    // 🔴 旧病根1：四个类全写 var(--design-secondary) → 四张卡一模一样（默认还是粉底）
    expect(new Set(got).size, '四类底色必须互不相同').toBe(4);
    for (const block of got) expect(block).not.toContain('var(--design-secondary)');
    // 🔴 旧病根2（2026-10-16 二次修）：满铺高饱和渐变在 2×2 网格里过重（用户反馈「不好看」）
    //     → 定稿方案A「浅底彩图标」，禁止回退满铺渐变
    for (const block of got) expect(block).not.toMatch(/linear-gradient/);
  });
  test('应用图标显式传色＋贴题字形（SIcon color prop 不吃 var()，MP 按 name-hex 烘焙）', () => {
    // 无 color prop 的 SIcon：MP 端按黑色烘焙渲染、H5 currentColor 回落黑 → 必须显式传 hex
    const PAIRS = [
      ['partner', '#e8590c'],   // 经营域：合伙人分红（双人+星）
      ['solutions', '#3b6ef7'], // 身份域：全民股东（星徽）
      ['category', '#0a9f8f'],  // 关系域：类目股东（四宫格）
      ['area', '#5c6470'],      // 工具域：区域股东（地图钉）
    ];
    for (const [name, color] of PAIRS) {
      expect(src).toContain(`name="${name}"`);
      expect(src).toContain(`color="${color}"`);
    }
    // crown/badge 同字形 → 不得再同时出现在四宫格（首版前两个图标一模一样）
    expect(src).not.toMatch(/app-ic ic-orange"><SIcon name="crown"/);
    expect(src).not.toMatch(/app-ic ic-purple"><SIcon name="badge"/);
  });
});

describe('distribution themeColor 与 canvas/radio 主题化', () => {
  test('themeColor computed 存在且吃 --design-primary', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
  test('根视图绑 themeStyle（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="dist-page" :style="\[navVars, themeStyle, brandVars, brandInkVars, tabBarPad\]">/);
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
  test('heroStyle 走 heroBrandStyle（品牌渐变 + 可读性前景）+ 品牌蓝兜底', () => {
    expect(src).toContain("import { heroBrandStyle } from '../../utils/templateTheme.js';");
    expect(src).toContain("const heroStyle = computed(() => heroBrandStyle(brand.value, 'linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))', themeColor.value));");
    expect(src).toContain('const heroInk = computed(() => heroStyle.value.color);');
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
    expect(ruleBlock(src, '.log-amt.neg')).toMatch(/#f53f3f|var\(--danger\)/);
  });
  test('佣金状态三态保留（待入账琥珀/已结算绿/已回退红）', () => {
    expect(src).toMatch(/\.st-p\s*\{\s*color:\s*(#ff7d00|var\(--brand-orange\))/);
    expect(src).toContain('.st-s { color: #00b42a; }');
    expect(src).toMatch(/\.st-c\s*\{\s*color:\s*(#f53f3f|var\(--danger\))/);
  });
  test('应用身份徽章保留语义（ok 绿/warn 琥珀，真实状态）', () => {
    expect(ruleBlock(src, '.app-state.ok')).toContain('#00b42a');
    expect(ruleBlock(src, '.app-state.warn')).toMatch(/#ff7d00|var\(--brand-orange\)/);
  });
  test('门槛提示保留琥珀（与 member apply-tip 家族一致的信息提示）', () => {
    expect(ruleBlock(src, '.tip-box')).toContain('#fff8e6');
    expect(ruleBlock(src, '.tip-box')).toContain('#ad6800');
  });
  test('中性承载色保留（#1d2129/#4e5969/#c9cdd4/#e5e6eb/#f2f3f5/#a9aeb8）', () => {
    for (const c of ['#1d2129', '#4e5969', '#c9cdd4', '#e5e6eb', '#f2f3f5', '#a9aeb8']) {
      expect(src, `中性色 ${c} 应保留`).toMatch(new RegExp(c + '|var\\(--[a-z0-9-]+\\)'));
    }
  });
  test('hero 白装饰保留（rgba(255,255,255 在深渐变上）', () => {
    expect(ruleBlock(src, '.user-avatar')).toContain('rgba(255,255,255,0.25)');
    expect(ruleBlock(src, '.user-level')).toContain('rgba(255,255,255,0.22)');
  });
});

describe('distribution 邀请码块白卡化 + 头像首字母对比度（2026-10-16 报修）', () => {
  test('邀请码块不再是第二块品牌渐变（去掉 g3 / 内联 heroStyle / 装饰假二维码）', () => {
    const box = ruleBlock(src, '.invite-box');
    expect(box).toMatch(/background:\s*(#fff|var\(--white\))/);
    expect(src).not.toContain('class="invite-box g3"');
    expect(src).not.toContain('deco-qr');
    expect(src).not.toContain('qrCellCls');
    expect(src).not.toContain('QR_PATTERN');
    expect(src).not.toContain('dqr-cell');
    // 品牌色收敛到唯一主按钮上（内联 heroStyle 提供渐变 + 可读文字）
    expect(src).toContain('class="mini-btn invite-btn solid" :style="heroStyle"');
  });
  test('次按钮用 --brand-ink（白底可读主色），不许直接写 var(--design-primary)', () => {
    const ghost = ruleBlock(src, '.invite-btn.ghost');
    expect(ghost).toContain('var(--brand-ink');
    expect(ghost).not.toContain('var(--design-primary)');
  });
  test('占位头像首字母：白底 + --brand-ink，不许在品牌渐变上写死白字', () => {
    const ph = ruleBlock(src, '.user-avatar.placeholder');
    expect(ph).toContain('color: var(--brand-ink');
    expect(ph).not.toContain('color: #fff;');
  });
  test('页面根下发 brandInkVars（--brand-ink / --brand-tint 的来源）', () => {
    expect(src).toContain('const { brandVars, brandPrimary, brandInkVars } = useBrandOverride();');
    expect(src).toContain(':style="[navVars, themeStyle, brandVars, brandInkVars, tabBarPad]"');
  });
});
