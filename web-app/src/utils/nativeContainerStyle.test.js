import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { containerStyle as sharedContainerStyle } from './containerStyle.js';

/**
 * 原生组件（native-*）容器样式 —— **直接从真实源码提取执行**（2026-10-07）
 *
 * 🔴 背景：用户反馈「名片搜索框组件的参数有问题，跟『按钮』有同样的问题，
 *   背景设置也是设置组件本身，容器的背景设置没有地方设置」。
 *   病根：两端 `nativeMargin()` 只输出边距，**完全不消费 `compBgColor`** →
 *   面板通用项里那个「组件背景色」控件能拖、预览不变 = **参数被架空**。
 *
 * 🔴 为什么用「提取源码再执行」而不是抄一份副本：
 *   抄副本 = 锁的是副本，真实实现改了测试照样绿（本项目已吃过这个亏）。
 *   从 .vue 源文件里正则提取函数体、用 new Function 构造后执行 → 真实实现。
 *
 * ⚠️ 两端同源手写、互不共享（已因此只修一端、留半边 bug 两次）：
 *   - admin `web-admin/src/views/customer/apps/design/ComponentRender.vue`
 *   - C 端  `web-app/src/pages/cardMain/home.vue`
 *   下面 `两端实现一致` 一例专门锁这个。
 */

const ROOT = path.resolve(__dirname, '../../..');
const SRC = {
  admin: path.join(ROOT, 'web-admin/src/views/customer/apps/design/ComponentRender.vue'),
  cEnd: path.join(ROOT, 'web-app/src/pages/cardMain/home.vue'),
};

function loadNativeMargin(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/function nativeMargin\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (!m) throw new Error('未在 ' + file + ' 中匹配到 nativeMargin()');
  // eslint-disable-next-line no-new-func
  return new Function('return (' + m[0] + ')')();
}

const adminMargin = loadNativeMargin(SRC.admin);
const cEndMargin = loadNativeMargin(SRC.cEnd);

