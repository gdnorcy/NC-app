/**
 * 对外可访问站点基址的唯一计算出口。
 *
 * 🔴 为什么不能直接用 req.protocol + req.get('host')：
 *    Node 进程前面通常挂着 nginx / CDN 做 TLS 终止（本机监听的是明文 http://127.0.0.1:3000），
 *    所以 Express 看到的 `req.protocol` 永远是反代到 Node 那一跳的协议 = http，
 *    拼出来的回调 URL / 分享链接就是 http://。
 *    站点 nginx 的 80 端口若是 certbot 生成的「→301 https」或「return 404」，
 *    外部拿 http 地址来访问会直接拿到非 200：
 *    典型故障就是微信公众号后台配置服务器地址时提示「请求失败，HTTP 返回非 200」。
 *
 * 取值优先级：
 *   1. 环境变量 PUBLIC_BASE_URL（部署形态特殊时由运维显式指定，带不带尾部斜杠都行）
 *   2. X-Forwarded-Proto / X-Forwarded-Host（多个代理时取第一个）
 *   3. 都没有 → 退回 req.protocol + Host（本地 http 开发形态，行为与以前一致）
 */
function firstOf(v) {
  return String(v || '').split(',')[0].trim();
}

export function publicBaseUrl(req) {
  const env = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const proto = firstOf(req?.headers?.['x-forwarded-proto']) || firstOf(req?.protocol) || 'http';
  const host = firstOf(req?.headers?.['x-forwarded-host']) || firstOf(typeof req?.get === 'function' ? req.get('host') : '');
  return `${proto}://${host}`;
}

/** 拼接绝对地址：path 带不带前导斜杠都行；path 为空时不留多余斜杠 */
export function absoluteUrl(req, path = '') {
  const base = publicBaseUrl(req);
  const p = String(path || '');
  if (!p) return base;
  return `${base}${p.startsWith('/') ? '' : '/'}${p}`;
}
