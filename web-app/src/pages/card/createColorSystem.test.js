import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 创建名片页 create 配色收敛回归锁（2026-10-15 全站配色审计 P1 第五批）。
// 本页大部分早已收敛（三皮肤 --sk-* 变量体系 + 主题位），残留 4 处：
// ① SIcon key 图标硬编码微信绿 #07c160（入驻绑定标题）；
// ② SIcon crown 图标硬编码会员金 #ffd21e（语音简介会员引导）——用户对
//    「会员金」的态度是收敛（10acd56 真机反馈把黄金会员改主题色）；
// ③ voice-locked 整套金色提示消费全文件无定义的 var(--gold)（无兜底 →
//    边框/背景声明无效，金色体系实际不显示）→ 改主题系；
// ④ vip-tag 死规则（模板无引用）且同样消费 var(--gold) → 删除。
//
// 保留（有据可查）：apply-banner 文字用 --design-subtext（文字色场景，
// MEMORY 明确记录合理）；apply-banner--reject 驳回琥珀 #D25F00/#FFF3E8
// （真实状态语义）；三皮肤 --sk-* 变量（被展示对象）；hdText step 皮肤
// 文字色；中性色。
//
// 锁：① 微信绿/会员金/--gold 清零；② 两处 SIcon 绑 themeColor；
//     ③ voice-locked 主题系；④ vip-tag 死规则不复活；⑤ 保留位不动。

const here = import.meta.url;
const CREATE = fileURLToPath(new URL('./create.vue', here));

const src = readFileSync(CREATE, 'utf8');

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

describe('create 微信绿/会员金/--gold 清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#07c160', '#ffd21e', 'var(--gold', '#fffbe8', '#b8860b'];
  test(`样式区禁：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('模板区禁 SIcon 硬编码微信绿/会员金', () => {
    expect(src).not.toContain('color="#07c160"');
    expect(src).not.toContain('color="#ffd21e"');
  });
  test('vip-tag 死规则不复活（消费无定义 --gold 且模板无引用）', () => {
    expect(css()).not.toContain('.vip-tag');
  });
});

describe('create 平台位归主题', () => {
  test('key/crown 两处 SIcon 绑 themeColor', () => {
    expect(src).toContain('<SIcon name="key" size="small" :color="themeColor" />');
    expect(src).toContain('<SIcon name="crown" size="small" :color="themeColor" />');
  });
  test('themeColor computed 存在且吃 --design-primary', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
  test('根视图绑 [skinVars, themeStyle, brandVars, navVars]（皮肤 + 主题 + 品牌覆盖 + 导航四源）', () => {
    // 2026-10-21 供需标签空白修复：追加 is-edit class（编辑模式关掉 .skin-step .card 的 640rpx min-height）
    expect(src).toMatch(/<view class="create-page" :class="\['skin-' \+ skinType, \{ 'is-edit': isEdit \}\]" :style="\[skinVars, themeStyle, brandVars, navVars\]">/);
  });
  test('voice-locked 会员引导改主题系（原金色提示消费无定义 --gold）', () => {
    const block = ruleBlock(src, '.voice-locked');
    expect(block).toContain('rgba(var(--design-primary-rgb, 22, 93, 255), 0.06)');
    expect(block).toContain('2rpx dashed var(--design-primary, #165dff)');
    expect(block).toContain('color: var(--design-primary, #165dff)');
  });
});

describe('create 保留位不动', () => {
  test('apply-banner 文字保留 --design-subtext（文字色场景，MEMORY 记录合理）', () => {
    expect(ruleBlock(src, '.apply-banner')).toContain('color: var(--design-subtext, #165DFF);');
  });
  test('apply-banner--reject 驳回琥珀保留（真实状态语义）', () => {
    const block = ruleBlock(src, '.apply-banner--reject');
    expect(block).toContain('#D25F00');
    expect(block).toContain('#FFF3E8');
  });
  test('三皮肤 --sk-* 变量体系保留（被展示对象）', () => {
    expect(src).toContain('--sk-bg');
    expect(src).toContain('--sk-hd-text');
    expect(src).toContain('--sk-card-bg');
  });
  test('hdText step 皮肤文字色保留', () => {
    expect(src).toContain("skinType.value === 'step' ? '#1d2129'");
  });
  test('中性承载保留（#9a9a9a 占位/#1d2129 step 皮肤/#4e5969）', () => {
    for (const c of ['#9a9a9a', '#1d2129', '#4e5969']) {
      expect(src, `中性色 ${c} 应保留`).toMatch(new RegExp(c + '|var\\(--[a-z0-9-]+\\)'));
    }
    // 2026-10-16 方案 A：关闭按钮图标原 #8a8f99 → 语义令牌
    // （SIcon 的 color 不能吃 var()，会被烘焙进 SVG data-URI / 构建期 PNG）
    // 2026-10-21 真机反馈「删除按钮全灰，是设计还是误」：ICON_DECOR 语义是
    // 「空态/占位/禁用」，可交互控件用它会被读成禁用 → 改 ICON_T2（次文本级）。
    expect(src).toContain(':color="ICON_T2"');
  });
});

describe('create 品牌色生效链路（2026-10-16 真机报修：创建页整页仍是设计中心蓝）', () => {
  test('皮肤必须吃「品牌覆盖后的主题」，否则 --sk-header/--sk-btn 色值永远停在蓝', () => {
    // 🔴 --sk-header/--sk-btn 是**已烘焙的色值**（hex 在 createSkin.js 里写死，v3.3 起为纯色），
    //    brandVars 在 :style 数组里排得再靠后也盖不掉 → 必须让 buildCreateSkinVars 的输入
    //    本身就已经含品牌覆盖。
    expect(src).toMatch(/const\s+skinTheme\s*=\s*computed\(\(\)\s*=>\s*\(\{\s*\.\.\.\(themeStyle\.value\s*\|\|\s*\{\}\),\s*\.\.\.\(brandVars\.value\s*\|\|\s*\{\}\)\s*\}\)\)/);
    expect(src).toContain('buildCreateSkinVars(skinTheme.value)');
    expect(src).not.toContain('buildCreateSkinVars(themeStyle.value)');
  });
  test('坐在品牌渐变上的图标/勾选不能写死白（亮黄底白图标会消失）', () => {
    expect(src).not.toContain('color="#ffffff"');
    expect(src).toContain(':color="brandInk"');
    expect(ruleBlock(src, '.type-check')).toContain('var(--sk-btn-text');
  });
  test('brandInk 与按钮文字同源（--sk-btn-text 由 heroForeground 裁决）', () => {
    expect(src).toContain("const brandInk = computed(() => skinVars.value['--sk-btn-text']");
  });
});
