/**
 * 360 全景浏览 Service Worker：秒开 + 离线可用（module 类型）
 * - 全景图（/uploads/*）→ cache-first，二次访问直接本地
 * - 场景 API（/api/scenes）→ network-first，离线回退上次列表
 * - HTML / 页面 → network-first（部署后必须拿到新版本，防止旧 HTML 引用已清理的旧哈希 JS）
 * - JS / CSS（文件名带内容哈希）→ stale-while-revalidate
 * 升级：install 时 skipWaiting，activate 时清理旧版本缓存。
 */
importScripts('/sw-strategy.js');

const VERSION = 'p3-v2';
const SHELL_CACHE = `panorama-shell-${VERSION}`;
const IMAGE_CACHE = `panorama-images-${VERSION}`;
const API_CACHE = `panorama-api-${VERSION}`;

self.addEventListener('install', (event) => {
  // 不预缓存 HTML（HTML 永远 network-first）；预缓存可能后续离线的 shell 资源不需要，直接跳过
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('panorama-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || fresh;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isNavigate = event.request.mode === 'navigate';
  const { strategy } = planRequest(event.request.url, location.origin, isNavigate);
  if (strategy === 'network-first') event.respondWith(networkFirst(event.request));
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(event.request));
  else if (strategy === 'stale-while-revalidate') event.respondWith(staleWhileRevalidate(event.request));
});
