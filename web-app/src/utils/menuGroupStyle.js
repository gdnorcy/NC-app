/**
 * 按钮组（menu-group）样式计算 —— C 端 `DesignPage.vue` 与 admin 画布
 * `ComponentRender.vue` **共用的唯一事实来源**。
 *
 * 🔴 全部数值来自对标站（eweishop，内部键名 `menu`）CDP 实测，不是目测/经验值：
 *   逐档切换属性面板 radio → 读 `decorateItem[0].params/.style` diff → 再量
 *   `getComputedStyle` 交叉验证，两边对得上才落代码。
 *
 * 实测基线（画布 375 逻辑宽 · 每项 93.75 = 375/4）：
 *   根容器.es-menu-group  padding 4px 0 · margin 8px 0 · overflow hidden
 *   每项    .es-icon-col   padding 8px 0 · 宽 = 100/列数%
 *   图区    .icon          50×50 · margin 0 auto
 *   图      .img           43×43 · margin 3.5px（由形状控border-radius）
 *   角标.mark         29×14 · 整块 scale(0.5)：真实 fs 16px/lh 28px/padding 0/radius 16px
 *                    → 视觉 8px/14px/radius 8px。我方不引入缩放，直接按视觉值写 CSS。
 *   文字    .text          margin 4px 0 0 · lh = fontSize + 7 · 单行省略
 *   列高    8(图区 50) + 4(文字上边距) + 21(文字) + 8 = 91
 *
 * 三档差异（实测）：
 *   按钮形状 navShape   square→radius 0 / arc→10px / circle→50%
 *   按钮样式 navStyle   style1 图+文（高 91）/ style2 仅图（高 66）/ style3 仅文（高 41）
 *   组件样式 newStyle   shadow→box-shadow rgba(226,231,244,.7) 0 0 10px
 *                       border→border 1px solid borderColor（根高 99→101）
 *   组件风格 showStyle  scroll→列宽固定 64.61px + 横向可滑 + margin 0 8px
 *                       swiper→内层再包一层，底部加20px 放指示点
 */

/** 实测：形状 → 圆角（px）。50% 是圆形，单独标记避免被当数值用 */
export const MENU_SHAPE_RADIUS = { square: 0, arc: 10, circle: '50%' };

/**
 * 图标类型（按钮类型=2）的图标颜色。
 * 来源：对标站 `style.iconColor` 的默认值 `#666666`（该字段未在属性面板暴露，是隐藏配置，
 * 面板「颜色选择」只有 底部背景/组件背景/文字颜色 三项），故本端先固定用此值。
 */
export const MENU_ICON_COLOR = '#666666';

/** 实测：按钮样式 → 是否显示图 / 是否显示文字 */
export const MENU_STYLE_PARTS = {
  style1: { img: true, text: true },
  style2: { img: true, text: false },
  style3: { img: false, text: true },
};

/** 实测：滑块范围（由默认值与百分比反推：边距 8→16% ⇒ 0~50；圆角 4→20% ⇒ 0~20；字号 14→66.7% ⇒ 8~17） */
export const MENU_LIMITS = {
  margin: { min: 0, max: 50 },
  radius: { min: 0, max: 20 },
  fontSize: { min: 8, max: 17 },
  imgSize: { min: 20, max: 60 },
};

/** 组件样式档 → 根容器附加类（与对标站根 class 一致，便于并排比对） */
export function menuRootClass(p) {
  const cls = ['mg-root'];
  // ⚠️ 列数是**数字或数字字符串**都要吃得下（对标站 params.rowNum 是字符串 "3"/"4"/"5"，
  // 本项目存数字；两边都过一遍 Number 归一，别写死 ===4）。
  // 🔴 必须用 else 兜底给一个合法值：`if (col >= 1 && col <= 5)` 在 columns 为 0 /
  //   '' / undefined 时**不生成列 class**，CSS 里没有 .mg-col-* 规则 → 每项没有
  //   宽度约束 → 整行拉满，表现为「列数设了没反应」。存量脏数据（columns:0）也会命中。
  const col = menuColCount(p.columns);
  cls.push('mg-col-' + col);
  const shape = p.navShape || 'circle';
  if (MENU_SHAPE_RADIUS[shape] !== undefined) cls.push('mg-' + shape);
  if (p.showStyle === 'scroll') cls.push('mg-scroll');
  return cls.join(' ');
}

/** 列数归一：夹到 1~5，非法值（含 0/''/undefined/NaN）一律回落 4（对标站默认 rowNum=4） */
export function menuColCount(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(5, n);
}

