/**
 * 智能名片解决方案 API
 * 个人C端用户 + 企业租户 + 平台运营
 */
import { Router } from 'express';
import { config } from '../config.js';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import sharp from 'sharp';
import { getStorage } from '../storage/index.js';
import { checkTenantAccess } from '../tenant.js';
import { trackEvents } from '../services/analytics.js';
import { createDistributionService, buildShareUrl } from '../services/distribution.js';
import { createMemberService } from '../services/member.js';
import { createGoodsOrderService } from '../services/goodsOrder.js';
import { PaymentService } from '../services/payment.js';
import { createRadarService } from '../services/radar.js';
import { createQuotaService } from '../services/quota.js';
import { createBenefitsService, WORKS_LABEL_MAX } from '../services/benefits.js';
import { normalizeTabJson } from '../services/design.js';
import { WxComponentService, standaloneCode2Session } from '../services/wx-component.js';
import { readSecret } from '../crypto.js';

// 设计中心「保存并预览」签名密钥（管理端/查看端共用，固定开发密钥；上线前可改为环境变量）
const PREVIEW_SECRET = 'nuok-design-preview-secret-2026';

const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/x-m4a', 'audio/m4a', 'audio/webm', 'audio/x-mpeg']);

/**
 * 个性化分享封面风格 key 白名单（2026-10-21）。
 * 单一事实来源在 web-app/src/utils/shareCover.js 的 SHARE_STYLES；
 * 这里必须与之一致（server/test/card-share-style.test.js 钉死两端 key 集合相同）。
 * ⚠️ 不做白名单校验的话，脏值会一路下发到 C 端 → 画不出对应封面 → 转发图空白。
 */
const SHARE_STYLES = ['cover-1', 'cover-2', 'cover-3', 'cover-4', 'cover-5', 'cover-6'];
const SHARE_TITLE_MAX = 30;

/**
 * 经纬度归一化（名片「导航到公司」）。
 * uni.openLocation 只吃有限数字的 latitude/longitude；传 undefined/'abc'/NaN 时
 * 小程序端不会报错、而是静默失败（点了没反应）——这类 bug 在真机上极难定位，
 * 所以在落库前统一收敛：非法值一律 0（0 = 未设置，C 端据此走「复制地址」降级）。
 */
function normalizeLatLng(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return {
    latitude: Number.isFinite(a) ? a : 0,
    longitude: Number.isFinite(b) ? b : 0,
  };
}

/**
 * 更新场景的经纬度合并：字段没传就保持库里的旧值（PATCH 语义），传了就按新值收敛。
 * 返回 [latitude, longitude] 直接喂给 UPDATE 的占位符。
 * ⚠️ 不能退化成 `Number(row.latitude)`：老库迁移前该列可能是 NULL，Number(null)=0 尚可，
 *    但 Number(undefined)=NaN 会写进 REAL 列，C 端 openLocation 直接静默失败。
 */
function coalesceLatLng(row, lat, lng) {
  const oldLat = Number(row.latitude);
  const oldLng = Number(row.longitude);
  if (lat === undefined && lng === undefined) {
    return [Number.isFinite(oldLat) ? oldLat : 0, Number.isFinite(oldLng) ? oldLng : 0];
  }
  const n = normalizeLatLng(lat, lng);
  return [
    lat === undefined ? (Number.isFinite(oldLat) ? oldLat : 0) : n.latitude,
    lng === undefined ? (Number.isFinite(oldLng) ? oldLng : 0) : n.longitude,
  ];
}

/**
 * 视频号分享链接解析：提取 finderUserName（sph 开头）与 feedId。
 * 微信无官方解析 API，只能正则提取（页面改版时可能失效 → 前端降级手动填 ID）。
 * 注意：微信对 channels.weixin.qq.com 网页抓取有反爬（errCode 10012 非法请求），
 * 封面/标题无法服务端抓取，统一走「默认封面 + 播放键」（已与产品确认）。
 * 主页短链（weixin.qq.com/sph/xxxx）只有主页短ID，既无 feedId 也无 sph 形态的
 * finderUserName（官方要求 sph 开头），返回 channelHome 让上层给专门引导。
 */
