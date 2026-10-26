/**
 * 「该页面是否必须登录才有数据」的单一事实来源。
 *
 * 🔴 为什么需要这张表：宫格/菜单点击直接 navigateTo，目标页的接口 401 被
 * `catch(e){}` 静默吞掉 → 用户看到的是「暂无客户/还没有人脉」的**假空态**，
 * 完全没有「请登录」的提示（用户 2026-10-26 反馈「基本上都是没有登录验证提示」）。
 *
 * 判定依据 = **后端该页主数据接口的鉴权中间件**（不是猜的，逐条核对）：
 *   · /api/card/*        → routes/card.js，auth = 必须 card_token
 *   · /api/card-market/* → app.js comboAuth，**整个前缀**都要 token（缺 → 401）
 *   · /api/card/cards/:id → 无 auth → 名片详情页对游客公开（**不要**加进来）
 *
 * 收录规则：只收「页面主数据接口需要鉴权」的页面。已经有守卫的页面也收在这里
 * （页面级守卫作为深链兜底，见 needsAuthPage 的 GUARDED 注释），单一事实来源
 * 宁可多收也不要出现「某个页面漏了守卫」。
 */

// 需要登录的页面路径（去掉 query 与末尾斜杠后比对）
const LOGIN_REQUIRED_PATHS = [
  // —— 身份域：我的名片相关 ——
  '/pages/card/myCard',          // GET /cards (auth)
  '/pages/card/collects',        // GET /collects (auth)
  '/pages/card/joinEnterprise',  // POST /api/card-market/enterprise/join (comboAuth)
  // —— 关系域：访客 / 集市 / 交换 / 动态 ——
  '/pages/card/visitors',        // GET /visitors/summary (auth)
  '/pages/card/visitorTimeline', // GET /visitors/:openid/timeline (auth)
  '/pages/card/market',          // GET /api/card-market/market/list (comboAuth)
  '/pages/card/connections',     // GET /api/card-market/connections (comboAuth)
  '/pages/card/exchangeRequests',// GET /api/card-market/exchange/list (comboAuth)
  '/pages/card/dynamic',         // GET /dynamics (auth)
  '/pages/card/messages',        // GET /api/card-market/messages + /radar/notifies (comboAuth+auth)
  // —— 经营域：客户 / 分销 ——
  '/pages/card/customers',       // GET /customers (auth)
  '/pages/card/customerDetail',  // GET /customers/:id/follows (auth)
  '/pages/card/distribution',    // GET /distribution/summary (auth)
  '/pages/card/distPartner',     // GET /distribution/team (auth)
  '/pages/card/distWallet',      // GET /distribution/wallet (auth)
  '/pages/card/distShareAll',
  '/pages/card/distShareCat',
  '/pages/card/distShareArea',
  '/pages/card/radarConfig',     // GET /radar/config (auth)
  // ⚠️ /pages/card/member **不在此列表**：会员中心对游客降级为默认态
  //   （getMemberStatus/getMemberMyCard 走 skipAuthRedirect，游客仍能看套餐与权益，
  //   购买/申请动作才由页面级 LoginGateModal 拦）。拦了入口会破坏「先看权益再登录」的产品语义。
];

/**
 * 页面**内部**已有登录守卫的页面（深链兜底用；入口拦截后目标页检测到已登录，不会重复弹层）。
 * - myCard：整页空态内联 <LoginGate>（不是浮层）
 * - dynamic：页面级浮层（onMounted 未登录即弹，登录成功原地重入取数）
 * - member / profile：动作级守卫
 */
export const GUARDED_PAGES = [
  '/pages/card/myCard',
  '/pages/card/dynamic',
  '/pages/card/member',
  '/pages/card/profile',
];

/** 去掉 query（?a=b）与 hash（#x），并去掉末尾斜杠，便于路径前缀比对 */
export function normalizePagePath(url) {
  if (!url) return '';
  let p = String(url);
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  const h = p.indexOf('#');
  if (h >= 0) p = p.slice(0, h);
  // 完整 URL 只取 pathname
  if (/^https?:\/\//i.test(p)) {
    try { p = new URL(p).pathname; } catch { /* 解析失败就按原串处理 */ }
  }
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** 该路径所属页面是否需要登录才能拿到数据 */
export function needsAuthPage(url) {
  const p = normalizePagePath(url);
  if (!p) return false;
  return LOGIN_REQUIRED_PATHS.some((x) => p === x || p.startsWith(x + '/'));
}

/** 该页面是否已自带页面级守卫（入口不再拦，避免多跳一次） */
export function hasPageGuard(url) {
  const p = normalizePagePath(url);
  if (!p) return false;
  return GUARDED_PAGES.some((x) => p === x || p.startsWith(x + '/'));
}

/**
 * 入口是否需要拦一道。
 *
 * 语义：**只要该页数据需要鉴权，入口就拦**——不管目标页自己有没有守卫。
 * 页面内已有守卫（GUARDED_PAGES）时，入口拦也不会「弹两次」：
 * 入口弹的是浮层 → 登录成功 → 继续跳转 → 目标页检测到已登录 → 不再弹。
 * 反之若入口不拦、只靠目标页：用户会先看到一页空白/骨架才弹层，体验更差。
 */
export function shouldGuardEntry(url) {
  return needsAuthPage(url);
}

export default { needsAuthPage, hasPageGuard, shouldGuardEntry, normalizePagePath };
