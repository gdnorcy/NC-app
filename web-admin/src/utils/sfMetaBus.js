/**
 * 超级表单提交按钮样式「跨工具实时同步」事件总线（web-admin 内单例）。
 *
 * 场景：用户在「超级表单设计器」(/apps/super-form) 改了提交按钮样式并保存后，
 * 希望「装修中心」(PageEditor) 画布里的超级表单提交按钮自动同步最新样式，无需手动重新绑定。
 *
 * 机制：
 *  - 同 app 内：设计器与装修中心同属 web-admin，模块单例直接派发事件；
 *  - 跨标签页：用户若开两个标签页分别在设计器与装修中心，用 localStorage 的 'storage'
 *    事件桥接（同标签页写入 localStorage 不会触发自身的 storage 事件，仅其他标签页收到）。
 */
import { reactive } from 'vue';

// 自上次消费以来「提交按钮样式已变更」的表单 id 集合（装修中心挂载/激活时统一补偿刷新）
const dirtyFormIds = reactive(new Set());
// 同标签页内的订阅者（设计器与装修中心同属一个 JS 运行时时生效）
const listeners = new Set();
const STORAGE_KEY = 'sf-meta-updated';

function notify(formId) {
  listeners.forEach((fn) => {
    try { fn(formId); } catch (e) { /* 单个订阅者异常不影响其他 */ }
  });
}

/**
 * 设计器侧调用：标记某个超级表单的提交按钮样式已变更并广播。
 * @param {number|string} formId
 */
export function markSfMetaUpdated(formId) {
  const id = Number(formId);
  if (!id) return;
  dirtyFormIds.add(id);
  // 跨标签页桥接：写入 localStorage，其他标签页的 storage 监听会触发同函数
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, t: Date.now() })); } catch (e) { /* 隐私模式等忽略 */ }
  notify(id);
}

/**
 * 装修中心侧调用：订阅变更事件，返回取消订阅函数。
 * @param {(formId:number)=>void} handler
 */
export function onSfMetaUpdated(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/**
 * 装修中心侧调用：取出并清空「自上次消费以来变更过的表单 id 列表」，用于挂载/激活时补偿刷新。
 * @returns {number[]}
 */
export function takeDirtySfFormIds() {
  const arr = Array.from(dirtyFormIds).map(Number);
  dirtyFormIds.clear();
  return arr;
}

// 跨标签页：其他标签页写入 storage 时（本标签页不会收到自身写入），把 id 并入脏集合并通知本标签页订阅者
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const { id } = JSON.parse(e.newValue);
        const nid = Number(id);
        if (nid) { dirtyFormIds.add(nid); notify(nid); }
      } catch (err) { /* 解析失败忽略 */ }
    }
  });
}
