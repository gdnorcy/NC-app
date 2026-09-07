/**
 * 轻量内存滑动窗口限流器
 * 用于登录、短信验证码等防刷场景。
 * 当前架构为单进程实例，内存实现足够；多实例部署时替换为 Redis 计数器。
 */
const buckets = new Map();
const DEFAULT_WINDOW_MS = 60_000;

/**
 * @param {object} opts
 * @param {string} opts.key 限流键（如 ip、ip+phone）
 * @param {number} opts.limit 窗口内允许次数
 * @param {number} [opts.windowMs] 窗口毫秒
 * @returns {{allowed:boolean, remaining:number, resetAt:number}}
 */
export function rateLimit({ key, limit, windowMs = DEFAULT_WINDOW_MS, now = Date.now() }) {
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);

  // 惰性清理：避免长期运行内存膨胀
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Express 中间件包装：keyFn(req) 生成限流键 */
export function rateLimitMiddleware({ keyFn, limit, windowMs }) {
  return (req, res, next) => {
    const r = rateLimit({ key: keyFn(req), limit, windowMs });
    if (!r.allowed) {
      return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    }
    next();
  };
}
