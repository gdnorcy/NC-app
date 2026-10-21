/**
 * 转发封面生成（MP 端专用）——把 shareCover.js 画好的 canvas 导出为临时文件路径，
 * 供 onShareAppMessage 的 imageUrl 使用。
 *
 * 🔴 微信硬约束：
 *   - imageUrl **支持本地临时文件路径** → 不必服务端存图
 *   - **显示比例固定 5:4** → 画布 750×600
 *   - 返回值支持 promise（3 秒内 resolve）→ 现场画完再 resolve
 *
 * 🔴 本项目已踩过的坑：
 *   1. getCurrentInstance() 只能在 setup 顶层取（事件处理器/await 之后一律 null）
 *   2. canvas 不能 display:none（MP 端节点查不到）→ 用 position:fixed + 负偏移移出屏幕
 *   3. canvasToTempFilePath 在 MP 端必须传 canvas 节点（2d 模式），不能只传 id
 */

import { renderShareCover, SHARE_COVER_W, SHARE_COVER_H } from './shareCover.js';

/**
 * 在指定 canvas 节点上画封面并导出临时文件路径。
 * @param {Object} canvas MP 的 type=2d canvas 节点
 * @param {Object} card 名片数据
 * @param {String} styleKey cover-1..cover-6
 * @param {Object} colors { primary, gradient, secondary }
 * @param {Object} opts { qrImage, avatarImage }
 * @returns {Promise<string>} 临时文件路径（失败抛错，由调用方兜底）
 */
export function exportShareCover(canvas, card, styleKey, colors, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!canvas) {
      reject(new Error('canvas not ready'));
      return;
    }
    // #ifdef MP-WEIXIN
    renderShareCover(canvas, card, styleKey, colors, {
      W: SHARE_COVER_W, H: SHARE_COVER_H, dpr: 2,
      qrImage: opts.qrImage || '',
      avatarImage: opts.avatarImage || '',
    }).then(() => {
      uni.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        success: (r) => resolve(r.tempFilePath),
        fail: (e) => reject(new Error((e && e.errMsg) || '封面导出失败')),
      });
    }).catch(reject);
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('not supported on this platform'));
    // #endif
  });
}
