// 微信公众号「服务器配置」两个密钥的生成与校验规则。
//
// 微信官方口径（mp.weixin.qq.com 基本配置 → 服务器配置）：
//   - Token（令牌）：必须为英文或数字，长度 3-32 字符
//   - EncodingAESKey（消息加密密钥）：43 位字符，字符集 A-Z a-z 0-9
// 手写极易写错位数或掺入不合法字符（下划线、短横线等），微信侧握手会直接失败，
// 所以这里做成唯一生成出口 + 校验出口，前后端/页面都不要再自己拼随机串。

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const MP_TOKEN_LEN = 32;
export const MP_AES_KEY_LEN = 43;

// 拒绝采样，避免 % 取模带来的字符分布偏置
function randomChars(n, dict) {
  const cryptoObj = globalThis.crypto;
  const len = dict.length;
  const limit = 256 - (256 % len);
  let out = '';
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    while (out.length < n) {
      const buf = new Uint8Array(n - out.length);
      cryptoObj.getRandomValues(buf);
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] < limit) out += dict[buf[i] % len];
      }
    }
    return out;
  }
  // 无 crypto 的极端环境（老 WebView）降级：Math.random 安全性弱，但此处仅用于生成一次密钥
  for (let i = 0; i < n; i++) out += dict[Math.floor(Math.random() * len)];
  return out;
}

/** 生成微信 Token：32 位字母数字（落在 3-32 的合法区间内，取最长） */
export function genMpToken() {
  return randomChars(MP_TOKEN_LEN, ALNUM);
}

/** 生成微信 EncodingAESKey：43 位字母数字 */
export function genMpEncodingAESKey() {
  return randomChars(MP_AES_KEY_LEN, ALNUM);
}

/** Token 是否合法：3-32 位纯字母数字 */
export function isValidMpToken(t) {
  return /^[A-Za-z0-9]{3,32}$/.test(String(t || ''));
}

/** EncodingAESKey 是否合法：留空表示明文模式，填了就必须正好 43 位字母数字 */
export function isValidMpAesKey(k) {
  const s = String(k || '');
  if (!s) return true;
  return /^[A-Za-z0-9]{43}$/.test(s);
}
