/**
 * 占位头像首字母 / 品牌渐变上的前景色 —— 全站一致性回归（2026-10-16 真机报修）
 *
 * 报修原文：「圆形头像整个填充白的了，中间是否少了东西或是配色有误。
 *           ……头像里的白色首字母（也是品牌渐变上的白字），一并按同样规则处理。」
 *
 * 病根是一类：**前景色写死，背景却跟着品牌色走**。设计中心把主色配成亮黄 #FCB801 后：
 *   · 品牌渐变圆 + 白字首字母        → 1.75:1，看不见
 *   · 品牌渐变 hero + 白色占位头像   → 同上
 *   · 白卡/白底圆 + var(--design-primary) 文字 → 同样 1.75:1
 *
 * 统一规则（两条，判据都是「文字所坐的那块底」，不是页面背景）：
 *   ① 坐在**品牌渐变上**  → var(--brand-hero-ink)（与 cardDetail hero 同源 heroForeground）
 *   ② 坐在**白卡/浅底上** → var(--brand-ink)（inkOnLightBg 自动压暗到 WCAG 3.0）
 * 两个变量由 utils/brand.js 的 useBrandOverride().brandInkVars 下发到页面根 :style。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';
import { contrastOn, inkOnLightBg } from '../../utils/color.js';
import { heroForeground } from '../../utils/templateTheme.js';

const here = import.meta.url;
const src = (rel) => readFileSync(fileURLToPath(new URL(rel, here)), 'utf8');

/** 取某选择器的规则块（到下一个 } 为止），与其余配色测试同款 */
function ruleBlock(s, sel) {
  const i = s.indexOf(sel);
  if (i < 0) return '';
  return s.slice(i, s.indexOf('}', i) + 1);
}

describe('两条前景规则的取色函数本身', () => {
  test('① 品牌渐变上的前景：亮黄主色自动转深字，深蓝主色保持白字', () => {
    const yellow = heroForeground('#FCB801', '#FCC601', { text: '#ffffff' });
    expect(yellow.light).toBe(true);
    expect(contrastOn(yellow.text, yellow.bg)).toBeGreaterThanOrEqual(3);
    // 白字在亮黄上确实不达标（这正是必须裁决的原因）
    expect(contrastOn('#ffffff', yellow.bg)).toBeLessThan(3);

    const blue = heroForeground('#165dff', '#4080ff', { text: '#ffffff' });
    expect(blue.light).toBe(false);
    expect(blue.text).toBe('#ffffff');
  });

  test('② 白底上的前景：亮黄压暗后达标，深蓝原样保留', () => {
    const y = inkOnLightBg('#FCB801');
    expect(contrastOn(y, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(inkOnLightBg('#165dff')).toBe('#165dff');
    expect(contrastOn('#165dff', '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});

describe('① 坐在品牌渐变上的首字母 —— 必须走 --brand-hero-ink', () => {
  const CASES = [
    ['market.vue', '.c-avatar'],
    ['market.vue', '.m-avatar'],
    ['market.vue', '.b-avatar'],
    ['customers.vue', '.customer-avatar'],
    ['dynamic.vue', '.dynamic-avatar'],
  ];
  for (const [f, sel] of CASES) {
    test(`${f} ${sel}`, () => {
      const block = ruleBlock(src('./' + f), sel + ' {');
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('var(--brand-hero-ink');
      expect(block).not.toMatch(/color:\s*#fff\b/);
    });
  }
});

describe('② 白底/浅底上的主色文字 —— 必须走 --brand-ink', () => {
  const CASES = [
    ['profile.vue', '.avatar {'],          // 白底圆形占位头像
    ['connections.vue', '.avatar-text'],   // 固定浅色膏片底
  ];
  for (const [f, sel] of CASES) {
    test(`${f} ${sel}`, () => {
      const block = ruleBlock(src('./' + f), sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('var(--brand-ink');
      expect(block).not.toMatch(/color:\s*var\(--design-primary\)/);
    });
  }

  test('分销五页占位头像：白底圆 + --brand-ink（不再把白字压在品牌渐变上）', () => {
    for (const f of ['distribution.vue', 'distPartner.vue', 'distShareCat.vue', 'distShareArea.vue', 'distShareAll.vue']) {
      const block = ruleBlock(src('./' + f), '.user-avatar.placeholder');
      expect(block, `${f} 占位头像规则块应存在`).not.toBe('');
      expect(block).toContain('var(--brand-ink');
      expect(block).not.toContain('color: #fff;');
    }
  });
});

describe('myCard：品牌渐变头像的首字母由 avatarStyle 一并给出', () => {
  test('avatarStyle 返回 background 的同时返回 color（CSS 的 #fff 兜底不可靠）', () => {
    const s = src('./myCard.vue');
    expect(s).toContain("import { heroForeground } from '../../utils/templateTheme.js';");
    expect(s).toContain('const fg = heroForeground(dark, c, { text: \'#ffffff\' });');
    expect(s).toContain('background: `linear-gradient(135deg, ${dark}, ${c})`, color: fg.text');
  });
  test('右上角「编辑」入口已删除（下方已有完整编辑列表，且该位置正对微信胶囊）', () => {
    const s = src('./myCard.vue');
    expect(s).not.toContain('class="on-edit"');
    expect(s).not.toContain('.on-edit {');
    expect(s).not.toMatch(/<template #right>[\s\S]{0,120}编辑[\s\S]{0,40}<\/template>/);
    // 下方「名片内容」列表里的「名片资料」行仍在（删的是重复入口，不是编辑能力）
    expect(s).toContain('<!-- 名片内容编辑列表 -->');
    expect(s).toContain('<view class="os-row" @click="editCard">');
  });
});

describe('会员等级徽章（金色渐变）前景可读', () => {
  test('.member-tag 深棕前景，白字/金图标均已移除', () => {
    const s = src('./profile.vue');
    const block = ruleBlock(s, '.member-tag');
    expect(block).toContain('color: #7a4b00');
    expect(block).not.toContain('color: #fff');
    expect(s).not.toContain('color="#faad14"');
    // 数值校验：金渐变中点 #ffd700~#ffaa00 取代表色，深棕前景须 ≥3:1
    const bg = '#ffc100'; // 渐变中值近似
    expect(contrastOn('#7a4b00', bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('消费 brandInkVars 的页面必须真的把它挂到根 :style', () => {
  const DIR = './';
  const PAGES = [
    'profile.vue', 'market.vue', 'customers.vue', 'connections.vue', 'dynamic.vue',
    'distribution.vue', 'distPartner.vue', 'distShareCat.vue', 'distShareArea.vue', 'distShareAll.vue',
  ];
  for (const f of PAGES) {
    test(`${f} 根 :style 含 brandInkVars`, () => {
      const s = src(DIR + f);
      expect(s).toMatch(/:style="\[[^\]]*brandInkVars[^\]]*\]">/);
    });
  }
});
