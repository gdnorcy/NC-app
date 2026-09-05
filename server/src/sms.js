/**
 * 短信服务 provider 抽象。
 * 开发环境默认使用 MockProvider：验证码打印到服务端日志，并在响应中回传（仅开发）。
 * 生产环境可接入阿里云 / 腾讯云短信，实现 send 方法即可。
 */

export class MockSmsProvider {
  async send(phone, code, purpose) {
    // 开发环境：打印到日志，方便测试
    console.log(`[SMS Mock] phone=${phone} code=${code} purpose=${purpose}`);
    return { ok: true, provider: 'mock', code };
  }
}

/**
 * 阿里云短信 provider（预留接口，需配置 AccessKey + SignName + TemplateCode）。
 * 当前未实现真实调用，返回 mock 结果；接入时替换 send 方法体。
 */
export class AliyunSmsProvider {
  constructor({ accessKeyId, accessKeySecret, signName, templateCode }) {
    this.accessKeyId = accessKeyId;
    this.accessKeySecret = accessKeySecret;
    this.signName = signName;
    this.templateCode = templateCode;
  }
  async send(phone, code) {
    // TODO: 调用阿里云 Dysmsapi 2017-05-25 SendSms
    console.log(`[SMS Aliyun stub] phone=${phone} code=${code}`);
    return { ok: true, provider: 'aliyun-stub' };
  }
}

let _provider = null;

export function getSmsProvider() {
  if (!_provider) {
    _provider = new MockSmsProvider();
  }
  return _provider;
}

export function setSmsProvider(p) {
  _provider = p;
}

/** 生成 6 位数字验证码 */
export function genSmsCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
