import { describe, it, expect } from 'vitest';
import {
  searchBoxSizeStyle, buttonSizeStyle, containerChildSizeStyle, DESIGN_VIEWPORT_PX,
} from './containerChildSize.js';

/**
 * 容器内子组件宽度与「容器左右边距」解耦（2026-10-07，用户反馈四轮）
 *
 * 🔴 用户反馈演进，是**同一个病被反复报**：
 *   1「组件『按钮』容器的左右边框调整，会调整按钮的大小，要区分按钮的大小调节和窗口的大小调节。」
 *   2「容器左右边距调了会同步调小搜索框，没有单独调搜索框大小的了。」
 *   3「容器左右边距还是会影响搜索框的大小，还是之前的坑。」← 前两轮方案都错了
 *
 * 🔴🔴 病根（像素实测，375px 容器 + 60% 宽搜索框，改容器 marginLR）：
 *     marginLR=0  → 宽 225px
 *     marginLR=20 → 宽 201px   ← 掉了 24px
 *     marginLR=40 → 宽 177px   ← 又掉了 24px
 *   **百分比永远参照「容器内容宽」** → 容器一变窄，子组件必然跟着变窄。
 *   第一轮「负 margin 抵消」失败（盖底色/溢出/偏左），第二轮「百分比」也失败。
 *   ✅ 正解：宽度用**视口单位**（C 端 vw / admin 按 375px 换算 px）→ 与容器边距彻底无关。
 *   ⚠️ 本文件的核心职责就是**防止有人再改回百分比**。
 */