/** 根容器内联样式（颜色 / 圆角 / 边距 / 阴影描边全落这里 —— 实测都在根上） */
export function menuRootStyle(p) {
  const s = {};
  // 组件背景（对标站 style.background，默认 #ffffff）
  if (p.compBgColor) s.backgroundColor = p.compBgColor;
  // 描边：实测 border 1px solid #ededed，**会占布局**（根高 99→101），故不设 box-sizing  tricks
  if (p.newStyle === 'border') {
    s.border = '1px solid ' + (p.borderColor || '#EDEDED');
  }
  // 投影：实测 rgba(226,231,244,0.7) 0px 0px 10px 0px（**不占布局**，根高不变）
  if (p.newStyle === 'shadow') {
    s.boxShadow = 'rgba(226, 231, 244, 0.7) 0px 0px 10px 0px';
  }
  const rt = Number(p.radiusTop) || 0;
  const rb = Number(p.radiusBottom) || 0;
  // 实测只有上/下圆角两个独立值（四角并非全独立），故拼四条
  s.borderTopLeftRadius = rt + 'px';
  s.borderTopRightRadius = rt + 'px';
  s.borderBottomLeftRadius = rb + 'px';
  s.borderBottomRightRadius = rb + 'px';
  s.marginTop = (Number(p.marginTop) || 0) + 'px';
  s.marginBottom = (Number(p.marginBottom) || 0) + 'px';
  const lr = Number(p.marginLR) || 0;
  s.marginLeft = lr + 'px';
  s.marginRight = lr + 'px';
  // 实测根 padding 恒为 4px 0（不是 0）：这是「上下各留 4px 让投影/描边不贴边」的设计
  s.padding = '4px 0';
  return s;
}

/** 单项样式：宽 = 100/列数%；滑动档实测是固定 64.61px（不是百分比） */
export function menuItemStyle(p) {
  const col = menuColCount(p.columns);
  const s = { width: (100 / col).toFixed(4) + '%' };
  if (p.showStyle === 'scroll') {
    // 实测：单行滑动时列宽固定 ~64.61px 且列间有 8px 间距（不是均分）
    s.width = '64.61px';
    s.marginRight = '8px';
    s.flexShrink = '0';
  }
  return s;
}

/** 图区（.icon）样式：实测 50×50 居中；滑动档左右外边距由固定宽推导，这里交给 CSS 的margin auto */
export function menuIconStyle(p) {
  const size = Math.min(80, Math.max(16, Number(p.imgSize) || 43));
  // 实测：imgSize 参数控的是**图**（.img，实测 43px），.icon 恒 50px（= imgSize + 7）
  return { width: (size + 7) + 'px', height: (size + 7) + 'px' };
}

/** 图（.img）样式 */
export function menuImgStyle(p) {
  const size = Math.min(80, Math.max(16, Number(p.imgSize) || 43));
  const r = MENU_SHAPE_RADIUS[p.navShape || 'circle'];
  const s = { width: size + 'px', height: size + 'px' };
  // 🔴 参数若允许 0 就必须发射（`square` 的圆角就是 0）。写 `if (r)` 会让
  // 方形档回落 CSS 基础圆角 → 看着还是圆的，正是「设了没反应」的典型。
  s.borderRadius = typeof r === 'number' ? r + 'px' : r;
  if (p.bgColor && p.bgColor !== 'transparent') s.backgroundColor = p.bgColor;
  return s;
}

/**
 * 角标（.mark）样式：实测 29×14 · radius 16px 16px 16px 0 · 1px solid #fff 内描边
 * 两个组件级参数（2026-10-06 用户新增，对标站没有）：
 *   markSize     标签大小 = 整块缩放：**宽高都变**（宽 = 高 × 2.07，14→29 与实测吻合）。
 *                用户反馈 v1 只调高度不正确 → v2 改为宽高同步。
 *   markFontSize 标签文字大小 = 只改字号，**标签盒子尺寸完全不动**（宽高都锁死，
 *                文字超宽由 overflow hidden 裁掉；用户明确：文字大小不能带动画布角标）。
 * 🔴 p 缺省时回落实测默认值 —— 两端 CSS 基础值与之保持一致，存量数据无此键也不变形。
 */
export function menuMarkStyle(it, p = {}) {
  const h = Math.min(28, Math.max(10, Math.round(Number(p.markSize) || 14)));
  const fs = Math.min(16, Math.max(6, Math.round(Number(p.markFontSize) || 8)));
  const w = Math.round(h * 2.07);
  return {
    background: it.labelBgColor || '#F83287',
    color: it.labelTextColor || '#FFFFFF',
    width: w + 'px',
    height: h + 'px',
    lineHeight: h + 'px',
    fontSize: fs + 'px',
    textAlign: 'center',
    overflow: 'hidden',
  };
}

/** 文字样式：实测 lh = fontSize + 7（14→21），margin-top 恒 4px */
export function menuTextStyle(p) {
  const fs = Math.min(24, Math.max(8, Number(p.fontSize) || 14));
  return {
    fontSize: fs + 'px',
    lineHeight: (fs + 7) + 'px',
    fontWeight: p.bold ? 'bold' : 'normal',
    color: p.textColor || '#333333',
  };
}
