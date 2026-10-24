/**
 * 单点登录实现 —— 🔴 唯一出处（2026-10-24 #312-18：登录不再跳两次页面）
 *
 * 背景：原先「我的名片」未登录 → reLaunch 到 pages/cardMain/login → 登录完再 reLaunch
 * 回名片页，**去、回各一次跳转**，用户要看着两个页面闪一遍。改成「页面内原地登录」后，
 * 登录请求的这部分能力必须被登录页和浮层**共用**，否则：
 *   ① H5 模拟码 vs 小程序 wx.login 分支；
 *   ② 租户兜底 DEFAULT_TENANT_ID（小程序登录的新用户没有租户归属 → 装修首页读不到）；
 *   ③ 登录后 resetBrandCache（冷启动时未登录态已拉过品牌色）；
 * 这三条任一条只在一边实现，另一边就会出现「能登录但首页空白/品牌色不对」。
 */
import { cardApi } from './cardApi.js';
import { resetBrandCache } from './brand.js';
import { DEFAULT_TENANT_ID } from '../config.js';

/**
 * 取登录所需凭证：小程序走 wx.login 拿 code，并带上小程序自身 appid
 * （后端据此走第三方平台 component 模式按租户登录；未授权时自动回落平台单 appid 通道）。
 * H5 无 wx.login → 沿用原先的模拟码路径。
 */
export function fetchLoginCode() {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    resolve({ code: 'h5_mock_' + Date.now(), appid: '' });
    // #endif
    // #ifndef H5
    uni.login({
      provider: 'weixin',
      success: (res) => {
        let appid = '';
        try {
          appid = uni.getAccountInfoSync().miniProgram.appId || '';
        } catch (e) {}
        resolve({ code: res.code, appid });
      },
      fail: () => reject(new Error('微信登录失败')),
    });
    // #endif
  });
}

/**
 * 执行登录：拿码 → 调后端 → 落 token/user → 清品牌色缓存。
 * @returns {Promise<{isNew:boolean, hasCard:boolean}>} 供调用方决定跳转去向
 */
export async function performWxLogin() {
  const { code, appid } = await fetchLoginCode();
  const parentId = uni.getStorageSync('share_parent_id') || '';
  const result = await cardApi.wxLogin(code, parentId, DEFAULT_TENANT_ID || '', appid);
  uni.setStorageSync('card_token', result.token);
  uni.setStorageSync('card_user', result.user);
  // 🔴 冷启动时 useBrandOverride 可能已在未登录态拉过品牌色，登录成功必须清缓存，
  //    后续各页才会带着新 token 重新拉取品牌色
  resetBrandCache();
  return result;
}

/**
 * 是否必须先去建名片：新用户/没名片的人落到任何「回跳目标」都是空壳页。
 */
export function mustCreateCard(result) {
  return Boolean(result && (result.isNew || !result.hasCard));
}
