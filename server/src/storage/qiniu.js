import qiniu from 'qiniu';

/**
 * 七牛云 Kodo 存储：上传后通过 CDN 域名访问
 */
export class QiniuStorage {
  constructor(cfg) {
    this.cfg = cfg;
    this.domain = (cfg.cdnDomain || '').replace(/\/+$/, '');
    this.mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey);
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, null);
    this.formUploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config());
    this.putExtra = new qiniu.form_up.PutExtra();
  }

  get keyPrefix() {
    return `scenes/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  }

  _uploadToken(key) {
    return new qiniu.rs.PutPolicy({ scope: `${this.cfg.bucket}:${key}` }).uploadToken(this.mac);
  }

  async put(buffer, key) {
    const objectKey = `${this.keyPrefix}/${key}`;
    const token = this._uploadToken(objectKey);
    await new Promise((resolve, reject) => {
      this.formUploader.put(
        token,
        objectKey,
        buffer,
        this.putExtra,
        (err, _body, _info) => (err ? reject(err) : resolve())
      );
    });
    return this.domain ? `${this.domain}/${objectKey}` : objectKey;
  }

  async delete(publicUrl) {
    const key = this._keyFromUrl(publicUrl);
    if (!key) return;
    await new Promise((resolve) => {
      this.bucketManager.delete(this.cfg.bucket, key, (err, _resp, _info) => resolve());
    });
  }

  _keyFromUrl(url) {
    if (!url) return null;
    if (this.domain && url.startsWith(this.domain)) return url.slice(this.domain.length + 1);
    return url.startsWith('http') ? null : url;
  }

  async testConnection() {
    // 真实上传一个测试对象再删除：验证 AK/SK 签名、空间存在与读写权限（走实际上传链路）
    const key = `.connection-test-${Date.now()}`;
    const token = this._uploadToken(key);
    try {
      await new Promise((resolve, reject) => {
        this.formUploader.put(
          token,
          key,
          Buffer.from('ok'),
          this.putExtra,
          (err, _body, _info) => (err ? reject(err) : resolve())
        );
      });
      await new Promise((resolve) => {
        this.bucketManager.delete(this.cfg.bucket, key, () => resolve());
      });
      return { ok: true, message: '连接成功，空间可读写' };
    } catch (err) {
      return { ok: false, message: `连接失败：${err.message || err}` };
    }
  }
}
