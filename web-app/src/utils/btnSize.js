/**
 * 按钮宽度计算 —— 已迁移到 `containerChildSize.js`（统一管理「容器内子组件宽度」）。
 *
 * 🔴 保留本文件仅为**兼容既有 import 路径**（`ComponentRender.vue` / `DesignPage.vue` /
 *   测试都从这里导入）。真实实现见 containerChildSize.js 的 buttonSizeStyle()。
 *
 * 🔴 勿在此处再实现一份 —— 项目已多次因「各处私藏副本」导致两端不一致。
 *   新增子组件宽度需求请统一加到 containerChildSize.js（搜索框就是这么加的）。
 */
export { buttonSizeStyle, WIDTH_MODES } from './containerChildSize.js';