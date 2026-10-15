import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 消息中心 messages 配色收敛回归锁（2026-10-15 全站配色审计 P1 第三批）。
// 收敛前：Tab 激活微信绿 rgba(7,193,96)+var(--success)；消息类型图标三分
// （exchange 绿渐变含 --success/#05a050、visitor 蓝渐变含漂移令牌
// --primary-deep/#2e6bb8、system 灰渐变）；根视图无 themeStyle。
// 收敛后：Tab 激活与 exchange/visitor 图标统一主题渐变；system 保留中性灰
// （非业务类型）；未读红/中性保留。
//
// 锁：① 微信绿与 --primary-deep 清零；② Tab 激活/图标底必须主题；
//     ③ system 灰与未读红保留；④ 根视图绑 themeStyle。

const here = import.meta.url;
const MESSAGES = fileURLToPath(new URL('./messages.vue', here));

const src = readFileSync(MESSAGES, 'utf8');

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

describe('messages 微信绿与漂移令牌清零', () => {
  const css = () => styleNoComments(src);
  const banned = ['#07c160', 'rgba(7, 193, 96', '#05a050', '#2e6bb8', '--primary-deep', '--theme-tint'];
  test(`样式区禁杂色/漂移令牌：${banned.join(' / ')}`, () => {
    for (const c of banned) {
      expect(css(), `不得残留 ${c}`).not.toContain(c);
    }
  });
  test('禁 var(--primary / var(--success 装饰位', () => {
    expect(css()).not.toMatch(/var\(--primary[,)]/);
    expect(css()).not.toContain('var(--success)');
  });
});

describe('messages 平台 UI 强调位归主题', () => {
  test('Tab 激活用主题 tint + 主题字', () => {
    const block = ruleBlock(src, '.mt-item.on');
    expect(block).toContain('rgba(var(--design-primary-rgb, 22, 93, 255), 0.08)');
    expect(block).toContain('color: var(--design-primary, #165dff)');
  });
  test('exchange/visitor 消息图标统一主题渐变', () => {
    for (const sel of ['.m-ic.exchange', '.m-ic.visitor']) {
      expect(ruleBlock(src, sel)).toContain('linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))');
    }
  });
  test('根视图绑 themeStyle（MP 注入前提）', () => {
    expect(src).toMatch(/<view class="msg-page" :style="\[themeStyle, brandVars\]">/);
    expect(src).toContain('const themeStyle = useDesignTheme();');
  });
});

describe('messages 语义色与中性保留', () => {
  test('system 消息图标保留中性灰渐变（非业务类型）', () => {
    expect(ruleBlock(src, '.m-ic.system')).toContain('linear-gradient(135deg, #8c8c8c, #6b6b6b)');
  });
  test('未读红点保留语义红 var(--danger)', () => {
    expect(ruleBlock(src, '.m-dot')).toContain('var(--danger)');
  });
  test('中性承载保留（#5b5b5b 正文/#c9cdd4 空态图标/#fff 消息卡）', () => {
    expect(src).toContain('#5b5b5b');
    expect(src).toContain('color="#c9cdd4"');
    expect(src).toContain('color="#ffffff"');
  });
});
