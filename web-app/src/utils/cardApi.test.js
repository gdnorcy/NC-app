import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cardApi } from './cardApi.js';

// ============================================================
// cardApi：URL 前缀、鉴权头、响应解包、错误 reject（AGENTS.md 前端 API 规范）
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

describe('cardApi 请求封装', () => {
  it('URL 拼接正确（/api/card 前缀 + 路径）', async () => {
    mockResponse(200, { cards: [] });
    await cardApi.getCards();
    expect(uniMock.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://localhost:3000/api/card/cards',
      method: 'GET',
    }));
  });

  it('携带 Authorization 头（card_token）', async () => {
    mockResponse(200, {});
    await cardApi.getCard(12);
    const args = uniMock.request.mock.calls[0][0];
    expect(args.header.Authorization).toBe('Bearer test-token');
    expect(args.header['Content-Type']).toBe('application/json');
  });

  it('成功响应直接解包返回 res.data（禁止再取 .data）', async () => {
    mockResponse(200, { card: { id: 12 } });
    const res = await cardApi.getCard(12);
    expect(res.card.id).toBe(12);
    expect(res.data).toBeUndefined();
  });

  it('非 2xx 状态 reject 错误字符串', async () => {
    mockResponse(500, { error: '服务器内部错误' });
    await expect(cardApi.getTemplates()).rejects.toThrow('服务器内部错误');
  });

  it('401 清空凭证并跳登录页', async () => {
    mockResponse(401, { error: '未登录' });
    await expect(cardApi.getProfile()).rejects.toThrow('未登录');
    expect(uniMock.removeStorageSync).toHaveBeenCalledWith('card_token');
    expect(uniMock.reLaunch).toHaveBeenCalledWith({ url: '/pages/card/login' });
  });

  it('无 token 时 Authorization 为空', async () => {
    uniMock.getStorageSync.mockReturnValue('');
    mockResponse(200, {});
    await cardApi.getProfile();
    const args = uniMock.request.mock.calls[0][0];
    expect(args.header.Authorization).toBe('');
  });

  it('POST/PUT 透传 method 与 data', async () => {
    mockResponse(200, { order: { id: 1 } });
    await cardApi.createCard({ name: '张三' });
    const args = uniMock.request.mock.calls[0][0];
    expect(args.method).toBe('POST');
    expect(args.data).toEqual({ name: '张三' });
  });

  it('distApply 提交分销商申请（POST /distribution/apply）', async () => {
    mockResponse(200, { ok: true });
    await cardApi.distApply();
    const args = uniMock.request.mock.calls[0][0];
    expect(args.url).toBe('http://localhost:3000/api/card/distribution/apply');
    expect(args.method).toBe('POST');
  });

  it('designLead 提交设计中心万能表单线索（POST /design/leads）', async () => {
    mockResponse(200, { ok: true, message: '提交成功' });
    await cardApi.designLead({ tenantId: 1, formTitle: '留资表单', fields: [{ label: '姓名', value: '李四' }] });
    const args = uniMock.request.mock.calls[0][0];
    expect(args.url).toBe('http://localhost:3000/api/card/design/leads');
    expect(args.method).toBe('POST');
    expect(args.data).toEqual({ tenantId: 1, formTitle: '留资表单', fields: [{ label: '姓名', value: '李四' }] });
  });
});