describe('nativeMargin 原生组件容器样式（真实源码）', () => {
  for (const [name, fn] of [['admin', adminMargin], ['C端', cEndMargin]]) {
    describe(name, () => {
      it('🔴 必须消费 compBgColor（容器底色）—— 否则面板控件被架空', () => {
        expect(fn({ compBgColor: '#e36f6f' }).background).toBe('#e36f6f');
      });

      it('compBgColor 未设/空串 → 不输出 background（保留组件自身底色）', () => {
        expect(fn({ compBgColor: '' }).background).toBeUndefined();
        expect(fn({}).background).toBeUndefined();
      });

      it('容器圆角用独立字段 radiusContainer，与组件自身 radius 不撞名', () => {
        const s = fn({ radiusContainer: 12, radius: 18 });
        expect(s.borderRadius).toBe('12px');
        expect(s.radius).toBeUndefined();
      });

      it('radiusContainer 未设/空串 → 不输出（CSS 兜底仍生效）', () => {
        expect(fn({ radius: 18 }).borderRadius).toBeUndefined();
        expect(fn({ radiusContainer: '' }).borderRadius).toBeUndefined();
      });

      it('左右边距读 marginLR，允许 0（故意通栏）', () => {
        expect(fn({ marginLR: 0 })).toMatchObject({ marginLeft: '0px', marginRight: '0px' });
        expect(fn({ marginLR: 12 })).toMatchObject({ marginLeft: '12px', marginRight: '12px' });
      });
    });
  }

  it('两端 marginBottom 缺省都兜 8px（保证卡间白缝，不会全部贴死）', () => {
    expect(adminMargin({}).marginBottom).toBe('8px');
    expect(cEndMargin({}).marginBottom).toBe('8px');
  });

  it('🔴 marginBottom=0 / marginTop=0 必须输出 0px（2026-10-16「上边距都设 3，我的名片上边距明显大了」）', () => {
    // 病根：曾用 if (mb) 把 0 吞掉 → C 端落到 CSS 兜底，而 .grid-section 兜底 16rpx(8px)、
    // .section 是 margin:0 → 同值不同缝（宫格→我的名片 8px，其余 3px）。
    // 0 = 故意贴边，必须内联 0px 压过 CSS 兜底。
    for (const fn of [adminMargin, cEndMargin]) {
      expect(fn({ marginBottom: 0 }).marginBottom).toBe('0px');
      expect(fn({ marginTop: 0 }).marginTop).toBe('0px');
      expect(fn({ marginTop: 3, marginBottom: 0 })).toMatchObject({ marginTop: '3px', marginBottom: '0px' });
      // 空串按缺省处理（mb 兜 8px，mt 不输出）
      expect(fn({ marginBottom: '' }).marginBottom).toBe('8px');
      expect(fn({ marginTop: '' }).marginTop).toBeUndefined();
    }
  });

  it('🔴 两端实现一致（marginLR / compBgColor / radiusContainer 的输出必须相同）', () => {
    const cases = [
      {}, { marginLR: 0 }, { marginLR: 12 }, { marginTop: 6, marginBottom: 10 },
      { compBgColor: '#123456' }, { radiusContainer: 8 },
      { marginLR: 8, marginTop: 4, marginBottom: 6, compBgColor: '#abc', radiusContainer: 10 },
    ];
    for (const c of cases) {
      const a = adminMargin(c);
      const b = cEndMargin(c);
      for (const k of ['marginLeft', 'marginRight', 'background', 'borderRadius']) {
        expect(String(a[k]), `两端 ${k} 不一致: ${JSON.stringify(c)}`).toBe(String(b[k]));
      }
    }
  });

  it('容器底色与组件自身底色 bgColor 是两个独立字段，互不影响', () => {
    for (const fn of [adminMargin, cEndMargin]) {
      const s = fn({ compBgColor: '#111', bgColor: '#f2f3f5' });
      expect(s.background).toBe('#111'); // 容器层
      expect(s.bgColor).toBeUndefined(); // 自身底色不走容器函数
    }
  });
});

