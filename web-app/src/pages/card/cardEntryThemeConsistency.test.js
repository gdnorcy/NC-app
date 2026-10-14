import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 「名片内容」三入口（名片资料 / 供需标签 / 展示设置）落地页配色一致性回归锁。
// 背景：分流出的两个轻页 needTagsEdit / displaySettings 误用了**平台固定品牌蓝**：
//   - `--primary`（token.scss: $primary=#165dff，编译期字面量，不随租户主题变）
//   - `--theme-tint`（全仓无任何定义 → 永远回落硬编码蓝）
//   - 硬编码 `#165dff`（switch / 图标底色）
// 而名片资料 create.vue 的主控件走租户主题 `--design-primary`（红主题=红）→ 红主题下第一个偏红、
// 后两个是蓝，即用户报的「色系不一致」。
// 项目规矩：平台 UI 跟随租户主题（--design-primary / --design-primary-rgb），被展示对象保留自身色。
// 本测试锁死三页统一走 --design-primary*，且不再出现 --primary / --theme-tint / 硬编码蓝开关色。

const here = import.meta.url;
const FILES = {
  '名片资料 create.vue': fileURLToPath(new URL('./create.vue', here)),
  '供需标签 needTagsEdit.vue': fileURLToPath(new URL('./needTagsEdit.vue', here)),
  '展示设置 displaySettings.vue': fileURLToPath(new URL('./displaySettings.vue', here)),
};

describe('名片内容三编辑入口配色一致性（跟随租户主题）', () => {
  for (const [name, path] of Object.entries(FILES)) {
    const src = readFileSync(path, 'utf8');
    test(`${name}：禁用平台固定蓝 --primary（应改 --design-primary）`, () => {
      expect(src).not.toContain('var(--primary)');
      expect(src).not.toContain('var(--primary,');
    });
    test(`${name}：禁用未定义 token --theme-tint（回落蓝，永远不跟随主题）`, () => {
      expect(src).not.toContain('var(--theme-tint');
    });
    test(`${name}：使用租户主题变量 --design-primary`, () => {
      expect(src).toContain('--design-primary');
    });
    test(`${name}：根视图绑定 themeStyle（MP 端注入主题 var 的前提）`, () => {
      // create.vue 是 :style="[skinVars, themeStyle, navVars]" 数组绑定；两个轻页是 :style="themeStyle"
      expect(src).toMatch(/:style="[^"]*themeStyle/);
    });
  }

  test('展示设置 switch 颜色绑定 themeColor（禁用硬编码 #165dff）', () => {
    const src = readFileSync(FILES['展示设置 displaySettings.vue'], 'utf8');
    expect(src).toContain(':color="themeColor"');
    expect(src).not.toMatch(/<switch[^>]*color="#165dff"/);
    expect(src).toContain("themeStyle.value['--design-primary']");
  });

  test('供需标签/展示设置 选中态与主按钮用主题色（含 rgb tint 写法）', () => {
    const nt = readFileSync(FILES['供需标签 needTagsEdit.vue'], 'utf8');
    const ds = readFileSync(FILES['展示设置 displaySettings.vue'], 'utf8');
    expect(nt).toContain('rgba(var(--design-primary-rgb');
    expect(nt).toContain('var(--design-primary, #165dff)');
    expect(ds).toContain('rgba(var(--design-primary-rgb');
  });
});
