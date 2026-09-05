import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchScenes, login, fetchAdminScenes, uploadImage } from '../src/api.js';

function mockFetchOnce(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

// node 环境无 localStorage，提供轻量 stub
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchScenes', () => {
  it('解析上架场景列表', async () => {
    mockFetchOnce(200, { scenes: [{ id: 1, title: '客厅' }] });
    const data = await fetchScenes();
    expect(data.scenes).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/scenes', expect.anything());
  });

  it('非 2xx 抛出带错误信息的异常', async () => {
    mockFetchOnce(500, { error: '服务器错误' });
    await expect(fetchScenes()).rejects.toThrow('服务器错误');
  });
});

describe('login', () => {
  it('POST 用户名密码并返回 token', async () => {
    mockFetchOnce(200, { token: 'abc' });
    const data = await login('admin', 'pass');
    expect(data.token).toBe('abc');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ username: 'admin', password: 'pass' });
  });

  it('登录失败抛出错误', async () => {
    mockFetchOnce(401, { error: '用户名或密码错误' });
    await expect(login('admin', 'bad')).rejects.toThrow('用户名或密码错误');
  });
});

describe('fetchAdminScenes', () => {
  it('携带 Bearer token', async () => {
    localStorage.setItem('panorama_token', 'tok-1');
    mockFetchOnce(200, { scenes: [] });
    await fetchAdminScenes();
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer tok-1');
  });
});

describe('uploadImage', () => {
  it('FormData 上传并返回路径', async () => {
    localStorage.setItem('panorama_token', 'tok-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ path: '/uploads/x.png' }),
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const path = await uploadImage(file);
    expect(path).toBe('/uploads/x.png');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers.Authorization).toBe('Bearer tok-1');
  });

  it('上传失败抛出错误', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '仅支持图片' }),
    });
    await expect(uploadImage(new File(['x'], 'x.txt', { type: 'text/plain' }))).rejects.toThrow(
      '仅支持图片'
    );
  });
});
