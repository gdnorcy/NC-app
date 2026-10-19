// 智能名片 API 封装
import { createApiClient } from './apiClient.js';
import { getTid } from './mallUtil.js';
import { qsStringify, qsParse } from './qs.js';
import { DEFAULT_TENANT_ID } from '../config.js';

// ===== 服务器基址 =====
// 单一来源 utils/apiBase.js（2026-10-17 收敛）：web-app/.env 配置，构建期生效。
//   VITE_MP_API_BASE  小程序端完整 URL，默认 https://zero.nshop.mobi（线上服务器，
//                     库已同步本地数据便于测试调试；要改回本地开发机就填局域网 IP，
//                     DHCP 换网会变，手机与电脑须同一 WiFi）
//   VITE_H5_API_BASE  H5 端默认空 = 同源相对路径（任意域名部署均可；dev 走 vite 代理）
// 小程序真机访问不到电脑的 localhost，必须完整 URL——这是 MP 与 H5 基址不同的原因。
import { API_HOST } from './apiBase.js';

const HOST = API_HOST;

const BASE_URL = HOST + '/api/card';
const MARKET_BASE_URL = HOST + '/api/card-market';
// 支付API基址：H5 同源相对路径（任意域名/端口部署可用）；小程序端 uni.request 要求完整 URL
const PAYMENT_BASE_URL = HOST + '/api/payment';

// 公共请求层（token 注入 / 401 跳登录 / 响应解包），行为与原 request 完全一致
const { request } = createApiClient(BASE_URL);

// 是否已登录：H5 优先直读 localStorage（与 apiClient.readToken 一致），小程序端走 uni 原生
// （2026-10-18 导出供页面做登录入口守卫用，如个人中心「编辑资料」未登录拦截）
export function hasCardToken() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('card_token')) return true;
  } catch { /* 忽略 */ }
  try { return !!uni.getStorageSync('card_token'); } catch { return false; }
}

// 支付API请求（使用card_token认证；H5 端 localStorage 直读优先，与 apiClient.readToken 一致）
function readPaymentToken() {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem('card_token');
      if (v) return v;
    }
  } catch { /* 忽略 */ }
  try { return uni.getStorageSync('card_token'); } catch { return ''; }
}

