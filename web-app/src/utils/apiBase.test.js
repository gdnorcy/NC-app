import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API_HOST, MP_API_BASE, H5_API_BASE, IS_MP_WEIXIN } from './apiBase.js';

// ============================================================
// apiBase：API 基址单一来源 + MP 编译安全红线
// 2026-10-17 真机崩溃回归：`typeof import.meta !== 'undefined' && import.meta.env`
// 在 MP（CJS 输出）下被 vite 垫片成 require("url")，微信运行时无此模块，
// app.js 启动即崩（module 'utils/url.js' is not defined）→ 全页面未注册。
// ============================================================
const SRC = readFileSync(fileURLToPath(new URL('./apiBase.js', import.meta.url)), 'utf-8');
// 剥掉块注释与行注释后只查真实代码——注释里允许引用反面写法做警示
// （行注释正则要求 // 前不是冒号，避免误伤 'https://...' 字符串）
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^:])\/\/.*/g, '$1');
// 期望值同样从 import.meta.env 取——改 .env 后测试自动跟随，不写死
const expectedMp = import.meta.env.VITE_MP_API_BASE || 'https://zero.nshop.mobi';
const expectedH5 = import.meta.env.VITE_H5_API_BASE || '';

describe('apiBase 基址取值', () => {
  it('MP 基址 = .env 配置（缺省服务器域名）', () => {
    expect(MP_API_BASE).toBe(expectedMp);
  });

  it('H5 基址 = .env 配置（缺省空串=同源相对）', () => {
    expect(H5_API_BASE).toBe(expectedH5);
  });

  it('node 环境（无 window/wx）判为非小程序 → API_HOST 取 H5 基址', () => {
    expect(IS_MP_WEIXIN).toBe(false);
    expect(API_HOST).toBe(H5_API_BASE);
  });
});

describe('apiBase MP 编译安全红线', () => {
  it('严禁 typeof import.meta 防御写法（MP 下编译出 require("url") 崩 app.js）', () => {
    expect(CODE).not.toMatch(/typeof\s+import\.meta/);
  });

  it('必须 import.meta.env 直接访问（vite define 才能整体替换为字面量）', () => {
    expect(CODE).toMatch(/import\.meta\.env/);
  });

  it('模块加载期不得调用 getSystemInfoSync（deprecated 警告，且 window/wx 判据已足够）', () => {
    expect(CODE).not.toMatch(/getSystemInfoSync/);
  });

  it('MP 构建产物（若已构建）不得含 require("url")/pathToFileURL 垫片', () => {
    const built = fileURLToPath(new URL('../../../dist/build/mp-weixin/utils/apiBase.js', import.meta.url));
    if (!existsSync(built)) return; // 未执行 MP 构建时跳过
    const out = readFileSync(built, 'utf-8');
    expect(out).not.toContain('require("url")');
    expect(out).not.toContain('pathToFileURL');
    expect(out).toContain('VITE_MP_API_BASE'); // env 已被 define 替换成字面量
  });
});
