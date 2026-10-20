/**
 * 微信支付 API v3 最小客户端（纯 node:crypto，零第三方依赖）
 * ------------------------------------------------------------
 * 为什么不用官方 SDK：服务器是生产单进程部署，引入 SDK 意味着线上要 npm install
 * （依赖源/网络/版本漂移风险）。微信支付 v3 的必需能力只有 4 件事，用 Node 内置
 * crypto 就能完整实现，且不增加运行时依赖：
 *   ① 请求签名（RSA-SHA256，Authorization: WECHATPAY2-SHA256-RSA2046）
 *   ② 小程序下单（POST /v3/pay/transactions/jsapi）
 *   ③ 回调验签（用**平台证书**公钥验 Wechatpay-Signature）
 *   ④ 回调解密（AES-256-GCM，密钥 = APIv3 密钥）
 *
 * 关键概念（容易混）：
 *   - **商户 API 证书**（apiclient_cert.pem / apiclient_key.pem）：我方请求签名用；
 *     序列号 serial_no = 该证书的序列号（可从证书文件运行时算出，无需手填）。
 *   - **平台证书**（wechatpay 签发）：**验回调签名**用，方向与商户证书相反。
 *     平台证书会轮换，故支持从 /v3/certificates 拉取并缓存（需 APIv3 密钥解密）。
 *
 * 所有配置都不落在本文件，调用方从 settings + env 注入。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const API_HOST = 'https://api.mch.weixin.qq.com';

function b64url(buf) {
  return Buffer.from(buf).toString('base64');
}

function randomNonce(len = 32) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

/** 从商户证书 PEM 里取序列号（微信要的格式：大写 hex，无 0x 前缀） */
export function serialFromCertPem(certPem) {
  const x = new crypto.X509Certificate(certPem);
  // Node 的 serialNumber 可能是奇数长度（丢掉前导 0），补齐成偶数
  let s = x.serialNumber.replace(/^0+(?=.)/, '').toUpperCase();
  if (s.length % 2 === 1) s = '0' + s;
  return s;
}

/**
 * 构造微信支付客户端
 * @param {object} cfg
 * @param {string} cfg.mchId            商户号
 * @param {string} cfg.apiV3Key         APIv3 密钥（32 位）
 * @param {string} cfg.appId            收款小程序/公众号 appid（须与商户号绑定）
 * @param {string} cfg.privateKeyPem    商户 API 私钥 PEM
 * @param {string} cfg.certPem          商户 API 证书 PEM（用于算序列号）
 * @param {string} [cfg.platformCertPem] 平台证书 PEM（验回调签名用；缺省则尝试在线拉取）
 * @param {string} [cfg.notifyUrl]      支付结果回调地址
 * @param {string} [cfg.platformId]     平台证书序列号（与 platformCertPem 配套）
 */
