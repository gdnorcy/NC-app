/**
 * 装修页第二批反馈（🔴 #326）回归锁
 *
 * 1) 文本组件「前置符号没有生效」——CardCompItem 曾写成
 *    `const { shape, text } = computed(...)`：对 ref 对象解构 .shape/.text
 *    恒为 undefined（ref 上没这两个属性，要 .value 才有）→ v-if 永远为假。
 *    这是**Vue 运行时语义**错误：真机才炸，源码正则是唯一能提前拦住它的手段
 *    （已并入 noticeSymbol.test.js；本文件只钉「三处渲染都还在」这条）。
 *
 * 2) 图片「限高设了整图消失」——限高分支原先给 width:auto/height:auto。
 *    uni 的 image **不是替换元素**（H5 是 div 包裹层、MP 是自定义组件），
 *    没有内在尺寸，auto → 高度塌成 0 → 元素不可见。必须给**显式盒高**。
 *    admin 画布是浏览器真 <img>（auto 能撑开）反而看不出问题——
 *    「画布绿 ≠ 真机对」的又一例。默认限高 350（用户 #326 指定）。
 *
 * 3) 新增「图形按钮组」（icon-menu，最多 5 个）：两端 registry + 三处渲染必须齐。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const item = () => stripComments(read('../../components/CardCompItem.vue'));
const design = () => stripComments(read('../../components/DesignPage.vue'));
const adminRender = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/ComponentRender.vue'));
const adminEditor = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/PageEditor.vue'));
const registry = () => stripComments(read('./cardCompRegistry.js'));
const adminRegistry = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js'));
const cardEdit = () => stripComments(read('./cardEdit.vue'));

/** 三个渲染点（C 端名片 / C 端首页商场 / admin 画布） */
const RENDERERS = [
  ['名片 CardCompItem', item, 'cc-iconmenu', 'cc-iconmenu'],
  ['首页商场 DesignPage', design, 'dp-iconmenu', 'dp-iconmenu'],
  ['admin 画布 ComponentRender', adminRender, 'r-iconmenu', 'r-iconmenu'],
];

describe('🔴 图片限高：不许再用 auto 尺寸（会塌缩成 0 = 整图消失）', () => {
  test('三处渲染都不把图片宽/高设成 auto 来限高', () => {
    for (const [name, readFn] of RENDERERS) {
      const s = readFn();
      // 限高分支里出现 `width: 'auto'` 或 `s.width = 'auto'` 就是塌缩元凶
      expect(s, `${name} 仍在用 auto 尺寸限高`).not.toMatch(/maxHeight[^;]{0,80}width:\s*'auto'/);
    }
  });

  test('CardCompItem 限高给显式盒高 + aspectFit，默认 350', () => {
    const s = item();
    expect(s).toMatch(/imgMaxHeight > 0 \? \{ height: imgMaxHeight \+ 'px'/);
    expect(s).toMatch(/imgMaxHeight > 0 \? 'aspectFit' : 'widthFix'/);
    // 字段未设 → 350；显式 0 才是不限制
    expect(s).toMatch(/const raw = props\.value\.maxHeight/);
    expect(s).toMatch(/raw == null \|\| raw === ''\) return 350/);
  });

  test('DesignPage / admin 限高同口径（显式盒高，且只对图片组件开默认 350）', () => {
    // ⚠️ 这两个函数被图片/图文/轮播/图集共用，只有图片有 maxHeight 字段，
    //    「未设→350」必须由调用点用第二参显式打开，否则会误钉死图文卡片高度。
    expect(design()).toMatch(/dpImgStyle\(p, useMhDefault\)/);
    expect(design()).toMatch(/useMhDefault && \(p\.maxHeight == null/);
    expect(adminRender()).toMatch(/imgFillStyle\(p, useMhDefault\)/);
    // 图片组件的三处调用点都传了 true
    expect(design().match(/dpImgStyle\(c\.props, true\)/g) || []).toHaveLength(3);
    expect(adminRender().match(/imgFillStyle\(comp\.props, true\)/g) || []).toHaveLength(3);
  });

  test('两端 registry 的 image 默认限高是 350', () => {
    for (const [name, readFn] of [['移动端', registry], ['admin', adminRegistry]]) {
      const m = readFn().match(/type: 'image'[\s\S]{0,900}?defaultProps: \{([^}]*)\}/);
      expect(m, `${name} image defaultProps 未找到`).toBeTruthy();
      expect(m[1], `${name} 默认限高不是 350`).toMatch(/maxHeight: 350/);
    }
  });
});

