/**
 * 🔴 第20轮回归锁：三层身份 C 端（购买=集市场席）
 *
 * 覆盖：
 *   1 utils/joinMode.js：双模读取（channel_config.individualJoinMode，取不到=code 保守默认）
 *   2 member.vue：订单归属修复（禁 enterpriseId||1 硬编码租户1）+ 场席权益行 + 购买成功文案
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

describe('member.vue（第20轮）', () => {
  const memberSrc = src('member.vue');

  test('订单归属修复：禁 customerId 硬编码租户1（个人购买原来全记到租户1）', () => {
    expect(memberSrc).not.toMatch(/customerId:\s*userInfo\.enterpriseId\s*\|\|\s*1/);
    // 渠道上下文优先，账号企业绑定兜底，都没有则不传（服务端 comboAuth 解析）
    expect(memberSrc).toMatch(/getTid\(\)\s*\|\|\s*userInfo\.enterpriseId/);
    expect(memberSrc).toMatch(/\.\.\.\(tid \? \{ customerId: Number\(tid\) \} : \{\}\)/);
  });

  test('含场席套餐权益行：仅 purchase 模式展示，文案含租户名', () => {
    expect(memberSrc).toMatch(/p\.market_subject === 1 && joinMode === 'purchase'/);
    expect(memberSrc).toMatch(/含集市入驻资格——购买后自动入驻/);
  });

  test('购买成功补场席说明（marketSubject.hasSeat）', () => {
    expect(memberSrc).toMatch(/marketSubject\.hasSeat/);
    expect(memberSrc).toMatch(/已开通会员，并获得/);
  });

  test('双模与租户名来自共享 helper（禁页面各写一份）', () => {
    expect(memberSrc).toMatch(/import \{ getIndividualJoinMode, getChannelTenantName \} from '\.\/utils\/joinMode\.js'/);
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

  test('无主体引导按双模分流：purchase→member 页 / code→口令浮层', () => {
    expect(dsSrc).toMatch(/getIndividualJoinMode\(\) === 'purchase'/);
    expect(dsSrc).toMatch(/uni\.navigateTo\(\{ url: '\/pages\/card\/member' \}\)/);
    expect(dsSrc).toMatch(/showInviteSheet\.value = true/);
  });

  test('口令浮层提交走 cardApi.applyIndividual（POST /apply，不新建名片）', () => {
    expect(dsSrc).toMatch(/cardApi\.applyIndividual\(\{/);
    expect(dsSrc).toMatch(/type: 'individual'/);
    expect(dsSrc).toMatch(/bindCode: code/);
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
