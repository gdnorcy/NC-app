/**
 * 商城 C 端 API（2026-09-18 新增，/api/mall 独立命名空间，方案C）
 * - 复用 createApiClient 公共请求层：token / 401 / 解包 与 cardApi 一致，登录态统一 card_token
 * - 商品浏览类接口公开（?tid= 指定租户）；购物车/下单/订单需登录（Authorization 头）
 * - 服务端 /api/mall 整体挂 requireGoodsApp C 端变体（未开通 goods 应用 → 403）
 * - API 基址：H5（含 /mall 独立产物）走同源相对路径 /api/mall，任意域名/端口部署可用；
 *   小程序端 uni.request 要求完整 URL，开发占位 localhost:3000，发布时替换实际 HTTPS 域名
 */
import { createApiClient, qs } from './apiClient.js';

const BASE_URL =
  typeof window !== 'undefined' && window.location
    ? '/api/mall'
    : 'http://localhost:3000/api/mall';
const { request } = createApiClient(BASE_URL);

export const mallApi = {
  // ===== 商品浏览（公开）=====
  /** 商品分类（含子级），?tid= 指定租户 */
  getCates: (params) => request('/cates' + qs(params)),
  /** 商品列表（分页/分类/关键字/排序），?tid= 指定租户 */
  getGoods: (params) => request('/goods' + qs(params)),
  /** 商品详情（含 SKU/门店可售状态/配送说明） */
  getGoodsDetail: (id) => request(`/goods/${id}`),

  // ===== 购物车（需登录）=====
  getCart: () => request('/cart'),
  addCart: (data) => request('/cart', 'POST', data),
  updateCart: (id, data) => request(`/cart/${id}`, 'PUT', data),
  removeCart: (id) => request(`/cart/${id}`, 'DELETE'),
  clearCart: () => request('/cart', 'DELETE'),

  /** 商城首页装修组件（公开，mall-home 发布稿→草稿回退） */
  getDesignHome: (params) => request('/design-home' + qs(params)),

  // ===== 门店（自提选择，公开读）=====
  getStores: (params) => request('/stores' + qs(params)),

  // ===== 下单与订单（需登录）=====
  /** 创建订单：{ items:[{goodsId,skuId,quantity}], delivery:{type:'express'|'pickup', storeId?, address?}, remark } */
  createOrder: (data) => request('/orders', 'POST', data),
  getOrders: (params) => request('/orders' + qs(params)),
  getOrder: (id) => request(`/orders/${id}`),
  cancelOrder: (id) => request(`/orders/${id}/cancel`, 'POST', {}),
};
