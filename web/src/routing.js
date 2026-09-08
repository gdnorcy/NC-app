/**
 * 展示端路由解析（纯函数，便于测试）
 *
 * /                     → { type: 'home' }                 项目列表首页
 * /?plan=1&scene=5      → { type: 'project', planId, sceneId }  场景编辑预览直达
 * /?plan=1              → { type: 'project', planId }      方案直达
 * /s/{token}?scene=5    → { type: 'share', token, sceneId }  分享直达（项目级或场景级）
 * 其余                   → { type: 'home' }                 默认回首页
 *
 * query 兼容两种传法：parseViewPath('/?plan=1') 或 parseViewPath('/', { plan: '1' })
 */
export function parseViewPath(pathname, query = {}) {
  const raw = String(pathname || '');
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const q = { ...query };
  if (qi >= 0) {
    for (const [k, v] of new URLSearchParams(raw.slice(qi + 1))) {
      if (!(k in q)) q[k] = v;
    }
  }
  const share = path.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  if (share) {
    const sceneId = q.scene ? Number(q.scene) : undefined;
    return {
      type: 'share',
      token: decodeURIComponent(share[1]),
      sceneId: Number.isFinite(sceneId) && sceneId > 0 ? sceneId : undefined,
    };
  }
  const planId = q.plan ? Number(q.plan) : undefined;
  if (Number.isFinite(planId) && planId > 0) {
    const sceneId = q.scene ? Number(q.scene) : undefined;
    return {
      type: 'project',
      planId,
      sceneId: Number.isFinite(sceneId) && sceneId > 0 ? sceneId : undefined,
    };
  }
  return { type: 'home' };
}