function paymentRequest(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const token = readPaymentToken();
    uni.request({
      url: PAYMENT_BASE_URL + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.error || '请求失败'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

export const cardApi = {
  // 微信登录
  // tid：单租户部署时把新用户落到默认租户（后端还有 config.defaultTenantId 兜底）
  // appid：小程序端携带自身 appid（第三方平台代开发按租户登录；H5 不传）
  wxLogin: (code, parentId, tid, appid) => request('/auth/wx-login', 'POST', { code, parentId, tid, appid: appid || '' }),

  // 用户信息
  // 🔴 游客可降级版本：首页/分享/预览等**未登录也要能看**的场景必须用它，
  //    否则本地残留过期 token → 401 → 全局 reLaunch 登录页，把游客从分享名片里踢走。
  getProfileSafe: () => request('/user/profile', 'GET', {}, { skipAuthRedirect: true }),
  getProfile: () => request('/user/profile'),
  updateProfile: (data) => request('/user/profile', 'PUT', data),

  // 名片
  getCards: () => request('/cards'),
  // 游客可降级的"我的名片"（会员中心取品牌色等场景，401 不跳登录）
  getCardsSafe: () => request('/cards', 'GET', {}, { skipAuthRedirect: true }),
  getCard: (id) => request(`/cards/${id}`),
  createCard: (data) => request('/cards', 'POST', data),
  createCardWithApply: (data) => request('/cards/create-with-apply', 'POST', data),
  updateCard: (id, data) => request(`/cards/${id}`, 'PUT', data),
  deleteCard: (id) => request(`/cards/${id}`, 'DELETE'),
  getCardWorks: (id) => request(`/cards/${id}/works`),
  // ===== 作品集管理（仅名片归属人；服务端 card.js 有归属校验）=====
  // 新增作品：图片直传(multipart file) + 标题(formData.title)，跨端走 uni.uploadFile
  addCardWork: (cardId, filePath, title) => {
    const token = uni.getStorageSync('card_token');
    return new Promise((resolve, reject) => {
      uni.uploadFile({
        url: BASE_URL + `/cards/${cardId}/works`,
        filePath,
        name: 'file',
        formData: { title: title || '' },
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const data = JSON.parse(res.data || '{}');
            if (res.statusCode >= 200 && res.statusCode < 300 && data.work) resolve(data);
            else reject(new Error(data.error || '新增作品失败'));
          } catch (e) { reject(new Error('新增作品失败')); }
        },
        fail: (e) => reject(new Error((e && e.errMsg) || '新增作品失败')),
      });
    });
  },
  updateCardWork: (cardId, workId, title) => request(`/cards/${cardId}/works/${workId}`, 'PUT', { title }),
  deleteCardWork: (cardId, workId) => request(`/cards/${cardId}/works/${workId}`, 'DELETE'),
  sortCardWorks: (cardId, ids) => request(`/cards/${cardId}/works/sort`, 'PUT', { ids }),
  // ===== 视频号作品管理（仅名片归属人；视频号链接调用：finderUserName + feedId）=====
  // 链接解析：粘贴视频号分享链接 → 自动提取 finderUserName(sph) + feedId（失败降级手动填）
  parseChannelLink: (cardId, link) => request(`/cards/${cardId}/videos/parse`, 'POST', { link }),
  // 新增视频条目：JSON（finderUserName + feedId + 标题）；封面统一默认图 + 播放键
  addCardVideo: (cardId, payload) => request(`/cards/${cardId}/videos`, 'POST', {
    finderUserName: payload.finderUserName,
    feedId: payload.feedId,
    title: payload.title || '',
  }),
  updateCardVideo: (cardId, videoId, data) => request(`/cards/${cardId}/videos/${videoId}`, 'PUT', data || {}),
  deleteCardVideo: (cardId, videoId) => request(`/cards/${cardId}/videos/${videoId}`, 'DELETE'),
  sortCardVideos: (cardId, ids) => request(`/cards/${cardId}/videos/sort`, 'PUT', { ids }),
  getCardDynamics: (id) => request(`/cards/${id}/dynamics`),
  getCardVideos: (id) => request(`/cards/${id}/videos`),
  // 语音简介上传（阶段C：上传音频；克隆语音后续新增；H5 端 FormData，小程序端走 uni.uploadFile）
  uploadVoiceFile: (file) => {
    const token = uni.getStorageSync('card_token');
    const fd = new FormData();
    fd.append('file', file);
    return fetch(BASE_URL + '/voice-upload', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then((r) => r.json().then((data) => {
      if (!r.ok) throw new Error(data.error || '上传失败');
      return data;
    }));
  },
  // 用户头像上传（个人中心编辑资料；入参为本地临时路径，跨端走 uni.uploadFile）
  uploadUserAvatar: (filePath) => {
    const token = uni.getStorageSync('card_token');
    return new Promise((resolve, reject) => {
      uni.uploadFile({
        url: BASE_URL + '/user/avatar-upload',
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const data = JSON.parse(res.data || '{}');
            if (res.statusCode >= 200 && res.statusCode < 300 && data.url) resolve(data);
            else reject(new Error(data.error || '头像上传失败'));
          } catch (e) { reject(new Error('头像上传失败')); }
        },
        fail: (e) => reject(new Error((e && e.errMsg) || '头像上传失败')),
      });
    });
  },
  // 名片模板（平台公共 + 本租户私有；小程序端由入口 tid 指定租户，H5 端走登录态）
  getTemplates: () => {
    const tid = getTid();
    return request(tid ? `/templates?tid=${tid}` : '/templates');
  },
  buyTemplate: (id) => request(`/templates/${id}/purchase`, 'POST', {}),
  // 动态互动（点赞/评论）
  likeDynamic: (id) => request(`/dynamics/${id}/like`, 'POST', {}),
  getComments: (id) => request(`/dynamics/${id}/comments`),
  addComment: (id, content) => request(`/dynamics/${id}/comments`, 'POST', { content }),

  // 访客采集
  trackVisitor: (data) => request('/visitor/track', 'POST', data),

  // 访客雷达
  getVisitorSummary: () => request('/visitors/summary'),
  getVisitorTimeline: (openid) => request(`/visitors/${openid}/timeline`),

  // 我的名片小程序码（type=wxacode 真·小程序码 | h5 降级 H5 链接二维码；image 为 dataURL）
  getWxacode: (cardId) => request(`/wxacode?cardId=${Number(cardId) || 0}`),

  // ===== 运营型雷达（阶段C：高潜榜/意向/AI报告/配置/话术/转发/导出/站内提醒）=====
  getRadarTopLeads: (limit) => request(`/radar/top-leads?limit=${limit || 20}`),
  getRadarIntent: (openid) => request(`/radar/intent/${openid}`),
  getRadarFeatures: () => request('/radar/features'),
  getRadarConfig: () => request('/radar/config'),
  saveRadarConfig: (data) => request('/radar/config', 'POST', data),
  getRadarWords: () => request('/radar/words'),
  saveRadarWord: (data) => request('/radar/words', 'POST', data),
  getRadarShares: (limit) => request(`/radar/shares?limit=${limit || 50}`),
  getRadarExport: () => request('/radar/export'),
  getRadarNotifies: (limit) => request(`/radar/notifies?limit=${limit || 50}`),
  readRadarNotify: (id) => request(`/radar/notifies/${id}/read`, 'POST', {}),
  radarSubscribe: (data) => request('/radar/subscribe', 'POST', data),

  // ===== 名片收藏（阶段C：收藏/取消/我的收藏）=====
  collectCard: (cardId) => request('/collect', 'POST', { cardId }),
  uncollectCard: (cardId) => request(`/collect?cardId=${cardId}`, 'DELETE'),
  getMyCollects: (limit) => request(`/collects?limit=${limit || 200}`),
  createCollectGroup: (name, oldName) => request('/collects/group', 'POST', { name, oldName }),
  deleteCollectGroup: (name) => request('/collects/group/delete', 'POST', { name }),
  moveCollectGroup: (collectId, groupName) => request(`/collects/${collectId}/group`, 'POST', { groupName }),

  // ===== 分销中心（租户维度，双身份隔离）=====
  distBind: (parentId, identityType) => request('/distribution/bind', 'POST', { parentId, identityType }),
  distFunnel: (data) => request('/distribution/funnel', 'POST', data),
  distQrcode: () => request('/distribution/qrcode', 'GET'),
  distSummary: (identityType) => request(`/distribution/summary?identityType=${identityType || ''}`),
  distApply: () => request('/distribution/apply', 'POST'),
  distSubs: (level, page) => request(`/distribution/subs?level=${level}&page=${page || 1}&pageSize=20`),
  distLogs: (params = {}) => request(`/distribution/logs?page=${params.page || 1}&pageSize=${params.pageSize || 20}&type=${params.type || ''}&identityType=${params.identityType || ''}`),
  distWallet: (identityType) => request(`/distribution/wallet?identityType=${identityType || ''}`),
  distWithdraw: (amount, identityType, payAccount) => request('/distribution/withdraw', 'POST', { amount, identityType, payAccount }),
  distWithdraws: (params = {}) => request(`/distribution/withdraws?page=${params.page || 1}&pageSize=${params.pageSize || 20}&status=${params.status || ''}&identityType=${params.identityType || ''}`),
  distTeam: (identityType, scope) => request(`/distribution/team?identityType=${identityType || ''}${scope ? `&scope=${scope}` : ''}`),
  distTeamOrders: (page, identityType) => request(`/distribution/team-orders?page=${page || 1}&pageSize=20&identityType=${identityType || ''}`),
  markVisitorRead: (openid) => request(`/visitors/${openid}/read`, 'POST'),

  // 客户管理
  getCustomers: (params) => request('/customers' + (params ? '?' + qsStringify(params) : '')),
  createCustomer: (data) => request('/customers', 'POST', data),
  updateCustomer: (id, data) => request(`/customers/${id}`, 'PUT', data),
  addFollow: (id, data) => request(`/customers/${id}/follow`, 'POST', data),
  getFollows: (id) => request(`/customers/${id}/follows`),

  // 人脉集市（租户级）
  getMarketList: (params) => request(MARKET_BASE_URL + '/market/list' + (params ? '?' + qsStringify(params) : '')),
  submitForm: (id, data) => request(MARKET_BASE_URL + `/forms/${id}/submit`, 'POST', { data }),
  getSuperForm: (id) => request(MARKET_BASE_URL + `/super-form/${id}/public`),
  submitSuperForm: (id, data) => request(MARKET_BASE_URL + `/super-form/${id}/submit`, 'POST', { data }),
  getMarketSettings: () => request(MARKET_BASE_URL + '/market/settings'),
  toggleMarket: (data) => request(MARKET_BASE_URL + '/market/toggle', 'POST', data),
  checkMarket: (params) => request(MARKET_BASE_URL + '/market/check' + (params ? '?' + qsStringify(params) : '')),
  getMarketMyStatus: () => request(MARKET_BASE_URL + '/market/my-status'),
  getMarketMyStats: () => request(MARKET_BASE_URL + '/market/my-stats'),

  // 名片交换
  exchange: (data) => request('/exchange', 'POST', data),
  exchangeRequest: (data) => request(MARKET_BASE_URL + '/exchange/request', 'POST', data),
  exchangeHandle: (data) => request(MARKET_BASE_URL + '/exchange/handle', 'POST', data),
  getExchangeList: () => request(MARKET_BASE_URL + '/exchange/list'),
  getConnections: () => request(MARKET_BASE_URL + '/connections'),
  updateConnection: (id, data) => request(MARKET_BASE_URL + `/connections/${id}`, 'PUT', data),
  deleteConnection: (id) => request(MARKET_BASE_URL + `/connections/${id}`, 'DELETE'),
  convertConnectionToCustomer: (id) => request(MARKET_BASE_URL + `/connections/${id}/convert-customer`, 'POST'),
  getExchangeUnread: () => request(MARKET_BASE_URL + '/exchange/unread'),

  // 消息通知
  getMessages: (type) => request(MARKET_BASE_URL + '/messages' + (type ? `?type=${type}` : '')),
  getMessageUnread: () => request(MARKET_BASE_URL + '/messages/unread'),
  markMessagesRead: (ids) => request(MARKET_BASE_URL + '/messages/read', 'POST', { ids }),

  // 入驻管理
  getIndividuals: () => request(MARKET_BASE_URL + '/individuals'),
  getEnterprises: () => request(MARKET_BASE_URL + '/enterprises'),
  getEnterpriseEmployees: (id) => request(`/card-market/enterprises/${id}/employees`),
  submitApply: (data) => request(MARKET_BASE_URL + '/apply', 'POST', data),
  // 本人入驻申请状态（独立 URL：/api/card-market 域，未绑定租户也可查询）
  // 🔴 基址必须走 MARKET_BASE_URL——曾写死 http://localhost:3000，小程序端直接失效
  getApplyStatus: () => new Promise((resolve, reject) => {
    const token = uni.getStorageSync('card_token');
    uni.request({
      url: MARKET_BASE_URL + '/apply/status',
      method: 'GET',
      header: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' },
      success: (res) => (res.statusCode === 200 ? resolve(res.data) : reject(new Error(res.data?.error || '请求失败'))),
      fail: (err) => reject(err),
    });
  }),
  getMyEnterprise: () => request(MARKET_BASE_URL + '/enterprise/my-data'),

  // 公海池
  getPublicPool: () => request(MARKET_BASE_URL + '/public-pool'),
  claimPoolCustomer: (id) => request(`/card-market/public-pool/${id}/claim`, 'POST'),

  // 会员
  getPackages: () => request('/member/packages'),
  getMemberStatus: () => request('/member/status', 'GET', {}, { skipAuthRedirect: true }),
  // 租户级会员卡（1:1 复刻菜鸟云会员中心）
  memberMyCard: () => request('/member/my-card', 'GET', {}, { skipAuthRedirect: true }),
  memberLevels: () => request('/member/levels', 'GET', {}, { skipAuthRedirect: true }),
  memberApply: (data) => request('/member/apply', 'POST', data),
  memberSign: () => request('/member/sign', 'POST', {}),
  memberBuy: (data) => request('/member/buy', 'POST', data),

  // 分销
  getDistributionSummary: () => request('/distribution/summary'),
  getCommissions: () => request('/distribution/commissions'),
  getTeam: () => request('/distribution/team'),

  // 动态
  getDynamics: () => request('/dynamics'),
  createDynamic: (data) => request('/dynamics', 'POST', data),

  // 设计中心：C 端读取租户发布配置（风格/底部导航/首页跳转）；pageType 指定 DIY 装修页面（首页跳转选择器）
  designConfig: (preview, pageType = '', tid = '') => {
    const params = { _t: Date.now() }; // 时间戳防浏览器 HTTP 缓存（装修配置改后须立即生效）
    if (preview) params.preview = 1;
    if (pageType) params.pageType = pageType;
    // H5 带签名访问（设计中心 iframe 免登录）：hash 中存在 tid/exp/sig 即透传，预览模式同样适用
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
      try {
        const hp = qsParse(window.location.hash.split('?')[1] || '');
        ['tid', 'exp', 'sig'].forEach((k) => { if (hp[k]) params[k] = hp[k]; });
      } catch { /* 忽略解析失败 */ }
    }
    if (tid) params.tid = tid; // 显式租户（商城等跨应用首页装修读取），优先于 hash 透传
    // 单租户部署：无显式/透传租户时统一用部署默认租户读取装修配置（登录用户无租户归属时
    // 后端 customerId=0 会读到空配置，故 C 端一律附加默认租户保证内容一致）
    if (!params.tid && DEFAULT_TENANT_ID) params.tid = DEFAULT_TENANT_ID;
    const qs = Object.keys(params).length ? '?' + qsStringify(params) : '';
    return request('/design/config' + qs);
  },
  // 设计中心万能表单提交（访客留资，归集设计线索）
  designLead: (data) => request('/design/leads', 'POST', data),
  // 设计中心「全景场景」组件：按租户拉取全景方案（封面/发布状态）
  designPanoramaScenes: () => request('/design/panorama-scenes', 'GET'),

  // ===== 内容管理（C 端公开读取，?tid= 指定租户）=====
  contentArticleCates: (tid) => request(`/content/article-cates?tid=${tid || ''}`),
  contentArticles: (params) => request('/content/articles' + (params ? '?' + qsStringify(params) : '')),
  contentArticle: (id, tid) => request(`/content/articles/${id}?tid=${tid || ''}`),
  contentComments: (params) => request('/content/comments' + (params ? '?' + qsStringify(params) : '')),
  contentAddComment: (data) => request('/content/comments', 'POST', data),
  contentPicCates: (tid) => request(`/content/pic-cates?tid=${tid || ''}`),
  contentPics: (params) => request('/content/pics' + (params ? '?' + qsStringify(params) : '')),
  contentPic: (id, tid) => request(`/content/pics/${id}?tid=${tid || ''}`),
  contentVideos: (params) => request('/content/videos' + (params ? '?' + qsStringify(params) : '')),
  /** 小程序直播 C 端：直播间列表（装修页 live-list 数据源，tid 租户校验） */
  liveRooms: (params) => request('/live/rooms' + (params ? '?' + qsStringify(params) : '')),
  contentSettings: (tid) => request(`/content/settings?tid=${tid || ''}`),
};

// 支付API
export const paymentApi = {
  // 创建支付订单
  createOrder: (data) => paymentRequest('/create', 'POST', data),
  // 模拟支付成功（开发环境）
  mockPay: (orderNo) => paymentRequest('/mock-pay', 'POST', { orderNo }),
  // 查询订单
  getOrder: (orderNo) => paymentRequest(`/orders/${orderNo}`),
  // 我的订单
  getMyOrders: (params) => paymentRequest('/my-orders' + (params ? '?' + qsStringify(params) : '')),
};

// 接口域名（不含 /api 路径段）：用于相对路径资源（如全景图 /uploads/xxx）拼接完整 URL
export const API_DOMAIN = BASE_URL.replace(/\/api\/[^/]*$/, '');
