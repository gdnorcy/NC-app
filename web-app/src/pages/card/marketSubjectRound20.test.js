/**
 * 🔴 第20轮回归锁：三层身份 C 端（购买=集市场席）
 *
 * 覆盖：
 *   1 utils/joinMode.js：双模读取（channel_config.individualJoinMode，取不到=code 保守默认）
 *   2 member.vue：1b 收敛后老 A 路全下线、唯一购买路径走 memberBuy、场席购买成功文案
 *   3 create.vue：口令区 purchase 模式提示
 *   4 displaySettings.vue：口令申请浮层接 /apply
 *   5 cardApi.applyIndividual → POST /card-market/apply
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { getIndividualJoinMode, getChannelTenantName } from './utils/joinMode.js';

const uniMock = { getStorageSync: vi.fn() };
vi.stubGlobal('uni', uniMock);

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== 1 双模读取 =====
describe('getIndividualJoinMode（channel_config 单一来源，取不到=code）', () => {
  test('purchase 模式透传', () => {
    uniMock.getStorageSync.mockReturnValue({ individualJoinMode: 'purchase' });
    expect(getIndividualJoinMode()).toBe('purchase');
  });

  test('code 模式透传', () => {
    uniMock.getStorageSync.mockReturnValue({ individualJoinMode: 'code' });
    expect(getIndividualJoinMode()).toBe('code');
  });

  test('渠道未配置/旧版 channel_config 无该字段 → code（保守默认，不改变存量行为）', () => {
    uniMock.getStorageSync.mockReturnValue(undefined);
    expect(getIndividualJoinMode()).toBe('code');
    uniMock.getStorageSync.mockReturnValue({});
    expect(getIndividualJoinMode()).toBe('code');
  });

  test('脏值（非 purchase 字符串）→ code', () => {
    uniMock.getStorageSync.mockReturnValue({ individualJoinMode: 'invite' });
    expect(getIndividualJoinMode()).toBe('code');
  });
});

describe('getChannelTenantName', () => {
  test('brandName 优先，回落 customerName', () => {
    uniMock.getStorageSync.mockReturnValue({ brandName: '零壹云', customerName: '默认客户' });
    expect(getChannelTenantName()).toBe('零壹云');
    uniMock.getStorageSync.mockReturnValue({ customerName: '默认客户' });
    expect(getChannelTenantName()).toBe('默认客户');
  });

  test('无配置 → 空串', () => {
    uniMock.getStorageSync.mockReturnValue(undefined);
    expect(getChannelTenantName()).toBe('');
  });
});

// ===== 源码钉子（防回退） =====
const src = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

describe('member.vue（1b 收敛后）', () => {
  const memberSrc = src('member.vue');

  test('老 A 路（member_package / productType=member / paymentApi 下单）全下线，禁回退', () => {
    expect(memberSrc).not.toMatch(/productType:\s*'member'/);
    expect(memberSrc).not.toMatch(/paymentApi\.createOrder/);
    expect(memberSrc).not.toMatch(/cardApi\.getPackages/);
    // 归属修复的旧形态（前端传 customerId）也不得复现：租户由服务端 req.customerId 单一裁定
    expect(memberSrc).not.toMatch(/customerId:\s*userInfo\.enterpriseId\s*\|\|\s*1/);
    expect(memberSrc).not.toMatch(/getTid\(\)\s*\|\|\s*userInfo\.enterpriseId/);
  });

  test('唯一购买路径走租户等级：memberBuy（/member/buy，服务端按 req.customerId 定租户）', () => {
    expect(memberSrc).toMatch(/cardApi\.memberBuy\(\{ levelId: lv\.id/);
  });

  test('购买成功补场席说明（marketSubject.hasSeat，租户名来自共享 helper）', () => {
    expect(memberSrc).toMatch(/marketSubject\.hasSeat/);
    expect(memberSrc).toMatch(/已开通会员，并获得/);
    expect(memberSrc).toMatch(/import \{ getChannelTenantName \} from '\.\/utils\/joinMode\.js'/);
  });
});

describe('create.vue（第20轮）', () => {
  const createSrc = src('create.vue');

  test('口令区 purchase 模式提示（两条入驻路都说清）', () => {
    expect(createSrc).toMatch(/joinMode === 'purchase'/);
    expect(createSrc).toMatch(/开通会员套餐即可自动入驻/);
  });

  test('双模来自共享 helper', () => {
    expect(createSrc).toMatch(/import \{ getIndividualJoinMode, getChannelTenantName \} from '\.\/utils\/joinMode\.js'/);
  });
});

describe('displaySettings.vue（第20轮）', () => {
  const dsSrc = src('displaySettings.vue');

  test('无主体引导按三模分流（第26轮）：purchase→member 页 / apply→免码直提 / code→口令浮层', () => {
    expect(dsSrc).toMatch(/const mode = getIndividualJoinMode\(\)/);
    expect(dsSrc).toMatch(/mode === 'purchase'/);
    expect(dsSrc).toMatch(/mode === 'apply'/);
    expect(dsSrc).toMatch(/uni\.navigateTo\(\{ url: '\/pages\/card\/member' \}\)/);
    expect(dsSrc).toMatch(/showInviteSheet\.value = true/);
  });

  test('口令浮层提交走 cardApi.applyIndividual（POST /apply，不新建名片；兑换码可选）', () => {
    expect(dsSrc).toMatch(/cardApi\.applyIndividual\(\{/);
    expect(dsSrc).toMatch(/type: 'individual'/);
    // 第26轮：免码申请——code 为空传 undefined，服务端按租户 individual_join_mode 校验
    expect(dsSrc).toMatch(/bindCode: c \|\| undefined/);
  });

  test('提交前过登录守卫（#312-18c 原地登录基建）', () => {
    const fn = dsSrc.slice(dsSrc.indexOf('async function submitInvite'));
    const callIdx = fn.indexOf('await cardApi.applyIndividual');
    const guardIdx = fn.indexOf('await requireLogin()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(callIdx);
  });
});

describe('cardApi.applyIndividual', () => {
  test('POST /card-market/apply', async () => {
    const uniReq = { getStorageSync: vi.fn(() => 't'), request: vi.fn(({ success }) => success({ statusCode: 200, data: { success: true } })) };
    vi.stubGlobal('uni', uniReq);
    vi.resetModules();
    const { cardApi } = await import('../../utils/cardApi.js');
    await cardApi.applyIndividual({ type: 'individual', bindCode: 'P123' });
    const args = uniReq.request.mock.calls[0][0];
    expect(args.url).toMatch(/\/api\/card-market\/apply$/);
    expect(args.method).toBe('POST');
    expect(args.data).toEqual({ type: 'individual', bindCode: 'P123' });
  });
});
