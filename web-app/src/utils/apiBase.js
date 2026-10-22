/**
 * API 基址单一来源（2026-10-17 从 cardApi / mallApi / App.vue 三处收敛）
 *
 * 配置在 web-app/.env（vite import.meta.env，**构建期生效**——改完必须重新构建）：
 *   VITE_MP_API_BASE   小程序端基址（uni.request 必须完整 URL），默认 https://zero.nshop.mobi
 *   VITE_H5_API_BASE   H5 端基址，默认空 = 同源相对路径（任意域名/端口部署均可；
 *                     vite dev 5174 已把 /api 与 /uploads 代理到 localhost:3000）
 *
 * 🔴 MP 编译红线（2026-10-17 真机崩溃换来的）：只能 `import.meta.env` 直接访问，
 *    **严禁 `typeof import.meta !== 'undefined' && import.meta.env` 防御式写法**——
 *    vite 在 MP（CJS 输出）下会把裸 import.meta 垫片成
 *    `{url: require("url").pathToFileURL(__filename).href}`：H5 有 document 走浏览器分支无事，
 *    MP 无 document → 编译出 require("url") → 微信运行时无此 Node 内置模块 →
 *    app.js 启动即崩（module 'utils/url.js' is not defined，连带全部页面未注册）。
 *    直接访问 import.meta.env 才会被 vite define 整体替换成字面量，不留裸 import.meta。
 *
 * 🔴 运行时探测而非条件编译：条件编译只在 uni 编译链生效，vitest / node 直接跑源码时
 *    两个分支会同时保留 → 写两个 const 抛「重复声明」。判据与条件编译等价：
 *    非小程序端有 window，微信小程序端没有（微信内 H5 也有 window，不受误判）。
 */

const env = import.meta.env || {};

/** 小程序端 API 基址（完整 URL，不含 /api 路径段） */
export const MP_API_BASE = env.VITE_MP_API_BASE || 'https://zero.nshop.mobi';
/** H5 端 API 基址：空串 = 同源相对路径 */
export const H5_API_BASE = env.VITE_H5_API_BASE || '';

/** 微信小程序端判定：MP 无 window 有 wx；H5（含微信内浏览器）有 window → false */
export const IS_MP_WEIXIN = typeof window === 'undefined' && typeof wx !== 'undefined';

/** 当前平台 API 基址（不含 /api 路径段）：MP=完整域名，H5='' = 同源相对 */
export const API_HOST = IS_MP_WEIXIN ? MP_API_BASE : H5_API_BASE;

/**
 * 🔴 存储回传的图片路径补全（2026-10-23 从 dynamic.vue / cardDetail.vue 收敛为单一来源）
 *
 * 服务端 storage/local.js 存的是 `/uploads/xxx` **相对路径**：
 *   - H5 同源，<image src="/uploads/xxx"> 正常
 *   - MP 会把 `/uploads/xxx` 当**小程序包内路径**解析 → 加载失败 → 图片空白 / 头像一片灰
 * 所以 MP 必须补 API_HOST，H5 保持同源相对。
 *
 * ⚠️ 只补「以 / 开头」的相对路径：微信头像等 https:// 链接、以及本地临时路径
 *    （wxfile:// / blob: / 本地 tmp）原样返回，不能误补。
 */
export const absUrl = (u) => (typeof u === 'string' && u.startsWith('/') ? API_HOST + u : u);
