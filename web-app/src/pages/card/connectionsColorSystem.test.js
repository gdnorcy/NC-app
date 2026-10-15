import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 我的人脉库 connections 配色收敛回归锁（2026-10-15 全站配色审计 P1 第四批）。
// 收敛前是「demo 遗留」页：全页用未定义变量的兜底写法恒落硬编码色——
// var(--wx, #07c160)（微信绿 CTA/确认钮）、var(--blue, #1d4e8f)（藏蓝）、
// var(--blue-soft, #e9f1fb)、var(--bg, #f5f6f7)；showModal confirmColor
// 硬编码 #07C160；且模板用 SIcon 但 script 无 import（空态图标静默失败，
// 本轮顺手补上）。
// 收敛后：筛选激活/分组标签/转客户钮/确认钮/空态 CTA → 主题；删除红与
// confirmColor 删除红保留（危险语义）；头像五色板保留（个体识别色）。
//
// 锁：① 微信绿/藏蓝/demo 兜底令牌清零；② 平台位必须主题；
//     ③ 删除语义红与头像五色板保留；④ themeStyle/themeColor 接入。

const here = import.meta.url;
const CONNECTIONS = fileURLToPath(new URL('./connections.vue', here));

const src = readFileSync(CONNECTIONS, 'utf8');

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

describe('connections demo 遗留色清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#07c160', '#07C160', '#1d4e8f', '#e9f1fb', '#e8f7ef', 'var(--wx', 'var(--blue', 'var(--bg,'];
  test(`样式区禁微信绿/藏蓝/demo 兜底令牌：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('脚本区 confirmColor 不再硬编码微信绿', () => {
    expect(src).not.toContain("confirmColor: '#07C160'");
    expect(src).toContain('confirmColor: themeColor.value');
  });
  test('.conn-page 页面底用 var(--bg-page)', () => {
    expect(ruleBlock(src, '.conn-page')).toContain('var(--bg-page)');
  });
});

describe('connections 平台 UI 强调位归主题', () => {
  const themed = [
    '.filter-tab.on',   // 筛选激活
    '.group-opt.on',    // 分组选项激活
    '.avatar-text',     // 头像首字
    '.group-tag',       // 分组标签
    '.op-btn.primary',  // 转客户操作钮
    '.empty-btn',       // 空态 CTA
    '.sheet-btn.ok',    // 弹层确认钮
  ];
  for (const sel of themed) {
    test(`${sel} 用主题变量`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toMatch(/var\(--design-(primary|primary-rgb)/);
    });
  }
  test('themeColor computed 存在且吃 --design-primary（showModal prop 需要真实 hex）', () => {
    expect(src).toMatch(/const themeColor = computed\(\(\) => brandPrimary\.value \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
  test('根视图绑 themeStyle + brandVars + brandInkVars（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="conn-page" :style="\[themeStyle, brandVars, brandInkVars\]">/);
  });
});

describe('connections 语义与识别色保留', () => {
  test('删除操作保留语义红（op-btn.danger + confirmColor 删除红）', () => {
    expect(ruleBlock(src, '.op-btn.danger')).toContain('#ff4d4f');
    expect(src).toContain("confirmColor: '#FF4D4F'");
  });
  test('头像五色板保留（个体识别色，按联系人稳定取色）', () => {
    expect(src).toContain("const colors = ['#E9F1FB', '#E8F7EF', '#FDF0E3', '#F3ECFE', '#FDECEC'];");
  });
  test('中性承载保留（#1a1a1a/#5b5b5b/#9a9a9a/#eee/#f5f6f7）', () => {
    for (const c of ['#1a1a1a', '#5b5b5b', '#9a9a9a', '#eee', '#f5f6f7']) {
      expect(src, `中性色 ${c} 应保留`).toContain(c);
    }
    expect(src).toContain('color="#9a9a9a"');
  });
});

describe('connections 组件 import 完整性', () => {
  test('SIcon 有 import（模板 line 31 空态图标，原缺失致静默失败）', () => {
    expect(src).toContain("import SIcon from '../../components/SIcon.vue';");
  });
});
