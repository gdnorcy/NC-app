import OSS from 'ali-oss';

/**
 * 阿里云 OSS 存储：上传后通过 CDN 域名访问
 */
export class OssStorage {
  constructor(cfg) {
    this.cfg = cfg;
    this.domain = (cfg.cdnDomain || '').replace(/\/+$/, '');
    this.folder = String(cfg.folder || '').replace(/^\/+|\/+$/g, '');
    this.client = new OSS({
      region: cfg.region,
      accessKeyId: cfg.accessKey,
      accessKeySecret: cfg.secretKey,
      bucket: cfg.bucket,
      secure: true,
    });
  }

  get keyPrefix() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return this.folder ? `${this.folder}/scenes/${date}` : `scenes/${date}`;
  }

  async put(buffer, key) {
    const objectKey = `${this.keyPrefix}/${key}`;
    await this.client.put(objectKey, buffer);
    return this.domain ? `${this.domain}/${objectKey}` : objectKey;
  }

  async delete(publicUrl) {
    const key = this._keyFromUrl(publicUrl);
    if (!key) return;
    try {
      await this.client.delete(key);
    } catch {
      // 删除失败不阻断场景删除
    }
  }

  _keyFromUrl(url) {
    if (!url) return null;
    if (this.domain && url.startsWith(this.domain)) return url.slice(this.domain.length + 1);
    return url.startsWith('http') ? null : url;
  }

  async testConnection() {
    try {
      await this.client.list({ 'max-keys': 1 });
      return { ok: true, message: '连接成功，Bucket 可读写' };
    } catch (err) {
      return { ok: false, message: `连接失败：${err.message || err}` };
    }
  }
}
