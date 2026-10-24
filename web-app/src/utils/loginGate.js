/**
 * 🔴 #312-18c 页面内原地登录的统一守卫（替代「跳登录页 → 再跳回来」）。
 *
 * 与 utils/inlineLogin.js 的分工：
 *   - inlineLogin.js = 登录**请求**唯一出处（取码/落 token/清缓存）；
 *   - loginGate.js   = 登录**浮层交互**唯一出处（Promise 守卫 + 弹层开关 + 成功回调）。
 *
 * 三条铁律（都来自真机反馈，别改回老写法）：
 *   1. requireLogin() 返回 Promise：调用方 `if (!(await requireLogin())) return;`
 *      —— 登录成功后**自动继续原动作**（老实现登录完回来还得再点一次）。
 *   2. cancelLogin() 必须 gateResolve(false)：否则 await 永远挂住，按钮「点了没反应」。
 *   3. 新用户/没名片（mustCreateCard）跳一次 /pages/card/create 去建名片，
 *      且**不放行**原动作（否则落在空壳页）。
 */
import { ref } from 'vue';
import { hasCardToken } from './cardApi.js';
import { mustCreateCard } from './inlineLogin.js';

export function useInlineLogin(onLoginSuccess) {
  const showLoginGate = ref(false);
  let gateResolve = null;

  /** 未登录 → 弹浮层并挂起；已登录 → 直接放行 */
  function requireLogin() {
    if (hasCardToken()) return Promise.resolve(true);
    showLoginGate.value = true;
    return new Promise((resolve) => { gateResolve = resolve; });
  }

  /** 「暂不登录」/点遮罩：结掉挂起的 Promise（不结会永久挂住） */
  function cancelLogin() {
    showLoginGate.value = false;
    if (gateResolve) { gateResolve(false); gateResolve = null; }
  }

  /** 登录成功：关浮层 →（新用户跳建名片）→ 原地重入 boot → 放行原动作 */
  async function onLoginGateSuccess(result) {
    showLoginGate.value = false;
    const done = gateResolve; gateResolve = null;
    if (mustCreateCard(result)) {
      uni.reLaunch({ url: '/pages/card/create' });
      if (done) done(false);
      return;
    }
    if (onLoginSuccess) await onLoginSuccess();
    if (done) done(true);
  }

  return { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess };
}
