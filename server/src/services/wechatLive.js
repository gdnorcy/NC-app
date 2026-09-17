/**
 * 小程序直播微信接口封装（1:1 复刻菜鸟云「微信直播」）
 *
 * 依赖：channel_apps 中 mini（微信小程序）渠道的 appid / app_secret / 授权状态
 * 接口：微信小程序直播组件（wxa/business/*）
 *   - 获取直播间列表  POST /wxa/business/getliveinfo
 *   - 创建直播间      POST /wxa/business/addliveinfo
 *   - 删除直播间      POST /wxa/business/deleteroom
 *   - 同步商品        POST /wxa/business/goods/sync（提交审核）
 *   - 获取商品列表    POST /wxa/business/getapprovedgoods
 *   - 商品审核状态    POST /wxa/business/goods/audit-status（按商品名/audit_id 查询）
 */
import { config } from '../config.js';

const WX_API = 'https://api.weixin.qq.com';

async function wxFetch(path, { token, method = 'POST', body } = {}) {
  const url = `${WX_API}${path}${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`微信接口请求失败 HTTP ${res.status}`);
  const data = await res.json();
  if (data.errcode && data.errcode !== 0) {
    const msg = data.errmsg || `微信接口错误 ${data.errcode}`;
    throw new Error(msg);
  }
  return data;
}

export function createWechatLiveService(db) {
  // 读取租户微信小程序渠道配置（appid/app_secret）
  function getMiniConfig(customerId) {
    const row = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mini'").get(customerId);
    if (!row || !row.appid || !row.app_secret) {
      throw new Error('未配置微信小程序 appid/app_secret，请先在「全端渠道-微信小程序」中配置');
    }
    return row;
  }

  async function getAccessToken(customerId) {
    const mini = getMiniConfig(customerId);
    const url = `${WX_API}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(mini.appid)}&secret=${encodeURIComponent(mini.app_secret)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.access_token) {
      throw new Error(data.errmsg || '获取微信 access_token 失败');
    }
    return data.access_token;
  }

  /**
   * 获取直播间列表（同步直播列表）
   * start/page 分页（每页 30）
   */
  async function fetchRooms(customerId, { start = 0, limit = 30 } = {}) {
    const token = await getAccessToken(customerId);
    const data = await wxFetch('/wxa/business/getliveinfo', {
      token,
      body: { start, limit },
    });
    return data.room_info || [];
  }

  /**
   * 创建直播间（微信直播组件）
   * 字段对齐菜鸟云「创建直播间」表单
   */
  async function createRoom(customerId, payload) {
    const token = await getAccessToken(customerId);
    const body = {
      name: payload.name,
      coverImg: payload.coverImg || payload.backgroundImg || '',
      startTime: Math.floor(new Date(payload.startTime).getTime() / 1000),
      endTime: Math.floor(new Date(payload.endTime).getTime() / 1000),
      anchorName: payload.anchorName,
      anchorWechat: payload.anchorWechat,
      type: payload.liveType === 'push' ? 1 : 0,
      screenType: 0, // 竖屏
      closeLike: payload.likeEnabled ? 0 : 1,
      closeGoods: payload.shelfEnabled ? 0 : 1,
      closeComment: payload.commentEnabled ? 0 : 1,
      closeReplay: payload.replayEnabled ? 0 : 1,
      closeShare: payload.shareEnabled ? 0 : 1,
      closeKf: payload.serviceEnabled ? 0 : 1,
    };
    const data = await wxFetch('/wxa/business/addliveinfo', { token, body });
    return data;
  }

  /**
   * 删除直播间
   */
  async function deleteRoom(customerId, roomId) {
    const token = await getAccessToken(customerId);
    return wxFetch('/wxa/business/deleteroom', { token, body: { roomId } });
  }

  /**
   * 获取已审核商品列表（商品库）
   */
  async function fetchApprovedGoods(customerId, { offset = 0, count = 30 } = {}) {
    const token = await getAccessToken(customerId);
    const data = await wxFetch('/wxa/business/getapprovedgoods', {
      token,
      body: { offset, count, status: 2 },
    });
    return data.goods || [];
  }

  /**
   * 提交商品审核（同步审核状态前先提交）
   */
  async function submitGoodsAudit(customerId, goodsList) {
    const token = await getAccessToken(customerId);
    const data = await wxFetch('/wxa/business/goods/audit', {
      token,
      body: { goodsInfo: goodsList },
    });
    return data;
  }

  /**
   * 同步商品审核状态
   */
  async function fetchGoodsAuditStatus(customerId, auditIds) {
    const token = await getAccessToken(customerId);
    const data = await wxFetch('/wxa/business/goods/audit-status', {
      token,
      body: { auditId: auditIds },
    });
    return data;
  }

  return {
    getAccessToken,
    fetchRooms,
    createRoom,
    deleteRoom,
    fetchApprovedGoods,
    submitGoodsAudit,
    fetchGoodsAuditStatus,
  };
}