export function createWechatPayClient(cfg) {
  const {
    mchId, apiV3Key, appId, privateKeyPem, certPem,
    platformCertPem = '', platformId = '', notifyUrl = '',
  } = cfg;

  if (!mchId || !apiV3Key || !appId || !privateKeyPem || !certPem) {
    throw new Error('微信支付配置不完整（缺 mchId/apiV3Key/appId/商户证书）');
  }
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const serialNo = serialFromCertPem(certPem);

  /** 生成请求签名：signStr = method\nurl\ntimestamp\nnonce\nbody\n */
  function sign(method, url, bodyStr) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomNonce();
    const signStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${bodyStr}\n`;
    const signature = crypto.createSign('RSA-SHA256').update(signStr, 'utf8').sign(privateKey, 'base64');
    const authorization = 'WECHATPAY2-SHA256-RSA2046 '
      + `mchid="${mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
    return { authorization, timestamp, nonce };
  }

  async function request(method, urlPath, bodyObj) {
    const url = urlPath.startsWith('http') ? urlPath : API_HOST + urlPath;
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
    const { authorization } = sign(method, url, bodyStr);
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization,
        'User-Agent': 'panorama-card/1.0',
      },
      body: bodyStr || undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = data?.message || data?.code || `HTTP ${res.status}`;
      const detail = data?.detail ? ` (${JSON.stringify(data.detail).slice(0, 200)})` : '';
      const err = new Error(`微信支付 ${method} ${urlPath} 失败：${msg}${detail}`);
      err.status = res.status;
      err.wechatCode = data?.code || '';
      throw err;
    }
    return data;
  }

  /**
   * 小程序下单（JSAPI）：返回 prepay_id
   *
   * 🔴 amountFen 单位是**分**，且本项目全链路统一用分：
   *    payment_orders.amount 存的就是分（card.js 建单时 price*100、
   *    goodsOrder 用 yuan2fen），微信 amount.total 也是分。
   *    早前这里写 `Math.round(amount * 100)`（按元处理），
   *    会把 2990 分的订单变成 299000 分（多收 1000 倍）——真金白银的量级事故。
   */
  async function jsapiOrder({ openid, outTradeNo, amountFen, description, payerIp = '127.0.0.1' }) {
    if (!openid) throw new Error('下单失败：缺少付款人 openid');
    const total = Math.round(Number(amountFen));
    if (!Number.isFinite(total) || total <= 0) throw new Error('下单失败：金额不合法');
    const body = {
      appid: appId,
      mchid: mchId,
      description: String(description || '名片服务').slice(0, 120),
      out_trade_no: outTradeNo,
      notify_url: notifyUrl || '',
      amount: { total, currency: 'CNY' },
      payer: { openid },
    };
    if (!notifyUrl) {
      // 微信对 JSAPI 下单强制要求 notify_url（空串会报 NO_AUTH/参数错误），
      // 缺配置时直接给出可操作的错误，而不是让用户收到一个天书般的微信错误码
      throw new Error('未配置支付回调地址（notifyUrl），无法下单');
    }
    const data = await request('POST', '/v3/pay/transactions/jsapi', body);
    return data.prepay_id;
  }

  /** 由 prepay_id 生成 uni.requestPayment 需要的 5 个参数 */
  function buildPayParams(prepayId) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomNonce();
    const packageStr = `prepay_id=${prepayId}`;
    // 签名串固定为 appId\ntimeStamp\nnonceStr\npackage\n
    const signStr = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
    const paySign = crypto.createSign('RSA-SHA256').update(signStr, 'utf8').sign(privateKey, 'base64');
    return { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign };
  }

  /** 解密回调 resource（AES-256-GCM） */
  function decryptResource(resource) {
    const key = Buffer.from(apiV3Key, 'utf8');
    if (key.length !== 32) throw new Error('APIv3 密钥长度必须 32 字节');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'));
    decipher.setAuthTag(Buffer.from(resource.ciphertext, 'base64').subarray(-16));
    decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
    const ciphertext = Buffer.from(resource.ciphertext, 'base64').subarray(0, -16);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  }

  /** 验回调签名（用平台证书公钥） */
  function verifyCallback(headers, rawBody) {
    if (!platformCertPem) return { ok: false, reason: 'no_platform_cert' };
    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const signature = headers['wechatpay-signature'];
    const serial = headers['wechatpay-serial'];
    if (!timestamp || !nonce || !signature) return { ok: false, reason: 'missing_signature_headers' };
    // 平台证书轮换：序列号与当前平台证书不一致时必须拒绝（否则可能被伪造）
    if (platformId && serial && serial.toUpperCase() !== platformId.toUpperCase()) {
      return { ok: false, reason: 'platform_cert_serial_mismatch', serial };
    }
    const signStr = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const publicKey = crypto.createPublicKey(platformCertPem);
    const ok = crypto.createVerify('RSA-SHA256').update(signStr, 'utf8').verify(publicKey, signature, 'base64');
    return { ok, reason: ok ? '' : 'verify_failed' };
  }

  /**
   * 拉取平台证书（用于验回调签名；也可由运维手工放文件避免在线依赖）
   * GET /v3/certificates → data[] {serial_no, effective_time, encrypt_certificate:{ciphertext,...}}
   */
  async function fetchPlatformCertificates() {
    const data = await request('GET', '/v3/certificates');
    const list = data?.data || [];
    const out = [];
    for (const item of list) {
      try {
        const pem = decryptResource(item.encrypt_certificate);
        out.push({ serialNo: item.serial_no, pem, effectiveTime: item.effective_time, expireTime: item.expire_time });
      } catch (e) {
        // 单张证书解密失败不阻断其它证书
      }
    }
    return out;
  }

  return {
    mchId, appId, serialNo, platformId,
    jsapiOrder, buildPayParams, decryptResource, verifyCallback, fetchPlatformCertificates, sign,
  };
}

/**
 * 从「后台填的支付配置 + env 兜底」合成微信支付客户端配置。
 *
 * 来源优先级（每项独立）：
 *   mchId / appid / serialNo / notifyUrl / 证书路径 → 后台（settings.payment.wechat 或租户 projects.config.payment.wechat）
 *   apiV3Key / 商户私钥 → 后台为主、env 兜底
 *   env WECHAT_PAY_* → 平台级兜底（平台自有商户号建议走这里，不入库）
 *
 * 私钥两种形态：
 *   ① 直接贴 PEM 全文（后台 textarea，对齐菜鸟云「代码上传密钥」的填法）
 *   ② 给服务器文件路径（privateKeyPath，容器/挂载场景更安全，不落库）
 *
 * @returns 配置对象；凑不齐返回 { missing:[...] } 便于调用方给出可操作提示
 */
