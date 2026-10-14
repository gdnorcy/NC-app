import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 「我的名片」卡配色和谐（方案B）回归锁。
// 原实现：.my-card 满铺主题渐变（var(--design-primary)→var(--design-gradient)），白字 + 半透明白编辑按钮，
// 在红粉主题下整页刺眼、与访客雷达红数字打架。
// 方案B：卡片改为「主题 tint 浅底 + 同色细边框」，文字转深色；编辑按钮改主题实底白字；访客数字保持主题色。
// 本测试锁死：① 不再满铺主题渐变；② tint 浅底 + 细边框；③ 编辑按钮主题实底；④ 访客数字仍跟随主题色。

const here = import.meta.url;
const homeVue = fileURLToPath(new URL('./home.vue', here));
const adminRender = fileURLToPath(new URL('../../../../web-admin/src/views/customer/apps/design/ComponentRender.vue', here));

/** 取出 .vue <style> 中某个扁平 CSS 规则块（无嵌套花括号） */
function ruleBlock(src, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'g');
  const m = re.exec(src);
  return m ? m[0] : '';
}

describe('我的名片卡配色和谐（方案B）', () => {
  const home = readFileSync(homeVue, 'utf8');

  test('C端 .my-card 不再满铺主题渐变（旧 design-gradient 写法应消失）', () => {
    expect(home).not.toContain('var(--design-gradient, #4080ff)');
    expect(home).not.toMatch(/\.my-card[\s\S]*?linear-gradient\(135deg,\s*var\(--design-primary,\s*#165dff\),\s*var\(--design-gradient/);
  });

  const myCard = ruleBlock(home, '.my-card');
  test('C端 .my-card 使用主题 tint 浅底（10% 主色 rgba）', () => {
    expect(myCard).toContain('rgba(var(--design-primary-rgb), 0.10)');
  });
  test('C端 .my-card 使用同色系细边框（14% 主色 rgba）', () => {
    expect(myCard).toContain('2rpx solid rgba(var(--design-primary-rgb), 0.14)');
  });

  const cardEdit = ruleBlock(home, '.card-edit');
  test('C端 .card-edit 改为主题实底白字（不再半透明白）', () => {
    expect(cardEdit).toContain('background: var(--design-primary, #165dff)');
    expect(cardEdit).not.toContain('rgba(255,255,255,0.2)');
  });

  const visitorNum = ruleBlock(home, '.visitor-num');
  test('C端 .visitor-num 仍跟随主题色（方案B 保留红数字）', () => {
    expect(visitorNum).toContain('var(--design-primary, #165dff)');
  });

  test('C端 卡片内文字已转深色（名/职位/公司不再白字）', () => {
    const name = ruleBlock(home, '.card-name');
    const pos = ruleBlock(home, '.card-position');
    const company = ruleBlock(home, '.card-company');
    expect(name).not.toMatch(/color:\s*#fff/);
    expect(name).not.toMatch(/rgba\(255,255,255/);
    expect(pos).not.toMatch(/rgba\(255,255,255/);
    expect(company).not.toMatch(/rgba\(255,255,255/);
  });

  test('C端 编辑按钮图标改白色（配合实底按钮）', () => {
    expect(home).toContain('<SIcon name="template" size="small" color="#ffffff" />');
  });

  test('后台设计预览 同步方案B：tint 浅底 + 细边框 + 实底编辑按钮', () => {
    const admin = readFileSync(adminRender, 'utf8');
    // native-mycard 预览用 tint 渐变 + 细边框（不再纯色 #F0F7FF）
    expect(admin).toContain('linear-gradient(135deg, rgba(22,93,255,0.10), rgba(22,93,255,0.03))');
    expect(admin).toContain('1px solid rgba(22,93,255,0.14)');
    // 预览含实底编辑按钮，与 C 端一致
    expect(admin).toContain('.r-mycard-edit { background: #165DFF;');
  });
});
