import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 转为客户：客户阶段常用标签回归锁（任务 #278）。
// 需求：转为客户时让用户选一个常用阶段（跟进中/报价阶段/已合作…），
// 写入客户 tags，便于在客户管理页识别阶段。阶段标签走现有 tags 通道，
// 不动 pipeline 状态枚举（待跟进/跟进中/已成交/已流失）。

const here = import.meta.url;
const VISITORS = fileURLToPath(new URL('./visitors.vue', here));
const src = readFileSync(VISITORS, 'utf8');

describe('visitors 转为客户-客户阶段标签', () => {
  test('STAGES 含常用阶段（跟进中/报价阶段/已合作）', () => {
    const m = src.match(/const STAGES = \[([\s\S]*?)\]/);
    expect(m, '应定义 STAGES 常量').not.toBeNull();
    const body = m[1];
    for (const s of ['初步接触', '跟进中', '报价阶段', '已合作', '暂不跟进']) {
      expect(body, `STAGES 应含「${s}」`).toContain(s);
    }
  });

  test('转换弹层渲染阶段选择器（stage-chip 绑定 convStage）', () => {
    expect(src).toMatch(/class="stage-chip"[^>]*v-for="s in STAGES"/);
    expect(src).toMatch(/:class="\{ active: convStage === s \}"/);
  });

  test('saveConvert 将选中的阶段写入客户 tags（含「访客转化」）', () => {
    const i = src.indexOf('async function saveConvert');
    expect(i, '应存在 saveConvert').toBeGreaterThan(-1);
    const block = src.slice(i, i + 600);
    expect(block).toContain("const tags = ['访客转化']");
    expect(block).toContain('if (convStage.value) tags.push(convStage.value)');
    expect(block).toContain('tags,');
    expect(block).toContain('cardApi.createCustomer');
  });

  test('convert 进入弹层时重置阶段选择', () => {
    expect(src).toMatch(/convStage\.value = '';/);
  });
});