export function buildClientConfig({ settingsWechat = {}, env = {} } = {}) {
  const s = settingsWechat || {};
  const pick = (a, b) => String(a || b || '').trim();

  const mchId = pick(s.mchId, env.WECHAT_PAY_MCH_ID);
  const appId = pick(s.appid || s.appId, env.WECHAT_PAY_APP_ID);
  const apiV3Key = pick(s.apiV3Key, env.WECHAT_PAY_API_V3_KEY);
  const privateKeyPem = String(s.privateKey || '').trim();
  const certPem = String(s.cert || '').trim();
  const privateKeyPath = pick(s.privateKeyPath, env.WECHAT_PAY_PRIVATE_KEY_PATH);
  const certPath = pick(s.certPath, env.WECHAT_PAY_CERT_PATH);
  const platformCertPem = String(s.platformCertPem || '').trim();
  const platformCertPath = pick(s.platformCertPath, env.WECHAT_PAY_PLATFORM_CERT_PATH);
  const notifyUrl = pick(s.notifyUrl, env.WECHAT_PAY_NOTIFY_URL);
  const platformId = pick(s.platformId, env.WECHAT_PAY_PLATFORM_ID);

  // MOCK_ 前缀是历史占位值（数据库里现在是 {"mchId":"MOCK_MCH","apiV3Key":"mock_key"}）
  const isMock = /^mock/i.test(mchId) || /^mock/i.test(apiV3Key);
  if (isMock) return { missing: ['商户号/APIv3 密钥仍是 MOCK 占位值，请在后台「支付配置」填入真实值'] };

  const missing = [];
  if (!mchId) missing.push('mchId（商户号）');
  if (!appId) missing.push('appid（收款小程序）');
  if (!apiV3Key) missing.push('apiV3Key（APIv3 密钥）');
  if (!privateKeyPem && !privateKeyPath) missing.push('privateKey（商户 API 私钥 PEM）或 privateKeyPath');
  if (!certPem && !certPath) missing.push('cert（商户 API 证书）或 certPath');
  if (!notifyUrl) missing.push('notifyUrl（支付回调地址）');
  if (missing.length) return { missing };

  return {
    mchId, apiV3Key, appId,
    privateKeyPem, certPem, privateKeyPath, certPath,
    // platformCertPem 必须一起带出：createClientFromConfig 靠它装配验回调签名的公钥，
    // 漏了会导致 verifyCallback 恒返回 no_platform_cert（回调全部 401）
    platformCertPem, platformCertPath, notifyUrl, platformId,
  };
}

/**
 * 按 buildClientConfig 的结果装配客户端（含读取磁盘证书/PEM）。
 * 证书读不到必须抛错——静默回落 mock 会让用户「点了支付，钱没扣，订单却成功了」，
 * 这比直接报错危险得多。
 */
export function createClientFromConfig(cfg) {
  if (!cfg || cfg.missing) {
    const detail = cfg?.missing ? cfg.missing.join('、') : '配置为空';
    throw new Error(`微信支付未配置：${detail}`);
  }
  const readMaybe = (inline, p) => {
    if (inline) return inline;
    if (!p) return '';
    try {
      return fs.readFileSync(p, 'utf8');
    } catch (e) {
      throw new Error(`读取证书文件失败：${p}（${e.message}）`);
    }
  };
  const privateKeyPem = readMaybe(cfg.privateKeyPem, cfg.privateKeyPath);
  const certPem = readMaybe(cfg.certPem, cfg.certPath);
  if (!privateKeyPem) throw new Error('商户 API 私钥为空，无法签名');
  if (!certPem) throw new Error('商户 API 证书为空，无法计算序列号');
  // 平台证书用于**验回调签名**（方向与商户证书相反）。缺失不阻断下单，
  // 但回调会因此验不过——所以单独给出提示文案，而不是静默。
  let platformCertPem = '';
  if (cfg.platformCertPem) platformCertPem = String(cfg.platformCertPem);
  else if (cfg.platformCertPath) {
    try { platformCertPem = readMaybe('', cfg.platformCertPath); }
    catch (e) { console.warn('[wechatpay] 平台证书读取失败（回调验签将不可用）：', e.message); }
  }
  return createWechatPayClient({
    mchId: cfg.mchId,
    apiV3Key: cfg.apiV3Key,
    appId: cfg.appId,
    privateKeyPem,
    certPem,
    platformCertPem,
    platformId: cfg.platformId || '',
    notifyUrl: cfg.notifyUrl,
  });
}
