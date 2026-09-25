/**
 * 智能名片首页「原生功能区组件化」数据迁移（一次性/幂等）
 *
 * 背景：装修编辑器原生 5 模块（搜索栏/宫格/我的名片/访客雷达/人脉集市）原为 C 端 home.vue
 * 代码写死的固定结构，由 meta.nativeSections 开关控制显隐。组件化后它们变为 components 数组
 * 中的 native-* 组件（可拖拽/排序/删除）。本函数对旧数据做兼容补齐：
 * - components 已含任意 native-* 组件 → 视为已组件化，不做任何改动（幂等）
 * - 否则按 meta.nativeSections 状态（默认全开）在末尾追加对应 native 组件（保持"DIY 在上、原生在下"现状）
 */
export const NATIVE_COMPONENT_TYPES = ['native-search', 'native-grid', 'native-mycard', 'native-radar', 'native-market'];

const NATIVE_DEFS = [
  ['native-search', { marginTop: 0, marginBottom: 0 }],
  ['native-grid', { marginTop: 0, marginBottom: 0 }],
  ['native-mycard', { showTitle: true, marginTop: 0, marginBottom: 0 }],
  ['native-radar', { showTitle: true, showToday: true, showTotal: true, showExchange: true, marginTop: 0, marginBottom: 0 }],
  ['native-market', { showTitle: true, marginTop: 0, marginBottom: 0 }],
];

const KEY_MAP = {
  'native-search': 'searchBar',
  'native-grid': 'quickGrid',
  'native-mycard': 'myCard',
  'native-radar': 'visitorRadar',
  'native-market': 'peopleMarket',
};

export function migrateNativeComponents(j) {
  if (!j || !Array.isArray(j.components)) return j;
  if (j.components.some((c) => c && NATIVE_COMPONENT_TYPES.includes(c.type))) return j;
  const ns = (j.meta && j.meta.nativeSections) || {};
  const add = [];
  for (const [type, props] of NATIVE_DEFS) {
    if (ns[KEY_MAP[type]] === false) continue; // 原开关关闭的模块不预置
    add.push({ id: `c-${type}`, type, props: JSON.parse(JSON.stringify(props)) });
  }
  if (add.length) j.components = j.components.concat(add);
  return j;
}
