/**
 * 装修组件「文本/公告」的前置符号 —— 单一事实来源（两端共用）
 *
 * 🔴 为什么抽出来（2026-10-21，#321 收尾时发现）：
 *   `symbol` 字段已同时进 web-app 与 web-admin 两端 registry（面板能配），
 *   但**渲染只补了名片那一份**（`CardCompItem.vue`）→ 两端各自出现「配了不生效」：
 *     - admin 设计器画布配了符号，预览不显示；
 *     - 首页/商场装修（`DesignPage.vue`）配了符号，C 端不显示。
 *   记忆规则：**两端各写一份必然漂移**；面板能配的字段，渲染必须三处同时认。
 *
 * 设计约束（照旧，别退回）：
 *   - 形状类（dot/square/arrow/diamond/bar）用真实元素 + CSS 画：
 *     WXSS 伪元素在小程序普通 view 上不可靠。`shape` 存**完整类名**，
 *     调用方直接 `:class="shape"` 即可 —— 不许各端自己拼 `is-` 前缀（那是漂移源）。
 *   - 字符类（check/star）直接输出字符，且**必须写码点**：
 *     `⧉`(U+29C9) 这类在小程序字体里是豆腐块，`✓`(U+2713)/`★`(U+2605) 才安全。
 *   - 颜色一律 currentColor，跟随公告文字色，不写死色值。
 *
 * 本模块纯函数、无端依赖，web-app 与 web-admin 均 import（跨包路径沿用
 * `containerStyle.js` / `sfComponentStyle.js` 的既有模式）。
 */

/** 内置符号表：shape 类走 CSS 画（值为完整类名），text 类直接输出字符 */
export const NOTICE_SYMBOLS = {
  dot: { shape: 'is-dot' },
  square: { shape: 'is-square' },
  arrow: { shape: 'is-arrow' },
  diamond: { shape: 'is-diamond' },
  bar: { shape: 'is-bar' },
  check: { text: '\u2713' },
  star: { text: '\u2605' },
};

/** 面板选项（两端 registry 的 schema 引用这一份，杜绝手抄漂移） */
export const NOTICE_SYMBOL_OPTIONS = [
  { label: '无', value: 'none' },
  { label: '圆点', value: 'dot' },
  { label: '方块', value: 'square' },
  { label: '箭头', value: 'arrow' },
  { label: '菱形', value: 'diamond' },
  { label: '对勾', value: 'check' },
  { label: '星号', value: 'star' },
  { label: '竖线', value: 'bar' },
];

/** 归一化：空/ 非法 / 无 → 'none'（显式 'none' 保持 'none'） */
export function normalizeNoticeSymbol(symbol) {
  const s = String(symbol == null ? '' : symbol).trim();
  return Object.prototype.hasOwnProperty.call(NOTICE_SYMBOLS, s) ? s : 'none';
}

/**
 * 解析 symbol → { shape, text }
 * 两个字段恒为字符串（空串 = 不渲染），调用方可直接塞进 class / 文本，无需各自判空。
 * 未设/ 非法值 / 显式 'none' 一律返回两个空串。
 *
 * ⚠️ 调用方必须**按空串短路整个元素**（`v-if="shape"`），
 *   不能渲染空壳元素 —— 空壳会白占一个 flex 槽位并抢走 gap。
 */
export function noticeSymbolParts(symbol) {
  const hit = NOTICE_SYMBOLS[normalizeNoticeSymbol(symbol)];
  return {
    shape: (hit && hit.shape) || '',
    text: (hit && hit.text) || '',
  };
}