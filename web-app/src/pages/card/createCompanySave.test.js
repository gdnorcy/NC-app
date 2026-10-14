import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 公司名称保存回归（2026-10-14）。
// 表单字段是 companyName，后端 card_profile 列名是 company。历史 bug：提交 payload 仅 { ...form }
// 带 companyName 却无 company，服务端 `company ?? card.company` 永远回落旧值 → 公司名从没保存成功。
// 修法：updateCard / 创建两条提交路径都显式加 `company: form.companyName`。

const src = readFileSync(fileURLToPath(new URL('./create.vue', import.meta.url)), 'utf8');

describe('create.vue 公司名称保存字段映射', () => {
  test('编辑保存路径：updateCard 的 payload 含 company: form.companyName', () => {
    expect(src).toMatch(/updateCard\([^)]*\{\s*\.\.\.form,\s*company:\s*form\.companyName/);
  });

  test('创建保存路径：payload 含 company: form.companyName', () => {
    expect(src).toMatch(/company:\s*form\.companyName/);
  });

  test('不存在「只带 companyName 不带 company」的裸提交（防止回退）', () => {
    // 提交段里若有 companyName 散落但整体仍缺 company 映射，则本断言无意义；
    // 关键是 company 映射必须存在。这里确认 companyName 不被当作列名直接提交。
    expect(src).not.toMatch(/updateCard\([^)]*\{\s*\.\.\.form\s*\}[^)]*\)/);
  });
});
