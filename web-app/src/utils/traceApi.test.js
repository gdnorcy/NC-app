import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as traceApi from './traceApi.js';
import { API_HOST } from './apiBase.js';

// ============================================================
// traceApi：C 端防伪溯源公开接口封装（/api/trace/public/*）
// 每个方法必须映射到 server/src/routes/trace.js 的真实路由，
// 且基址一律来自 apiBase.js（禁硬编码 '/api/trace'）。
// 公开段租户只认 tid（URL ?tid=），前端必须透传。
// ============================================================
const uniMock = {
  getStorageSync: vi.fn(),
  removeStorageSync: vi.fn(),
  reLaunch: vi.fn(),
  request: vi.fn(),
};
vi.stubGlobal('uni', uniMock);

beforeEach(() => {
  vi.clearAllMocks();
  uniMock.getStorageSync.mockReturnValue('test-token');
});

function mockResponse(statusCode, body) {
  uniMock.request.mockImplementation(({ success }) => success({ statusCode, data: body }));
}

const BASE = API_HOST + '/api/trace/public';

describe('traceApi 请求封装', () => {
  it('scanEntry → GET /public/scan-entry?co=&tid=', async () => {
    mockResponse(200, { ok: 1 });
    await traceApi.scanEntry('ABC123', 't1');
    expect(uniMock.request).toHaveBeenCalledWith(expect.objectContaining({
      url: BASE + '/scan-entry?co=ABC123&tid=t1',
      method: 'GET',
    }));
  });

  it('verifyTrace → POST /public/verify?tid= （带 body）', async () => {
    mockResponse(200, { verified: true });
    await traceApi.verifyTrace({ co: 'ABC123' }, 't1');
    const args = uniMock.request.mock.calls[0][0];
    expect(args.method).toBe('POST');
    expect(args.url).toBe(BASE + '/verify?tid=t1');
    expect(args.data).toEqual({ co: 'ABC123' });
  });

  it('traceHistory → GET /public/history?code=&tid=', async () => {
    mockResponse(200, { list: [] });
    await traceApi.traceHistory('ABC123', 't1');
    expect(uniMock.request).toHaveBeenCalledWith(expect.objectContaining({
      url: BASE + '/history?code=ABC123&tid=t1',
      method: 'GET',
    }));
  });

  it('myGoods → GET /public/mygoods?tid= （需登录态）', async () => {
    mockResponse(200, { list: [] });
    await traceApi.myGoods({ page: 1 }, 't1');
    expect(uniMock.request).toHaveBeenCalledWith(expect.objectContaining({
      url: BASE + '/mygoods?page=1&tid=t1',
      method: 'GET',
    }));
  });

  it('claimReward → POST /public/claim?tid= （带 body）', async () => {
    mockResponse(200, { claimed: true });
    await traceApi.claimReward({ sj: '13800000000', rewardId: 5 }, 't1');
    const args = uniMock.request.mock.calls[0][0];
    expect(args.method).toBe('POST');
    expect(args.url).toBe(BASE + '/claim?tid=t1');
    expect(args.data).toEqual({ sj: '13800000000', rewardId: 5 });
  });

  it('traceSceneQr → POST /public/mp-scene?tid= （带 body，取临时引导二维码）', async () => {
    mockResponse(200, { ok: true, imageUrl: '/api/trace/public/mp-scene/image?tid=t1&scene=100001' });
    const r = await traceApi.traceSceneQr('ABC123', 't1', 'OC-TICKET');
    const args = uniMock.request.mock.calls[0][0];
    expect(args.method).toBe('POST');
    expect(args.url).toBe(BASE + '/mp-scene?tid=t1');
    // 🔴 oc 是服务端签发的身份凭据，必须随请求带回（前端自己没有 openid 可言）
    expect(args.data).toEqual({ code: 'ABC123', oc: 'OC-TICKET' });
    expect(r.imageUrl).toContain('/mp-scene/image');
  });

  it('traceScanMode → GET /public/scan-mode?tid= （先验真再问方案会重复计数）', async () => {
    mockResponse(200, { scanMode: 'push_dynamic', oauthReady: true });
    await traceApi.traceScanMode('t1');
    expect(uniMock.request).toHaveBeenCalledWith(expect.objectContaining({
      url: BASE + '/scan-mode?tid=t1',
      method: 'GET',
    }));
  });

  it('wxAuthStartUrl：回跳地址必须是本站相对路径（服务端只放行这类）', () => {
    const url = traceApi.wxAuthStartUrl('t1', '/card/#/pages/trace/index?co=ABC&tid=t1');
    // H5 端 API_HOST 为空（同源相对路径），小程序端是完整域名 → 只断言"以基址开头"
    expect(url.startsWith(API_HOST)).toBe(true);
    expect(url).toContain('/api/trace/public/wx-auth/start?tid=t1&redirect=');
    expect(url).toContain(encodeURIComponent('/card/#/pages/trace/index?co=ABC&tid=t1'));
    expect(url).not.toContain('redirect=http', '绝对外链地址不该出现在这里（服务端会 400）');
  });

  it('所有方法都带 tid（公开段租户定位唯一来源）', async () => {
    mockResponse(200, {});
    const methods = [
      () => traceApi.scanEntry('c', 'TID'),
      () => traceApi.verifyTrace({}, 'TID'),
      () => traceApi.traceHistory('c', 'TID'),
      () => traceApi.myGoods({}, 'TID'),
      () => traceApi.claimReward({}, 'TID'),
      () => traceApi.activateBatch('b', 'p', 'TID'),
      () => traceApi.traceSceneQr('c', 'TID'),
      () => traceApi.traceScanMode('TID'),
    ];
    for (const m of methods) {
      uniMock.request.mockClear();
      await m();
      expect(uniMock.request.mock.calls[0][0].url).toContain('tid=TID');
    }
  });
});
