/**
 * API 基址单一来源（2026-10-17 从 cardApi / mallApi / App.vue 三处收敛）
 *
 * 配置在 web-app/.env（vite import.meta.env，**构建期生效**——改完必须重新构建）：
 *   VITE_MP_API_BASE   小程序端基址（uni.request 必须完整 URL），默认 https://zero.nshop.mobi
 *   VITE_H5_API_BASE   H5 端基址，默认空 = 同源相对路径（任意域名/端口部署均可；
 *                     vite dev 5174 已把 /api 与 /uploads 代理到 localhost:3000）
 *
 * 🔴 运行时探测而非条件编译：条件编译只在 uni 编译链生效，vitest / node 直接跑源码时
 *    两个分支会同时保留 → 写两个 const 抛「重复声明」。判据与条件编译等价：
 *    非小程序端有 window，微信小程序端没有。
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** 小程序端 API 基址（完整 URL，不含 /api 路径段） */
export const MP_API_BASE = env.VITE_MP_API_BASE || 'https://zero.nshop.mobi';
/** H5 端 API 基址：空串 = 同源相对路径 */
export const H5_API_BASE = env.VITE_H5_API_BASE || '';

export const IS_MP_WEIXIN =
  typeof window === 'undefined' && typeof wx !== 'undefined' && typeof uni !== 'undefined' && !!uni.getSystemInfoSync;

/** 当前平台 API 基址（不含 /api 路径段）：MP=完整域名，H5='' = 同源相对 */
export const API_HOST = IS_MP_WEIXIN ? MP_API_BASE : H5_API_BASE;
