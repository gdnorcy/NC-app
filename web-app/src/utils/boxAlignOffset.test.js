/**
 * 「横向对齐 + 左边偏移」共享语义回归锁（🔴 #327，2026-10-22）
 *
 * 用户口径（原话）：
 *   「选择居中，再调左边偏移就是在居中的基础偏移；如果再选居左，向左偏移要清零，
 *     如若在调左边偏移，那就是在居左偏移的基础上去偏移；如果再选择居中，
 *     向左偏移也是清零，如果再调左边偏移，也是在这个基础上去做调整偏移。」
 *
 * ✅ 定死的三条：① 对齐=基准 ② 偏移叠加在基准上 ③ 切对齐→偏移清零
 *
 * 🔴 病根（修的就是它）：偏移原来用 `margin-left` 表达，直接覆盖对齐写好的
 *   `margin-left:auto` → 居中/居右失效（看起来都像居左），且偏移≠0 时切对齐
 *   **界面毫无反应**。这就是用户说的「三个参数感觉不太对」。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';
import {
  ALIGN_KEY, ALIGN_OPTIONS, ALIGN_OFFSET_KEYS,
  normalizeAlign, offsetShiftStyle, clearedOffsetsFor,
} from './boxAlignOffset.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
/** 剥注释后再断言「旧实现已移除」——源码说明注释里含同字面量会造成假失败 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('ALIGN_OPTIONS：三选项（两端 schema 共用）', () => {
  test('居左/居中/居右，取值 left/center/right', () => {
    expect(ALIGN_OPTIONS.map((o) => o.label)).toEqual(['居左', '居中', '居右']);
    expect(ALIGN_OPTIONS.map((o) => o.value)).toEqual(['left', 'center', 'right']);
  });

  test('ALIGN_KEY 恒为 align（面板清零逻辑靠它判字段）', () => {
    expect(ALIGN_KEY).toBe('align');
  });

  test('两端 registry 的 align 字段都引用共享表，不许各自内联一份', () => {
    const mob = stripComments(read('../pages/card/cardCompRegistry.js'));
    const adm = stripComments(read('../../../web-admin/src/views/customer/apps/design/componentRegistry.js'));
    for (const [name, src] of [['C 端', mob], ['admin', adm]]) {
      expect(src, `${name} 未引用 ALIGN_OPTIONS`).toMatch(/import \{ ALIGN_OPTIONS \}/);
      // ⚠️ 别断言「全文不出现 label:'居左'」——搜索框的 textAlign（占位文案对齐）
      //    是另一个字段，也用居左/居中/居右，语义不同不能混为一谈。只钉 align 字段本身。
      // ⚠️ 排除「文字对齐」类字段（图文组件的 align 是**卡内文字**对齐，只有左/中，
      //    与「组件横向位置」是两回事，不能用三选项共享表）
      const alignFields = (src.match(/\{ key: 'align'[^\n]*\}/g) || [])
        .filter((f) => !/label: '[^']*文字[^']*'/.test(f));
      expect(alignFields.length, `${name} 没有任何 align 字段`).toBeGreaterThan(0);
      for (const f of alignFields) {
        expect(f, `${name} 的 align 字段仍内联选项：${f.slice(0, 60)}`).toMatch(/options: ALIGN_OPTIONS/);
      }
    }
  });
});

describe('normalizeAlign：非法回落按调用点给', () => {
  test('合法值原样返回', () => {
    for (const v of ['left', 'center', 'right']) expect(normalizeAlign(v)).toBe(v);
  });

  test('非法/未设 → fallback（按钮 center、搜索框 left，写死一个会让存量视觉突变）', () => {
    for (const bad of [undefined, null, '', 'weird', 123, 'LEFT']) {
      expect(normalizeAlign(bad, 'center')).toBe('center');
      expect(normalizeAlign(bad, 'left')).toBe('left');
    }
  });
});

describe('offsetShiftStyle：偏移叠加，不碰 margin', () => {
  test('0 / 非法 → 空对象（调用方合并时保持对齐基准不变）', () => {
    for (const v of [0, undefined, null, '', NaN, 'abc']) {
      expect(offsetShiftStyle(v), String(v)).toEqual({});
    }
  });

  test('px / rpx 两种单位（rpx = C 端 750 设计稿 ×2）', () => {
    expect(offsetShiftStyle(12)).toEqual({ position: 'relative', left: '12px' });
    expect(offsetShiftStyle(12, { unit: 'px' })).toEqual({ position: 'relative', left: '12px' });
    expect(offsetShiftStyle(12, { unit: 'rpx' })).toEqual({ position: 'relative', left: '24rpx' });
  });

  test('负数向左（left 为负），不取绝对值', () => {
    expect(offsetShiftStyle(-8).left).toBe('-8px');
    expect(offsetShiftStyle(-8, { unit: 'rpx' }).left).toBe('-16rpx');
  });

  test('🔴 用 relative+left，绝不用 marginLeft（会覆盖 align 的 auto）', () => {
    const s = offsetShiftStyle(10);
    expect(s.marginLeft).toBeUndefined();
    expect(s.position).toBe('relative');
  });
});

describe('clearedOffsetsFor：切对齐 → 偏移清零', () => {
  test('只清**实际存在**的键，不凭空塞字段', () => {
    expect(clearedOffsetsFor({ align: 'center', boxOffsetX: 12 })).toEqual({ boxOffsetX: 0 });
    expect(clearedOffsetsFor({ align: 'center', offsetX: -6 })).toEqual({ offsetX: 0 });
    expect(clearedOffsetsFor({ align: 'center' })).toEqual({});
    expect(clearedOffsetsFor({})).toEqual({});
  });

  test('两个历史 key 都要认（boxOffsetX=按钮/搜索框、offsetX=文本公告）', () => {
    expect(ALIGN_OFFSET_KEYS).toEqual(['boxOffsetX', 'offsetX']);
    expect(clearedOffsetsFor({ boxOffsetX: 5, offsetX: 5 })).toEqual({ boxOffsetX: 0, offsetX: 0 });
  });
});

describe('🔴 三处渲染都必须走共享实现（禁各写一份 marginLeft）', () => {
  const RENDERERS = [
    ['C 端 CardCompItem.vue', stripComments(read('../components/CardCompItem.vue'))],
    ['C 端 DesignPage.vue', stripComments(read('../components/DesignPage.vue'))],
    ['admin ComponentRender.vue', stripComments(read('../../../web-admin/src/views/customer/apps/design/ComponentRender.vue'))],
  ];

  test('公告偏移用共享 offsetShiftStyle，不再自己写 marginLeft', () => {
    for (const [name, src] of RENDERERS) {
      expect(src, `${name} 未引用 offsetShiftStyle`).toMatch(/import \{ offsetShiftStyle \}/);
      // 「旧实现已移除」类断言必须先剥注释，否则说明注释里的同字面量会造成假失败
      expect(src, `${name} 仍在用 marginLeft 表达公告偏移`).not.toMatch(/s\.marginLeft = off/);
      expect(src, `${name} 仍在用 marginLeft 表达公告偏移`).not.toMatch(/st\.marginLeft = off/);
    }
  });

  test('🔴 共享实现里不许再出现「偏移覆盖对齐」的旧写法', () => {
    const core = stripComments(read('./containerChildSize.js'));
    expect(core).toMatch(/Object\.assign\(s, offsetShiftStyle\(/);
    expect(core).not.toMatch(/s\.marginLeft = unit === 'px'/);
  });
});
