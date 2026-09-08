// 全景 C 端埋点 SDK
// 上报 /api/card/analytics/events（solution=panorama）
// - visitorKey：localStorage 持久化访客标识
// - 主通道 fetch 异步上报；页面卸载时用 sendBeacon 兜底
const STORAGE_KEY = 'pano_vid';

export function getVisitorKey() {
  let v = '';
  try { v = localStorage.getItem(STORAGE_KEY); } catch { /* 隐私模式忽略 */ }
  if (!v) {
    v = 'pv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* 忽略 */ }
  }
  return v;
}

let pending = [];

function flush() {
  flushStay();
  if (!pending.length) return;
  const events = pending;
  pending = [];
  const body = { solution: 'panorama', events };
  const payload = JSON.stringify(body);
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        '/api/card/analytics/events',
        new Blob([payload], { type: 'application/json' })
      );
      if (ok) return;
    }
  } catch { /* 走 fetch 兜底 */ }
  fetch('/api/card/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => {});
}

let flushing = false;
function scheduleFlush() {
  if (flushing) return;
  flushing = true;
  setTimeout(() => { flushing = false; flush(); }, 800);
}

// 事件入队：eventType + 上下文（sceneId/planId/page 等）
export function track(eventType, extra = {}) {
  const event = { eventType, page: location.pathname, visitorKey: getVisitorKey(), ...extra };
  // 同一访客同一场景的 scene_view 去重：停留期间只计一次
  if (eventType === 'scene_view') {
    const now = Date.now();
    if (window.__panoLastSceneView && window.__panoLastSceneView.sceneId === event.sceneId && now - window.__panoLastSceneView.at < 8000) {
      return;
    }
    window.__panoLastSceneView = { sceneId: event.sceneId, at: now };
  }
  pending.push(event);
  scheduleFlush();
}

// 页面卸载/隐藏时立即上报（含场景停留时长）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

function flushStay() {
  // 同一次 flush 只补发一次 scene_leave，避免重复
  if (!window.__panoSceneStay || window.__panoSceneStay.reported) return;
  const stay = window.__panoSceneStay;
  const durationMs = Date.now() - stay.at;
  if (durationMs < 3000) { window.__panoSceneStay = null; return; }
  stay.reported = true;
  pending.push({ eventType: 'scene_leave', page: location.pathname, visitorKey: getVisitorKey(), sceneId: stay.sceneId, durationMs });
}