describe('containerChildSizeStyle 容器内子组件宽度', () => {
  it('🔴🔴 宽度必须用视口单位，禁止百分比（百分比永远参照容器内容宽）', () => {
    for (const fn of [searchBoxSizeStyle, buttonSizeStyle]) {
      for (const p of [{ widthMode: 'full' }, { widthMode: 'full', widthPercent: 60 },
        { widthMode: 'full', marginLR: 20 }, { widthMode: 'full', widthPercent: 60, marginLR: 40 }]) {
        const w = String(fn(p).width);
        expect(w, JSON.stringify(p)).not.toMatch(/%$/);
      }
    }
    // C 端发 vw；admin 侧发按 375px 设计稿换算的 px
    expect(searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60 }).width).toBe('60vw');
    expect(searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60 }, { unit: 'px' }).width)
      .toBe(`${(60 * DESIGN_VIEWPORT_PX) / 100}px`);
  });

  it('🔴 宽度只由 widthPercent 决定，与容器 marginLR 无关（解耦核心）', () => {
    for (const unit of ['vw', 'px']) {
      const widths = [0, 10, 20, 40].map(
        (lr) => searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60, marginLR: lr }, { unit }).width,
      );
      expect(new Set(widths).size, `unit=${unit} 出现不同宽度：${widths}`).toBe(1);
    }
  });

  it('🔴 flex 子项必须覆盖 flex（否则 flex:1 会把 width 压掉、滑块没反应）', () => {
    const s = searchBoxSizeStyle({ widthMode: 'full', widthPercent: 60 });
    expect(s.flex).toBe('none');
    // 反例对照：非 flex 容器的按钮不需要 flex 字段
    expect(buttonSizeStyle({ widthMode: 'full', widthPercent: 60 }).flex).toBeUndefined();
  });

  it('🔴 两个分支都必须显式 display:block（inline 类里 auto 边距被当0）', () => {
    for (const p of [{ widthMode: 'full' }, { widthMode: 'full', widthPercent: 60 }, { widthMode: 'auto' }]) {
      const s = searchBoxSizeStyle(p);
      expect(s.display, JSON.stringify(p)).toBe('block');
      expect(String(s.display)).not.toContain('inline');
      // 搜索框：左侧不 auto，剩余空间全让给右侧铃铛（见下方「铃铛贴右」用例）
      expect(s.marginLeft).toBe('0');
      expect(s.marginRight).toBe('auto');
      // 按钮：容器内居中，两侧 auto
      const b = buttonSizeStyle(p);
      expect(b.display, JSON.stringify(p)).toBe('block');
      expect(b.marginLeft).toBe('auto');
      expect(b.marginRight).toBe('auto');
    }
  });

  it('🔴 搜索框 margin-right:auto 把剩余空间让给铃铛（否则铃铛被推到中间/居左）', () => {
    // 用户反馈「搜索框右边的信息提示图标一直居左，感觉是多余的」：
    // 两侧 auto 会平分剩余空间 → 铃铛既不贴右也不贴左。
    for (const p of [{ widthMode: 'full' }, { widthMode: 'full', widthPercent: 60 }, { widthMode: 'auto' }]) {
      const s = searchBoxSizeStyle(p);
      expect(s.marginLeft, JSON.stringify(p)).toBe('0');
      expect(s.marginRight, JSON.stringify(p)).toBe('auto');
    }
  });

  // 🔴 #327：偏移从「覆盖 marginLeft」改成「position:relative + left」——
  //   覆盖会让对齐写好的 marginLeft:auto 失效（居中/居右当场变居左，切对齐毫无反应）。
  it('🔴 #327 boxOffsetX 用 relative+left 表达，不碰 marginLeft', () => {
    // C 端 px 语义 → rpx（×2）；admin 直接 px
    const c = searchBoxSizeStyle({ widthMode: 'full', boxOffsetX: 12 });
    expect(c.position).toBe('relative');
    expect(c.left).toBe('24rpx');
    expect(searchBoxSizeStyle({ widthMode: 'full', boxOffsetX: 12 }, { unit: 'px' }).left).toBe('12px');
    // auto 分支同样要生效（曾漏掉，用户在自适应模式下就没法微调）
    expect(searchBoxSizeStyle({ widthMode: 'auto', boxOffsetX: 12 }).left).toBe('24rpx');
    expect(buttonSizeStyle({ widthMode: 'full', boxOffsetX: 10 }).left).toBe('20rpx');
    expect(buttonSizeStyle({ widthMode: 'full', boxOffsetX: 10 }, { unit: 'px' }).left).toBe('10px');
  });

  it('boxOffsetX = 0 / 未设 时不产生位移（保持 align 给的边距）', () => {
    for (const v of [0, undefined, null, '', NaN]) {
      const sb = searchBoxSizeStyle({ widthMode: 'full', boxOffsetX: v });
      expect(sb.left, String(v)).toBeUndefined();
      expect(sb.position, String(v)).toBeUndefined();
      expect(sb.marginLeft, String(v)).toBe('0');
      const b = buttonSizeStyle({ widthMode: 'full', boxOffsetX: v });
      expect(b.left, String(v)).toBeUndefined();
      expect(b.position, String(v)).toBeUndefined();
      expect(b.marginLeft, String(v)).toBe('auto');
      // auto 模式也不受影响
      expect(buttonSizeStyle({ widthMode: 'auto', boxOffsetX: v }).marginLeft, String(v)).toBe('auto');
    }
  });

  it('auto 模式：fit-content（内容宽；搜索框靠左、按钮居中）', () => {
    const s = searchBoxSizeStyle({ widthMode: 'auto' });
    expect(s.width).toBe('fit-content');
    expect(s.flex).toBe('none');
    expect(s.marginLeft).toBe('0');
    expect(s.textAlign).toBe('center');
    const b = buttonSizeStyle({ widthMode: 'auto' });
    expect(b.width).toBe('fit-content');
    expect(b.marginLeft).toBe('auto');
    expect(b.marginRight).toBe('auto');
  });

  it('🔴 max-width 必须用视口基准，不能用 100%（100% 参照容器内容宽 → 破坏解耦）', () => {
    // 实测：max-width:100% 时 marginLR=0/20/40 → 宽 300/300/295px，最后一行被压 5px。
    // 这是「解耦后又残留的耦合」，很容易在加兜底时无意间引入。
    expect(searchBoxSizeStyle({ widthMode: 'full' }).maxWidth).toBe('100vw');
    expect(searchBoxSizeStyle({ widthMode: 'auto' }).maxWidth).toBe('100vw');
    expect(searchBoxSizeStyle({ widthMode: 'full' }, { unit: 'px' }).maxWidth).toBe('375px');
    for (const fn of [searchBoxSizeStyle, buttonSizeStyle]) {
      expect(String(fn({ widthMode: 'full', widthPercent: 60 }).maxWidth)).not.toBe('100%');
      expect(String(fn({ widthMode: 'auto' }).maxWidth)).not.toBe('100%');
    }
  });

  it('存量默认（未设 widthPercent）：满屏 100%，视觉不变', () => {
    for (const fn of [searchBoxSizeStyle, buttonSizeStyle]) {
      const s = fn({});
      expect(s.width).toBe('100vw');
      expect(s.boxSizing).toBe('border-box');
      expect(fn({}, { unit: 'px' }).width).toBe('375px');
    }
  });

  it('百分比夹取到 20~100（非法 → 100）', () => {
    const f = (v) => containerChildSizeStyle({ widthMode: 'full', widthPercent: v }, { flexChild: true }).width;
    expect(f(5)).toBe('20vw');
    expect(f(999)).toBe('100vw');
    expect(f('abc')).toBe('100vw');
    expect(f(0)).toBe('100vw');
  });

  it('按钮 auto 模式额外加左右内边距（搜索框自身有 padding，不要重复加）', () => {
    expect(buttonSizeStyle({ widthMode: 'auto' }).padding).toBe('0 12px');
    expect(searchBoxSizeStyle({ widthMode: 'auto' }).padding).toBeUndefined();
  });

  it('🔴 不得再出现负 margin 溢出补偿 / calc 溢出法（按钮第一轮的错误方案）', () => {
    for (const fn of [searchBoxSizeStyle, buttonSizeStyle]) {
      for (const p of [{ widthMode: 'full' }, { widthMode: 'full', marginLR: 20 }, { widthMode: 'auto', marginLR: 20 }]) {
        const s = fn(p);
        expect(String(s.width)).not.toContain('calc');
        // 唯一允许的负值是用户显式设置的 boxOffsetX
        if (!('boxOffsetX' in p)) {
          expect(String(s.marginLeft || '')).not.toContain('-');
          expect(String(s.marginRight || '')).not.toContain('-');
        }
      }
    }
  });

  it('样式对象不残留 undefined（小程序 setStyle 整条失效）', () => {
    for (const p of [{}, { widthMode: 'auto' }, { widthMode: 'full' }, { widthMode: 'full', marginLR: 0 },
      { widthMode: 'full', boxOffsetX: 0 }, { widthMode: 'full', boxOffsetX: 8 }]) {
      for (const [k, v] of Object.entries(searchBoxSizeStyle(p))) {
        expect(v, k).not.toBeUndefined();
        expect(String(v), k).not.toContain('undefined');
      }
    }
  });
  // ===== 原 btnSize.test.js 的按钮专项断言，已迁到这里 =====
  // 🔴 2026-10-07 删除 `btnSize.test.js`：它是 btnSize.js 的配套测试，而 btnSize.js 已退化为
  //   纯转发壳（真实实现全在 containerChildSize.js）→ 两份测试锁同一件事、必然漂移。
  //   现在所有断言集中在本文件，唯一事实来源。
  describe('buttonSizeStyle 按钮专项（居中）', () => {
    it('自适应模式：内容宽(fit-content) + 居中', () => {
      const s = buttonSizeStyle({ widthMode: 'auto' });
      // 🔴 回归锁：width:auto 会被 block 撑满容器（实测），必须是 fit-content
      expect(s.width).toBe('fit-content');
      expect(s.padding).toBe('0 12px');
      expect(s.marginLeft).toBe('auto');
      expect(s.marginRight).toBe('auto');
      expect(s.textAlign).toBe('center');
    });

    it('🔴 自适应必须是 block + fit-content（inline-block 不居中 / block+auto 撑满，均实测）', () => {
      const s = buttonSizeStyle({ widthMode: 'auto' });
      // 组件基础类（.r-btn / .dp-btn）是 inline-block，其 auto 边距被当 0 → 必须显式 block
      expect(s.display).toBe('block');
      expect(s.width).toBe('fit-content');
    });

    it('整行模式：视口宽度 + 两侧 auto 居中（无负 margin、无 calc 溢出）', () => {
      for (const pct of [50, 60, 80]) {
        const s = buttonSizeStyle({ widthMode: 'full', widthPercent: pct });
        expect(s.width).toBe(`${pct}vw`);
        expect(s.marginLeft).toBe('auto');
        expect(s.marginRight).toBe('auto');
        expect(String(s.width)).not.toContain('calc');
      }
    });
  });
});

