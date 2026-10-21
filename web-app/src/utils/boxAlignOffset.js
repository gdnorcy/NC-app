/**
 * 「横向对齐 + 左边偏移」的共享语义（按钮 / 文本公告 / 搜索框 三处共用）
 *
 * 🔴 反馈 #327（2026-10-22）用户原话：
 *   「选择居中，再调左边偏移就是在居中的基础偏移；如果再选居左，向左偏移要清零，
 *     如若在调左边偏移，那就是在居左偏移的基础上去偏移；如果再选择居中，
 *     向左偏移也是清零，如果再调左边偏移，也是在这个基础上去做调整偏移。」
 *
 * ✅ 定死的模型（三句话）：
 *   1. **对齐是基准**（居左 / 居中 / 居右）
 *   2. **偏移是叠加在基准之上的微调**（负数向左、正数向右）—— 不是"覆盖"基准
 *   3. **手动切换对齐 → 偏移清零**（偏移是相对旧基准调出来的，换基准后旧数值没意义）
 *
 * 🔴 病根（本轮修的就是它）：偏移原来用 `margin-left` 表达，直接**覆盖**了对齐
 *   刚写好的 `margin-left:auto` → 居中/居右当场失效（看起来都像居左）；
 *   更糟的是只要偏移 ≠ 0，切换对齐时 marginLeft 每次都被覆盖 →
 *   **界面一点反应都没有**，这正是用户说的"感觉不太对"。
 *   ✅ 正解：对齐继续用 auto 边距当基准，偏移改用 `position:relative + left`
 *      —— 不参与布局流、不改宽度、不造层叠上下文，可与 auto 居中**叠加**。
 *
 * ⚠️ 三端（C 端 CardCompItem / DesignPage、admin ComponentRender）必须共用本模块，
 *    否则「面板配了不生效」「后台预览与真机不一致」会再次出现（已踩过多次）。
 */

/** 对齐字段名（两端 schema 统一用这个 key） */
export const ALIGN_KEY = 'align';

/** 横向对齐三选项（两端 schema 共用，防选项文案/取值漂移） */
export const ALIGN_OPTIONS = [
  { label: '居左', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '居右', value: 'right' },
];

/**
 * 与「对齐」配对的偏移字段（切换对齐时要清零的键）。
 * ⚠️ 两个 key 是历史遗留：`boxOffsetX`=按钮/搜索框，`offsetX`=文本公告。
 *   不能统一成一个——它们是不同组件 schema 里已落库的数据字段。
 */
export const ALIGN_OFFSET_KEYS = ['boxOffsetX', 'offsetX'];

/**
 * 归一对齐值：未设/非法 → `fallback`。
 * ⚠️ fallback **按组件给**（按钮默认 center、搜索框默认 left），
 *    写死一个值会让存量数据视觉突变。
 */
export function normalizeAlign(v, fallback = 'center') {
  return v === 'left' || v === 'right' || v === 'center' ? v : fallback;
}

/**
 * 偏移 style：**叠加**在对齐基准之上。
 *
 * 🔴 用 `position:relative + left`，不用 `margin-left`：
 *    margin-left 会覆盖对齐写好的 `auto`（居中/居右失效）；
 *    也不用 `transform:translateX` —— transform 会造层叠上下文，
 *    在小程序里可能影响浮层/点击热区（CardCompItem 公告的历史注释就踩过）。
 *    `position:relative`（z-index:auto）**不造**层叠上下文，且不脱离文档流、不改宽度。
 *
 * @param {*} raw 偏移数值（px 语义；负数向左、正数向右）
 * @param {object} [opts]
 * @param {'px'|'rpx'} [opts.unit='px'] 'rpx' = C 端（按 750 设计稿 ×2）
 * @returns {object} 空对象 = 不偏移（调用方 Object.assign 时保持基准不变）
 */
export function offsetShiftStyle(raw, opts = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return {};
  const unit = opts.unit === 'rpx' ? 'rpx' : 'px';
  return { position: 'relative', left: `${unit === 'rpx' ? n * 2 : n}${unit}` };
}

/**
 * 切换对齐时要写回的偏移归零值。
 * 🔴 只清**实际存在**的键：给没有该字段的组件凭空塞一个 0 会污染 props；
 *    存量/新建组件的 defaultProps 里都有，故正常情况一定会清到。
 *
 * @param {object} props 组件 props
 * @returns {object} 待合并的 `{ boxOffsetX: 0, offsetX: 0 }`（缺哪个不带哪个）
 */
export function clearedOffsetsFor(props) {
  const out = {};
  const p = props || {};
  for (const k of ALIGN_OFFSET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = 0;
  }
  return out;
}
