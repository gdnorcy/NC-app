import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 「名片内容」三入口分流回归（2026-10-14）。
// 历史缺陷：名片资料/供需标签/展示设置三行全是 @click="editCard" 同跳 create 三步向导，
// 供需标签要从第 1 步翻两页，「展示设置（公开状态、模板样式）」描述是空头支票
// （goTemplateSelect 是死代码；isPublic 开关藏在向导第 3 步高级区）。
// 修法（方案C）：供需标签→needTagsEdit 轻页；展示设置→displaySettings 轻页（内跳 templateSelect）；
// 名片资料→保留 editCard 全量向导。

const here = import.meta.url;
const myCardSrc = readFileSync(fileURLToPath(new URL('./myCard.vue', here)), 'utf8');
const pagesJson = JSON.parse(readFileSync(fileURLToPath(new URL('../../pages.json', here)), 'utf8'));

const cardPages = pagesJson.subPackages.find((s) => s.root === 'pages/card').pages.map((p) => p.path);

describe('我的名片「名片内容」三入口分流', () => {
  test('新轻页必须已在 pages.json 注册（跳未注册页=无报错无跳转）', () => {
    expect(cardPages).toContain('needTagsEdit');
    expect(cardPages).toContain('displaySettings');
    expect(cardPages).toContain('templateSelect');
  });

  test('三行入口各归各：仅名片资料仍走 editCard，另两行走各自轻页', () => {
    // 逐行提取「os-row 处理函数 → 首个 osr-name 文案」映射，精确到行不靠窗口猜测
    const rowRe = /<view class="os-row" @click="(\w+)">[\s\S]{0,500}?osr-name">([^<]+)<\/view>/g;
    const map = {};
    let m;
    while ((m = rowRe.exec(myCardSrc))) map[m[2]] = m[1];
    expect(map['名片资料']).toBe('editCard');
    expect(map['供需标签']).toBe('goNeedTags');
    expect(map['展示设置']).toBe('goDisplaySettings');
  });

  test('跳转目标与轻页实际路径一致', () => {
    expect(myCardSrc).toContain('/pages/card/needTagsEdit?id=');
    expect(myCardSrc).toContain('/pages/card/displaySettings?id=');
  });

  test('轻页保存走部分字段更新（needTags / isPublic），不得整卡覆盖', () => {
    const nt = readFileSync(fileURLToPath(new URL('./needTagsEdit.vue', here)), 'utf8');
    const ds = readFileSync(fileURLToPath(new URL('./displaySettings.vue', here)), 'utf8');
    expect(nt).toMatch(/updateCard\([^)]*,\s*\{\s*needTags:\s*JSON\.stringify/);
    expect(ds).toMatch(/updateCard\([^)]*,\s*\{\s*isPublic:\s*val\s*\}/);
    // 轻页兜底解析本人名片：绝不能用 cardLastViewId（可能是他人名片；注释提及不算，检测真实调用）
    expect(nt).toMatch(/getCardsSafe/);
    expect(ds).toMatch(/getCardsSafe/);
    expect(nt).not.toMatch(/getStorageSync\(\s*['"]cardLastViewId['"]/);
    expect(ds).not.toMatch(/getStorageSync\(\s*['"]cardLastViewId['"]/);
  });
});
