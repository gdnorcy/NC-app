/**
 * 展示端路由解析（纯函数，便于测试）
 *
 * /             → { type: 'home' }            项目列表首页
 * /s/{token}    → { type: 'share', token }    分享链接直达（项目级或场景级）
 * 其余           → { type: 'home' }            默认回首页
 */
export function parseViewPath(pathname) {
  const path = String(pathname || '');
  const share = path.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  if (share) {
    return { type: 'share', token: decodeURIComponent(share[1]) };
  }
  return { type: 'home' };
}
