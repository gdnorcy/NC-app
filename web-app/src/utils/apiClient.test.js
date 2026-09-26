/**
 * 公共请求层 createApiClient 测试（2026-09-18）
 * - 与 cardApi 行为一致：token 注入 / 401 清凭证跳登录 / 响应解包 / 错误 reject / 无 token 空头
 * - mallApi 基址与方法映射正确（/api/mall）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient, qs } from './apiClient.js';
import { mallApi } from './mallApi.js';

function setupUniMock() {
  const uniMock = {
    getStorageSync: vi.fn(),
    removeStorageSync: vi.fn(),
    reLaunch: vi.fn(),
    request: vi.fn(),
  };
  vi.stubGlobal('uni', uniMock);
  return uniMock;
}

describe('createApiClient 公共请求层', () => {
  let uniMock;
  beforeEach(() => { uniMock = setupUniMock(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const mockResponse = (statusCode, data) => {
    uniMock.request.mockImplementation((args) => {
      args.success({ statusCode, data });
    });
  };

  it('携带 Authorization 头（默认 card_token）', async () => {
    uniMock.getStorageSync.mockReturnValue('test-token');
    const client = createApiClient('http://localhost:3000/api/mall');
    mockResponse(200, { ok: 1 });
    await client.request('/goods');
    const args = uniMock.request.mock.calls[0][0];
    expect(args.url).toBe('http://localhost:3000/api/mall/goods');
    expect(args.header.Authorization).toBe('Bearer test-token');
    expect(args.header['Content-Type']).toBe('application/json');
  });

  it('已登录 token 失效（401）时清空凭证并跳登录页', async () => {
    uniMock.getStorageSync.mockReturnValue('expired-token');
    const client = createApiClient('http://localhost:3000/api/mall');
    mockResponse(401, { error: '未登录' });
    await expect(client.request('/cart')).rejects.toThrow('未登录');
    expect(uniMock.removeStorageSync).toHaveBeenCalledWith('card_token');
    expect(uniMock.removeStorageSync).toHaveBeenCalledWith('card_user');
    expect(uniMock.reLaunch).toHaveBeenCalledWith({ url: '/pages/cardMain/login' });
  });

  it('游客模式（无 token）401 只降级不跳登录页', async () => {
    uniMock.getStorageSync.mockReturnValue('');
    const client = createApiClient('http://localhost:3000/api/mall');
    mockResponse(401, { error: '未登录' });
    await expect(client.request('/cart')).rejects.toThrow('未登录');
    expect(uniMock.reLaunch).not.toHaveBeenCalled();
  });

  it('无 token 时 Authorization 为空', async () => {
    uniMock.getStorageSync.mockReturnValue('');
    const client = createApiClient('http://localhost:3000/api/mall');
    mockResponse(200, {});
    await client.request('/goods');
    expect(uniMock.request.mock.calls[0][0].header.Authorization).toBe('');
  });

  it('2xx 解包 res.data，非 2xx reject 错误信息', async () => {
    const client = createApiClient('http://localhost:3000/api/mall');
    mockResponse(200, { list: [1] });
    const data = await client.request('/goods');
    expect(data).toEqual({ list: [1] });
    mockResponse(403, { error: '未开通' });
    await expect(client.request('/cart')).rejects.toThrow('未开通');
  });

  it('qs 拼装跳过空值', () => {
    expect(qs({ page: 1, kw: 'a b', empty: '', nil: undefined })).toBe('?page=1&kw=a%20b');
    expect(qs({})).toBe('');
  });
});

describe('mallApi 方法映射', () => {
  let uniMock;
  beforeEach(() => { uniMock = setupUniMock(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('商品浏览接口走 /api/mall 前缀', async () => {
    uniMock.getStorageSync.mockReturnValue('t');
    uniMock.request.mockImplementation((args) => args.success({ statusCode: 200, data: { list: [] } }));
    await mallApi.getGoods({ page: 1, pageSize: 10 });
    expect(uniMock.request.mock.calls[0][0].url).toBe('http://localhost:3000/api/mall/goods?page=1&pageSize=10');
  });

  it('购物车/订单接口走 /api/mall 前缀', async () => {
    uniMock.getStorageSync.mockReturnValue('t');
    uniMock.request.mockImplementation((args) => args.success({ statusCode: 200, data: {} }));
    await mallApi.addCart({ goodsId: 1, quantity: 2 });
    expect(uniMock.request.mock.calls[0][0].url).toBe('http://localhost:3000/api/mall/cart');
    expect(uniMock.request.mock.calls[0][0].method).toBe('POST');
    await mallApi.createOrder({ items: [] });
    expect(uniMock.request.mock.calls[1][0].url).toBe('http://localhost:3000/api/mall/orders');
    expect(uniMock.request.mock.calls[1][0].method).toBe('POST');
  });

  it('H5 环境（window 存在）→ mallApi 走同源相对路径 /api/mall（/mall 独立产物任意域名/端口可用）', async () => {
    globalThis.window = { location: { search: '' } };
    try {
      // 动态 import + query 强制重新求值模块（BASE_URL 为模块级常量）
      const mod = await import('./mallApi.js?h5=1');
      uniMock.getStorageSync.mockReturnValue('t');
      uniMock.request.mockImplementation((args) => args.success({ statusCode: 200, data: { list: [] } }));
      await mod.mallApi.getGoods({ page: 1, pageSize: 10 });
      expect(uniMock.request.mock.calls[0][0].url).toBe('/api/mall/goods?page=1&pageSize=10');
    } finally {
      delete globalThis.window;
    }
  });

  it('H5 环境（window 存在）→ paymentApi 走同源相对路径 /api/payment（商城 mock 支付链路）', async () => {
    globalThis.window = { location: { search: '' } };
    try {
      const mod = await import('./cardApi.js?h5=1');
      uniMock.getStorageSync.mockReturnValue('t');
      uniMock.request.mockImplementation((args) => args.success({ statusCode: 200, data: { paid: true } }));
      await mod.paymentApi.mockPay('NO123');
      expect(uniMock.request.mock.calls[0][0].url).toBe('/api/payment/mock-pay');
      expect(uniMock.request.mock.calls[0][0].header.Authorization).toBe('Bearer t');
    } finally {
      delete globalThis.window;
    }
  });
});
