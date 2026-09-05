import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../src/config.js';
import { LocalStorage } from '../src/storage/local.js';
import {
  planLevels,
  generatePyramidTiles,
  pyramidTileUrls,
  TILE_W,
  TILE_H,
  PYRAMID_THRESHOLD,
} from '../src/tiling.js';

/** 合成一张带方向标记的全景测试图（2:1 等距柱状） */
async function makePano(width, height) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#4a7fb5"/>
    <rect x="${width * 0.25}" y="${height * 0.25}" width="${width * 0.5}" height="${height * 0.5}" fill="#c94f4f"/>
    <text x="${width * 0.5}" y="${height * 0.5}" font-size="${Math.round(height * 0.2)}" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">CENTER</text>
    <text x="${width * 0.5}" y="${height * 0.08}" font-size="${Math.round(height * 0.1)}" fill="#ffffff" text-anchor="middle">TOP</text>
  </svg>`);
  return sharp(svg).webp().toBuffer();
}

test('planLevels：从原图逐级减半到 <= 1024', () => {
  assert.deepEqual(
    planLevels(4096).map((l) => [l.width, l.height, l.cols, l.rows]),
    [
      [4096, 2048, 4, 4],
      [2048, 1024, 2, 2],
      [1024, 512, 1, 1],
    ]
  );
  assert.deepEqual(
    planLevels(8192).map((l) => l.width),
    [8192, 4096, 2048, 1024]
  );
});

test('planLevels：超过上限时钳制到 MAX_PYRAMID_WIDTH', () => {
  const levels = planLevels(32768);
  assert.equal(levels[0].width, 16384);
  assert.equal(levels[0].cols, 16);
  assert.equal(levels[0].rows, 16);
});

test('generatePyramidTiles：生成多层级瓦片并返回 manifest', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-tiles-'));
  config.uploadsDir = path.join(tmp, 'uploads');
  config.dataDir = tmp;
  const storage = new LocalStorage({ provider: 'local' });

  const src = await makePano(4096, 2048);
  const manifest = await generatePyramidTiles(src, storage, 'tile-test');

  assert.equal(manifest.type, 'pyramid');
  assert.equal(manifest.tileW, TILE_W);
  assert.equal(manifest.tileH, TILE_H);
  assert.equal(manifest.levels.length, 3);
  assert.match(manifest.tileUrl, /^\/uploads\/tile-test-tiles\/\{width\}\/\{col\}_\{row\}\.webp$/);

  // 瓦片落盘：21 张 + 尺寸抽查
  const dirs = fs.readdirSync(path.join(tmp, 'uploads/tile-test-tiles'));
  assert.deepEqual(dirs.sort(), ['1024', '2048', '4096']);
  const tile4096 = fs.readdirSync(path.join(tmp, 'uploads/tile-test-tiles/4096')).sort();
  assert.equal(tile4096.length, 16);
  assert.deepEqual(tile4096.slice(0, 4), ['0_0.webp', '0_1.webp', '0_2.webp', '0_3.webp']);
  const meta = await sharp(path.join(tmp, 'uploads/tile-test-tiles/4096/0_0.webp')).metadata();
  assert.equal(meta.width, TILE_W);
  assert.equal(meta.height, TILE_H);
  assert.equal(meta.format, 'webp');
  // 边缘瓦片为实际剩余尺寸
  const edgeMeta = await sharp(path.join(tmp, 'uploads/tile-test-tiles/1024/0_0.webp')).metadata();
  assert.equal(edgeMeta.width, 1024);

  // 枚举全部瓦片 URL
  const urls = pyramidTileUrls(manifest);
  assert.equal(urls.length, 16 + 4 + 1);
  assert.ok(urls.includes('/uploads/tile-test-tiles/4096/3_3.webp'));
  assert.ok(urls.includes('/uploads/tile-test-tiles/1024/0_0.webp'));

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('generatePyramidTiles：宽度低于阈值不生成', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-tiles-small-'));
  config.uploadsDir = path.join(tmp, 'uploads');
  const storage = new LocalStorage({ provider: 'local' });
  const src = await makePano(PYRAMID_THRESHOLD - 1, Math.round((PYRAMID_THRESHOLD - 1) / 2));
  const manifest = await generatePyramidTiles(src, storage, 'small');
  assert.equal(manifest, null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('pyramidTileUrls：非法输入返回空', () => {
  assert.deepEqual(pyramidTileUrls(null), []);
  assert.deepEqual(pyramidTileUrls({ type: 'pyramid' }), []);
});
