/**
 * 装修组件链接跳转执行（跨端统一入口）
 *
 * 🔴 反馈 #298：按钮组件支持「跳转外部小程序」，默认仍是内部页面。
 *   链接模型（存组件 props 里，字段名保持向后兼容）：
 *     linkType: 'internal'（默认，内部页面）| 'miniapp'（外部小程序）| 'web'（网页）| 'phone'（电话）
 *     url:        内部页面路径 / 网页地址 / 电话号码（按 linkType 复用同一字段）
 *     miniAppId:  外部小程序 AppID
 *     miniAppPath:外部小程序页面路径（可空 = 首页）
 *     miniAppEnv: 'release'（默认）| 'trial' | 'develop'
 *
 * ⚠️ 存量数据没有 linkType → 一律按 'internal' 处理（向后兼容，不破坏已有配置）。
 *
 * ⚠️ 两条 C 端渲染路径都要走这里（CardCompItem.vue 与 DesignPage.vue 各自有跳转逻辑），
 *   否则「详情页能跳、装修预览不跳」或反之 → 行为分裂。
 *
 * ⚠️ wx.navigateToMiniProgram 只能在 MP-WEIXIN 端调用，且目标小程序须与当前小程序
 *   **属于同一微信开放平台**（第三方平台代开发模式下这是硬约束）→ 非微信端降级为提示。
 */

/** 判断是否外部小程序跳转 */
export function isMiniAppLink(link) {
  const l = link || {};
  return (l.linkType || 'internal') === 'miniapp' && !!(l.miniAppId || '').trim();
}

/** 链接类型的可读描述（用于「我的名片」等处的展示） */
export function describeLink(link) {
  const l = link || {};
  const type = l.linkType || 'internal';
  if (type === 'miniapp') return `小程序 ${l.miniAppId || ''}${l.miniAppPath ? ' · ' + l.miniAppPath : ''}`;
  if (type === 'phone') return `电话 ${l.url || ''}`;
  if (type === 'web') return l.url || '';
  return l.url || '';
}

/**
 * 执行跳转。
 * @param {object} link 链接配置
 * @param {object} opts { onError } 可选错误回调
 * @returns {boolean} 是否已处理跳转（false = 未处理，调用方走原逻辑）
 */
export function execCompLink(link, opts = {}) {
  const l = link || {};
  const type = l.linkType || 'internal';
  const url = String(l.url || '').trim();

  // —— 外部小程序 ——
  if (type === 'miniapp') {
    const appId = String(l.miniAppId || '').trim();
    if (!appId) {
      uni.showToast({ title: '未配置小程序 AppID', icon: 'none' });
      return true;
    }
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.navigateToMiniProgram) {
      const envVersion = l.miniAppEnv || 'release';
      wx.navigateToMiniProgram({
        appId,
        path: String(l.miniAppPath || '').trim(),
        envVersion,
        fail: (e) => {
          const msg = (e && e.errMsg) || '';
          if (String(msg).indexOf('navigateToMiniProgram:fail') === 0) {
            // 常见失败：目标小程序未关联同一开放平台 / appId 不存在
            uni.showToast({ title: '无法打开该小程序，请检查 AppID', icon: 'none' });
          } else {
            uni.showToast({ title: '打开小程序失败', icon: 'none' });
          }
        },
      });
      return true;
    }
    // #endif
    uni.showToast({ title: '仅小程序端支持跳转外部小程序', icon: 'none' });
    return true;
  }

  // —— 网页链接 ——
  if (type === 'web') {
    if (!url) {
      uni.showToast({ title: '未配置网页地址', icon: 'none' });
      return true;
    }
    // #ifdef H5
    window.open(url, '_blank');
    return true;
    // #endif
    // #ifdef MP-WEIXIN
    // 小程序端不能直接开外部浏览器 → 复制到剪贴板，让用户到微信里打开
    uni.setClipboardData({
      data: url,
      success: () => uni.showToast({ title: '链接已复制，请到微信中打开', icon: 'none' }),
      fail: () => uni.showToast({ title: '复制失败', icon: 'none' }),
    });
    return true;
    // #endif
    // #ifndef H5
    // #ifndef MP-WEIXIN
    uni.showToast({ title: '当前端不支持网页跳转', icon: 'none' });
    return true;
    // #endif
    // #endif
  }

  // —— 拨打电话 ——
  if (type === 'phone') {
    if (!url) {
      uni.showToast({ title: '未配置电话号码', icon: 'none' });
      return true;
    }
    const digits = url.replace(/[^\d+]/g, '');
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.makePhoneCall) {
      wx.makePhoneCall({ phoneNumber: digits, fail: () => {} });
      return true;
    }
    // #endif
    uni.makePhoneCall({ phoneNumber: digits, fail: () => {} });
    return true;
  }

  // —— 内部页面（默认）——
  if (!url) return false;
  if (!url.startsWith('/')) {
    // 存量数据可能存了不带斜杠的路径 → 补上再跳
    uni.navigateTo({ url: '/' + url, fail: () => {} });
    return true;
  }
  uni.navigateTo({ url, fail: () => {} });
  return true;
}
