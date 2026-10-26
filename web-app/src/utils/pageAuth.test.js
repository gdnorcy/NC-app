import { describe, it, expect } from 'vitest';
import {
  needsAuthPage,
  hasPageGuard,
  shouldGuardEntry,
  normalizePagePath,
} from './pageAuth.js';

// 🔴 这张表是「首页宫格入口要不要弹登录提示」的唯一判据。
// 判定依据 = 后端接口的鉴权中间件，改表前先核对 server/src/routes/card.js 与
// app.js 的 comboAuth 挂载范围（card-market 整个前缀都要 token）。
describe('normalizePagePath（路径归一）', () => {
  it('去 query', () => {
    expect(normalizePagePath('/pages/card/visitors?openid=abc')).toBe('/pages/card/visitors');
  });
  it('去 hash', () => {
    expect(normalizePagePath('/pages/card/market#top')).toBe('/pages/card/market');
  });
  it('去末尾斜杠', () => {
    expect(normalizePagePath('/pages/card/customers/')).toBe('/pages/card/customers');
  });
  it('完整 URL 取 pathname', () => {
    expect(normalizePagePath('https://x.com/pages/card/distribution?a=1')).toBe('/pages/card/distribution');
  });
  it('空值安全', () => {
    expect(normalizePagePath('')).toBe('');
    expect(normalizePagePath(null)).toBe('');
  });
});

describe('needsAuthPage（需要登录才有数据）', () => {
  const authPages = [
    '/pages/card/visitors',        // GET /visitors/summary (auth)
    '/pages/card/customers',       // GET /customers (auth)
    '/pages/card/connections',     // GET /api/card-market/connections (comboAuth)
    '/pages/card/market',          // GET /api/card-market/market/list (comboAuth)
    '/pages/card/distribution',    // GET /distribution/summary (auth)
    '/pages/card/dynamic',         // GET /dynamics (auth)
    '/pages/card/messages',        // comboAuth
    '/pages/card/customerDetail',
    '/pages/card/exchangeRequests',
    '/pages/card/collects',
    '/pages/card/visitorTimeline',
    '/pages/card/distWallet',
    '/pages/card/distPartner',
  ];
  for (const p of authPages) {
    it(`${p} 需要登录`, () => {
      expect(needsAuthPage(p)).toBe(true);
    });
  }

  const publicPages = [
    '/pages/card/cardDetail',      // GET /cards/:id 无 auth → 游客可看
    '/pages/card/profile',         // 免登录可看（未登录时菜单切「登录」）
    '/pages/card/create',
    '/pages/mall/index',           // 商城浏览公开
    '/pages/cardMain/home',
  ];
  for (const p of publicPages) {
    it(`${p} 不需要登录`, () => {
      expect(needsAuthPage(p)).toBe(false);
    });
  }

  it('带 query 仍能识别', () => {
    expect(needsAuthPage('/pages/card/visitors?openid=x')).toBe(true);
  });

  it('前缀相同但不是子路径的页面不算（如 connectionsX）', () => {
    expect(needsAuthPage('/pages/card/connectionsX')).toBe(false);
  });
});

describe('hasPageGuard / shouldGuardEntry（入口是否再拦一道）', () => {
  it('myCard / dynamic / member / profile 页面内部已有守卫', () => {
    for (const p of ['/pages/card/myCard', '/pages/card/dynamic', '/pages/card/member', '/pages/card/profile']) {
      expect(hasPageGuard(p)).toBe(true);
    }
  });

  it('需鉴权的页面入口一律拦（页面内已有守卫的也不豁免——登录成功后目标页检测到已登录不会重复弹层）', () => {
    for (const p of ['/pages/card/visitors', '/pages/card/customers', '/pages/card/market', '/pages/card/connections', '/pages/card/distribution']) {
      expect(hasPageGuard(p)).toBe(false);
      expect(shouldGuardEntry(p)).toBe(true);
    }
  });

  it('myCard / dynamic 入口也拦（避免先落到空页面再弹层）', () => {
    expect(shouldGuardEntry('/pages/card/myCard')).toBe(true);
    expect(shouldGuardEntry('/pages/card/dynamic')).toBe(true);
  });

  it('会员中心入口不拦：游客可看权益与套餐（降级默认态，是产品语义）', () => {
    expect(needsAuthPage('/pages/card/member')).toBe(false);
    expect(shouldGuardEntry('/pages/card/member')).toBe(false);
  });

  it('公开页入口不拦', () => {
    expect(shouldGuardEntry('/pages/card/cardDetail')).toBe(false);
    expect(shouldGuardEntry('/pages/card/profile')).toBe(false);
  });
});
