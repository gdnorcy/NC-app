/**
 * 页面级登录守卫（深链兜底）—— 需登录才有数据的页面在**页面内部**再兜一道。
 *
 * 🔴 为什么入口拦还不够：
 *   首页宫格已经拦了（utils/pageAuth.js + home.vue 的 goPage），但这些页面还能从
 *   别的路径进来 —— 深链、消息卡片、其它页的跳转（myCard→visitors、member→distribution…）。
 *   这些入口若不兜底，页面会走到 `catch(e){}` → 401 被静默吞掉 → 渲染成
 *   「暂无客户 / 还没有人脉 / 暂无访客记录」的**假空态**，用户完全不知道要登录。
 *
 * 用法（每个需鉴权的页面）：
 *   const { showLoginGate, cancelLogin, onLoginGateSuccess, guardPage } = usePageGuard(loadFn);
 *   onMounted(() => { guardPage(); });              // 首次进入：未登录就弹层并停住取数
 *   onShow(() => { guardPage({ soft: true }); });    // 切回本页：仅在「已加载过内容」时补弹
 *   模板：<LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
 *
 * soft 口径与 dynamic.vue 一致：用户点「暂不登录」后切走再切回，**不反复打断**；
 * 只有「本来已看到内容、登录态中途掉了」才补弹（避免数据凭空消失却无解释）。
 *
 * 登录成功 → onLoginGateSuccess 自动重跑 loadFn（页面不销毁、零跳转）。
 * 守卫与浮层本体复用 utils/loginGate.js + components/LoginGateModal.vue（禁再抄一份）。
 */
import { ref } from 'vue';
import { hasCardToken } from './cardApi.js';
import { useInlineLogin } from './loginGate.js';

export function usePageGuard(loadFn) {
  const gate = useInlineLogin(async () => {
    loaded.value = true;
    if (typeof loadFn === 'function') await loadFn();
  });

  // 本页是否已经成功取过数（用于 soft 模式判断「登录态中途掉了」）
  const loaded = ref(false);

  /**
   * 页面取数前的守卫：
   *   已登录 → 直接跑 loadFn（返回 true）
   *   未登录 → 弹登录浮层并**停住**取数（返回 false）；登录成功后由 onLoginGateSuccess 重跑
   * @param {{soft?: boolean}} opts soft=true 时，仅在「已取过数」的情况下弹层（不打断首次浏览）
   */
  async function guardPage(opts = {}) {
    if (hasCardToken()) {
      loaded.value = true;
      if (typeof loadFn === 'function') await loadFn();
      return true;
    }
    if (opts.soft && !loaded.value) return false;
    gate.showLoginGate.value = true;
    return false;
  }

  return { ...gate, guardPage, loaded };
}

export default usePageGuard;
