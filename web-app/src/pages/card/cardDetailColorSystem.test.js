import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 对外名片 cardDetail 配色收敛回归锁（2026-10-14 全站配色审计第三批，P0）。
//
// 页面结构决定收敛边界：
//   - hero 区（模板 theme_config 黑金/纸艺/全屏遮罩、租户 brandColor 渐变、heroColor/
//     navFgColor/isLightHero）= **被展示对象**（名片主人自选样式），保留自身色，不动；
//   - Tab 激活态/链接/供需标签/评论头像/发送按钮/点赞态/表单按钮 = 平台功能 UI，
//     收敛为单一主题色 --design-primary / --design-primary-rgb，工具图标保持中性。
//
// 锁：① 平台强调位禁 --primary/--primary-deep/--success(装饰位)/硬编码平台蓝与旧琥珀绿底；
//     ② 上述位置必须用 --design-primary；③ 语义色克制保留（.fp-req 必填红）；
//     ④ 根视图绑 themeStyle（MP 注入前提）；⑤ 死变量 var(--gold) 已清除。

const here = import.meta.url;
const DETAIL = fileURLToPath(new URL('./cardDetail.vue', here));

const src = readFileSync(DETAIL, 'utf8');

// 从 <style> 块提取单条规则（文字/颜色断言必须锁在单规则块内，全文匹配会跨规则误伤）
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

describe('cardDetail 平台 UI 强调位收敛为租户主题', () => {
  const themed = [
    '.cdot',                    // 任职公司小圆点
    '.mp-tab.on',               // Tab 激活文字
    '.bar',                     // Tab 激活下划线
    '.vl.link',                 // 链接文字
    '.dyn-act.liked',           // 动态点赞激活态
    '.fe-btn',                  // 表单入口按钮（文字+边框）
    '.fp-submit',               // 表单提交按钮
    '.cmt-send',                // 评论发送按钮
  ];
  for (const sel of themed) {
    test(`${sel} 用 --design-primary（禁 --primary 回落）`, () => {
      const block = ruleBlock(src, sel);
      expect(block, `${sel} 规则块应存在`).not.toBe('');
      expect(block).toContain('--design-primary');
      expect(block).not.toMatch(/var\(--primary[,)]/);
    });
  }

  test('Tab 激活态/下划线不再是微信绿（--success 退出装饰位）', () => {
    expect(ruleBlock(src, '.mp-tab.on')).not.toContain('var(--success)');
    expect(ruleBlock(src, '.bar')).not.toContain('var(--success)');
  });
  test('评论发送按钮不再是微信绿', () => {
    expect(ruleBlock(src, '.cmt-send')).not.toContain('var(--success)');
  });

  test('供需/标签 chip 用主题 tint（收敛前绿底+琥珀底双色相）', () => {
    // 合并选择器规则：.skill-tag.need, .skill-tag { ... }（.need 特异性更高仍生效）
    const block = ruleBlock(src, '.skill-tag.need, .skill-tag');
    expect(block, 'skill-tag 合并规则块应存在').not.toBe('');
    expect(block).toContain('rgba(var(--design-primary-rgb');
    expect(block).toContain('var(--design-primary');
    // 旧双色相（绿 rgba(7,193,96,.1) / 琥珀 rgba(245,158,11,.12)+#b45309）不得残留
    const css = styleBlock(src);
    expect(css).not.toContain('rgba(7,193,96');
    expect(css).not.toContain('rgba(245, 158, 11');
    expect(css).not.toContain('#b45309);');
  });

  test('评论头像/hero 头像描边/表单图标底跟随主题', () => {
    expect(ruleBlock(src, '.cmt-av')).toContain('var(--design-primary');
    expect(ruleBlock(src, '.p3-ava')).toContain('rgba(var(--design-primary-rgb');
    expect(ruleBlock(src, '.fe-icon')).toContain('rgba(var(--design-primary-rgb');
  });

  test('点赞激活态底色用主题 rgb（禁硬编码 rgba(22,93,255,.06)）', () => {
    expect(ruleBlock(src, '.dyn-act.liked')).toContain('rgba(var(--design-primary-rgb');
    expect(styleBlock(src)).not.toContain('rgba(22,93,255');
    expect(styleBlock(src)).not.toContain('rgba(22, 93, 255');
  });

  test('全文件禁 --primary / --primary-deep / --theme-tint 漂移令牌', () => {
    expect(src).not.toMatch(/var\(--primary[,)]/);
    expect(src).not.toContain('var(--primary-deep');
    expect(src).not.toContain('var(--theme-tint');
  });

  test('死变量 var(--gold) 已清除（收藏文字改随星标 #ffd21e）', () => {
    expect(src).not.toContain('var(--gold)');
    expect(src).toContain("collected ? 'color:#ffd21e'");
  });
});

describe('cardDetail 被展示对象与语义色保留', () => {
  test('hero/模板主题色位不动（黑金/纸艺/全屏遮罩仍是自身色）', () => {
    // 曜石黑金模板的装饰金点与遮罩、guideSolid 深棕底——名片主人自选样式
    expect(src).toContain('.rdot');
    expect(src).toContain('#c9a25e');
    expect(src).toContain('#d9bc78');
    expect(src).toContain('.pano-mask-l');
    expect(src).toContain('.hero-guide.hg-solid .hg-btn.hg-primary');
    // hero 渐变仍走租户主题兜底（无模板时）
    expect(src).toContain('var(--design-primary, #b45309)');
  });

  test('语义色克制保留：.fp-req 必填标记仍是 --danger', () => {
    expect(ruleBlock(src, '.fp-req')).toContain('var(--danger)');
  });

  test('中性工具图标保留（#86909c/#9a9a9a/#c9cdd4）', () => {
    expect(src).toContain('color="#86909c"');
    expect(src).toContain("'#9a9a9a'");
    expect(src).toContain('color="#c9cdd4"');
  });

  test('根视图绑 [navVars, themeStyle, brandVars]（MP 端 CSS 变量注入 + 品牌覆盖前提）', () => {
    expect(src).toMatch(/<view class="profile-page" :style="\[navVars, themeStyle, brandVars\]"/);
  });

  test('themeColor computed 存在、被查看名片品牌主色优先且兜底 #165dff（SIcon prop 不吃 var()）', () => {
    // 🔴 必与 brandVars 同源：brandVars 取 brandPalette(card)（被查看名片自身品牌色），
    //    themeColor 若另取设计中心色 → 同页出现「页面主体品牌色 + 图标系统色」两种色。
    expect(src).toMatch(/const themeColor = computed\(\(\) => \(brand\.value && brand\.value\.primary\) \|\| \(themeStyle\.value && themeStyle\.value\['--design-primary'\]\) \|\| '#165dff'\)/);
  });
});
