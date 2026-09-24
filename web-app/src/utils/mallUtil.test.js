import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTid } from './mallUtil.js';

// ============================================================
// mallUtil.getTid：租户上下文（分享 query / App launch query / 扫码 scene）
// ============================================================
const uniMock = {
  getStorageSync: vi.fn(),
  setStorageSync: vi.fn(),
};
vi.stubGlobal('uni', uniMock);

beforeEach(() => {
  vi.clearAllMocks();
  uniMock.getStorageSync.mockReturnValue('');
});

describe('mallUtil.getTid 租户上下文', () => {
  it('Page.onLoad 分享直带 options.tid → 写入 storage 并返回', () => {
    expect(getTid({ tid: '3' })).toBe('3');
    expect(uniMock.setStorageSync).toHaveBeenCalledWith('mall_tid', '3');
  });

  it('App.onLaunch options.query.tid（分享卡片）→ 写入 storage 并返回', () => {
    expect(getTid({ query: { tid: '5' } })).toBe('5');
    expect(uniMock.setStorageSync).toHaveBeenCalledWith('mall_tid', '5');
  });

  it('扫码场景值 options.scene（URL 编码 tid=7）→ 解码解析并返回', () => {
    expect(getTid({ scene: 'tid%3D7' })).toBe('7');
    expect(uniMock.setStorageSync).toHaveBeenCalledWith('mall_tid', '7');
  });

  it('无入口 tid 时读回已存 storage（二次进入/页面跳转）', () => {
    uniMock.getStorageSync.mockReturnValue('9');
    expect(getTid({})).toBe('9');
    expect(uniMock.setStorageSync).not.toHaveBeenCalled();
  });

  it('无入口 tid 且 storage 为空 → 返回空串（平台公共模板）', () => {
    expect(getTid(undefined)).toBe('');
  });
});
