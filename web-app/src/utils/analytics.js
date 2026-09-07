/**
 * 行为埋点 SDK（第三批）
 * - 访客身份：本地生成并复用 visitor_key（游客维度）
 * - 事件缓冲：满 10 条或 5 秒内自动上报 /api/card/analytics/events
 * - 登录用户自动携带 card_token，租户由服务端结算
 * 用法：import { track } from '@/utils/analytics';
 *       track('page_view', { page: '/pages/card/myCard', cardId: 1 });
 */
const EVENTS_URL = '/api/card/analytics/events';

function getVisitorKey() {
  let key = uni.getStorageSync('visitor_key');
  if (!key) {
    key = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    uni.setStorageSync('visitor_key', key);
  }
  return key;
}

let buffer = [];
let timer = null;

function flush() {
  if (!buffer.length) return;
  const batch = buffer;
  buffer = [];
  const token = uni.getStorageSync('card_token');
  uni.request({
    url: EVENTS_URL,
    method: 'POST',
    data: { events: batch },
    header: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    },
    success: () => {},
    fail: () => {
      // 上报失败：退回缓冲（限 50 条防膨胀）
      buffer = batch.concat(buffer).slice(0, 50);
      schedule();
    },
  });
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, 5000);
}

/**
 * 上报事件
 * @param {string} eventType page_view / card_view / form_submit / exchange_init / exchange_success / share_click / dynamic_view ...
 * @param {object} opts { page, cardId, sceneId, durationMs, extra }
 */
export function track(eventType, opts = {}) {
  const user = uni.getStorageSync('card_user') || {};
  const ev = {
    eventType,
    page: opts.page || '',
    cardId: opts.cardId || 0,
    sceneId: opts.sceneId || 0,
    visitorKey: getVisitorKey(),
    userId: user.id || 0,
    durationMs: opts.durationMs || 0,
    extra: opts.extra || {},
  };
  buffer.push(ev);
  if (buffer.length >= 10) flush();
  else schedule();
}

/** 页面曝光埋点：onShow 时调用 */
export function trackPageView(page, extra = {}) {
  track('page_view', { page, ...extra });
}

export default { track, trackPageView };