describe('🔴 面板 radio：空值必须回落 schema default（存量 linkType="" 不亮）', () => {
  test('cardEdit 用 radioVal 判定选中（不裸绑 props[f.key]）', () => {
    const s = cardEdit();
    expect(s).toMatch(/:class="\{ on: String\(radioVal\(f\)\) === String\(o\.value\) \}/);
    expect(s).toMatch(/function radioVal\(f\)/);
    expect(s).toMatch(/f\.default !== undefined \? f\.default : v/);
  });

  test('admin 面板组件级 radio/radioButton/graphic 都用 propVal 兜底', () => {
    const s = adminEditor();
    expect(s).toMatch(/function propVal\(f\)/);
    expect(s).toMatch(/:model-value="propVal\(f\)" @update:model-value="selectedComp\.props\[f\.key\] = \$event"/);
    expect(s).toMatch(/:class="\{ active: String\(propVal\(f\)\) === String\(o\.value\) \}/);
  });
});

describe('图形按钮组 icon-menu（🔴 #326 新增）', () => {
  test('两端 registry 都有 icon-menu，defaultProps 逐字一致', () => {
    const mob = registry().match(/type: 'icon-menu'[\s\S]{0,1200}?defaultProps: \{([\s\S]*?)\n {4}\},/);
    const adm = adminRegistry().match(/type: 'icon-menu'[\s\S]{0,1200}?defaultProps: \{([\s\S]*?)\n {4}\},/);
    expect(mob, '移动端缺 icon-menu').toBeTruthy();
    expect(adm, 'admin 缺 icon-menu').toBeTruthy();
    // 默认图标 = 设计中心按钮组同款素材（menuIconUrl），默认 4 项、最多 5 项
    for (const body of [mob[1], adm[1]]) {
      expect(body).toMatch(/iconUrl: menuIconUrl\(i \+ 1\)/);
      expect(body).toMatch(/items: \['一', '二', '三', '四'\]/);
      expect(body).toMatch(/iconSize: 28/);
    }
    // 两端 defaultProps 同构：items 用 map 生成（linkType 写一次）、图标走 menuIconUrl
    expect(mob[1]).toMatch(/linkType: 'internal'/);
    expect(adm[1]).toMatch(/linkType: 'internal'/);
  });

  test('admin 端限制最多 5 个', () => {
    expect(adminRegistry()).toMatch(/type: 'icon-menu'[\s\S]{0,1600}?listMax: 5/);
  });

  test('三处渲染都有 icon-menu 分支', () => {
    for (const [name, readFn, cls] of RENDERERS) {
      const s = readFn();
      expect(s, `${name} 缺 icon-menu 渲染`).toMatch(/type === 'icon-menu'/);
      expect(s, `${name} 缺 ${cls} 样式`).toContain(`.${cls}`);
    }
  });

  test('每个按钮带自己的链接配置（items[bi] 而非组件级 props）', () => {
    // 🔴 记忆规则「子组件自身配置 ≠ 父级配置」：不传 it 会退化成组件级 internal（永远跳不对）
    expect(item()).toMatch(/@click="onTap\('link', it\.url, it\)"/);
    expect(design()).toMatch(/@click="onJump\(compLink\(it\)\)"/);
  });

  test('cardEdit 有专属编辑器：最多 5 个 + 图标预设格', () => {
    const s = cardEdit();
    expect(s).toMatch(/editing\.type === 'icon-menu'/);
    expect(s).toMatch(/editing\.props\.items\.length < 5/);
    expect(s).toMatch(/function addIconItem\(\)/);
    expect(s).toMatch(/ICON_PRESETS/);
    // item 作用域的链接配置（与 buttons 分列，别混用 'btn'）
    expect(s).toMatch(/t\.scope === 'item'/);
    expect(s).toMatch(/scope: 'item', index: bi/);
  });

  test('server 组件类型白名单已含 icon-menu', () => {
    expect(read('../../../../server/src/routes/card.js')).toMatch(/COMP_TYPES = \[[^\]]*'icon-menu'/);
  });
});