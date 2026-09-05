import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchScenes,
  login,
  fetchAdminScenes,
  uploadImage,
  fetchStorageConfig,
  saveStorageConfig,
  testStorage,
} from '../src/api.js';

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
  it('解析上架场景列表并返回数组', async () => {
    mockFetchOnce(200, { scenes: [{ id: 1, title: '客厅' }] });
    const data = await fetchScenes();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('客厅');
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

describe('storage API', () => {
  beforeEach(() => {
    localStorage.setItem('panorama_token', 'tok-1');
  });

  it('fetchStorageConfig 携带 token', async () => {
    mockFetchOnce(200, { config: { provider: 'oss' } });
    const data = await fetchStorageConfig();
    expect(data.config.provider).toBe('oss');
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/storage', expect.anything());
  });

  it('saveStorageConfig 发送 PUT JSON（含厂商专属字段）', async () => {
    mockFetchOnce(200, { config: { provider: 'qiniu' } });
    await saveStorageConfig({ provider: 'qiniu', accessKey: 'ak', secretKey: 'sk', bucket: 'b', zone: 'z2', folder: 'vr360', region: '', cdnDomain: '' });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(options.headers.Authorization).toBe('Bearer tok-1');
    expect(JSON.parse(options.body)).toMatchObject({ provider: 'qiniu', zone: 'z2', folder: 'vr360' });
  });

  it('fetchStorageConfig 返回多厂商配置', async () => {
    mockFetchOnce(200, {
      config: {
        provider: 'qiniu',
        providers: { local: {}, oss: { hasSecretKey: false }, qiniu: { hasSecretKey: true, zone: 'z2' } },
      },
    });
    const data = await fetchStorageConfig();
    expect(data.config.providers.qiniu.hasSecretKey).toBe(true);
    expect(data.config.providers.qiniu.zone).toBe('z2');
  });

  it('testStorage 返回测试结果，失败时抛错', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, message: '连接成功' }),
    });
    const result = await testStorage();
    expect(result.ok).toBe(true);
    expect(global.fetch.mock.calls[0][1].body).toBeUndefined();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, message: '连接失败：鉴权错误' }),
    });
    await expect(testStorage()).rejects.toThrow('连接失败：鉴权错误');
  });

  it('testStorage 携带表单配置测试', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, message: '空间可读写' }),
    });
    await testStorage({ provider: 'oss', accessKey: 'ak', secretKey: 'sk', bucket: 'b', region: 'r', cdnDomain: '' });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toMatchObject({ provider: 'oss', bucket: 'b' });
  });

  it('testStorage 超时转为超时错误', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
      const promise = testStorage();
      vi.advanceTimersByTime(15000);
      await expect(promise).rejects.toThrow('连接超时');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createScene', () => {
  it('JSON 请求保留 Content-Type 与 Bearer token', async () => {
    localStorage.setItem('panorama_token', 'tok-1');
    mockFetchOnce(201, { scene: { id: 9, title: '客厅' } });
    const { createScene } = await import('../src/api.js');
    await createScene({ title: '客厅', imagePath: '/uploads/a.jpg', sortOrder: 0, published: true });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers.Authorization).toBe('Bearer tok-1');
    expect(typeof options.body).toBe('string');
  });
});

describe('uploadImage', () => {
  it('FormData 上传并返回 path 与 previewPath', async () => {
    localStorage.setItem('panorama_token', 'tok-1');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ path: '/uploads/x-main.webp', previewPath: '/uploads/x-preview.webp' }),
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const data = await uploadImage(file);
    expect(data.path).toBe('/uploads/x-main.webp');
    expect(data.previewPath).toBe('/uploads/x-preview.webp');
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
