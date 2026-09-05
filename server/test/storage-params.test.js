import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OssStorage } from '../src/storage/oss.js';
import { QiniuStorage, QINIU_ZONES } from '../src/storage/qiniu.js';

test('OSS：文件夹前缀拼入上传路径', () => {
  const s = new OssStorage({
    provider: 'oss',
    accessKey: 'ak',
    secretKey: 'sk',
    bucket: 'panorama-360',
    region: 'oss-cn-shenzhen',
    folder: '/panorama/',
    cdnDomain: 'https://img.example.com/',
  });
  assert.match(s.keyPrefix, /^panorama\/scenes\/\d{8}$/);
  assert.equal(s.domain, 'https://img.example.com'); // 去尾斜杠
});

test('OSS：无文件夹时默认 scenes 前缀', () => {
  const s = new OssStorage({ provider: 'oss', accessKey: 'a', secretKey: 's', bucket: 'panorama-360', region: 'r', folder: '', cdnDomain: '' });
  assert.match(s.keyPrefix, /^scenes\/\d{8}$/);
});

test('七牛：所属区域映射到 SDK Zone', () => {
  assert.equal(QINIU_ZONES.z0, 'Zone_z0');
  assert.equal(QINIU_ZONES.z2, 'Zone_z2');
  assert.equal(QINIU_ZONES.as0, 'Zone_as0');
  assert.equal(QINIU_ZONES[''], undefined);
});

test('七牛：区域与文件夹前缀生效', () => {
  const s = new QiniuStorage({
    provider: 'qiniu',
    accessKey: 'ak',
    secretKey: 'sk',
    bucket: 'panorama-360',
    zone: 'z2',
    folder: 'vr360',
    cdnDomain: 'https://cdn.example.com',
  });
  assert.match(s.keyPrefix, /^vr360\/scenes\/\d{8}$/);
});

test('七牛：未知区域回退自动探测，不抛错', () => {
  const s = new QiniuStorage({ provider: 'qiniu', accessKey: 'a', secretKey: 's', bucket: 'panorama-360', zone: 'zz', folder: '', cdnDomain: '' });
  assert.match(s.keyPrefix, /^scenes\/\d{8}$/);
});