describe('nativeMargin 容器圆角（2026-10-16「圆角为 0，预览图及小程序还是有圆角」）', () => {
  // 病根：白卡类 native-* 的容器圆角只有 CSS 写死（C端 var(--radius-md)=16rpx=8px /
  // admin .r-native-* 8px），面板「圆角」滑块设 0 完全不生效 = 参数被架空。
  // 修法：nativeMargin 增加第二参 opts，调用方 opt-in（containerRadius: true）消费 props.radius。
  const OPTS = { containerRadius: true };

  it('opt-in 后消费 props.radius，0 必须生效（方角）', () => {
    for (const fn of [adminMargin, cEndMargin]) {
      expect(fn({ radius: 0 }, OPTS).borderRadius).toBe('0px');
      expect(fn({ radius: 12 }, OPTS).borderRadius).toBe('12px');
    }
  });

  it('未 opt-in（搜索框等）不消费 radius —— 自身圆角语义不得误伤容器', () => {
    for (const fn of [adminMargin, cEndMargin]) {
      expect(fn({ radius: 12 }).borderRadius).toBeUndefined();
      expect(fn({ radius: 12 }, {}).borderRadius).toBeUndefined();
    }
  });

  it('radiusContainer 优先级仍高于 opt-in 的 radius（搜索容器不受影响）', () => {
    for (const fn of [adminMargin, cEndMargin]) {
      expect(fn({ radius: 0, radiusContainer: 10 }, OPTS).borderRadius).toBe('10px');
    }
  });

  it('radius 未设置/空串 → 不输出（CSS 兜底 8px 仍生效，两端兜底值一致）', () => {
    for (const fn of [adminMargin, cEndMargin]) {
      expect(fn({}, OPTS).borderRadius).toBeUndefined();
      expect(fn({ radius: '' }, OPTS).borderRadius).toBeUndefined();
    }
  });

  it('🔴 两端 opt-in 后输出仍一致', () => {
    const cases = [
      [{ radius: 0 }, OPTS], [{ radius: 12 }, OPTS], [{ radius: '' }, OPTS], [{}, OPTS],
      [{ radius: 0, radiusContainer: 10 }, OPTS],
      [{ radius: 8, marginLR: 10, compBgColor: '#fff' }, OPTS],
    ];
    for (const [props, opts] of cases) {
      const a = adminMargin(props, opts);
      const b = cEndMargin(props, opts);
      for (const k of ['marginLeft', 'marginRight', 'background', 'borderRadius']) {
        expect(String(a[k]), `两端 ${k} 不一致: ${JSON.stringify(props)}`).toBe(String(b[k]));
      }
    }
  });

  it('🔴 四个白卡调用点必须 opt-in（宫格/我的名片/访客雷达/人脉集市，两端各 4 处）', () => {
    const cSrc = fs.readFileSync(SRC.cEnd, 'utf8');
    const aSrc = fs.readFileSync(SRC.admin, 'utf8');
    // 漏挂 = 该组件容器圆角继续被 CSS 写死架空（本项目已两次只改一端）
    expect((cSrc.match(/containerRadius: true/g) || []).length).toBe(4);
    expect((aSrc.match(/containerRadius: true/g) || []).length).toBe(4);
    // 搜索栏不得 opt-in：radius 是搜索框自身圆角（C端走 topBarStyle 内部单参调用，
    // admin 是 native-search 模板的单参调用）
    expect(cSrc).toMatch(/nativeMargin\(props\);/);
    expect(aSrc).toMatch(/nativeMargin\(comp\.props\)"/);
  });

  it('🔴 admin 宫格容器必须挂 nativeMargin（曾漏挂 → 预览不消费边距/底色/圆角）', () => {
    const aSrc = fs.readFileSync(SRC.admin, 'utf8');
    expect(aSrc).toMatch(/class="r-native-grid" :style="\[nativeMargin\(comp\.props, \{ containerRadius: true \}\), gridPreviewStyle\(comp\.props\)\]"/);
  });

  it('🔴 宫格 schema 不得自带 marginLR（同名 key 会把通用「容器左右边距」去重隐藏）', () => {
    const reg = fs.readFileSync(
      path.join(ROOT, 'web-admin/src/views/customer/apps/design/componentRegistry.js'), 'utf8');
    const start = reg.indexOf("type: 'native-grid'");
    expect(start).toBeGreaterThan(-1);
    const end = reg.indexOf("type: 'native-mycard'");
    const block = reg.slice(start, end);
    expect(block).not.toContain("key: 'marginLR'");
  });

  it('🔴 集市 schema 不得暴露「卡片圆角」控件（预览恒空态看不到效果，被判与通用圆角重复）', () => {
    // cardRadius 只作用于 C 端集市列表里的人脉小卡（有数据才有），admin 预览恒为空态
    // → 滑块拖了永远不变 =「参数被架空」感知。控件移除，字段与 C 端消费保留（存量兼容）。
    const reg = fs.readFileSync(
      path.join(ROOT, 'web-admin/src/views/customer/apps/design/componentRegistry.js'), 'utf8');
    const start = reg.indexOf("type: 'native-market'");
    expect(start).toBeGreaterThan(-1);
    const block = reg.slice(start, reg.indexOf('];', start));
    expect(block).not.toContain("key: 'cardRadius'");
    // 字段与消费必须保留：defaultProps 仍带 cardRadius，C 端 market-card 仍读它
    expect(block).toMatch(/cardRadius: 12/);
    const cSrc = fs.readFileSync(SRC.cEnd, 'utf8');
    expect(cSrc).toMatch(/cardRadius \?\? 12/);
  });

  it('🔴 native-* 不显示「内边距」控件（渲染层不消费 props.padding，显示即架空）', () => {
    const pe = fs.readFileSync(
      path.join(ROOT, 'web-admin/src/views/customer/apps/design/PageEditor.vue'), 'utf8');
    expect(pe).toMatch(/nativeNoPadding/);
    expect(pe).toMatch(/startsWith\('native-'\)/);
  });
});

describe('画布 wrapper 不给 native-* 套 shared containerStyle（2026-10-16「marginLR=0 小程序正常、预览仍有边距」）', () => {
  // 病根：admin 画布对每个组件有三层容器样式 —— .pe-comp（compBoxStyle → containerStyle
  // 带 padding）→ .comp-render（containerStyle computed → margins/bg）→ .r-native-grid
  // （nativeMargin）。前两层是给**非原生**组件准备的；native-* 的几何全由内部 nativeMargin
  // 下发（与 C 端一致），wrapper 再套一层 = 双重生效：
  //   ① 存量 native-grid.props.padding=11（旧「内边距」滑块留下的值）让 wrapper 凭空多一圈
  //      11px 灰边 —— C 端不读 padding 所以真机正常、预览不对；
  //   ② marginLR 在 wrapper+inner 双重叠加（搜索栏 7px 被画成 14px 的隐性漂移）。
  // 修法：两层 wrapper 对 native-* 一律返回 {}（自包含），nativeMargin 全权负责。
  function loadCompBoxStyle() {
    const src = fs.readFileSync(
      path.join(ROOT, 'web-admin/src/views/customer/apps/design/PageEditor.vue'), 'utf8');
    const m = src.match(/function compBoxStyle\(c\)\s*\{[\s\S]*?\n\}/);
    if (!m) throw new Error('未匹配到 compBoxStyle()');
    // eslint-disable-next-line no-new-func
    return new Function('compContainerStyle', 'return (' + m[0] + ')')(sharedContainerStyle);
  }

  function loadAdminContainerComputed() {
    const src = fs.readFileSync(SRC.admin, 'utf8');
    const m = src.match(/const containerStyle = computed\(\(\) => \{([\s\S]*?)\n\}\);/);
    if (!m) throw new Error('未匹配到 containerStyle computed');
    // eslint-disable-next-line no-new-func
    return new Function('props', 'sharedContainerStyle', m[1]);
  }

  const compBoxStyle = loadCompBoxStyle();
  const adminContainer = loadAdminContainerComputed();

  it('🔴 compBoxStyle 对 native-* 必须返回空（wrapper 不吃 padding/margin/bg）', () => {
    // 存量实测数据：native-grid props.padding=11（旧滑块遗留）→ wrapper 曾输出 padding:11px
    expect(compBoxStyle({ type: 'native-grid', props: { padding: 11, marginLR: 0 } })).toEqual({});
    expect(compBoxStyle({ type: 'native-search', props: { marginLR: 7 } })).toEqual({});
    expect(compBoxStyle({ type: 'native-mycard', props: { compBgColor: '#fff' } })).toEqual({});
  });

  it('非 native 组件的 wrapper 行为不变（button 的 padding/marginLR 照常下发）', () => {
    const s = compBoxStyle({ type: 'button', props: { padding: 11, marginLR: 10 } });
    expect(s.padding).toBe('11px');
    expect(s.marginLeft).toBe('10px');
  });

  it('🔴 ComponentRender 的 containerStyle computed 对 native-* 必须返回空（marginLR 不再双重叠加）', () => {
    expect(adminContainer({ comp: { type: 'native-search', props: { marginLR: 7 } } }, sharedContainerStyle)).toEqual({});
    expect(adminContainer({ comp: { type: 'native-grid', props: { marginLR: 0 } } }, sharedContainerStyle)).toEqual({});
  });

  it('非 native 组件的 .comp-render 容器行为不变', () => {
    const s = adminContainer({ comp: { type: 'button', props: { marginLR: 10 } } }, sharedContainerStyle);
    expect(s.marginLeft).toBe('10px');
  });
});