// 🔴 反馈 #321：按钮横向对齐（居左/居中/居右）与左边偏移的联动
describe('align：按钮横向对齐（#321）', () => {
  it('居中（默认，未设 align 时也居中）：两侧 auto', () => {
    for (const p of [{}, { align: undefined }, { align: 'center' }]) {
      const s = containerChildSizeStyle(p);
      expect(s.marginLeft, JSON.stringify(p)).toBe('auto');
      expect(s.marginRight, JSON.stringify(p)).toBe('auto');
    }
  });

  it('居左：左贴容器左边（marginLeft=0，剩余空间全让给右侧）', () => {
    const s = containerChildSizeStyle({ align: 'left' });
    expect(s.marginLeft).toBe('0');
    expect(s.marginRight).toBe('auto');
  });

  it('居右：右贴容器右边（marginRight=0）', () => {
    const s = containerChildSizeStyle({ align: 'right' });
    expect(s.marginLeft).toBe('auto');
    expect(s.marginRight).toBe('0');
  });

  it('非法 align 一律回落居中（不崩、不产生无效边距）', () => {
    for (const bad of ['weird', 'center ', null, 123]) {
      const s = containerChildSizeStyle({ align: bad });
      expect(s.marginLeft, String(bad)).toBe('auto');
      expect(s.marginRight, String(bad)).toBe('auto');
    }
  });

  // 🔴🔴 这是 #327 的核心回归：旧口径「设了偏移就以偏移为准」= 偏移**覆盖**对齐，
  //   后果是居中/居右失效（看起来都像居左），且偏移≠0 时切对齐界面毫无反应
  //   —— 用户原话「居左、居右、居中三个参数感觉不太对」。
  it('🔴 #327 偏移**叠加**在对齐基准上：两者必须同时生效', () => {
    const basisLeft = { left: '0', center: 'auto', right: 'auto' };
    const basisRight = { left: 'auto', center: 'auto', right: '0' };
    for (const align of ['left', 'center', 'right']) {
      const s = containerChildSizeStyle({ align, boxOffsetX: 12 });
      expect(s.marginLeft, align).toBe(basisLeft[align]);   // 基准**仍在**，没被偏移吃掉
      expect(s.marginRight, align).toBe(basisRight[align]);
      expect(s.position, align).toBe('relative');
      expect(s.left, align).toBe('24rpx');                  // 偏移叠加（C 端 px→rpx ×2）
    }
    // admin 侧用 px 基准
    const px = containerChildSizeStyle({ align: 'left', boxOffsetX: 12 }, { unit: 'px' });
    expect(px.left).toBe('12px');
    expect(px.marginLeft).toBe('0');
  });

  it('boxOffsetX=0 或非法时不偏移（保持 align 给的边距）', () => {
    for (const v of [0, null, undefined, 'abc', NaN]) {
      const s = containerChildSizeStyle({ align: 'left', boxOffsetX: v });
      expect(s.marginLeft, String(v)).toBe('0');
    }
  });

  it('textAlign 仍是 center（管按钮内文字，与 align 是两件事，别删）', () => {
    // 🔴 历史行为：按钮内部文字居中。删掉它会让 align=left 时按钮内文字贴左。
    for (const align of ['left', 'center', 'right']) {
      expect(containerChildSizeStyle({ align }).textAlign, align).toBe('center');
      expect(containerChildSizeStyle({ align, widthMode: 'auto' }).textAlign, align).toBe('center');
    }
  });

  it('auto 模式下 align 同样生效（fit-content + 横向位置）', () => {
    const l = containerChildSizeStyle({ align: 'left', widthMode: 'auto' });
    expect(l.width).toBe('fit-content');
    expect(l.marginLeft).toBe('0');
  });

  it('buttonSizeStyle 与通用实现同口径（对齐基准 + 偏移叠加，两个都在）', () => {
    const s = buttonSizeStyle({ align: 'right', boxOffsetX: 8, widthMode: 'full' });
    expect(s.marginLeft).toBe('auto');     // align=right 的基准（旧口径这里会被改成 16rpx）
    expect(s.marginRight).toBe('0');
    expect(s.position).toBe('relative');
    expect(s.left).toBe('16rpx');          // 叠加的偏移
  });

  // 🔴 #327：搜索框新增 align 字段。此前渲染层写死「marginLeft:0; marginRight:auto」
  //   （注释里已预告「将来加 align 时这行会把它拽回左边」）→ 那两行必须已删除。
  it('🔴 #327 搜索框尊重 align（不再写死靠左），默认回落到 left', () => {
    expect(searchBoxSizeStyle({}).marginLeft).toBe('0');
    expect(searchBoxSizeStyle({}).marginRight).toBe('auto');
    expect(searchBoxSizeStyle({ align: 'center' }).marginLeft).toBe('auto');
    expect(searchBoxSizeStyle({ align: 'center' }).marginRight).toBe('auto');
    expect(searchBoxSizeStyle({ align: 'right' }).marginLeft).toBe('auto');
    expect(searchBoxSizeStyle({ align: 'right' }).marginRight).toBe('0');
    // 未设 align 的存量数据 → 回落 left（存量视觉就是靠左、铃铛贴右）
    expect(searchBoxSizeStyle({ align: undefined }).marginLeft).toBe('0');
  });

  it('宽度仍用视口单位（align 不许把解耦破坏掉）', () => {
    const s = containerChildSizeStyle({ align: 'left', widthPercent: 60 });
    expect(s.width).toBe('60vw');
    const px = containerChildSizeStyle({ align: 'left', widthPercent: 60 }, { unit: 'px' });
    expect(px.width).toBe('225px');       // 375 × 60%
  });
});
