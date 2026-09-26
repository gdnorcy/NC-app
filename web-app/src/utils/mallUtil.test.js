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

  it('H5 顶层 query 直读（/mall/?tid=13，与 /pano 对齐）→ 写入 storage 并返回', () => {
    globalThis.window = { location: { search: '?tid=13' } };
    try {
      expect(getTid(undefined)).toBe('13');
      expect(uniMock.setStorageSync).toHaveBeenCalledWith('mall_tid', '13');
    } finally {
      delete globalThis.window;
    }
  });

  it('H5 顶层 query 无 tid 时回退 options.tid（不清空分享进入上下文）', () => {
    globalThis.window = { location: { search: '?a=1' } };
    try {
      expect(getTid({ tid: '8' })).toBe('8');
      expect(uniMock.setStorageSync).toHaveBeenCalledWith('mall_tid', '8');
    } finally {
      delete globalThis.window;
    }
  });

  it('H5 顶层 query 带 tid 时优先于 options（多入口并存取 URL 为准）', () => {
    globalThis.window = { location: { search: '?tid=21' } };
    try {
      expect(getTid({ tid: '8' })).toBe('21');
      expect(uniMock.setStorageSync).toHaveBeenCalledWith('mall_tid', '21');
    } finally {
      delete globalThis.window;
    }
  });
});
