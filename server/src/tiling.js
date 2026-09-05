import sharp from 'sharp';

/**
 * 全景金字塔切片：
 * 将宽 >= PYRAMID_THRESHOLD 的全景图切为多分辨率层级瓦片（2:1 等距柱状投影）。
 * 层级宽度从原图（上限 MAX_PYRAMID_WIDTH）逐级减半，直到 <= 1024。
 * 每层切成 TILE_W × TILE_H 的 WebP 瓦片，输出 manifest 供前端按视角按需加载。
 */

export const TILE_W = 1024;
export const TILE_H = 512;
export const MAX_PYRAMID_WIDTH = 16384;
export const PYRAMID_THRESHOLD = 2048; // 宽度 >= 该值才生成金字塔
export const TILE_QUALITY = 80;

/** 计算层级（宽度从 base 逐级减半到 <= 1024，保持 2:1） */
export function planLevels(width) {
  const base = Math.min(width, MAX_PYRAMID_WIDTH);
  const levels = [];
  for (let w = base; w >= 1024; w = Math.floor(w / 2)) {
    const h = Math.max(1, Math.round(w / 2));
    levels.push({
      width: w,
      height: h,
      cols: Math.ceil(w / TILE_W),
      rows: Math.ceil(h / TILE_H),
    });
  }
  return levels;
}

/**
 * 生成金字塔瓦片并上传到存储层。
 * @param {Buffer} srcBuffer 原始全景图
 * @param {object} storage 存储实例（put(buffer, key) → URL）
 * @param {string} baseKey 文件名前缀（瓦片统一挂在该前缀下的 tiles/ 目录）
 * @returns {Promise<object|null>} manifest（含 tileUrl 模板）；宽度不足或失败返回 null
 */
export async function generatePyramidTiles(srcBuffer, storage, baseKey) {
  const meta = await sharp(srcBuffer).rotate().metadata();
  if (!meta.width || meta.width < PYRAMID_THRESHOLD) return null;

  const levels = planLevels(meta.width);
  const prefix = `${baseKey}-tiles`;
  let firstUrl = null;

  for (const level of levels) {
    // 整层缩放到目标分辨率（PNG 无损中间态），再逐瓦片提取
    const layer = await sharp(srcBuffer)
      .rotate()
      .resize(level.width, level.height, { fit: 'fill' })
      .png()
      .toBuffer();
    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) {
        const left = col * TILE_W;
        const top = row * TILE_H;
        const w = Math.min(TILE_W, level.width - left);
        const h = Math.min(TILE_H, level.height - top);
        const tile = await sharp(layer)
          .extract({ left, top, width: w, height: h })
          .webp({ quality: TILE_QUALITY })
          .toBuffer();
        const key = `${prefix}/${level.width}/${col}_${row}.webp`;
        const url = await storage.put(tile, key);
        if (firstUrl === null) firstUrl = url;
      }
    }
  }

  // 由第一张瓦片的 URL 推导模板（同前缀下结构一致）
  const marker = `${prefix}/${levels[0].width}/0_0.webp`;
  const template = firstUrl.replace(marker, `${prefix}/{width}/{col}_{row}.webp`);

  return {
    type: 'pyramid',
    tileW: TILE_W,
    tileH: TILE_H,
    levels,
    tileUrl: template,
  };
}

/** 枚举 manifest 中全部瓦片 URL（供删除场景时清理云端对象） */
export function pyramidTileUrls(pyramid) {
  if (!pyramid || !Array.isArray(pyramid.levels)) return [];
  const urls = [];
  for (const level of pyramid.levels) {
    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) {
        urls.push(
          pyramid.tileUrl
            .replace('{width}', level.width)
            .replace('{col}', col)
            .replace('{row}', row)
        );
      }
    }
  }
  return urls;
}