function parseChannelLink(link) {
  const text = String(link || '').trim();
  if (!text) return null;
  const hasParams = /finderUserName=/.test(text) || /feedId=/.test(text);
  // 🔴 weixin.qq.com/sph/xxxx 不是「视频号主页链接」，而是微信 2026 改版后的**统一加密短链**
  // （分享任何单条视频都长这样）。实测 301 → channels.weixin.qq.com/finder-preview/pages/sph?id=xxx，
  // 落地页无 feedId/finderUserName（0 命中），短码是路由密文，服务端无法反解出作品。
  // 不要再引导用户「去复制单条视频链接」——那就是这个形态，改版后已不存在明文参数链接。
  if (!hasParams && /\/sph\/[A-Za-z0-9_-]{4,32}/.test(text)) {
    return { channelHome: true };
  }
  const f = text.match(/finderUserName=([^&\s"']+)/);
  const d = text.match(/feedId=([^&\s"']+)/);
  if (!f || !d) return null;
  let finderUserName;
  let feedId;
  try {
    finderUserName = decodeURIComponent(f[1]);
    feedId = decodeURIComponent(d[1]);
  } catch {
    finderUserName = f[1];
    feedId = d[1];
  }
  if (!/^sph/i.test(finderUserName)) return null;
  if (finderUserName.length > 64 || feedId.length < 4 || feedId.length > 128) return null;
  return { finderUserName, feedId };
}

export function createCardRouter(db, wxService) {
  const router = Router();
  const voiceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 语音简介 ≤10MB
  });
  const distribution = createDistributionService(db);
  const member = createMemberService(db);
  const radar = createRadarService(db);
  const quota = createQuotaService(db);
  const benefits = createBenefitsService(db);

  // ============================================================
  // SIcon 服务端按需渲染（小程序运行期主题色，2026-10-15）
  // ============================================================
  // 背景：小程序 <image> 不支持 SVG data-URI，SIcon 的 MP 分支用构建期烘焙的
  //   base64 PNG（scripts/gen-mp-sicons.js → src/utils/sicons-base64.js）。
  //   烘焙色板只来自「构建那一刻」的源码静态色 + DB 租户主题色；而设计中心
  //   支持自定义取色，租户切换主题色（如玫红→草绿）后运行期颜色不在烘焙表里
  //   → SIcon 兜底黑色 → 真机「名片内容等图标全黑，不跟主题色」。
  //   本路由用同一套 sharp 管线按需渲染任意 (name,color)：SIcon 精确命中走
  //   离线 base64（零请求），未命中走本端点（任意颜色/自定义色全支持）。
  // ⚠️ svgMap 单一事实来源是 web-app/src/components/SIcon.vue 源码（与
  //   gen-mp-sicons 读同一份），禁在此处复制一份——双份必然漂移。
  const SICON_CACHE_CAP = 1000;
  const siconCache = new Map(); // `${name}-${hex}` → PNG Buffer（FIFO）
  let siconSvgMap = null;

  function loadSiconSvgMap() {
    if (siconSvgMap) return siconSvgMap;
    const map = {};
    try {
      // 路由文件在 server/src/routes/，仓库根 = 上三级
      const siconVue = fs.readFileSync(new URL('../../../web-app/src/components/SIcon.vue', import.meta.url), 'utf8');
      const mapRe = /^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*'([^']*)',$/gm;
      let m;
      while ((m = mapRe.exec(siconVue)) !== null) {
        const name = m[1] || m[2];
        if (name && m[3]) map[name] = m[3];
      }
    } catch (e) { /* SIcon.vue 不在部署树 → 空 map，端点整体 404，客户端仍走烘焙兜底 */ }
    siconSvgMap = map;
    return map;
  }

  // GET /api/card/sicon?name=card&color=4FA140 → PNG（免鉴权静态渲染器）
  router.get('/sicon', async (req, res) => {
    const name = String(req.query.name || '');
    const color = String(req.query.color || '').replace(/^#/, '');
    if (!/^[a-z0-9-]+$/.test(name) || !/^[0-9a-fA-F]{3,8}$/.test(color)) {
      return res.status(400).json({ error: '参数不合法' });
    }
    const paths = loadSiconSvgMap()[name];
    if (!paths) return res.status(404).json({ error: '图标不存在' });
    const hex = color.toLowerCase();
    const key = `${name}-${hex}`;
    let png = siconCache.get(key);
    if (!png) {
      // 与 gen-mp-sicons.js 的 SVG 模板保持一致：color 属性必须给——
      // apps/dynamic/radar 等图标内部 fill="currentColor"，不声明会回落 SVG 默认黑
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" color="#${hex}" stroke="#${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
      try {
        png = await sharp(Buffer.from(svg), { density: 96 })
          .resize(72, 72)
          .png({ quality: 80, compressionLevel: 9, effort: 8 })
          .toBuffer();
      } catch (e) {
        return res.status(500).json({ error: '渲染失败' });
      }
      if (siconCache.size >= SICON_CACHE_CAP) {
        const oldest = siconCache.keys().next().value;
        if (oldest !== undefined) siconCache.delete(oldest);
      }
      siconCache.set(key, png);
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(png);
  });

  // ============================================================
  // 微信授权登录/注册
  // ============================================================
  router.post('/auth/wx-login', async (req, res) => {
    try {
      const { code, parentId, tid, appid } = req.body;
      if (!code) return res.status(400).json({ error: 'code不能为空' });

      // 按租户登录（微信第三方平台代开发模式）：
      // 小程序端携带自身 appid（uni.getAccountInfoSync().miniProgram.appId）。
      // 三级通道，openid 命名空间互不相通、**绝不能互串**：
      // ① component 授权租户（channel_apps.mini + authorized）→ sns/component/jscode2session；
      //    失败直接报错，不回落（否则会建出错误归属的用户）。
      // ② 自运营租户（未授权但填了自己的 AppID+AppSecret）→ 标准 sns/jscode2session，
      //    openid 属租户自己的小程序。
      // ③ 未带 appid（H5）/ 无匹配渠道 → 回落平台单 appid 通道。
      let openid, unionid, channelTenantId = 0;
      const channel = appid
        ? db.prepare("SELECT * FROM channel_apps WHERE appid = ? AND channel_type = 'mini'").get(appid)
        : null;
      if (channel && channel.auth_status === 'authorized') {
        try {
          const wx = new WxComponentService(db);
          const r = await wx.componentCode2Session(channel.appid, code);
          openid = r.openid;
          unionid = r.unionid || '';
          channelTenantId = Number(channel.customer_id) || 0;
        } catch (e) {
          return res.status(400).json({ error: '微信登录失败: ' + e.message });
        }
      } else if (channel && readSecret(channel.app_secret)) {
        // 自运营模式：客户在「参数设置」填了自己的 AppID/AppSecret（未走第三方授权）
        // 🔴 app_secret 落库是密文，必须 readSecret 解密后再送微信（原文是明文时代遗留）
        try {
          const r = await standaloneCode2Session(channel.appid, readSecret(channel.app_secret), code);
          openid = r.openid;
          unionid = r.unionid || '';
          channelTenantId = Number(channel.customer_id) || 0;
        } catch (e) {
          return res.status(400).json({ error: '微信登录失败: ' + e.message });
        }
      } else {
        // 调用微信code2session（平台单 appid 通道）
        try {
          const result = await wxService.code2Session(code);
          openid = result.openid;
          unionid = result.unionid || '';
        } catch (e) {
          return res.status(400).json({ error: '微信登录失败: ' + e.message });
        }
      }

      // 查找或创建用户
      let user = db.prepare('SELECT * FROM platform_user WHERE openid = ?').get(openid);
      let isNew = false;

      if (!user) {
        isNew = true;
        // 溯源绑定已迁移到租户维度（dist_user_relation）：扫码静默绑定由 POST /distribution/bind 负责
        // （老 platform_user.parent_id 字段保留兼容存量读取，新绑定不再写入）
        const result = db.prepare(
          'INSERT INTO platform_user (openid, unionid, nickname, avatar) VALUES (?,?,?,?)'
        ).run(openid, unionid, '微信用户', '');
        user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(result.lastInsertRowid);
      }

      // 租户归属兜底：按租户小程序登录 → 授权关系决定的 customer_id 最优先；
      // 其次 URL 携带 tid；最后回落部署默认租户 config.defaultTenantId
      // （单租户/独立域名部署）。
      // 🔴 不兜底的后果：小程序登录的新用户 customer_id 恒为空 → 装修首页配置、分销、
      // 人脉库、集市都按租户取数 → **首页一片空白**、各处报「未入驻/未开通」。
      // 多租户平台部署时把 DEFAULT_TENANT_ID 设为 0 即关闭兜底。
      const bindTid = channelTenantId || Number(tid) || Number(config.defaultTenantId || 0);
      if (!user.customer_id && bindTid) {
        const cid = bindTid;
        // 🔴 2026-10-20 改造：这里曾给每个新用户自动建一家「H5演示用户_<userId>」企业
        // 并把账号挂到它下面。后果有二：
        //   ① 租户的「旗下企业」被这些演示企业占满（线上实测 8 家里 6 家是它）；
        //   ② 正常注册用户被身份判定为「挂靠成员」（橙），本应是「租户名片」——
        //      他自己创建名片却显示"挂靠"，用户当场质疑。
        // 兜底只需绑租户（customer_id），企业归属应走正式的入驻/员工流程，
        // 不该由登录兜底凭空造企业。历史脏数据由 cleanupDemoEnterprises() 迁移清理。
        db.prepare('UPDATE platform_user SET customer_id = ? WHERE id = ?').run(cid, user.id);
        user.customer_id = cid;
      }

      // 生成token
      const token = Buffer.from(JSON.stringify({ uid: user.id, openid, ts: Date.now() })).toString('base64') + '.' + randomBytes(8).toString('hex');

      res.json({
        token,
        user: toUser(user),
        isNew,
        hasCard: !!db.prepare('SELECT id FROM card_profile WHERE user_id = ?').get(user.id),
        identity: {
          customerId: user.customer_id || null,
          enterpriseId: user.enterprise_id || null,
          identityType: user.identity_type || '',
        },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 可选认证中间件：无 token 不阻断（用于设计中心预览签名放行）
  function authOptional(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return next();
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
      if (user && user.status === 'active') {
        req.user = user;
        req.userId = user.id;
        req.customerId = user.customer_id || null;
        if (!req.customerId && user.enterprise_id) {
          const ent = db.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(user.enterprise_id);
          if (ent) req.customerId = ent.customer_id;
        }
      }
      next();
    } catch { next(); }
  }

  // 预览签名校验：sig = sha256(tid:exp:PREVIEW_SECRET) 前 32 位，exp 30 分钟内有效
  // 签名通过即可免登录访问该租户配置（含发布版首页），preview=1 仅标识「草稿预览」意图，不强求
  function verifyPreviewSig(q) {
    const tid = Number(q.tid);
    const exp = Number(q.exp);
    if (!tid || !exp || exp < Math.floor(Date.now() / 1000)) return 0;
    const expect = createHash('sha256').update(`${tid}:${exp}:${PREVIEW_SECRET}`).digest('hex').slice(0, 32);
    return String(q.sig) === expect ? tid : 0;
  }

  // 认证中间件（注入租户上下文 customerId）
  function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(payload.uid);
      if (!user || user.status !== 'active') return res.status(401).json({ error: '账号异常' });
      req.user = user;
      req.userId = user.id;
      // 租户上下文：优先用户绑定的租户，其次所属企业映射的租户
      req.customerId = user.customer_id || null;
      if (!req.customerId && user.enterprise_id) {
        const ent = db.prepare('SELECT customer_id FROM tenant_enterprises WHERE id = ?').get(user.enterprise_id);
        if (ent) req.customerId = ent.customer_id;
      }
      next();
    } catch {
      res.status(401).json({ error: 'token无效' });
    }
  }

  // 租户上下文中间件：必须已绑定租户
  function requireTenant(req, res, next) {
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户，禁止访问' });
    // 租户生命周期 + 智能名片解决方案授权（P2-10/P2-11）
    // 到期且 miniExpireMode=prompt → 只读放行（仅GET）；写操作拒绝
    const blocked = checkTenantAccess(db, req.customerId, 'card', 'mini');
    if (blocked) {
      if (blocked.readonly && req.method === 'GET') { req.customerId = req.customerId || customerId; req.tenantReadonly = true; return next(); }
      return res.status(blocked.status).json({ error: blocked.error });
    }
    next();
  }

  // ============================================================
  // 用户信息
  // ============================================================
  router.get('/user/profile', auth, (req, res) => {
    // 与 /cards 一致：join 租户配置，使 brandColor 可用
    const card = db.prepare(`SELECT cp.*, pu.member_level as owner_member_level, pj.config as tenant_config,
      ct.theme_config as template_theme
      FROM card_profile cp
      LEFT JOIN platform_user pu ON cp.user_id = pu.id
      LEFT JOIN projects pj ON pj.id = COALESCE(
        (SELECT id FROM projects WHERE id = COALESCE(
          (SELECT customer_id FROM tenant_individuals WHERE user_id = cp.user_id LIMIT 1),
          (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = cp.user_id LIMIT 1),
          cp.customer_id, pu.customer_id, 0) LIMIT 1),
        (SELECT id FROM projects ORDER BY id ASC LIMIT 1))
      LEFT JOIN card_templates ct ON ct.id = cp.template_id
      WHERE cp.user_id = ?`).get(req.user.id);
    res.json({ user: toUser(req.user), card: card ? toCard(card) : null });
  });

  router.put('/user/profile', auth, (req, res) => {
    const { nickname, avatar, phone } = req.body;
    db.prepare("UPDATE platform_user SET nickname=?, avatar=?, phone=?, updated_at=datetime('now') WHERE id=?")
      .run(nickname || req.user.nickname, avatar || req.user.avatar, phone || req.user.phone, req.user.id);
    const user = db.prepare('SELECT * FROM platform_user WHERE id = ?').get(req.user.id);
    res.json({ user: toUser(user) });
  });

  // ============================================================
  // 名片模板商业化（两层：平台→租户购买→租户设C端售价；C端用户→付费解锁）
  // 可见范围：租户自建 + 平台免费(price=0) + 平台已购付费
  // ============================================================
  /** 某租户对 C 端可见的模板列表（含 C 端售价 price，元；0=免费） */
  function cVisibleTemplates(customerId) {
    const owned = new Map();
    db.prepare("SELECT asset_key, c_price FROM tenant_asset_purchases WHERE tenant_id = ? AND asset_type = 'card_template'")
      .all(customerId || 0)
      .forEach((r) => owned.set(Number(r.asset_key), Number(r.c_price || 0)));
    const rows = db.prepare(`
      SELECT * FROM card_templates ct WHERE ct.enabled = 1 AND (
        (ct.tenant_id != 0 AND ct.tenant_id = ?)
        OR (ct.tenant_id = 0 AND ct.price <= 0)
        OR (ct.tenant_id = 0 AND ct.price > 0 AND EXISTS (
          SELECT 1 FROM tenant_asset_purchases tap
          WHERE tap.tenant_id = ? AND tap.asset_type = 'card_template' AND tap.asset_key = CAST(ct.id AS TEXT)
        ))
      ) ORDER BY ct.tenant_id, ct.sort_order, ct.id DESC
    `).all(customerId || 0, customerId || 0);
    return rows.map((t) => {
      const isPlatform = Number(t.tenant_id) === 0;
      const cPrice = isPlatform ? (owned.get(Number(t.id)) || 0) : Number(t.price || 0);
      return {
        id: t.id, name: t.name, cover: t.cover, description: t.description, layout: t.layout || 'card',
        themeConfig: (() => { try { return JSON.parse(t.theme_config); } catch { return {}; } })(),
        tenantId: t.tenant_id, price: cPrice,
      };
    });
  }

  /** C 端用户已购模板集合 */
  function userOwnedTemplates(userId) {
    return new Set(db.prepare('SELECT template_id FROM user_template_purchases WHERE user_id = ?').all(userId).map((r) => Number(r.template_id)));
  }

  /** 校验模板是否对 C 端用户可用（可见 + 免费或已购） */
  function canCUseTemplate(customerId, userId, templateId) {
    if (!templateId) return { ok: true };
    const list = cVisibleTemplates(customerId);
    const t = list.find((x) => x.id === Number(templateId));
    if (!t) return { ok: false, error: '模板不存在或不可用' };
    if (Number(t.price) <= 0) return { ok: true, price: 0 };
    if (userId && userOwnedTemplates(userId).has(Number(templateId))) return { ok: true, price: Number(t.price) };
    return { ok: false, error: '该模板为付费模板，请先购买' };
  }

  // C 端模板列表（未登录：仅平台免费模板；登录后：租户可见集合 + 本人已购状态）
  // ?tid= 显式指定租户（小程序端分享/扫码进入的租户上下文），优先于登录态 customerId
  router.get('/templates', authOptional, (req, res) => {
    try {
      const customerId = Number(req.query.tid) || req.customerId || 0;
      const list = cVisibleTemplates(customerId);
      const owned = req.user ? userOwnedTemplates(req.user.id) : new Set();
      // 创建页默认皮肤（B1：租户后台配置，C 端无感）
      let skin = 'live';
      try {
        const proj = db.prepare('SELECT config FROM projects WHERE id = ?').get(customerId);
        if (proj && proj.config) {
          const cfg = JSON.parse(proj.config || '{}');
          if (['live', 'step'].includes(cfg.card_create_skin)) skin = cfg.card_create_skin;
        }
      } catch {}
      res.json({ templates: list.map((t) => ({ ...t, purchased: owned.has(Number(t.id)) })), skin });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // C 端购买付费模板（生成支付单，支付成功后由 payment 解锁 user_template_purchases）
  router.post('/templates/:id/purchase', auth, (req, res) => {
    try {
      if (!req.customerId) return res.status(403).json({ error: '未入驻任何企业，暂不可购买模板' });
      const id = Number(req.params.id);
      const t = cVisibleTemplates(req.customerId).find((x) => x.id === id);
      if (!t) return res.status(404).json({ error: '模板不存在或不可用' });
      if (Number(t.price) <= 0) return res.status(400).json({ error: '免费模板无需购买' });
      if (userOwnedTemplates(req.user.id).has(id)) return res.status(400).json({ error: '已购买该模板' });
      const payment = new PaymentService(db);
      const order = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'card',
        productType: 'template',
        productId: String(id),
        productName: t.name,
        amount: Math.round(Number(t.price) * 100), // payment_orders.amount 单位为分
        channel: req.body.channel || 'wechat',
        remark: '购买名片模板',
      });
      res.json({ orderNo: order.orderNo, amount: order.amount, templateName: t.name, templateId: id });
    } catch (e) { res.status(400).json({ error: e.message || '下单失败' }); }
  });

  // ============================================================
  // 名片 CRUD
  // ============================================================
  router.get('/cards', auth, (req, res) => {
    // 与 /cards/:id 一致：join 租户配置，使列表也携带 brandColor
    const cards = db.prepare(`SELECT cp.*, pu.member_level as owner_member_level, pj.config as tenant_config
      FROM card_profile cp
      LEFT JOIN platform_user pu ON cp.user_id = pu.id
      LEFT JOIN projects pj ON pj.id = COALESCE(
        (SELECT id FROM projects WHERE id = COALESCE(
          (SELECT customer_id FROM tenant_individuals WHERE user_id = cp.user_id LIMIT 1),
          (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = cp.user_id LIMIT 1),
          cp.customer_id, pu.customer_id, 0) LIMIT 1),
        (SELECT id FROM projects ORDER BY id ASC LIMIT 1))
      LEFT JOIN card_templates ct ON ct.id = cp.template_id
      WHERE cp.user_id = ? ORDER BY cp.created_at DESC`).all(req.user.id);
    res.json({ cards: cards.map(toCard) });
  });

  router.get('/cards/:id', (req, res) => {
    // owner_member_expire_at：供 toCard 算 ownerIsVip（视频号主页等会员能力的开关）。
    // 会员判定必须在服务端出布尔结果，不能让 C 端拿过期时间自己判——
    // SQLite 存的是 'YYYY-MM-DD HH:MM:SS'（空格分隔），MP 端 new Date() 解析该格式会失败。
    const card = db.prepare(`SELECT cp.*, pu.member_level as owner_member_level,
      pu.member_expire_at as owner_member_expire_at, pj.config as tenant_config,
      ct.theme_config as template_theme, ct.layout as template_layout
      FROM card_profile cp
      LEFT JOIN platform_user pu ON cp.user_id = pu.id
      LEFT JOIN projects pj ON pj.id = COALESCE(
        (SELECT id FROM projects WHERE id = COALESCE(
          (SELECT customer_id FROM tenant_individuals WHERE user_id = cp.user_id LIMIT 1),
          (SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = cp.user_id LIMIT 1),
          cp.customer_id, pu.customer_id, 0) LIMIT 1),
        (SELECT id FROM projects ORDER BY id ASC LIMIT 1))
      LEFT JOIN card_templates ct ON ct.id = cp.template_id
      WHERE cp.id = ?`).get(req.params.id);
    if (card) card.template_layout = card.template_layout || 'card';
    if (!card) return res.status(404).json({ error: '名片不存在' });
    if (card.status !== 'active') return res.status(404).json({ error: '名片不可用' });
    // 附加租户启用的表单（优先挂载到本名片，否则取租户第一个 active 表单）
    let activeForm = null;
    const tenantId = card.customer_id || (() => {
      const t = db.prepare('SELECT customer_id FROM tenant_individuals WHERE user_id = ? AND status = ? LIMIT 1').get(card.user_id, 'active')
        || db.prepare('SELECT customer_id FROM tenant_enterprise_employees WHERE user_id = ? AND status = ? LIMIT 1').get(card.user_id, 'active');
      return t?.customer_id || null;
    })();
    if (tenantId) {
      const bound = db.prepare("SELECT id, title, description, fields FROM card_form_template WHERE customer_id = ? AND status = 'active' AND card_id = ? LIMIT 1")
        .get(tenantId, card.id);
      const any = bound || db.prepare("SELECT id, title, description, fields FROM card_form_template WHERE customer_id = ? AND status = 'active' AND (card_id IS NULL OR card_id = 0) ORDER BY id DESC LIMIT 1")
        .get(tenantId);
      if (any) activeForm = { id: any.id, title: any.title, description: any.description, fields: JSON.parse(any.fields || '[]') };
    }
    card.templateLayout = card.template_layout || 'card';
    card.collectCount = db.prepare('SELECT COUNT(*) AS c FROM card_collect WHERE card_id = ?').get(card.id).c;
    card.recentVisitors = db.prepare(
      'SELECT pu.avatar FROM card_visitor cv LEFT JOIN platform_user pu ON cv.visitor_user_id = pu.id WHERE cv.card_id = ? AND pu.avatar IS NOT NULL AND pu.avatar != \'\' ORDER BY cv.last_visit_at DESC LIMIT 8'
    ).all(card.id).map((r) => r.avatar);
    res.json({ card: toCard(card), activeForm });
  });

  // 名片动态列表（公开，展示名片所有者的动态）
  router.get('/cards/:id/dynamics', (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    // 可选登录态：带当前用户点赞标记
    let myUid = null;
    try {
      if (req.headers.authorization) {
        const payload = JSON.parse(Buffer.from(req.headers.authorization.split(' ')[1].split('.')[0], 'base64').toString());
        myUid = payload.uid || null;
      }
    } catch {}
    const rows = db.prepare(`SELECT d.*, u.nickname, u.avatar FROM card_dynamic d
      LEFT JOIN platform_user u ON d.user_id = u.id
      WHERE d.card_id = ? AND d.status='active' AND d.visibility='public'
      ORDER BY d.created_at DESC LIMIT 20`).all(card.id);
    const liked = myUid ? new Set(db.prepare('SELECT dynamic_id FROM card_dynamic_like WHERE user_id = ?').all(myUid).map(r => r.dynamic_id)) : new Set();
    res.json({ dynamics: rows.map((d) => toDynamic(d, liked.has(d.id))) });
  });

  // 名片视频号作品列表：主人（带本人 token）看全部；访客仅 is_show=1
  router.get('/cards/:id/videos', authOptional, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    const isOwner = !!(req.user && card.user_id === req.user.id);
    const videos = isOwner
      ? db.prepare('SELECT id, card_id, title, cover_url, duration, sort_order, finder_user_name, feed_id, is_show FROM card_videos WHERE card_id = ? ORDER BY sort_order ASC, id ASC').all(card.id)
      : db.prepare("SELECT id, card_id, title, cover_url, duration, sort_order, finder_user_name, feed_id, is_show FROM card_videos WHERE card_id = ? AND is_show = 1 AND feed_id != '' ORDER BY sort_order ASC, id ASC").all(card.id);
    res.json({ videos: videos.map((v) => ({
      id: v.id, cardId: v.card_id, title: v.title, coverUrl: v.cover_url, duration: v.duration,
      sortOrder: v.sort_order, finderUserName: v.finder_user_name, feedId: v.feed_id, isShow: !!v.is_show,
    })) });
  });

  // ============================================================
  // 语音简介上传（阶段C：上传音频；克隆语音后续新增）
  // ============================================================
  /**
   * 🔴 反馈 #297：MIME 白名单放宽。
   *   原实现只认 AUDIO_MIME 白名单里的精确 MIME，**MP 端上传常带
   *   `application/octet-stream`**（uni.uploadFile 不设置 fileType → multer 拿到 octet-stream）
   *   → 直接 400「仅支持 mp3/wav/...」，用户表现为「点击上传没反应/失败」。
   *   现在改为「MIME 命中 **或** 文件后缀是已知音频后缀」即放行，
   *   并按后缀决定存储扩展名（录音产物 mp3 走这条路）。
   */
  function resolveAudioExt(file) {
    const orig = String(file.originalname || '');
    const ext = (path.extname(orig) || '').toLowerCase();
    const known = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm', '.amr', '.silk', '.aiff'];
    if (known.includes(ext)) return ext;
    const mime = (file.mimetype || '').toLowerCase();
    if (mime === 'audio/mpeg') return '.mp3';
    if (mime === 'audio/wav' || mime === 'audio/x-wav') return '.wav';
    if (mime === 'audio/mp4' || mime === 'audio/x-m4a' || mime === 'audio/m4a') return '.m4a';
    if (mime === 'audio/aac') return '.aac';
    if (mime === 'audio/ogg') return '.ogg';
    if (mime === 'audio/webm') return '.webm';
    return '';
  }

  router.post('/voice-upload', auth, (req, res) => {
    voiceUpload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '音频大小不能超过 10MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到音频文件' });
      const mime = (req.file.mimetype || '').toLowerCase();
      const ext = resolveAudioExt(req.file);
      if (!AUDIO_MIME.has(mime) && !ext) {
        return res.status(400).json({ error: '仅支持 mp3/wav/m4a/aac/ogg 音频格式' });
      }
      const safeExt = ext || '.mp3';
      try {
        const storage = await getStorage(db);
        const url = await storage.put(req.file.buffer, `voice-card-${req.user.id}-${Date.now()}${safeExt}`);
        // 🔴 顺手记入历史表（上传来源），用户可在「历史音频」里直接选用
        const name = req.file.originalname || '语音简介';
        try {
          db.prepare('INSERT INTO card_voice_history (user_id, url, name, source, duration_sec, size_bytes) VALUES (?,?,?,?,?,?)')
            .run(req.user.id, url, name, 'upload', 0, req.file.size || req.file.buffer.length || 0);
        } catch (e2) { console.error('语音历史写入失败（不影响上传）:', e2?.message || e2); }
        res.status(201).json({ url, name });
      } catch (e) {
        console.error('语音上传失败:', e);
        res.status(500).json({ error: '语音上传失败' });
      }
    });
  });

  // —— 语音简介历史记录（反馈 #297）——
  // GET  列表（当前用户，按时间倒序）
  // POST 录音上传（source='record'，前端在线录音产出的 mp3）
  // DELETE /voice-history/:id 删除一条历史
  router.get('/voice-history', auth, (req, res) => {
    const rows = db.prepare('SELECT * FROM card_voice_history WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
    res.json({
      voices: rows.map((r) => ({
        id: r.id, url: r.url, name: r.name || '语音简介',
        source: r.source, durationSec: r.duration_sec || 0, sizeBytes: r.size_bytes || 0,
        createdAt: r.created_at,
      })),
    });
  });

  router.post('/voice-history', auth, (req, res) => {
    voiceUpload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '音频大小不能超过 10MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到音频文件' });
      const mime = (req.file.mimetype || '').toLowerCase();
      const ext = resolveAudioExt(req.file);
      if (!AUDIO_MIME.has(mime) && !ext) {
        return res.status(400).json({ error: '仅支持 mp3/wav/m4a/aac/ogg 音频格式' });
      }
      const safeExt = ext || '.mp3';
      const durationSec = Math.max(0, Math.min(600, Number(req.body?.durationSec) || 0));
      try {
        const storage = await getStorage(db);
        const url = await storage.put(req.file.buffer, `voice-rec-${req.user.id}-${Date.now()}${safeExt}`);
        const name = req.body?.name || `录音 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        const info = db.prepare('INSERT INTO card_voice_history (user_id, url, name, source, duration_sec, size_bytes) VALUES (?,?,?,?,?,?)')
          .run(req.user.id, url, name, 'record', durationSec, req.file.size || req.file.buffer.length || 0);
        res.status(201).json({
          voice: {
            id: info.lastInsertRowid, url, name, source: 'record',
            durationSec, sizeBytes: req.file.size || 0, createdAt: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.error('录音上传失败:', e);
        res.status(500).json({ error: '录音上传失败' });
      }
    });
  });

  router.delete('/voice-history/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: '参数错误' });
    // 🔴 严格按 user_id 限定，防跨用户删他人记录
    const info = db.prepare('DELETE FROM card_voice_history WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: '记录不存在' });
    res.json({ ok: true });
  });

  // 用户头像上传（个人中心「编辑资料」）：图片 ≤5MB，存对象存储返回 URL
  router.post('/user/avatar-upload', auth, (req, res) => {
    voiceUpload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
      const mime = (req.file.mimetype || '').toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
        return res.status(400).json({ error: '仅支持 png/jpg/webp 图片' });
      }
      const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
      try {
        const storage = await getStorage(db);
        const url = await storage.put(req.file.buffer, `avatar-u${req.user.id}-${Date.now()}${ext}`);
        res.status(201).json({ url });
      } catch (e) {
        console.error('头像上传失败:', e);
        res.status(500).json({ error: '头像上传失败' });
      }
    });
  });

  // 动态配图上传（发布动态时选图）→ 返回 URL 供 card_dynamic.images 使用
  // 🔴 与头像上传同 multer 实例（voiceUpload），但单独走图片 MIME 白名单。
  //   MP 端 chooseMedia 选出的临时文件后缀是 .jpg 但 contentType 常为 application/octet-stream，
  //   这里按「后缀 + MIME 双判」放宽，避免小程序端上传直接 400（与语音上传同理）。
  router.post('/dynamic/image-upload', auth, (req, res) => {
    voiceUpload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 10MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
      const mime = (req.file.mimetype || '').toLowerCase();
      const origName = String(req.file.originalname || '');
      const ext = (path.extname(origName) || '').toLowerCase();
      const mimeOk = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime);
      // MP 端临时文件常无扩展名/带 octet-stream → 允许按已知图片后缀放行
      const extOk = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
      if (!mimeOk && !extOk) {
        return res.status(400).json({ error: '仅支持 png/jpg/webp 图片' });
      }
      const safeExt = extOk ? ext : (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg');
      try {
        const storage = await getStorage(db);
        const url = await storage.put(req.file.buffer, `dynamic-u${req.user.id}-${Date.now()}${safeExt}`);
        res.status(201).json({ url });
      } catch (e) {
        console.error('动态配图上传失败:', e);
        res.status(500).json({ error: '图片上传失败' });
      }
    });
  });

  router.post('/cards', auth, (req, res) => {
    const { name, position, city, industry, phone, wechat, email, company, companies, bio, businessField, needTags, avatar, isPublic, templateId, voiceUrl, voiceName, latitude, longitude, address } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });
    // 位置三件套（详情页「导航」唤起地图用）：坐标必须是有限数字，脏数据一律落 0，
    // 否则 C 端 Number.isFinite 判过的脏值会让 uni.openLocation 抛参、点了没反应。
    const loc = normalizeLatLng(latitude, longitude);
    const chkTpl = canCUseTemplate(req.customerId, req.user.id, templateId);
    if (!chkTpl.ok) return res.status(400).json({ error: chkTpl.error });
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, city, industry, phone, wechat, email, company, companies, bio, business_field, need_tags, avatar, is_public, template_id, voice_url, voice_name, latitude, longitude, address)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', city || '', industry || '', phone || '', wechat || '', email || '', company || '', companies !== undefined ? JSON.stringify(companies) : '', bio || '', businessField || '', Array.isArray(needTags) ? JSON.stringify(needTags) : (needTags || ''), avatar || '', isPublic ? 1 : 0, templateId || '', voiceUrl || '', voiceName || '', loc.latitude, loc.longitude, String(address || '').slice(0, 200));
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(result.lastInsertRowid);
    res.json({ card: toCard(card) });
  });

  // 创建名片+入驻申请（合并流程）
  router.post('/cards/create-with-apply', auth, (req, res) => {
    const { name, position, city, phone, wechat, email, bio, businessField, avatar, isPublic, videoChannel,
            slogan, tags, templateId, voiceUrl, voiceName, companies,
            bindCode, applyType, enterpriseName, industry, latitude, longitude, address } = req.body;
    if (!name) return res.status(400).json({ error: '姓名不能为空' });
    const loc0 = normalizeLatLng(latitude, longitude);
    const chkTpl = canCUseTemplate(req.customerId, req.user.id, templateId);
    if (!chkTpl.ok) return res.status(400).json({ error: chkTpl.error });

    // 1. 创建名片
    const cardType = applyType === 'enterprise' ? 'company' : 'personal';
    const result = db.prepare(
      `INSERT INTO card_profile (user_id, name, position, city, industry, phone, wechat, email, bio, business_field, avatar, is_public, video_channel, card_type, slogan, tags, template_id, voice_url, voice_name, companies, latitude, longitude, address)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, name, position || '', city || '', industry || '', phone || '', wechat || '', email || '', bio || '', businessField || '', avatar || '', isPublic ? 1 : 0, videoChannel || '', cardType, slogan || '', tags || '', templateId || '', voiceUrl || '', voiceName || '', companies !== undefined ? JSON.stringify(companies) : '', loc0.latitude, loc0.longitude, String(address || '').slice(0, 200));
    const cardId = result.lastInsertRowid;

    // 2. 处理入驻申请（填了口令才入驻）
    if (bindCode) {
      // 安全口令：只按 invite_code 匹配（含纯数字口令），禁止直接用 project id 猜测入驻
      const project = db.prepare('SELECT * FROM projects WHERE invite_code = ?').get(String(bindCode).trim());
      if (!project) {
        return res.status(400).json({ error: '入驻口令无效' });
      }
      if (project.status !== 'active') {
        return res.status(400).json({ error: '该客户项目已停用，无法入驻' });
      }
      if (project.valid_until && project.valid_until < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ error: '该客户项目已过期，无法入驻' });
      }
      const customerId = project.id;

      // 企业入驻必须提供企业名称（前置校验，先于重复入驻校验给出明确错误）
      if (applyType === 'enterprise' && !enterpriseName) {
        return res.status(400).json({ error: '企业名称不能为空' });
      }

      // 重复/重新申请校验（rejected 允许重新申请；双身份：个人+企业 允许并存）
      const already = applyType === 'enterprise'
        ? db.prepare('SELECT id, status FROM tenant_enterprises WHERE customer_id = ? AND admin_user_id = ?').get(customerId, req.user.id)
        : db.prepare('SELECT id, status FROM tenant_individuals WHERE customer_id = ? AND user_id = ?').get(customerId, req.user.id);
      if (already && already.status !== 'rejected') {
        return res.status(400).json({
          error: already.status === 'pending' ? '申请审核中，请耐心等待管理员审核' : '已入驻该客户项目，请勿重复入驻'
        });
      }
      let applyStatus = 'pending';
      if (already && already.status === 'rejected') {
        // 拒绝后重新申请
        if (applyType === 'individual') {
          db.prepare("UPDATE tenant_individuals SET status = 'pending', name = ?, phone = ?, position = ?, company = ?, updated_at = datetime('now') WHERE id = ?")
            .run(name, phone || '', position || '', city || '', already.id);
          // 🔴 拒绝后重申请：把最新 phone/name/position 同步回名片，防止名片与入驻个人手机号分叉（2026-10-20 修复）
          db.prepare("UPDATE card_profile SET phone=?, name=?, position=?, updated_at=datetime('now') WHERE user_id = ? AND status='active'")
            .run(phone || '', name, position || '', req.user.id);
        } else {
          db.prepare("UPDATE tenant_enterprises SET status = 'pending', name = ?, industry = ?, updated_at = datetime('now') WHERE id = ?")
            .run(enterpriseName, industry || '', already.id);
          db.prepare("UPDATE tenant_enterprise_employees SET name = ?, position = ?, status = 'pending', updated_at = datetime('now') WHERE enterprise_id = ? AND user_id = ?")
            .run(name, position || '', already.id, req.user.id);
        }
        db.prepare('INSERT INTO tenant_invite_log (customer_id, invite_code, user_id) VALUES (?, ?, ?)').run(customerId, String(bindCode).trim(), req.user.id);
        const card0 = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(cardId);
        return res.json({ card: toCard(card0), applyStatus });
      }

      // 口令使用审计
      db.prepare('INSERT INTO tenant_invite_log (customer_id, invite_code, user_id) VALUES (?, ?, ?)').run(customerId, String(bindCode).trim(), req.user.id);
      // 审核流：创建 pending，不绑定租户、不关联名片（审核通过后由 card-market/apply/audit 完成）

      if (applyType === 'enterprise') {
        const entResult = db.prepare(`INSERT INTO tenant_enterprises (customer_id, name, industry, admin_user_id, status)
          VALUES (?, ?, ?, ?, 'pending')`).run(customerId, enterpriseName, industry || '', req.user.id);
        const enterpriseId = entResult.lastInsertRowid;
        db.prepare(`INSERT INTO tenant_enterprise_employees (enterprise_id, customer_id, user_id, name, position, role, status)
          VALUES (?, ?, ?, ?, ?, 'admin', 'pending')`).run(enterpriseId, customerId, req.user.id, name, position || '');
      } else {
        db.prepare(`INSERT INTO tenant_individuals (customer_id, user_id, name, phone, position, company, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(customerId, req.user.id, name, phone || '', position || '', city || '');
      }
    }

    const card = db.prepare('SELECT * FROM card_profile WHERE id = ?').get(cardId);
    res.json({ card: toCard(card), applyStatus: bindCode ? 'pending' : undefined });
  });

  router.put('/cards/:id', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    const { name, position, city, industry, phone, wechat, email, company, companies, bio, businessField, needTags, avatar, isPublic, videoChannel, slogan, tags, templateId, voiceUrl, voiceName, worksLabel, latitude, longitude, address, shareStyle, shareTitle } = req.body;
    // 自定义作品标签名（白银+权益）：仅拦截「设非空值」；清空（''）一律放行——
    // 会员过期后仍允许把标签改回默认「作品」，不做能力降级惩罚。
    let effectiveWorksLabel = card.works_label;
    if (worksLabel !== undefined) {
      const v = String(worksLabel || '').trim().slice(0, WORKS_LABEL_MAX);
      if (v && !benefits.canCustomWorksLabel(req.user.id)) {
        return res.status(403).json({ error: '自定义作品标签名需白银及以上会员', code: 'labelLocked' });
      }
      effectiveWorksLabel = v;
    }
    // 模板校验（C 端可见 + 免费或已购）。
    // 🔴 存量死引用自愈：模板库重建/重排后（如旧 id 4、11 已删），存量名片仍挂死 template_id，
    // 编辑向导把该 id 原样发回 → 若一律 400「模板不存在或不可用」，名片将永远无法保存。
    // 故：提交的 templateId 与库中存量一致（用户没动模板）但校验失败时，不阻断保存，
    // 自动迁移到平台默认模板（is_default=1）；用户主动改成另一个不可用模板仍拒绝。
    let effectiveTemplateId = templateId;
    if (templateId !== undefined && templateId) {
      const chkTpl = canCUseTemplate(req.customerId, req.user.id, templateId);
      if (!chkTpl.ok) {
        if (String(templateId) === String(card.template_id)) {
          const def = db.prepare("SELECT id FROM card_templates WHERE tenant_id = 0 AND enabled = 1 AND is_default = 1 ORDER BY id LIMIT 1").get();
          if (!def) return res.status(400).json({ error: chkTpl.error });
          effectiveTemplateId = def.id;
        } else {
          return res.status(400).json({ error: chkTpl.error });
        }
      }
    }
    // 个性化分享设置（2026-10-21）：转发封面风格 + 自定义标题
    // ⚠️ PATCH 语义：字段没传就保持旧值（undefined 不写库），
    //    否则前端只想改标题时会把风格清成默认、把标题清空。
    // ⚠️ shareStyle 必须白名单校验：脏值下发到 C 端 → 画不出封面 → 转发图空白。
    let effectiveShareStyle = card.share_style || 'cover-1';
    if (shareStyle !== undefined && shareStyle !== null && shareStyle !== '') {
      if (!SHARE_STYLES.includes(String(shareStyle))) {
        return res.status(400).json({ error: '分享封面风格不存在' });
      }
      effectiveShareStyle = String(shareStyle);
    }
    let effectiveShareTitle = card.share_title || '';
    if (shareTitle !== undefined && shareTitle !== null) {
      effectiveShareTitle = String(shareTitle || '').trim().slice(0, SHARE_TITLE_MAX);
    }
    db.prepare(
      `UPDATE card_profile SET name=?, position=?, city=?, industry=?, phone=?, wechat=?, email=?, company=?, companies=?, bio=?, business_field=?, need_tags=?, avatar=?, is_public=?, video_channel=?, slogan=?, tags=?, template_id=?, voice_url=?, voice_name=?, works_label=?, latitude=?, longitude=?, address=?, share_style=?, share_title=?, updated_at=datetime('now') WHERE id=?`
    ).run(name || card.name, position ?? card.position, city ?? card.city, industry ?? card.industry, phone ?? card.phone, wechat ?? card.wechat, email ?? card.email, company ?? card.company, companies !== undefined ? JSON.stringify(companies) : card.companies, bio ?? card.bio, businessField ?? card.business_field, needTags !== undefined ? (Array.isArray(needTags) ? JSON.stringify(needTags) : needTags) : card.need_tags, avatar ?? card.avatar, isPublic !== undefined ? (isPublic ? 1 : 0) : card.is_public, videoChannel ?? card.video_channel, slogan ?? card.slogan, tags ?? card.tags, templateId !== undefined ? effectiveTemplateId : card.template_id, voiceUrl !== undefined ? voiceUrl : card.voice_url, voiceName !== undefined ? voiceName : card.voice_name, effectiveWorksLabel,       ...coalesceLatLng(card, latitude, longitude), address !== undefined ? String(address || '').slice(0, 200) : card.address, effectiveShareStyle, effectiveShareTitle, card.id);
    // 🔴 姓名/手机号双表同步：名片是个人/企业主体在 C 端唯一可编辑入口，入驻个人档案
    // (tenant_individuals) 的 phone/name/position 必须随名片保持一致，否则后台「入驻个人」
    // 与「名片管理」同一人手机号对不上（2026-10-20 修复：原「一个有手机号一个没有」根因）。
    db.prepare(`UPDATE tenant_individuals SET phone=?, name=?, position=?, updated_at=datetime('now')
      WHERE customer_id = ? AND user_id = ? AND status != 'disabled'`)
      .run(phone ?? card.phone, name || card.name, position ?? card.position, card.customer_id, req.user.id);
    const updated = db.prepare(`SELECT cp.*, ct.theme_config as template_theme
      FROM card_profile cp LEFT JOIN card_templates ct ON ct.id = cp.template_id WHERE cp.id = ?`).get(card.id);
    res.json({ card: toCard(updated) });
  });

  router.delete('/cards/:id', auth, (req, res) => {
    const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    db.prepare("UPDATE card_profile SET status='deleted', updated_at=datetime('now') WHERE id=?").run(card.id);
    res.json({ ok: true });
  });

  // 名片作品集列表（公开）
  router.get('/cards/:id/works', (req, res) => {
    const works = db.prepare('SELECT id, card_id, image_url, title, sort_order FROM card_works WHERE card_id = ? ORDER BY sort_order ASC, id ASC').all(req.params.id);
    res.json({ works: works.map((w) => ({ id: w.id, cardId: w.card_id, imageUrl: w.image_url, title: w.title, sortOrder: w.sort_order })) });
  });

  // ============================================================
  // 名片作品集管理（增/改/删/排序）——仅名片归属人可操作
  //   ⚠️ 历史上 card_works 只有 seed 写入 + 公开 GET，用户/运营均无管理入口；
  //      此处补齐归属校验的写路由，C 端 worksEdit.vue 与后台共用。
  // ============================================================
  const WORK_IMG_MIME = ['image/png', 'image/jpeg', 'image/webp'];
  // 新增作品（图片直传 + 标题，一次请求）：multipart file + title
  router.post('/cards/:id/works', auth, (req, res) => {
    voiceUpload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : err.message;
        return res.status(400).json({ error: message });
      }
      try {
        const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
        if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
        const mime = (req.file.mimetype || '').toLowerCase();
        if (!WORK_IMG_MIME.includes(mime)) return res.status(400).json({ error: '仅支持 png/jpg/webp 图片' });
        // 会员分级门禁（benefits.js 单一来源）：跨用户名下所有名片累计计数，
        // 先校验再落盘，避免传了图才被拒。超限 403 + limitHit 供 C 端弹升级引导。
        const gate = benefits.canAddWork(req.user.id);
        if (!gate.ok) {
          return res.status(403).json({
            error: `作品数量已达上限（${gate.used}/${gate.limit} 张），升级会员可添加更多`,
            code: 'limitHit', kind: 'works', limit: gate.limit, used: gate.used,
          });
        }
        const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
        const storage = await getStorage(db);
        const url = await storage.put(req.file.buffer, `work-c${card.id}-${Date.now()}${ext}`);
        const title = String(req.body.title || '').trim();
        const maxSort = db.prepare('SELECT MAX(sort_order) AS m FROM card_works WHERE card_id = ?').get(card.id);
        const sort = (maxSort && maxSort.m != null ? Number(maxSort.m) : 0) + 1;
        const info = db.prepare('INSERT INTO card_works (card_id, image_url, title, sort_order) VALUES (?,?,?,?)')
          .run(card.id, url, title, sort);
        res.status(201).json({ work: { id: Number(info.lastInsertRowid), cardId: card.id, imageUrl: url, title, sortOrder: sort } });
      } catch (e) {
        console.error('新增作品失败:', e);
        res.status(500).json({ error: '新增作品失败' });
      }
    });
  });

  // 作品排序（批量）：body { ids:[workId,...] } 按数组顺序重排 sort_order
  // ⚠️ 必须定义在 /:workId 之前，否则 sort 会被当成 workId。
  router.put('/cards/:id/works/sort', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      const upd = db.prepare('UPDATE card_works SET sort_order = ? WHERE id = ? AND card_id = ?');
      ids.forEach((wid, idx) => upd.run(idx + 1, wid, card.id));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 修改作品标题
  router.put('/cards/:id/works/:workId', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const work = db.prepare('SELECT * FROM card_works WHERE id = ? AND card_id = ?').get(req.params.workId, card.id);
      if (!work) return res.status(404).json({ error: '作品不存在' });
      const title = String(req.body.title != null ? req.body.title : work.title).trim();
      db.prepare('UPDATE card_works SET title = ? WHERE id = ?').run(title, work.id);
      res.json({ work: { id: work.id, cardId: card.id, imageUrl: work.image_url, title, sortOrder: work.sort_order } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除作品
  router.delete('/cards/:id/works/:workId', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const work = db.prepare('SELECT id FROM card_works WHERE id = ? AND card_id = ?').get(req.params.workId, card.id);
      if (!work) return res.status(404).json({ error: '作品不存在' });
      db.prepare('DELETE FROM card_works WHERE id = ?').run(work.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 名片视频号作品管理（增/改/删/排序）——镜像 card_works 归属模型
  //   视频号链接调用方案：存 finderUserName + feedId，C 端点击 wx.openChannelsActivity
  //   跳转具体视频（无主体限制）；封面统一默认图 + 播放键（微信反爬致封面无法抓取）。
  //   数量门禁走 benefits.js（free=0/silver=2/gold=6/diamond=20，跨名片累计）。
  // ============================================================
  // 链接解析：粘贴视频号分享链接 → finderUserName + feedId（失败前端降级手动填）
  router.post('/cards/:id/videos/parse', auth, (req, res) => {
    try {
      const parsed = parseChannelLink(req.body && req.body.link);
      if (!parsed) {
        return res.status(400).json({ error: '无法从链接中提取视频号ID与作品ID，请改用「填写视频号 ID」（视频号助手获取）', code: 'parseFail' });
      }
      // 微信 sph 加密短链：短码是路由密文，无法反解（2026-10-19 实测核实，勿再写「主页链接」）
      if (parsed.channelHome) {
        return res.status(400).json({
          error: '微信现在分享复制到的是 weixin.qq.com/sph/ 开头的加密短链，它只用于跳转、不含作品ID，无法解析。请到「视频号助手」获取：首页复制视频号ID（sph开头），内容管理里复制作品的feedId',
          code: 'channelHomeLink',
        });
      }
      res.json({ finderUserName: parsed.finderUserName, feedId: parsed.feedId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 新增视频条目（JSON：finderUserName + feedId + 标题）
  router.post('/cards/:id/videos', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT * FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const body = req.body || {};
      const finder = String(body.finderUserName || '').trim();
      const feed = String(body.feedId || '').trim();
      if (!/^sph/i.test(finder)) return res.status(400).json({ error: 'finderUserName 需以 sph 开头（视频号ID）' });
      if (!feed) return res.status(400).json({ error: 'feedId 不能为空（视频唯一标识）' });
      if (finder.length > 64 || feed.length > 128) return res.status(400).json({ error: 'ID 长度超出限制' });
      // 去重先于门禁：已添加过的视频重复提交应提示「请勿重复」而非误导为「达上限」
      const dup = db.prepare('SELECT id FROM card_videos WHERE card_id = ? AND finder_user_name = ? AND feed_id = ?').get(card.id, finder, feed);
      if (dup) return res.status(409).json({ error: '该视频已添加，请勿重复添加', code: 'duplicated' });
      // 会员分级门禁（先校验再落库）：free 无视频位，引导升级
      const gate = benefits.canAddVideo(req.user.id);
      if (!gate.ok) {
        return res.status(403).json({
          error: `视频号作品数量已达上限（${gate.used}/${gate.limit} 个），升级会员可添加更多`,
          code: 'limitHit', kind: 'videos', limit: gate.limit, used: gate.used,
        });
      }
      const title = String(body.title || '').trim().slice(0, 40);
      const maxSort = db.prepare('SELECT MAX(sort_order) AS m FROM card_videos WHERE card_id = ?').get(card.id);
      const sort = (maxSort && maxSort.m != null ? Number(maxSort.m) : 0) + 1;
      let videoId;
      try {
        const info = db.prepare('INSERT INTO card_videos (card_id, title, cover_url, duration, finder_user_name, feed_id, sort_order, is_show) VALUES (?,?,?,?,?,?,?,1)')
          .run(card.id, title, '', '', finder, feed, sort);
        videoId = Number(info.lastInsertRowid);
      } catch (e) {
        // 唯一索引兜底：并发/极端时序下的重复提交
        if (String(e.message).includes('UNIQUE')) {
          return res.status(409).json({ error: '该视频已添加，请勿重复添加', code: 'duplicated' });
        }
        throw e;
      }
      res.status(201).json({
        video: { id: videoId, cardId: card.id, title, coverUrl: '', duration: '', finderUserName: finder, feedId: feed, isShow: true, sortOrder: sort },
      });
    } catch (e) {
      console.error('新增视频失败:', e);
      res.status(500).json({ error: '新增视频失败' });
    }
  });

  // 视频排序（批量）：body { ids:[videoId,...] }
  // ⚠️ 必须定义在 /:videoId 之前，否则 sort 会被当成 videoId。
  router.put('/cards/:id/videos/sort', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      const upd = db.prepare('UPDATE card_videos SET sort_order = ? WHERE id = ? AND card_id = ?');
      ids.forEach((vid, idx) => upd.run(idx + 1, vid, card.id));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 修改视频标题/时长/启停
  router.put('/cards/:id/videos/:videoId', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const video = db.prepare('SELECT * FROM card_videos WHERE id = ? AND card_id = ?').get(req.params.videoId, card.id);
      if (!video) return res.status(404).json({ error: '视频不存在' });
      const title = String(req.body.title != null ? req.body.title : video.title).trim().slice(0, 40);
      const duration = String(req.body.duration != null ? req.body.duration : video.duration).trim().slice(0, 16);
      const isShow = req.body.isShow != null ? (req.body.isShow ? 1 : 0) : video.is_show;
      db.prepare('UPDATE card_videos SET title = ?, duration = ?, is_show = ? WHERE id = ?').run(title, duration, isShow, video.id);
      res.json({ video: { id: video.id, cardId: card.id, title, coverUrl: video.cover_url, duration, finderUserName: video.finder_user_name, feedId: video.feed_id, isShow: !!isShow, sortOrder: video.sort_order } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除视频条目
  router.delete('/cards/:id/videos/:videoId', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const video = db.prepare('SELECT id FROM card_videos WHERE id = ? AND card_id = ?').get(req.params.videoId, card.id);
      if (!video) return res.status(404).json({ error: '视频不存在' });
      db.prepare('DELETE FROM card_videos WHERE id = ?').run(video.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 访客行为采集
  // ============================================================
  router.post('/visitor/track', async (req, res) => {
    try {
      const { cardId, visitorOpenid, actionType, actionDetail, duration, page } = req.body;
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });

      const today = new Date().toISOString().slice(0, 10);

      // 更新或创建访客记录（24小时内合并）
      let visitor = db.prepare(
        'SELECT * FROM card_visitor WHERE card_id=? AND visitor_openid=? AND visit_date=?'
      ).get(cardId, visitorOpenid || 'anonymous', today);

      if (visitor) {
        db.prepare(
          "UPDATE card_visitor SET visit_count=visit_count+1, duration=duration+?, last_visit_at=datetime('now') WHERE id=?"
        ).run(duration || 0, visitor.id);
      } else {
        db.prepare(
          'INSERT INTO card_visitor (card_id, visitor_openid, visit_date, visit_count, duration, pages) VALUES (?,?,?,1,?,?)'
        ).run(cardId, visitorOpenid || 'anonymous', today, duration || 0, JSON.stringify([page || 'profile']));
      }

      // 记录行为详情
      db.prepare(
        'INSERT INTO card_visitor_action (card_id, visitor_openid, action_type, action_detail) VALUES (?,?,?,?)'
      ).run(cardId, visitorOpenid || 'anonymous', actionType || 'view', actionDetail || '');

      // 更新名片访问量
      if (actionType === 'view') {
        db.prepare('UPDATE card_profile SET view_count=view_count+1 WHERE id=?').run(cardId);
      }

      // ===== 运营型雷达链路（评估修订：cardId 反查租户 → 匹配事件 → 意向分 → 客户池 → 话术 → 分级提醒） =====
      // 雷达链路失败不阻塞主上报（try/catch 兜底）
      try {
        const cardRow = db.prepare('SELECT user_id FROM card_profile WHERE id = ?').get(cardId);
        const tenantId = radar.resolveTenant(cardId);
        const event = radar.matchEvent(tenantId, actionType || 'view');
        if (event && cardRow) {
          const ownerUserId = cardRow.user_id;
          const visitor = {
            openid: visitorOpenid || 'anonymous',
            name: (actionDetail || '').slice(0, 64),
            phone: '',
            wechat: '',
            company: '',
            userId: 0,
          };
          // 已注册访客：card_visitor.visitor_user_id 关联真实用户（如有）
          const vRow = db.prepare(
            'SELECT visitor_user_id FROM card_visitor WHERE card_id=? AND visitor_openid=? ORDER BY id DESC LIMIT 1'
          ).get(cardId, visitorOpenid || 'anonymous');
          if (vRow && vRow.visitor_user_id) visitor.userId = vRow.visitor_user_id;

          const intent = radar.onVisitorEvent(tenantId, ownerUserId, visitor, event, { duration: duration || 0 });

          // 高意向事件（转发/留电话/二次回访等 importance>=2）或带可识别身份（有姓名/已注册）时沉淀客户池
          let client = null;
          if (event.importance >= 2 || visitor.name || visitor.userId) {
            client = radar.upsertClient(tenantId, ownerUserId, visitor, 'radar');
          }

          // 话术：写入跟进建议（不自动群发，合规），随响应返回供前端提示
          const words = radar.pickWords(tenantId, event.id, intent.hit);
          if (client && client.id) {
            db.prepare(
              "INSERT INTO card_customer_follow (customer_id, user_id, content, next_follow_at) VALUES (?,?,?,NULL)"
            ).run(client.id, ownerUserId, words);
          }

          // 分级提醒：高意向事件才推送（通道未接降级站内提醒，见 radar.sendNotify）
          if (event.importance >= 2) {
            radar.sendNotify(tenantId, ownerUserId, event, visitor);
          }
        }
      } catch (radarErr) { /* 雷达链路异常不影响访客上报 */ }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // 访客雷达
  // ============================================================
  router.get('/visitors/summary', auth, (req, res) => {
    // 访客雷达为付费功能：free 或会员已过期 → 锁定
    const isMember = req.user.member_level !== 'free' && req.user.member_expire_at && new Date(req.user.member_expire_at) > new Date();
    if (!isMember) {
      return res.json({
        locked: true,
        memberLevel: req.user.member_level || 'free',
        memberExpireAt: req.user.member_expire_at || null,
        today: 0, week: 0, total: 0, diff: 0, exchange: 0, visitors: []
      });
    }

    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.json({ today: 0, week: 0, total: 0, diff: 0, exchange: 0, visitors: [] });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const todayCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(card.id, today).c;
    const yesterdayCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(card.id, yesterday).c;
    const weekCount = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date>=?').get(card.id, weekAgo).c;
    const total = db.prepare('SELECT view_count FROM card_profile WHERE id=?').get(card.id).view_count;

    // 较昨日增幅
    let diff = 0;
    if (yesterdayCount > 0) diff = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);

    const visitors = db.prepare(
      'SELECT * FROM card_visitor WHERE card_id=? ORDER BY last_visit_at DESC LIMIT 50'
    ).all(card.id);

    const enriched = visitors.map((v) => {
      // 关联昵称/头像
      let nickname = '', avatar = '';
      if (v.visitor_user_id) {
        const u = db.prepare('SELECT nickname, avatar FROM platform_user WHERE id=?').get(v.visitor_user_id);
        if (u) { nickname = u.nickname; avatar = u.avatar; }
      }
      // 最近动作
      const lastAction = db.prepare('SELECT action_type, action_detail FROM card_visitor_action WHERE card_id=? AND visitor_openid=? ORDER BY created_at DESC LIMIT 1').get(card.id, v.visitor_openid);
      const actionType = lastAction ? lastAction.action_type : '';
      const actionDetail = lastAction ? lastAction.action_detail : '';

      // 全部行为（用于意向评分）
      const actions = db.prepare('SELECT action_type, action_detail FROM card_visitor_action WHERE card_id=? AND visitor_openid=?').all(card.id, v.visitor_openid);
      const actionTypes = new Set(actions.map(a => a.action_type));

      // 标签推断（只表「行为」，单一口径）：已交换名片 > 观看视频 > 回访客 > 新访客
      // 🔴 2026-10-18：原 visit_count>=2 也标「高意向」，与下方 score 徽标「中意向55分」
      //    同屏自相矛盾。意向强弱自此唯一由 score/level 表达，标签只承载客观行为。
      let tag = '新访客', tagColor = '#9a9a9a';
      if (actionType === 'exchange') { tag = '已交换名片'; tagColor = '#07c160'; }
      else if (actionType === 'video' || (actionDetail || '').includes('视频')) { tag = '观看视频'; tagColor = '#1d4e8f'; }
      else if (v.visit_count >= 2) { tag = '回访客'; tagColor = '#1d4e8f'; }

      // ===== AI 意向评分（本地规则引擎，0-100） =====
      let score = 0;
      score += Math.min(45, (v.visit_count || 1) * 15);            // 访问频次（封顶45）
      if (v.duration > 60) score += 10;
      if (v.duration > 180) score += 5;                            // 深度停留（封顶15）
      if (actionTypes.has('exchange')) score += 20;                // 交换名片（强意向）
      if (actionTypes.has('video') || actionTypes.has('share') || actionTypes.has('form')) score += 10;
      if (actionTypes.has('comment') || actionTypes.has('like')) score += 5;
      const firstVisit = db.prepare('SELECT MIN(visit_date) as d FROM card_visitor WHERE card_id=? AND visitor_openid=?').get(card.id, v.visitor_openid).d;
      const isReturning = firstVisit && firstVisit < v.visit_date;
      if (isReturning) score += 10;                                // 回访加分
      score = Math.min(100, score);
      const level = score >= 70 ? '高意向' : (score >= 40 ? '中意向' : '低意向');
      const levelColor = score >= 70 ? '#07c160' : (score >= 40 ? '#FF7D00' : '#9a9a9a');

      // 行为描述
      const durText = v.duration > 0 ? ` · 停留${v.duration >= 60 ? Math.floor(v.duration / 60) + '分' + (v.duration % 60) + '秒' : v.duration + '秒'}` : '';
      const behavior = `访问${v.visit_count}次${durText}`;
      const timeAgo = timeAgoText(v.last_visit_at);

      return {
        id: v.id, cardId: v.card_id, visitorOpenid: v.visitor_openid, visitorUserId: v.visitor_user_id,
        nickname: nickname || (v.visitor_openid === 'anonymous' ? '匿名访客' : '访客'), avatar,
        visitCount: v.visit_count, duration: v.duration, lastVisitAt: v.last_visit_at,
        tag, tagColor, actionType, behavior, timeAgo, unread: !v.read_at,
        score, level, levelColor, firstVisitAt: firstVisit || null, isReturning,
      };
    });

    // 名片交换数：与该名片相关的交换记录（发出或收到都算）
    // ⚠️ 前端 native-radar 的「名片交换」直接读 summary.exchange，缺字段会恒显示 0。
    const exchange = db.prepare('SELECT COUNT(*) as c FROM card_exchange WHERE from_card_id=? OR to_card_id=?').get(card.id, card.id).c;

    res.json({ today: todayCount, week: weekCount, total, diff, exchange, visitors: enriched, trend: buildVisitorTrend(db, card.id) });
  });

  // 访客已读标记（红点消失）
  // 🔴 按行 id 标记，不是按 visitor_openid：列表里每条 = 一次访问会话（card_visitor 行），
  //    而匿名访客的 openid 全是 'anonymous'——按 openid 更新会一次性清掉所有匿名访客红点
  //    （用户反馈：只看一条、红点全没）。已读态须逐行独立，故用主键 id + card_id 双约束。
  router.post('/visitors/:visitorId/read', auth, (req, res) => {
    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.status(404).json({ error: '名片不存在' });
    db.prepare('UPDATE card_visitor SET read_at = datetime(\'now\') WHERE id=? AND card_id=?')
      .run(Number(req.params.visitorId) || 0, card.id);
    res.json({ ok: true });
  });

  // ============================================================
  // 运营型雷达（阶段A：高潜榜/意向详情/配置/话术/转发链/导出/站内提醒/订阅授权）
  // ============================================================

  // 会员门槛判断（与 /visitors/summary 同口径：非 free 且未过期）
  function radarMember(req, res) {
    const isMember = req.user.member_level !== 'free' && req.user.member_expire_at && new Date(req.user.member_expire_at) > new Date();
    if (!isMember) {
      res.json({ locked: true, memberLevel: req.user.member_level || 'free', memberExpireAt: req.user.member_expire_at || null });
      return null;
    }
    return isMember;
  }

  // 高潜客户榜（会员内）
  router.get('/radar/top-leads', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const card = db.prepare('SELECT id, user_id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (!card) return res.json({ leads: [], total: 0 });
      const tenantId = radar.resolveTenant(card.id);
      const leads = radar.topLeads(tenantId, req.user.id, Number(req.query.limit) || 20).map((r) => ({
        visitorOpenid: r.visitor_openid,
        visitorUserId: r.visitor_user_id,
        score: r.score,
        hitCount: r.hit_count,
        level: r.score >= 70 ? '高意向' : (r.score >= 40 ? '中意向' : '低意向'),
        lastCalcAt: r.last_calc_at,
        words: radar.pickWords(tenantId, (() => { const e = radar.matchEvent(tenantId, 'view'); return e ? e.id : 0; })(), r.hit_count),
      }));
      res.json({ leads, total: leads.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 单个访客意向详情（会员内）
  router.get('/radar/intent/:visitorOpenid', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (!card) return res.json({ intent: null });
      const tenantId = radar.resolveTenant(card.id);
      const intent = radar.intentOf(tenantId, req.user.id, req.params.visitorOpenid);
      res.json({ intent: intent ? { ...intent, level: intent.score >= 70 ? '高意向' : (intent.score >= 40 ? '中意向' : '低意向') } : null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 小程序端上报订阅授权结果（阶段D消费；阶段A留存授权记录）
  router.post('/radar/subscribe', auth, (req, res) => {
    try {
      const { granted, tmplIds = [] } = req.body || {};
      db.prepare(
        'INSERT INTO card_radar_subscribe (user_id, granted, tmpl_ids) VALUES (?,?,?)'
      ).run(req.user.id, granted ? 1 : 0, JSON.stringify(Array.isArray(tmplIds) ? tmplIds.slice(0, 5) : []));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 名片主查看雷达配置
  router.get('/radar/config', auth, (req, res) => {
    const cfg = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id = ?').get(req.customerId || 0);
    res.json({ config: cfg ? { switch: cfg.switch, xcxTmpid: cfg.xcx_tmpid, gzhAppid: cfg.gzh_appid, gzhTmpid: cfg.gzh_tmpid } : null });
  });

  // 更新雷达配置（开关/推送模板；tenant 级 upsert）
  router.post('/radar/config', auth, requireTenant, (req, res) => {
    try {
      const { switch: sw, xcxTmpid, gzhAppid, gzhTmpid } = req.body || {};
      const exists = db.prepare('SELECT * FROM card_radar_push_config WHERE tenant_id = ?').get(req.customerId);
      if (exists) {
        db.prepare(
          "UPDATE card_radar_push_config SET switch=?, xcx_tmpid=?, gzh_appid=?, gzh_tmpid=?, updated_at=datetime('now') WHERE id=?"
        ).run(sw !== undefined ? (sw ? 1 : 0) : exists.switch, xcxTmpid ?? exists.xcx_tmpid, gzhAppid ?? exists.gzh_appid, gzhTmpid ?? exists.gzh_tmpid, exists.id);
      } else {
        db.prepare(
          'INSERT INTO card_radar_push_config (tenant_id, switch, xcx_tmpid, gzh_appid, gzh_tmpid) VALUES (?,?,?,?,?)'
        ).run(req.customerId, sw ? 1 : 0, xcxTmpid || '', gzhAppid || '', gzhTmpid || '');
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 话术列表（按事件分组，tenant 维度 + 平台公共）
  router.get('/radar/words', auth, (req, res) => {
    const events = db.prepare(
      'SELECT * FROM card_radar_event WHERE enabled = 1 AND (tenant_id = ? OR tenant_id = 0) ORDER BY tenant_id DESC, sort_order, id'
    ).all(req.customerId || 0);
    res.json({ groups: events.map((ev) => ({
      eventId: ev.id, name: ev.name, title: ev.title, importance: ev.importance,
      words: db.prepare('SELECT id, time_start, time_end, words FROM card_radar_words WHERE tenant_id = ? AND event_id = ? ORDER BY time_start').all(req.customerId || 0, ev.id),
    })) });
  });

  // 新增/编辑话术（tenant 维度）
  router.post('/radar/words', auth, requireTenant, (req, res) => {
    try {
      const { eventId, timeStart = 0, timeEnd = 0, words } = req.body || {};
      const ev = db.prepare('SELECT id FROM card_radar_event WHERE id = ? AND (tenant_id = ? OR tenant_id = 0)').get(eventId, req.customerId);
      if (!ev) return res.status(404).json({ error: '事件不存在' });
      if (!words || !String(words).trim()) return res.status(400).json({ error: '话术内容不能为空' });
      const r = db.prepare(
        'INSERT INTO card_radar_words (tenant_id, event_id, time_start, time_end, words) VALUES (?,?,?,?,?)'
      ).run(req.customerId, eventId, Number(timeStart) || 0, Number(timeEnd) || 0, String(words).trim().slice(0, 500));
      res.json({ ok: true, id: r.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 转发传播链列表（会员内）
  router.get('/radar/shares', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (!card) return res.json({ shares: [], total: 0 });
      const tenantId = radar.resolveTenant(card.id);
      const shares = radar.shares(tenantId, card.id, Number(req.query.limit) || 50);
      res.json({ shares: shares.map((s) => ({ id: s.id, fromUserId: s.from_user_id, toOpenid: s.to_openid, shareUrl: s.share_url, createdAt: s.created_at })), total: shares.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 记录转发链（公开，分享名片时上报）
  router.post('/radar/share', (req, res) => {
    try {
      const { cardId, fromUserId, toOpenid, shareUrl } = req.body || {};
      if (!cardId || !fromUserId) return res.status(400).json({ error: '参数缺失' });
      const card = db.prepare('SELECT id FROM card_profile WHERE id = ?').get(cardId);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      const tenantId = radar.resolveTenant(cardId);
      radar.trackShare(tenantId, cardId, fromUserId, toOpenid || '', shareUrl || '');
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 客户+意向导出 CSV（会员内；企微同步占位）
  router.get('/radar/export', auth, (req, res) => {
    try {
      if (!radarMember(req, res)) return;
      const leads = radar.topLeads(req.customerId || 0, req.user.id, 500);
      const lines = ['访客openid,意向分,命中次数,最近计算时间'];
      for (const l of leads) {
        lines.push(`${l.visitor_openid},${l.score},${l.hit_count},${l.last_calc_at}`);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="radar-leads.csv"');
      res.send('\uFEFF' + lines.join('\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 当前会员权益：features + 配额余量（阶段C：AI报告入口 / 会员卡权益清单用；free 返回空 features + 不限配额）
  router.get('/radar/features', auth, (req, res) => {
    const lead = quota.quotaLeft(req.user.id, 'lead');
    const push = quota.quotaLeft(req.user.id, 'push');
    const collect = quota.quotaLeft(req.user.id, 'collect');
    const all = ['ai_report', 'ai_words', 'quota_lead', 'quota_push', 'enterprise'];
    res.json({
      isMember: !!quota.planOf(req.user.id),
      features: all.filter((f) => quota.hasFeature(req.user.id, f)),
      quota: {
        lead: { limit: lead.limit, used: lead.used, left: lead.left, unlimited: lead.unlimited },
        push: { limit: push.limit, used: push.used, left: push.left, unlimited: push.unlimited },
        collect: { limit: collect.limit, used: collect.used, left: collect.left, unlimited: collect.unlimited },
      },
    });
  });

  // 站内提醒列表（名片主消息页）
  router.get('/radar/notifies', auth, (req, res) => {
    const notifies = radar.listNotifies(req.customerId || 0, req.user.id, Number(req.query.limit) || 50);
    res.json({ notifies: notifies.map((n) => ({ id: n.id, eventName: n.event_name, title: n.title, visitorName: n.visitor_name, channel: n.channel, status: n.status, readAt: n.read_at, createdAt: n.created_at })) });
  });

  // 站内提醒已读
  router.post('/radar/notifies/:id/read', auth, (req, res) => {
    db.prepare("UPDATE card_radar_notify SET read_at = datetime('now') WHERE id = ? AND owner_user_id = ?")
      .run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  // ============================================================
  // 名片收藏（产品决策：本期做；collect_limit 权益：0=不限，超限提示升级）
  // ============================================================
  router.post('/collect', auth, (req, res) => {
    try {
      const { cardId, groupName } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });
      const card = db.prepare("SELECT * FROM card_profile WHERE id = ? AND status = 'active'").get(cardId);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      if (Number(card.user_id) === req.user.id) return res.status(400).json({ error: '不能收藏自己的名片' });
      const exist = db.prepare('SELECT id FROM card_collect WHERE card_id = ? AND user_id = ?').get(cardId, req.user.id);
      if (exist) return res.json({ ok: true, collected: true });
      // 收藏上限校验（collect_limit：0=不限）
      if (!quota.canCollect(req.user.id)) {
        return res.status(403).json({ error: '收藏数量已达上限，升级会员可收藏更多名片', limitHit: true });
      }
      db.prepare('INSERT INTO card_collect (card_id, user_id, group_name) VALUES (?,?,?)').run(cardId, req.user.id, groupName || '未分组');
      res.json({ ok: true, collected: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 取消收藏
  router.delete('/collect', auth, (req, res) => {
    try {
      const { cardId } = req.query || {};
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });
      db.prepare('DELETE FROM card_collect WHERE card_id = ? AND user_id = ?').run(cardId, req.user.id);
      res.json({ ok: true, collected: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 我的收藏列表
  router.get('/collects', auth, (req, res) => {
    try {
      const rows = db.prepare(
        `SELECT c.*, cp.name, cp.company, cp.position, cp.avatar FROM card_collect c
         LEFT JOIN card_profile cp ON cp.id = c.card_id
         WHERE c.user_id = ? ORDER BY c.id DESC LIMIT ?`
      ).all(req.user.id, Number(req.query.limit) || 200);
      const groups = db.prepare(
        "SELECT group_name AS name, COUNT(*) AS count FROM card_collect WHERE user_id = ? GROUP BY group_name ORDER BY MIN(id)"
      ).all(req.user.id).map((g) => ({ name: g.name || '未分组', count: g.count }));
      res.json({
        groups,
        collects: rows.map((r) => ({
          id: r.id, cardId: r.card_id, groupName: r.group_name || '未分组', name: r.name || '', company: r.company || '', position: r.position || '', avatar: r.avatar || '', createdAt: r.created_at,
        })),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 名片夹分组管理（group_name 字符串集合，不建独立分组表）
  // 新建/重命名分组：POST /collects/group {name, oldName?}（oldName 存在则重命名该分组）
  router.post('/collects/group', auth, (req, res) => {
    try {
      const { name, oldName } = req.body || {};
      if (!name || !String(name).trim()) return res.status(400).json({ error: '分组名不能为空' });
      const n = String(name).trim().slice(0, 20);
      if (oldName && String(oldName) !== '未分组') {
        db.prepare("UPDATE card_collect SET group_name = ? WHERE user_id = ? AND group_name = ?").run(n, req.user.id, String(oldName));
      } else {
        const exist = db.prepare('SELECT id FROM card_collect WHERE user_id = ? AND group_name = ? LIMIT 1').get(req.user.id, n);
        if (!exist) {
          // 无收藏时也允许先建分组：用一条无 card 的占位记录不可行，改为直接返回成功并允许前端本地维护
        }
      }
      const groups = db.prepare("SELECT group_name AS name, COUNT(*) AS count FROM card_collect WHERE user_id = ? GROUP BY group_name ORDER BY MIN(id)").all(req.user.id).map((g) => ({ name: g.name || '未分组', count: g.count }));
      res.json({ ok: true, groups });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除分组：组内收藏移回「未分组」
  router.post('/collects/group/delete', auth, (req, res) => {
    try {
      const { name } = req.body || {};
      if (!name || String(name) === '未分组') return res.status(400).json({ error: '无效分组' });
      db.prepare("UPDATE card_collect SET group_name = '未分组' WHERE user_id = ? AND group_name = ?").run(req.user.id, String(name));
      const groups = db.prepare("SELECT group_name AS name, COUNT(*) AS count FROM card_collect WHERE user_id = ? GROUP BY group_name ORDER BY MIN(id)").all(req.user.id).map((g) => ({ name: g.name || '未分组', count: g.count }));
      res.json({ ok: true, groups });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 移动收藏到指定分组
  router.post('/collects/:id/group', auth, (req, res) => {
    try {
      const { groupName } = req.body || {};
      const row = db.prepare('SELECT id FROM card_collect WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!row) return res.status(404).json({ error: '收藏不存在' });
      db.prepare('UPDATE card_collect SET group_name = ? WHERE id = ?').run(groupName || '未分组', row.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 无感留资（修订二：card_lead 提交表；授权手机号 → 落线索 → 客户池 → 高意向事件+提醒）
  // ============================================================
  router.post('/leads', (req, res) => {
    try {
      const { cardId, name = '', phone = '' } = req.body || {};
      if (!cardId) return res.status(400).json({ error: 'cardId不能为空' });
      const card = db.prepare("SELECT * FROM card_profile WHERE id = ? AND status = 'active'").get(cardId);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      if (!phone && !name) return res.status(400).json({ error: '请至少提供姓名或手机号' });
      const tenantId = radar.resolveTenant(cardId);
      // 留资配额（阶段B对齐：套餐有效期累计 + 成功才扣 + 超限引导升级；free 不限）
      if (!quota.canLead(card.user_id)) {
        return res.status(403).json({ error: '留资额度已达上限，升级会员可解锁更多留资', limitHit: true });
      }
      db.prepare(
        'INSERT INTO card_lead (tenant_id, card_id, owner_user_id, visitor_openid, name, phone, source) VALUES (?,?,?,?,?,?,?)'
      ).run(tenantId, cardId, card.user_id, '', String(name).trim().slice(0, 64), String(phone).trim().slice(0, 32), 'radar');
      // 入客户池（有手机号/姓名时）
      radar.upsertClient(tenantId, card.user_id, { openid: '', name: String(name).trim() || '游客', phone: String(phone).trim(), wechat: '', company: '', userId: 0 }, 'radar');
      // 触发高意向事件 form（importance>=2 → 站内提醒）
      const event = radar.matchEvent(tenantId, 'form');
      if (event) {
        radar.onVisitorEvent(tenantId, card.user_id, { openid: '', name: String(name).trim() || '游客', phone: String(phone).trim(), userId: 0 }, event, {});
        radar.sendNotify(tenantId, card.user_id, event, { name: String(name).trim() || '匿名访客' });
      }
      res.json({ ok: true, message: '提交成功，我们会尽快与您联系' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 近7日访问趋势（按日聚合，缺日补0）
  function buildVisitorTrend(db, cardId) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const c = db.prepare('SELECT COALESCE(SUM(visit_count),0) as c FROM card_visitor WHERE card_id=? AND visit_date=?').get(cardId, d).c;
      days.push({ date: d.slice(5), count: c });
    }
    return days;
  }

  function timeAgoText(time) {    if (!time) return '';
    const d = new Date(String(time).replace(' ', 'T'));
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 172800000) return '昨天';
    return String(time).slice(5, 16);
  }

  router.get('/visitors/:visitorOpenid/timeline', auth, (req, res) => {
    const card = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!card) return res.json({ actions: [] });
    const actions = db.prepare(
      'SELECT * FROM card_visitor_action WHERE card_id=? AND visitor_openid=? ORDER BY created_at DESC LIMIT 100'
    ).all(card.id, req.params.visitorOpenid);
    res.json({ actions: actions.map(toVisitorAction) });
  });

  // ============================================================
  // 客户管理
  // ============================================================
  router.get('/customers', auth, (req, res) => {
    const { status, tag } = req.query;
    let sql = 'SELECT * FROM card_customer WHERE owner_user_id=?';
    const params = [req.user.id];
    if (status) { sql += ' AND status=?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC';
    const customers = db.prepare(sql).all(...params);
    res.json({ customers: customers.map(toCustomer) });
  });

  router.post('/customers', auth, (req, res) => {
    const { name, phone, wechat, company, tags, source, sourceCardId } = req.body;
    if (!name) return res.status(400).json({ error: '客户姓名不能为空' });
    const result = db.prepare(
      'INSERT INTO card_customer (owner_user_id, name, phone, wechat, company, tags, source, source_card_id) VALUES (?,?,?,?,?,?,?,?)'
    ).run(req.user.id, name, phone || '', wechat || '', company || '', JSON.stringify(tags || []), source || 'manual', sourceCardId || null);
    const customer = db.prepare('SELECT * FROM card_customer WHERE id=?').get(result.lastInsertRowid);
    res.json({ customer: toCustomer(customer) });
  });

  router.put('/customers/:id', auth, (req, res) => {
    const customer = db.prepare('SELECT * FROM card_customer WHERE id=? AND owner_user_id=?').get(req.params.id, req.user.id);
    if (!customer) return res.status(404).json({ error: '客户不存在' });
    const { name, phone, wechat, company, tags, status, nextFollowAt } = req.body;
    db.prepare(
      "UPDATE card_customer SET name=?, phone=?, wechat=?, company=?, tags=?, status=?, next_follow_at=?, updated_at=datetime('now') WHERE id=?"
    ).run(name || customer.name, phone ?? customer.phone, wechat ?? customer.wechat, company ?? customer.company, tags ? JSON.stringify(tags) : customer.tags, status || customer.status, nextFollowAt || null, customer.id);
    const updated = db.prepare('SELECT * FROM card_customer WHERE id=?').get(customer.id);
    res.json({ customer: toCustomer(updated) });
  });

  router.post('/customers/:id/follow', auth, (req, res) => {
    const { content, nextFollowAt } = req.body;
    if (!content) return res.status(400).json({ error: '跟进内容不能为空' });
    db.prepare('INSERT INTO card_customer_follow (customer_id, user_id, content, next_follow_at) VALUES (?,?,?,?)')
      .run(req.params.id, req.user.id, content, nextFollowAt || null);
    db.prepare("UPDATE card_customer SET last_follow_at=datetime('now'), next_follow_at=?, updated_at=datetime('now') WHERE id=?")
      .run(nextFollowAt || null, req.params.id);
    res.json({ ok: true });
  });

  router.get('/customers/:id/follows', auth, (req, res) => {
    const follows = db.prepare('SELECT * FROM card_customer_follow WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id);
    res.json({ follows: follows.map(toFollow) });
  });

  // ============================================================
  // 名片交换
  // ------------------------------------------------------------
  // 2026-10-20 身份模型重构后明确：交换是通讯基础功能，对全部 active 名片开放，
  // 不按身份（认证状态）设门禁——上架集市才需要认证（见 services/cardIdentity.js
  // 的 cardCapabilities）。真有防骚扰需求走频控/会员等级，不要在这里补身份门禁。
  // ============================================================
  router.post('/exchange', auth, (req, res) => {
    const { toCardId, sharePhone } = req.body;
    const myCard = db.prepare('SELECT * FROM card_profile WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!myCard) return res.status(400).json({ error: '请先创建名片' });
    const toCardRow = db.prepare('SELECT * FROM card_profile WHERE id=?').get(toCardId);
    if (!toCardRow) return res.status(404).json({ error: '对方名片不存在' });
    // 🔴 自交换校验（与 POST /collect 同口径）：主人预览自己的名片时操作栏就是访客视角，
    //    第 3 格「交换名片」对本人是可见可点的；若不拦，会往自己的客户池里插一条自己的
    //    记录 + 自己的 exchange_count +1（数据自污染，且我的名片集里出现「自己」）。
    if (Number(toCardRow.user_id) === req.user.id) return res.status(400).json({ error: '不能与自己的名片交换' });

    db.prepare(
      'INSERT INTO card_exchange (from_user_id, to_user_id, from_card_id, to_card_id, phone_shared) VALUES (?,?,?,?,?)'
    ).run(req.user.id, toCardRow.user_id, myCard.id, toCardId, sharePhone ? 1 : 0);

    db.prepare('UPDATE card_profile SET exchange_count=exchange_count+1 WHERE id=?').run(toCardId);

    // 自动转为客户
    const exists = db.prepare('SELECT id FROM card_customer WHERE owner_user_id=? AND name=?').get(req.user.id, toCardRow.name);
    if (!exists) {
      db.prepare(
        'INSERT INTO card_customer (owner_user_id, name, phone, wechat, company, source, source_card_id) VALUES (?,?,?,?,?,?,?)'
      ).run(req.user.id, toCardRow.name, sharePhone ? toCardRow.phone : '', toCardRow.wechat, toCardRow.company, 'exchange', toCardId);
    }

    res.json({ ok: true, exchangedCard: toCard(toCardRow) });
  });

  // ============================================================
  // 人脉集市
  // ============================================================
  router.get('/market', auth, (req, res) => {
    const { keyword, businessField, page = 1, pageSize = 20 } = req.query;
    let sql = "SELECT * FROM card_profile WHERE is_public=1 AND status='active'";
    const params = [];
    if (keyword) { sql += ' AND (name LIKE ? OR company LIKE ? OR position LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (businessField) { sql += ' AND business_field LIKE ?'; params.push(`%${businessField}%`); }
    sql += ' ORDER BY view_count DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    const cards = db.prepare(sql).all(...params);
    const total = db.prepare("SELECT COUNT(*) as c FROM card_profile WHERE is_public=1 AND status='active'").get().c;
    res.json({ cards: cards.map(toCard), total, page: Number(page), pageSize: Number(pageSize) });
  });

  // ============================================================
  // 会员套餐
  // ============================================================
  router.get('/member/packages', (_req, res) => {
    const packages = db.prepare('SELECT * FROM member_package WHERE enabled=1 ORDER BY sort_order').all();
    res.json({ packages: packages.map(p => ({ ...p, features: JSON.parse(p.features || '[]') })) });
  });

  router.get('/member/status', auth, (req, res) => {
    const isMember = req.user.member_level !== 'free' && req.user.member_expire_at && new Date(req.user.member_expire_at) > new Date();
    res.json({
      level: isMember ? req.user.member_level : 'free',
      expireAt: req.user.member_expire_at,
      isMember,
      // 会员分级权益快照（作品/视频数量上限 + 自定义标签名开关；C 端 worksEdit/videosEdit 消费）
      benefits: benefits.snapshot(req.user.id),
    });
  });

  // ============================================================
  // 租户级会员卡（1:1 复刻菜鸟云：我的会员卡/等级列表/申请/签到/购买）
  // ============================================================

  // 我的会员卡（等级卡/卡号/到期/积分/余额/设置/申请状态）
  router.get('/member/my-card', auth, (req, res) => {
    if (!req.customerId) return res.json({ card: null, levels: [], settings: null, applyStatus: null, unbound: true });
    res.json(member.myCard(req.customerId, req.user.id));
  });

  // 会员等级列表（C 端展示/购买/申请用）
  router.get('/member/levels', auth, (req, res) => {
    if (!req.customerId) return res.json({ levels: [] });
    res.json({ levels: member.listLevels(req.customerId) });
  });

  // 申请会员（申请模式）
  router.post('/member/apply', auth, (req, res) => {
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户' });
    const r = member.apply(req.customerId, req.user.id, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // 每日签到（积分）
  router.post('/member/sign', auth, (req, res) => {
    if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户' });
    const r = member.sign(req.customerId, req.user.id);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // 直接购买会员（生成支付单，支付成功后开卡）
  router.post('/member/buy', auth, (req, res) => {
    try {
      if (!req.customerId) return res.status(403).json({ error: '未入驻任何客户' });
      const levelId = Number(req.body.levelId);
      const level = member.getLevel(req.customerId, levelId);
      if (!level) return res.status(404).json({ error: '会员等级不存在' });
      if (level.upgrade_mode !== 'consume' || !level.buy_price) return res.status(400).json({ error: '该等级不支持直接购买' });
      const settings = member.getSettings(req.customerId);
      if (!settings.card_enabled) return res.status(400).json({ error: '会员卡未启用' });
      const payment = new PaymentService(db);
      const order = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'card',
        productType: 'member_card',
        productId: String(level.id),
        productName: level.name || `会员${level.level_no}级`,
        amount: level.buy_price,
        channel: req.body.channel || 'wechat',
        remark: '购买会员卡',
      });
      res.json({ orderNo: order.orderNo, amount: order.amount, level });
    } catch (e) {
      res.status(400).json({ error: e.message || '下单失败' });
    }
  });

  // ============================================================
  // 商品订单（二期-A：C 端下单 → 支付单 → 分销分账/扣库存/通知由支付成功链路处理）
  // ============================================================

  // 我的订单列表（C 端）
  router.get('/goods/orders', auth, (req, res) => {
    try {
      if (!req.customerId) return res.json({ list: [] });
      const svc = createGoodsOrderService(db);
      const { status = '', page = 1, pageSize = 10 } = req.query;
      const result = svc.listOrders({ customerId: req.customerId, status, keyword: '', page: Number(page), pageSize: Number(pageSize) });
      // C 端仅返回当前用户订单
      const list = (result.list || []).filter((o) => o.user_id === req.user.id);
      res.json({ list, total: list.length });
    } catch (e) {
      res.status(400).json({ error: e.message || '查询失败' });
    }
  });

  // 申请售后（1:1 复刻菜鸟云：仅退款/退货退款，已支付订单可申请，同单唯一）
  router.post('/goods/orders/:id/after-sale', auth, requireTenant, (req, res) => {
    try {
      const svc = createGoodsOrderService(db);
      const row = svc.createAfterSale({
        customerId: req.customerId, orderId: req.params.id, userId: req.user.id,
        type: req.body.type, reason: req.body.reason,
      });
      res.json(row);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // 下单：建业务单 + 支付单，返回支付所需信息
  router.post('/goods/order', auth, requireTenant, (req, res) => {
    try {
      const { items, deliveryMode = 'express', receiverName = '', receiverPhone = '', receiverAddress = '', remark = '' } = req.body || {};
      const svc = createGoodsOrderService(db);
      const order = svc.createOrder({
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        items, deliveryMode, receiverName, receiverPhone, receiverAddress, remark,
      });
      const payment = new PaymentService(db);
      const payOrder = payment.createOrder({
        payerType: 'tenant',
        customerId: req.customerId,
        userId: req.user.id,
        identityType: req.user.identity_type || 'individual',
        solution: 'goods',
        productType: 'goods',
        productId: String(order.id),
        productName: `商品订单#${order.orderNo}`,
        amount: order.pay_amount,
        channel: req.body?.channel || 'wechat',
        remark: `GO_${order.orderNo}`,
      });
      res.json({ orderNo: order.order_no, payOrderNo: payOrder.orderNo, amount: order.pay_amount, id: order.id });
    } catch (e) {
      res.status(400).json({ error: e.message || '下单失败' });
    }
  });

  // ============================================================
  // 分销（租户维度 dist_* 表；未入驻租户返回空态，不再读老 distribution_commission）
  // ============================================================

  // 扫码静默溯源绑定（首次进入租户绑定，永久锁定，不弹窗）
  router.post('/distribution/bind', auth, requireTenant, (req, res) => {
    const { parentId, identityType } = req.body;
    if (!parentId) return res.json({ ok: true, message: '无绑定来源' });
    const idt = identityType || req.user.identity_type || 'individual';
    const result = distribution.bindRelation(req.customerId, req.user.id, idt, Number(parentId), 'qrcode');
    if (!result.ok) return res.json({ ok: false, error: result.error });
    res.json({ ok: true, relation: result.relation });
  });

  // 分销漏斗埋点：share（登录用户主动分享）/ view（带邀请链接访问，可未登录，按访客去重）
  router.post('/distribution/funnel', (req, res) => {
    try {
      const { eventType, inviter, visitorKey } = req.body || {};
      if (eventType === 'share') {
        if (!req.user || !req.user.id) return res.json({ ok: false, error: '未登录' });
        const tenantId = req.customerId || (() => { const u = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(req.user.id); return u ? u.customer_id : 0; })();
        if (!tenantId) return res.json({ ok: false, error: '未入驻租户' });
        distribution.trackFunnel(tenantId, req.user.id, 'share', '');
        return res.json({ ok: true });
      }
      if (eventType === 'view') {
        const pid = Number(inviter || 0);
        const vk = String(visitorKey || '').slice(0, 64);
        if (!pid || !vk) return res.json({ ok: false, error: '缺少邀请人或访客标识' });
        const inv = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(pid);
        if (!inv || !inv.customer_id) return res.json({ ok: false, error: '邀请人不存在' });
        distribution.trackFunnel(inv.customer_id, pid, 'view', vk);
        return res.json({ ok: true });
      }
      res.json({ ok: false, error: '未知事件类型' });
    } catch (e) {
      res.json({ ok: false, error: '埋点失败' });
    }
  });

  // 我的名片小程序码（2026-10-21 用户需求：二维码/链接 → 可生成单独的小程序码供下载印刷）
  // 优先取当前租户已授权小程序的真·小程序码（scene 携带名片 id，扫码直达该名片详情）；
  // 租户未授权小程序 / 小程序码生成失败（如页面未发布）时降级返回 H5 名片页二维码。
  router.get('/wxacode', auth, async (req, res) => {
    try {
      const cardId = Number(req.query.cardId || 0);
      if (!cardId) return res.status(400).json({ error: '缺少 cardId' });
      const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const h5Url = `${proto}://${host}/card/#/pages/card/cardDetail?id=${cardId}`;
      const fallback = async () => {
        const QRCode = (await import('qrcode')).default;
        const image = await QRCode.toDataURL(h5Url, { margin: 1, width: 600, errorCorrectionLevel: 'M' });
        return { ok: true, type: 'h5', image, url: h5Url };
      };
      // 找当前租户的小程序渠道（SaaS：每客户一小程序，customer_id 挂 channel_apps）
      let channel = null;
      try {
        channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mini' AND auth_status = 'authorized' ORDER BY id DESC LIMIT 1").get(req.customerId || 0);
      } catch (e) {}
      if (channel && wxService) {
        try {
          const envVersion = channel.audit_status === 'released' ? 'release' : 'trial';
          const buf = await wxService.getWxacode(channel.id, `id=${cardId}`, 'pages/card/cardDetail', envVersion);
          return res.json({ ok: true, type: 'wxacode', image: `data:image/png;base64,${buf.toString('base64')}` });
        } catch (e) {
          // 小程序码失败（未发布/未配置等）→ 降级 H5 二维码，绝不让用户拿到空结果
        }
      }
      res.json(await fallback());
    } catch (e) {
      res.status(500).json({ error: '二维码生成失败' });
    }
  });

  // 我的推广二维码（PRD：名片ID + 租户归属，扫码跳名片自动绑定上下级）
  router.get('/distribution/qrcode', auth, async (req, res) => {
    try {
      if (!req.customerId) return res.json({ ok: false, error: '未入驻任何租户，暂无法生成推广码' });
      const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const shareUrl = buildShareUrl(req.user.id, `${proto}://${host}`);
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
      res.json({ ok: true, qrDataUrl, shareUrl, inviterId: req.user.id });
    } catch (e) {
      res.status(500).json({ error: '二维码生成失败' });
    }
  });

  // 我的分销中心汇总（钱包三键隔离 + 直推/间推 + 本月佣金 + 分销商申请状态 + 基本设置/关系设置透传）
  router.get('/distribution/summary', auth, (req, res) => {
    if (!req.customerId) return res.json({ wallet: null, directCount: 0, indirectCount: 0, monthCommission: 0, monthNew: 0, todayCommission: 0, todayOrder: 0, todayNew: 0, totalCommission: 0, totalOrders: 0, withdrawing: 0, isEnableDist: false, isEnablePartner: false, isEnableShareAll: false, isEnableShareCat: false, isEnableShareArea: false, unbound: true, isPartner: false, shareTags: [], partnerPending: 0, partnerTotal: 0, sharePending: 0, shareTotal: 0, shareAllPending: 0, shareAllTotal: 0, shareCatPending: 0, shareCatTotal: 0, shareAreaPending: 0, shareAreaTotal: 0, shareCatGroups: [], shareAreaGroups: [], currentLevelName: '默认等级', currentLevelNo: 1, nextLevel: null, levels: [], subTmplReview: '', subTmplDone: '', gate: 0, applyStatus: null, canApply: false, distName: '推广员', subName: '下级', bindRule: 0, becomeRule: 0, becomeAmount: 0, becomeProducts: '', applyTopImg: '', promoteImg: '', applyTip: '', shareTitle: '', shareImg: '', applyAgreement: '', distNotice: '', posterBadge: true, zeroOrder: false, showParent: false, showPhone: false, defaultLevel: '默认等级', parent: null, posterTemplates: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const s = distribution.getSummary(req.customerId, req.user.id, idt);
    const apply = distribution.getApplyStatus(req.customerId, req.user.id, idt);
    res.json({
      wallet: {
        waitSettle: s.wallet.wait_settle,
        available: s.wallet.available,
        totalIncome: s.wallet.total_income,
        totalWithdraw: s.wallet.total_withdraw,
      },
      directCount: s.directCount,
      indirectCount: s.indirectCount,
      monthCommission: s.monthCommission,
      monthNew: s.monthNew,
      todayCommission: s.todayCommission || 0,
      todayOrder: s.todayOrder || 0,
      todayNew: s.todayNew || 0,
      totalCommission: s.totalCommission || 0,
      totalOrders: s.totalOrders || 0,
      withdrawing: s.withdrawing || 0,
      isEnableDist: !!s.isEnableDist,
      isEnablePartner: !!s.isEnablePartner,
      isEnableShareAll: !!s.isEnableShareAll,
      isEnableShareCat: !!s.isEnableShareCat,
      isEnableShareArea: !!s.isEnableShareArea,
      selfName: s.selfName || '我',
      selfAvatar: s.selfAvatar || '',
      isPartner: s.isPartner,
      partnerMode: s.partnerMode || 0,
      shareTags: s.shareTags,
      partnerPending: s.partnerPending,
      partnerTotal: s.partnerTotal,
      sharePending: s.sharePending,
      shareTotal: s.shareTotal,
      shareAllPending: s.shareAllPending,
      shareAllTotal: s.shareAllTotal,
      shareCatPending: s.shareCatPending,
      shareCatTotal: s.shareCatTotal,
      shareAreaPending: s.shareAreaPending,
      shareAreaTotal: s.shareAreaTotal,
      shareCatGroups: s.shareCatGroups || [],
      shareAreaGroups: s.shareAreaGroups || [],
      currentLevelName: s.currentLevelName || '默认等级',
      currentLevelNo: s.currentLevelNo || 1,
      nextLevel: s.nextLevel || null,
      levels: s.levels || [],
      subTmplReview: s.subTmplReview || '',
      subTmplDone: s.subTmplDone || '',
      posterTemplates: s.posterTemplates || [],
      // 分销商申请链路：gate 门槛（become_rule）/ 是否可申请 / 最新申请状态
      gate: apply.gate,
      inWhitelist: apply.inWhitelist,
      canApply: apply.canApply,
      applyStatus: apply.applyStatus,
      rejectReason: apply.rejectReason,
      // 基本设置 / 分销参数 / 关系设置 / 分享设置 / 协议与须知
      distName: s.distName, subName: s.subName,
      applyTopImg: s.applyTopImg, promoteImg: s.promoteImg, applyTip: s.applyTip,
      zeroOrder: s.zeroOrder, showParent: s.showParent, showPhone: s.showPhone, defaultLevel: s.defaultLevel,
      bindRule: s.bindRule, becomeRule: s.becomeRule, becomeAmount: s.becomeAmount, becomeProducts: s.becomeProducts,
      shareTitle: s.shareTitle, shareImg: s.shareImg,
      applyAgreement: s.applyAgreement, distNotice: s.distNotice,
      posterBadge: s.posterBadge !== undefined ? s.posterBadge : true,
      withdrawMin: s.withdrawMin || 0,
      withdrawFeeRate: s.withdrawFeeRate || 0,
      parent: s.parent,
    });
  });

  // 申请成为分销商（门槛=2 指定名单时开放）
  router.post('/distribution/apply', auth, requireTenant, (req, res) => {
    const idt = req.body.identityType || req.user.identity_type || 'individual';
    res.json(distribution.applyDistributor(req.customerId, req.user.id, idt));
  });

  // 合伙人「团队流水」：团队成员付费订单明细
  router.get('/distribution/team-orders', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { page = 1, pageSize = 20 } = req.query;
    res.json(distribution.getTeamOrders(req.customerId, req.user.id, idt, { page: Number(page), pageSize: Number(pageSize) }));
  });

  // 我的下级客户列表（直推 level=1 / 间推 level=2）
  router.get('/distribution/subs', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { level = 1, page = 1, pageSize = 20 } = req.query;
    res.json(distribution.getSubs(req.customerId, req.user.id, idt, { level: Number(level), page: Number(page), pageSize: Number(pageSize) }));
  });

  // 收益明细（type 过滤：level1/level2/partner/share_all/share_cat/share_area）
  router.get('/distribution/logs', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { page = 1, pageSize = 20, type = '' } = req.query;
    const r = distribution.getLogs(req.customerId, req.user.id, idt, { page: Number(page), pageSize: Number(pageSize), type });
    res.json(r);
  });

  // 钱包
  router.get('/distribution/wallet', auth, (req, res) => {
    if (!req.customerId) return res.json(null);
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const w = distribution.getWallet(req.customerId, req.user.id, idt);
    res.json({ waitSettle: w.wait_settle, available: w.available, totalIncome: w.total_income, totalWithdraw: w.total_withdraw });
  });

  // 申请提现
  router.post('/distribution/withdraw', auth, requireTenant, (req, res) => {
    const { amount, identityType, payAccount } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: '提现金额无效' });
    const idt = identityType || req.user.identity_type || 'individual';
    const r = distribution.applyWithdraw(req.customerId, req.user.id, idt, Number(amount), payAccount || '');
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true, withdrawNo: r.withdrawNo });
  });

  // 提现记录
  router.get('/distribution/withdraws', auth, (req, res) => {
    if (!req.customerId) return res.json({ total: 0, list: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    const { page = 1, pageSize = 20, status = '' } = req.query;
    res.json(distribution.getWithdraws(req.customerId, req.user.id, idt, { page: Number(page), pageSize: Number(pageSize), status }));
  });

  // 我的下级列表（直推/间推）
  router.get('/distribution/team', auth, (req, res) => {
    if (!req.customerId) return res.json({ firstLevel: [], secondLevel: [] });
    const idt = req.query.identityType || req.user.identity_type || 'individual';
    // 合伙人「我的团队」：沿 pid1 递归收集全部团队成员（BFS，防环）
    if (req.query.scope === 'all') {
      return res.json(distribution.buildTeam(req.customerId, req.user.id, idt));
    }
    const firstLevel = db.prepare(
      'SELECT r.user_id as id, u.nickname, u.avatar, r.bind_time as createdAt FROM dist_user_relation r LEFT JOIN platform_user u ON u.id = r.user_id WHERE r.tenant_id = ? AND r.pid1 = ? AND r.identity_type = ? ORDER BY r.id DESC'
    ).all(req.customerId, req.user.id, idt);
    const secondLevel = db.prepare(
      'SELECT r.user_id as id, u.nickname, u.avatar, r.bind_time as createdAt FROM dist_user_relation r LEFT JOIN platform_user u ON u.id = r.user_id WHERE r.tenant_id = ? AND r.pid2 = ? AND r.identity_type = ? ORDER BY r.id DESC'
    ).all(req.customerId, req.user.id, idt);
    res.json({
      firstLevel: firstLevel.map(u => ({ id: u.id, nickname: u.nickname || '微信用户', avatar: u.avatar, createdAt: u.createdAt })),
      secondLevel: secondLevel.map(u => ({ id: u.id, nickname: u.nickname || '微信用户', avatar: u.avatar, createdAt: u.createdAt })),
    });
  });

  // ============================================================
  // 动态
  // ============================================================
  router.get('/dynamics', auth, (req, res) => {
    const dynamics = db.prepare('SELECT * FROM card_dynamic WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
    res.json({ dynamics: dynamics.map(toDynamic) });
  });

  router.post('/dynamics', auth, (req, res) => {
    const { content, images, visibility, title, cardId } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    // 🔴 反馈 #295：原实现 `cardId || null` → card_id=NULL，而名片页公开动态列表按
    //    `card_id = ? AND visibility='public'` 过滤 → 公开动态永远不上名片页（发了没人看）。
    //    现在未显式指定 cardId 时，自动挂到该用户名下**最近创建的名片**上。
    let targetCardId = cardId ? Number(cardId) : null;
    if (!targetCardId) {
      const own = db.prepare('SELECT id FROM card_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      targetCardId = own ? own.id : null;
    }
    // 可见范围归一：只认 'private'，其余一律 'public'（与 toDynamic 的兜底一致）
    const vis = visibility === 'private' ? 'private' : 'public';
    const imgList = Array.isArray(images) ? images.filter((u) => typeof u === 'string' && u).slice(0, 9) : [];
    const result = db.prepare('INSERT INTO card_dynamic (user_id, card_id, title, content, images, visibility) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, targetCardId, title || '', content, JSON.stringify(imgList), vis);
    const dynamic = db.prepare(`SELECT d.*, u.nickname, u.avatar FROM card_dynamic d
      LEFT JOIN platform_user u ON d.user_id = u.id WHERE d.id = ?`).get(result.lastInsertRowid);
    res.json({ dynamic: toDynamic(dynamic) });
  });

  // ============ 动态点赞/取消点赞 ============
  router.post('/dynamics/:id/like', auth, (req, res) => {
    const dyn = db.prepare("SELECT * FROM card_dynamic WHERE id = ? AND status = 'active'").get(req.params.id);
    if (!dyn) return res.status(404).json({ error: '动态不存在' });
    const exist = db.prepare('SELECT id FROM card_dynamic_like WHERE dynamic_id = ? AND user_id = ?').get(dyn.id, req.user.id);
    if (exist) {
      db.prepare('DELETE FROM card_dynamic_like WHERE id = ?').run(exist.id);
      db.prepare('UPDATE card_dynamic SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(dyn.id);
      return res.json({ liked: false, likeCount: Math.max(0, (dyn.like_count || 0) - 1) });
    }
    db.prepare('INSERT INTO card_dynamic_like (dynamic_id, user_id) VALUES (?, ?)').run(dyn.id, req.user.id);
    db.prepare('UPDATE card_dynamic SET like_count = like_count + 1 WHERE id = ?').run(dyn.id);
    res.json({ liked: true, likeCount: (dyn.like_count || 0) + 1 });
  });

  // ============ 动态评论 ============
  router.post('/dynamics/:id/comments', auth, (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
    const dyn = db.prepare("SELECT * FROM card_dynamic WHERE id = ? AND status = 'active'").get(req.params.id);
    if (!dyn) return res.status(404).json({ error: '动态不存在' });
    const r = db.prepare('INSERT INTO card_dynamic_comment (dynamic_id, user_id, content) VALUES (?, ?, ?)')
      .run(dyn.id, req.user.id, content.trim().slice(0, 200));
    db.prepare('UPDATE card_dynamic SET comment_count = comment_count + 1 WHERE id = ?').run(dyn.id);
    const c = db.prepare(`SELECT c.*, u.nickname, u.avatar FROM card_dynamic_comment c
      LEFT JOIN platform_user u ON c.user_id = u.id WHERE c.id = ?`).get(r.lastInsertRowid);
    res.json({ comment: { id: c.id, dynamicId: c.dynamic_id, userId: c.user_id, nickname: c.nickname || '访客', avatar: c.avatar || '', content: c.content, createdAt: c.created_at } });
  });

  // 动态评论列表（公开只读）
  router.get('/dynamics/:id/comments', (req, res) => {
    const rows = db.prepare(`SELECT c.*, u.nickname, u.avatar FROM card_dynamic_comment c
      LEFT JOIN platform_user u ON c.user_id = u.id
      WHERE c.dynamic_id = ? AND c.status = 'active' ORDER BY c.created_at ASC LIMIT 50`).all(req.params.id);
    res.json({ comments: rows.map((c) => ({ id: c.id, dynamicId: c.dynamic_id, userId: c.user_id, nickname: c.nickname || '访客', avatar: c.avatar || '', content: c.content, createdAt: c.created_at })) });
  });

  // ============================================================
  // 名片自定义装修组件（2026-10-20 V1：个人名片组件装修）
  //   数据 card_components：source='user' 归属人自建（PUT 整存）；
  //   source='master' 租户母版（card_id=0 + customer_id），只读注入实现「企业母版锁定」。
  //   type/props 与 web-admin componentRegistry 对齐；母版 PC 管理页在 V1.1。
  // ============================================================
  const COMP_TYPES = ['image', 'channel-video', 'notice', 'divider', 'spacer', 'button', 'rich-text', 'button-group'];
  const COMP_MAX = 20;
  const compProps = (raw) => { try { const p = JSON.parse(raw); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };

  // 组件列表（公开读：名片详情页渲染；母版 isLock 在前，个人组件随后）
  router.get('/cards/:id/components', (req, res) => {
    try {
      const card = db.prepare('SELECT id, customer_id FROM card_profile WHERE id = ?').get(req.params.id);
      if (!card) return res.status(404).json({ error: '名片不存在' });
      const master = card.customer_id
        ? db.prepare(`SELECT * FROM card_components WHERE customer_id = ? AND source = 'master' AND status = 'active'
            ORDER BY sort_order ASC, id ASC`).all(card.customer_id)
        : [];
      const own = db.prepare(`SELECT * FROM card_components WHERE card_id = ? AND source = 'user' AND status = 'active'
          ORDER BY sort_order ASC, id ASC`).all(card.id);
      const dto = (row, isLock) => ({
        id: row.id, cardId: row.card_id, type: row.type,
        props: compProps(row.props), sortOrder: row.sort_order, isLock,
      });
      res.json({ components: [...master.map((m) => dto(m, true)), ...own.map((o) => dto(o, false))] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 整存个人组件（仅归属人）：body { components:[{type, props}] }，数组顺序即展示顺序。
  // 服务端强制：type 白名单 + 剥离 source/isLock/cardId/customerId（防伪造母版）+ 数量上限。
  router.put('/cards/:id/components', auth, (req, res) => {
    try {
      const card = db.prepare('SELECT id, customer_id FROM card_profile WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!card) return res.status(404).json({ error: '名片不存在或无权操作' });
      const list = Array.isArray(req.body && req.body.components) ? req.body.components : null;
      if (!list) return res.status(400).json({ error: 'components 必须为数组' });
      if (list.length > COMP_MAX) return res.status(400).json({ error: `自定义组件最多 ${COMP_MAX} 个` });
      const clean = [];
      for (const c of list) {
        const type = String((c && c.type) || '');
        if (!COMP_TYPES.includes(type)) return res.status(400).json({ error: `不支持的组件类型: ${type}` });
        const props = c && c.props && typeof c.props === 'object' ? c.props : {};
        clean.push({ type, props: JSON.stringify(props).slice(0, 20000) });
      }
      // 整存：先删后插（本项目不用显式事务，SQLite 逐句自动提交，与 card_works 等同风格）；
      // 个人名片单编辑场景，中途失败概率极低，真失败用户再存一次即自愈
      db.prepare(`DELETE FROM card_components WHERE card_id = ? AND source = 'user'`).run(card.id);
      const ins = db.prepare(`INSERT INTO card_components (card_id, customer_id, type, props, sort_order, source)
        VALUES (?, ?, ?, ?, ?, 'user')`);
      clean.forEach((c, i) => ins.run(card.id, card.customer_id ?? null, c.type, c.props, i + 1));
      res.json({ ok: true, count: clean.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // 工具函数
  // ============================================================
  function toUser(row) {
    if (!row) return null;
    return {
      id: row.id, openid: row.openid, nickname: row.nickname, avatar: row.avatar,
      phone: row.phone || '', memberLevel: row.member_level, memberExpireAt: row.member_expire_at,
      enterpriseId: row.enterprise_id, enterpriseRole: row.enterprise_role,
      parentId: row.parent_id, status: row.status, createdAt: row.created_at,
    };
  }

  // 品牌 5 色键名映射：projects.config 键 → toCard 出口键（与设计中心 STYLE_SCHEMES 语义对应）
  const BRAND_KEYS = [
    { cfg: 'brand_color', out: 'primary' },
    { cfg: 'brand_gradient', out: 'gradient' },
    { cfg: 'brand_secondary', out: 'secondary' },
    { cfg: 'brand_text', out: 'text' },
    { cfg: 'brand_subtext', out: 'subText' },
  ];

  function toCard(row) {
    if (!row) return null;
    let ownerMemberLevel = 'free';
    if (row.owner_member_level !== undefined) ownerMemberLevel = row.owner_member_level || 'free';
    // 名片主人的会员能力开关（视频号主页入口等）。
    // 🔴 单一裁决口径：与 radarMember() 一致（非 free 且未过期），且在服务端算成布尔下发。
    //    C 端只消费 ownerIsVip，不许自己判过期——date 解析跨端不等价（SQLite 空格分隔的
    //    'YYYY-MM-DD HH:MM:SS' 在 MP 端 new Date() 会 Invalid Date）。
    const ownerIsVip =
      ownerMemberLevel !== 'free' &&
      !!row.owner_member_expire_at &&
      new Date(String(row.owner_member_expire_at).replace(' ', 'T')) > new Date();
    // 租户品牌 5 色（projects.config：brand_color 主色 + gradient/secondary/text/subText），
    // 语义与设计中心系统风格「主题/渐变/辅助/文字/文字辅」一一对应；未配置='' 由 C 端回落
    let brandColors = { primary: '', gradient: '', secondary: '', text: '', subText: '' };
    if (row.tenant_config) {
      try {
        const cfg = JSON.parse(row.tenant_config);
        BRAND_KEYS.forEach((k) => { brandColors[k.out] = String(cfg[k.cfg] || '').trim(); });
      } catch {}
    }
    const brandColor = brandColors.primary;
    // 模板主题（card_templates.theme_config）
    let templateTheme = null;
    if (row.template_theme) {
      try { templateTheme = JSON.parse(row.template_theme); } catch {}
    }
    // 模板已删/无效时回退平台默认模板（is_default=1），保证旧名片不落入空白默认。
    // 🔴 但租户配了品牌主色时兜底模板必须让位：否则默认模板 theme 恒非空，
    // C 端 heroStyle「模板优先」分支永远命中，品牌主色设了也不显示（死代码 bug）。
    // 分层：自选模板 > 品牌主色 > 兜底模板 > 装修中心主题色。
    if (!templateTheme && !brandColor) {
      try {
        const def = db.prepare('SELECT theme_config FROM card_templates WHERE tenant_id = 0 AND is_default = 1 AND enabled = 1 LIMIT 1').get();
        if (def && def.theme_config) templateTheme = JSON.parse(def.theme_config);
      } catch {}
    }
    // 多公司（JSON 数组: [{name, position}]）
    let companies = [];
    if (row.companies) {
      try { const p = JSON.parse(row.companies); if (Array.isArray(p)) companies = p; } catch {}
    }
    return {
      id: row.id, userId: row.user_id, enterpriseId: row.enterprise_id, cardType: row.card_type,
      name: row.name, position: row.position, city: row.city, phone: row.phone, wechat: row.wechat, email: row.email,
      company: row.company, companies, bio: row.bio, businessField: row.business_field, industry: row.industry || '', avatar: row.avatar,
      slogan: row.slogan || '', tags: row.tags || '', needTags: row.need_tags || '',
      templateId: row.template_id, templateTheme, templateLayout: row.template_layout || 'card', videoChannel: row.video_channel, isPublic: !!row.is_public,
      worksLabel: row.works_label || '',
      // 个性化分享设置（转发封面风格 + 自定义标题）
      // 🔴 share_style 必须在此归一：库里可能是历史空串/脏值，C 端不该拿到非法 key
      //    （画不出对应封面 → 转发图空白）。非法值一律回落 'cover-1'。
      shareStyle: SHARE_STYLES.includes(row.share_style) ? row.share_style : 'cover-1',
      shareTitle: String(row.share_title || '').slice(0, 30),
      collectCount: row.collectCount || 0, recentVisitors: row.recentVisitors || [],
      voiceUrl: row.voice_url || '', voiceName: row.voice_name || '',
      viewCount: row.view_count, exchangeCount: row.exchange_count, status: row.status,
      ownerMemberLevel,
      ownerIsVip,
      brandColor,
      brandColors,
      // 位置（「导航」唤起系统地图用）：latitude/longitude 为 0 表示主人没选过位置，
      // C 端据此走「复制地址」降级；保留 city/company 作为兜底地址文案。
      latitude: Number(row.latitude) || 0,
      longitude: Number(row.longitude) || 0,
      address: row.address || '',
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function toDynamic(row, likedByMe = false) {
    if (!row) return null;
    let images = [];
    try { images = JSON.parse(row.images || '[]'); } catch {}
    return {
      likedByMe: !!likedByMe,
      id: row.id, userId: row.user_id, cardId: row.card_id, title: row.title || '',
      content: row.content, images, likeCount: row.like_count || 0, commentCount: row.comment_count || 0,
      // 🔴 反馈 #295：visibility 之前**漏在这里** → 序列化出口恒无该字段 →
      //    前端 `d.visibility === 'public' ? '公开' : '仅自己'` 判据恒走「仅自己」，
      //    即使用户在发布弹窗选了「公开」。这是「选公开却显示仅自己」的根因。
      //    兜底 'public'：库里默认就是 public，老数据 visibility 为空也应显示「公开」。
      visibility: row.visibility === 'private' ? 'private' : 'public',
      authorName: row.nickname || '', authorAvatar: row.avatar || '',
      createdAt: row.created_at,
    };
  }

  function toVisitor(row) {
    if (!row) return null;
    return {
      id: row.id, cardId: row.card_id, visitorOpenid: row.visitor_openid, visitDate: row.visit_date,
      visitCount: row.visit_count, duration: row.duration, lastVisitAt: row.last_visit_at,
    };
  }

  function toCustomer(row) {
    if (!row) return null;
    return {
      id: row.id, ownerUserId: row.owner_user_id, enterpriseId: row.enterprise_id,
      name: row.name, phone: row.phone, wechat: row.wechat, company: row.company,
      tags: JSON.parse(row.tags || '[]'), source: row.source, status: row.status,
      lastFollowAt: row.last_follow_at, nextFollowAt: row.next_follow_at,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  function toVisitorAction(row) {
    if (!row) return null;
    return {
      id: row.id, cardId: row.card_id, visitorOpenid: row.visitor_openid,
      actionType: row.action_type, actionDetail: row.action_detail, duration: row.duration, createdAt: row.created_at,
    };
  }

  function toFollow(row) {
    if (!row) return null;
    return {
      id: row.id, customerId: row.customer_id, userId: row.user_id,
      content: row.content, nextFollowAt: row.next_follow_at, createdAt: row.created_at,
    };
  }

  // 全景热点表单留资（公开）：sceneId 反查租户，沉淀为客户线索
  router.post('/panorama/leads', (req, res) => {
    try {
      const { sceneId, hotspotTitle, fields = {} } = req.body || {};
      if (!sceneId) return res.status(400).json({ error: 'sceneId 必填' });
      const scene = db.prepare('SELECT id, plan_id FROM scenes WHERE id = ?').get(Number(sceneId));
      if (!scene) return res.status(404).json({ error: '场景不存在' });
      const plan = db.prepare('SELECT id, project_id FROM plans WHERE id = ?').get(scene.plan_id);
      if (!plan) return res.status(404).json({ error: '方案不存在' });
      const name = String(fields.name || '').trim().slice(0, 64);
      const phone = String(fields.phone || '').trim().slice(0, 32);
      const message = String(fields.message || '').trim().slice(0, 500);
      if (!name && !phone && !message) return res.status(400).json({ error: '请至少填写一项内容' });
      // 自定义字段（除 name/phone/message 外的键）存入 extra
      const extra = {};
      for (const [k, v] of Object.entries(fields)) {
        if (!['name', 'phone', 'message'].includes(k) && v !== undefined && v !== null && v !== '') extra[k] = String(v).slice(0, 200);
      }
      db.prepare(
        `INSERT INTO panorama_leads (tenant_id, plan_id, scene_id, hotspot_title, name, phone, message, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        plan.project_id || 0,
        plan.id,
        scene.id,
        String(hotspotTitle || '').slice(0, 128),
        name,
        phone,
        message,
        JSON.stringify(extra)
      );
      res.json({ ok: true, message: '提交成功，我们会尽快与您联系' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 设计中心万能表单提交（访客留资，归集 design_leads）
  router.post('/design/leads', (req, res) => {
    try {
      const { tenantId, formTitle, fields = [] } = req.body || {};
      if (!tenantId) return res.status(400).json({ error: '租户参数缺失' });
      const tenant = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(tenantId));
      if (!tenant) return res.status(404).json({ error: '租户不存在' });
      if (!Array.isArray(fields) || !fields.length) return res.status(400).json({ error: '表单内容为空' });
      if (fields.length > 50) return res.status(400).json({ error: '表单项过多' });
      const list = fields.slice(0, 50).map((f) => ({
        label: String(f.label || '').trim().slice(0, 64),
        value: String(f.value ?? '').trim().slice(0, 500),
      })).filter((f) => f.label && f.value);
      if (!list.length) return res.status(400).json({ error: '请至少填写一项内容' });
      db.prepare(
        `INSERT INTO design_leads (tenant_id, page_type, form_title, fields)
         VALUES (?, 'home', ?, ?)`
      ).run(
        Number(tenantId),
        String(formTitle || '留资表单').slice(0, 128),
        JSON.stringify(list)
      );
      res.json({ ok: true, message: '提交成功，我们会尽快与您联系' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 行为埋点（第三批）
  // 游客事件：cardId 反查租户；登录事件：使用用户绑定的租户
  // ============================================================
  router.post('/analytics/events', (req, res) => {
    try {
      const { events = [] } = req.body || {};
      if (!Array.isArray(events) || !events.length) return res.json({ ok: true, written: 0 });

      // 可选认证：兼容三类 token 解析租户
      //  - 客户后台 token（auth.js）：payload { uid(users.id), customerId }
      //  - C端 token（multi-auth.js）：payload { id(platform_user.id) }
      //  - 游客：无 token / 解析失败 → 走 cardId 反查
      let tenantId = 0;
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          if (payload.customerId) {
            tenantId = payload.customerId;
          } else if (payload.uid != null) {
            const cu = db.prepare('SELECT customer_id FROM users WHERE id = ?').get(payload.uid);
            if (cu && cu.customer_id) tenantId = cu.customer_id;
          }
          if (!tenantId && payload.id != null) {
            const u = db.prepare('SELECT customer_id FROM platform_user WHERE id = ?').get(payload.id);
            if (u) tenantId = u.customer_id || 0;
          }
        } catch { /* 无效 token 忽略，走游客逻辑 */ }
      }
      const anyCard = events.find((e) => e.cardId);
      if (!tenantId && anyCard) {
        const owner = db.prepare(
          'SELECT u.customer_id FROM card_profile cp JOIN platform_user u ON cp.user_id = u.id WHERE cp.id = ?'
        ).get(Number(anyCard.cardId));
        if (owner) tenantId = owner.customer_id || 0;
      }
      // 全景游客事件：sceneId → scenes → plans → project_id 反查租户
      const anyScene = events.find((e) => e.sceneId);
      if (!tenantId && anyScene) {
        const owner = db.prepare(
          'SELECT p.project_id AS cid FROM scenes sc JOIN plans p ON sc.plan_id = p.id WHERE sc.id = ?'
        ).get(Number(anyScene.sceneId));
        if (owner) tenantId = owner.cid || 0;
      }
      // solution 白名单：card（名片）/ panorama（全景），默认 card
      const solution = ['card', 'panorama'].includes(req.body?.solution) ? req.body.solution : 'card';
      const result = trackEvents(db, tenantId, solution, events);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 设计中心：C 端读取租户发布配置（最新风格/底部导航/首页跳转，供小程序/H5 按配置渲染）
  router.get('/design/config', authOptional, (req, res) => {
    // 装修配置实时性要求高（导航方案/页面内容改后须立即生效）：禁止 HTTP 层缓存（浏览器启发式缓存会导致改方案后仍显示旧导航）
    res.setHeader('Cache-Control', 'no-store');
    // 租户上下文：正常登录态优先；否则校验设计中心预览签名（免登录）
    const previewTid = req.customerId ? 0 : verifyPreviewSig(req.query);
    // 公开浏览：未登录时支持 ?tid= 数字指定租户（装修配置为公开内容，供商城/全景等公开首页渲染）
    const pubTid = Number(req.query.tid) || 0;
    // 登录但无租户归属（customerId=0）、且无签名/显式租户时，回退部署默认租户读取公开装修配置
    // （小程序登录用户常无 customer_id，若直用 0 会读到平台级空配置，与装修中心内容不一致）
    const effectiveTenant = req.customerId || previewTid || pubTid || Number(config.defaultTenantId) || 0;
    if (!req.customerId && !previewTid && !pubTid && !Number(config.defaultTenantId)) return res.status(401).json({ error: '未登录' });
    const tenantId = effectiveTenant;
    const style = db.prepare('SELECT style_json FROM tenant_style_config WHERE tenant_id = ?').get(tenantId);
    let tab = null; // 底部导航方案：由装修页面设置 meta.nav 决定（default/custom/none）
    const home = db.prepare('SELECT home_page, home_pages FROM tenant_home_config WHERE tenant_id = ?').get(tenantId);
    let homePages = {};
    if (home) {
      try { homePages = JSON.parse(home.home_pages || '{}'); } catch { homePages = {}; }
      // 兼容旧字段：home_pages 未含 card 时以 home_page 兜底（'card' 表示不跳转，展示 DIY 装修首页）
      if (!homePages.card && home.home_page && home.home_page !== 'card') homePages.card = home.home_page;
    }
    // 预览模式（?preview=1）：额外返回首页草稿页面组件，供 C 端「保存并预览」；
    // 首页跳转选择器支持指定 DIY 装修页面（?pageType=xxx）：读取该 page_type 的已发布页面（未发布回退草稿），
    // 与菜鸟云「首页跳转可选 DIY 页面」语义一致；未指定时按 card 应用语义取页：
    // ① home_pages.card 指向的 pageType → ② 无则预置 page_type='home'（智能名片默认首页）→ ③ 兜底 is_home=1。
    // 说明：panorama/index 同接口调用只读 homePages 不使用 pages 字段，因此无 pageType 统一走 card 语义不产生跨应用干扰
    const reqPageType = String(req.query.pageType || '').trim();
    let pages = null;
    let header = null;
    const pickPage = (status) => {
      let q;
      let args;
      if (reqPageType) {
        q = 'SELECT design_json FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = ? ORDER BY version DESC LIMIT 1';
        args = [tenantId, reqPageType, status];
      } else {
        const cm = String(homePages.card || '').match(/pageType=([^&]+)/);
        const target = cm ? cm[1] : 'home';
        const exists = db.prepare('SELECT 1 FROM tenant_page_design WHERE tenant_id = ? AND page_type = ?').get(tenantId, target);
        if (exists) {
          q = 'SELECT design_json FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = ? ORDER BY version DESC LIMIT 1';
          args = [tenantId, target, status];
        } else {
          q = 'SELECT design_json FROM tenant_page_design WHERE tenant_id = ? AND is_home = 1 AND status = ? ORDER BY version DESC LIMIT 1';
          args = [tenantId, status];
        }
      }
      return db.prepare(q).get(...args);
    };
    if (String(req.query.preview) === '1') {
      // 预览优先读草稿（status=0）。但页面一经发布，publishPage 会 DELETE 草稿行（design.js:516），
      // 此时草稿为空 → 必须回退已发布版本（status=1），否则设计中心首页 iframe 预览空白、
      // 并误弹「草稿暂无组件」（用户反馈）。与下方非预览分支对称：草稿空 → 回退发布版。
      const draft = pickPage(0);
      if (draft) {
        const j = JSON.parse(draft.design_json || '{}');
        pages = j;
        header = j.meta?.header || null;
      } else {
        const pub = pickPage(1);
        if (pub) {
          const j = JSON.parse(pub.design_json || '{}');
          pages = j;
          header = j.meta?.header || null;
        }
      }
    } else {
      // 非预览：读取已发布页面组件与头部设置，供 C 端小程序/H5 渲染装修；
      // 未发布时回退到草稿（保证装修过的租户实际页面始终是装修内容，与设计中心预览一致）
      const pub = pickPage(1);
      let homeJson = null;
      if (pub) {
        homeJson = JSON.parse(pub.design_json || '{}');
      } else {
        const draft = pickPage(0);
        if (draft) homeJson = JSON.parse(draft.design_json || '{}');
      }
      if (homeJson) {
        pages = homeJson;
        header = homeJson.meta?.header || null;
      }
    }
    // 统一默认首页（is_home）→ C 端跳转 URL：配置谁为首页就跳谁（商城/全景/名片/自定义页）
    // 预置页按应用壳跳转（home→智能名片、mall-home→商城）；custom-* 自定义页走全景通用装修壳
    const homeRow = db.prepare('SELECT page_type FROM tenant_page_design WHERE tenant_id = ? AND is_home = 1 ORDER BY id DESC LIMIT 1').get(tenantId);
    const HOME_SHELL = { home: '/pages/cardMain/home', 'mall-home': '/pages/mall/index' };
    const homePt = homeRow?.page_type || 'home';
    const homeShell = HOME_SHELL[homePt] || '/pages/panorama/home';
    const homePageUrl = `${homeShell}?pageType=${homePt}`;
    // 底部导航：读取装修「页面设置 → 底部导航」配置（页面级）
    // mode=default 用租户默认方案；mode=custom 用指定独立方案；mode=none 关闭
    const pageNav = (pages && pages.meta && pages.meta.nav) || {};
    const navMode = pageNav.mode === 'none' || pageNav.mode === 'custom' ? pageNav.mode : 'default';
    if (navMode === 'none') {
      tab = null;
    } else if (navMode === 'custom' && Number(pageNav.schemeId)) {
      tab = db
        .prepare('SELECT scheme_name, tab_json FROM tenant_tab_scheme WHERE tenant_id = ? AND id = ? AND enabled = 1')
        .get(tenantId, Number(pageNav.schemeId));
    } else {
      tab = db
        .prepare('SELECT scheme_name, tab_json FROM tenant_tab_scheme WHERE tenant_id = ? AND is_default = 1 AND enabled = 1')
        .get(tenantId);
    }
    res.json({
      tenantId,
      style: style ? JSON.parse(style.style_json || '{}') : null,
      nav: { mode: navMode, jumpEnabled: pageNav.jumpEnabled !== false },
      tab: tab ? (() => {
        let tj = [];
        try { tj = JSON.parse(tab.tab_json || '[]'); } catch { tj = []; }
        return { name: tab.scheme_name, ...normalizeTabJson(tj) };
      })() : null,
      homePage: homePages.card || home?.home_page || 'card',
      homePages,
      homePageUrl,
      header,
      pages,
    });
  });

  // 设计中心「全景场景」组件：按租户返回全景方案（含发布状态与封面），供小程序/H5 首页渲染
  router.get('/design/panorama-scenes', authOptional, (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); // 全景方案为装修配置，改后须立即生效
    const previewTid = req.customerId ? 0 : verifyPreviewSig(req.query);
    if (!req.customerId && !previewTid) return res.status(401).json({ error: '未登录' });
    const tenantId = req.customerId || previewTid;
    const plans = db
      .prepare('SELECT * FROM plans WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
      .all(tenantId)
      .map((p) => {
        const scene = db
          .prepare('SELECT preview_path, image_path FROM scenes WHERE plan_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1')
          .get(p.id);
        const sceneCount = db
          .prepare('SELECT COUNT(*) AS n FROM scenes WHERE plan_id = ?')
          .get(p.id).n || 0;
        return {
          id: p.id,
          name: p.name,
          cover: p.cover_path || (scene ? scene.preview_path || scene.image_path : '') || '',
          published: Boolean(p.published),
          sceneCount,
        };
      });
    res.json({ plans });
  });

  return router;
}
