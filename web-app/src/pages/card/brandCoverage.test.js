// 名片业务域：品牌主色覆盖「覆盖率守护」（2026-10-15 批量铺开后新增）
//
// 背景：品牌色此前只覆盖 hero/头像层，页面主体（按钮/链接/数字/激活背景/图标）消费
// var(--design-primary)（设计中心系统色）→ 逐页截图报修「某页还是蓝」。本轮把 18 个页面
// 一次性铺齐，但**新页面是天然漏接点**（没有任何东西会提醒你接）。
//
// 故加此全域守护：凡消费 --design-primary 的页面，必须同时满足
//   ① 根 :style 里合并 brandVars（否则页面主体不跟随品牌色）
//   ② brandVars 由 brandThemeOverride 产出（禁手搓 CSS 变量，避免与 design.js 漂移）
//   ③ 页面若有 themeColor（SIcon/canvas/modal 需真实 hex），品牌主色必须优先于系统主题色
// 新增页面若只绑 themeStyle，本文件会直接失败并点名。

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

const DIR = fileURLToPath(new URL('.', import.meta.url));

function pages() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.vue') && !f.includes('.test.'))
    .map((f) => ({ name: f, src: readFileSync(DIR + f, 'utf8') }))
    // 只约束「消费了主题变量」的页面——没消费的自然不需要覆盖
    .filter((p) => p.src.includes('--design-primary'));
}

// 根视图 :style 绑定行（各页第一个 template 根 view）
function rootStyleLine(src) {
  const m = src.match(/<view[^>]*\s:style="[^"]*"[^>]*>/);
  return m ? m[0] : '';
}

describe('名片域页面：品牌主色覆盖率守护', () => {
  const targets = pages();

  test('参与守护的页面清单非空（防路径/过滤写错导致静默空跑）', () => {
    expect(targets.length).toBeGreaterThanOrEqual(18);
  });

  targets.forEach(({ name, src }) => {
    test(`${name}：根视图合并 brandVars（页面主体跟随品牌色）`, () => {
      const line = rootStyleLine(src);
      // 🔴 反例（曾逐页踩）：根只绑 themeStyle → 全页 var(--design-primary) 消费点仍是系统蓝
      expect(line, `${name} 根视图应为 ${line || '(未匹配到根 :style)'}`).toContain('brandVars');
    });

    test(`${name}：brandVars 单一来源（useBrandOverride 或 brandThemeOverride，禁手搓变量）`, () => {
      // 🔴 反例：页面里手搓 { '--design-primary': xxx } → 与 design.js 的变量集合漂移。
      // 两条合法路径：① useBrandOverride()（异步拉本人名片，通用页）② brandThemeOverride(brand)
      //   （页内已有名片数据，如 myCard/cardDetail/home）
      const centralized =
        src.includes("from '../../utils/brand.js'") || src.includes('brandThemeOverride(');
      expect(centralized, `${name} 的 brandVars 未走 utils/brand.js 单一来源`).toBe(true);
      expect(src).not.toMatch(/brandVars\s*=\s*computed\(\(\)\s*=>\s*\{/);
    });
  });
});

describe('themeColor 品牌优先（JS 层取色的 SIcon / canvas / modal）', () => {
  const withThemeColor = pages().filter((p) => p.src.includes('const themeColor = computed'));

  test('存在取色页面（防过滤写错）', () => {
    expect(withThemeColor.length).toBeGreaterThanOrEqual(8);
  });

  withThemeColor.forEach(({ name, src }) => {
    test(`${name}：themeColor 品牌主色优先，且保留系统色回落 + #165dff 兜底`, () => {
      const m = src.match(/const themeColor = computed\([^;]*;?/);
      expect(m, `${name} 未匹配到 themeColor 定义`).toBeTruthy();
      const expr = m[0];
      // 🔴 反例（曾踩）：只有 themeStyle.value['--design-primary'] → 图标/海报仍是系统蓝
      expect(expr).toMatch(/brand(Primary\.value|\.value(\s*&&\s*brand\.value)?\.primary)/);
      expect(expr).toContain("themeStyle.value['--design-primary']");
      expect(expr).toContain("'#165dff'");
      // 🔴 保持原始防御：不能直接 themeStyle.value['--design-primary'] 取值前不判空
      expect(expr).toMatch(/\(?themeStyle\.value && themeStyle\.value\[/);
    });
  });
});
