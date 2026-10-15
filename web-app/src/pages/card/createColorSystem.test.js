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
    expect(src).toMatch(/<view class="create-page" :class="'skin-' \+ skinType" :style="\[skinVars, themeStyle, brandVars, navVars\]">/);
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
  test('中性承载保留（#8a8f99/#9a9a9a/#1d2129/#4e5969/#fff）', () => {
    for (const c of ['#8a8f99', '#9a9a9a', '#1d2129', '#4e5969']) {
      expect(src, `中性色 ${c} 应保留`).toContain(c);
    }
    expect(src).toContain('color="#ffffff"');
  });
});
