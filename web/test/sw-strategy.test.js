import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// public 目录文件不参与 vite 模块解析，用 vm 沙箱执行与 SW importScripts 完全同一份代码
const CODE = fs.readFileSync(fileURLToPath(new URL('../public/sw-strategy.js', import.meta.url)), 'utf8');

let planRequest;
beforeAll(() => {
  const sandbox = { URL };
  vm.runInNewContext(CODE, sandbox);
  planRequest = sandbox.planRequest;
});

const ORIGIN = 'https://panorama.example.com';

describe('planRequest 缓存策略', () => {
  it('场景 API 走网络优先，离线可回退', () => {
    expect(planRequest(`${ORIGIN}/api/scenes`, ORIGIN).strategy).toBe('network-first');
  });

  it('全景图走缓存优先', () => {
    expect(planRequest(`${ORIGIN}/uploads/123-main.webp`, ORIGIN).strategy).toBe('cache-first');
    expect(planRequest(`${ORIGIN}/uploads/a/123-preview.jpg`, ORIGIN).strategy).toBe('cache-first');
  });

  it('页面与静态资源走 SWR', () => {
    expect(planRequest(`${ORIGIN}/`, ORIGIN).strategy).toBe('stale-while-revalidate');
    expect(planRequest(`${ORIGIN}/index.html`, ORIGIN).strategy).toBe('stale-while-revalidate');
    expect(planRequest(`${ORIGIN}/assets/main-abc123.js`, ORIGIN).strategy).toBe('stale-while-revalidate');
  });

  it('跨源请求不拦截（CDN 交由浏览器/CDN 缓存）', () => {
    expect(planRequest('https://img.cdn.example.com/scenes/123-main.webp', ORIGIN).strategy).toBe('skip');
  });

  it('非法 URL 返回 skip', () => {
    expect(planRequest('https://', ORIGIN).strategy).toBe('skip');
    expect(planRequest('http://', ORIGIN).strategy).toBe('skip');
  });
});
