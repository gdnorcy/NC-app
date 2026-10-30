/**
 * 扫码查询方案：决定「消费者拿到防伪码后，从哪里看到验真结果」。
 *
 * 🔴 三档的差别不在样式，而在**印刷物形态 + 结果出口**：
 *    web            → 印普通网址码，任何扫码工具都能打开溯源页；不依赖公众号资质、可无限量印刷
 *    push_dynamic   → 仍印普通网址码，溯源页现场生成短时效一次性二维码，长按识别后由公众号推送结果
 *    push_permanent → 出码时为每张码生成专属公众号带参二维码（一物一图），扫了直接进公众号拿结果
 *
 * 🔴 为什么不做成"七选一"：外部对标产品里同类开关有 7 个值，其中多个值在它自己的源码里
 *    落完全相同的分支（历史遗留），还有一个被硬编码成仅特定后台角色可见。
 *    那套语义搬过来只会让人困惑，这里只保留**行为真的不同**的三档。
 *
 * 🔴 选项名与不可用原因都由本模块出具，后台只是渲染 —— 避免"后台写一份、服务端认另一份"。
 */
export const SCAN_MODE_WEB = 'web';
export const SCAN_MODE_PUSH_DYNAMIC = 'push_dynamic';
export const SCAN_MODE_PUSH_PERMANENT = 'push_permanent';

/** 印出来的东西完全不同，必须写清楚让商户自己选。 */
export const SCAN_MODE_OPTIONS = [
  {
    value: SCAN_MODE_WEB,
    label: '网页验真',
    print: '印普通网址二维码',
    desc: '任何扫码工具都能打开溯源页查看结果。不依赖公众号资质、不受配额限制，适合大批量印刷。',
  },
  {
    value: SCAN_MODE_PUSH_DYNAMIC,
    label: '公众号推送',
    print: '印普通网址二维码，页面内引导识别',
    desc: '印网址码，溯源页呈现为一张带二维码的海报：结论做主视觉、内嵌公众号引导二维码、文字说明与操作引导。长按识别后由认证公众号推送一份验真结果，消费者可据此识破仿冒查询网站。',
  },
  {
    value: SCAN_MODE_PUSH_PERMANENT,
    label: '公众号直推（小批量）',
    print: '每张码印专属公众号二维码',
    desc: '出码时为每张码单独向微信申请一张专属二维码，扫码直接在公众号内收到结果。一张图只能对应一个码，且受微信配额约束，适合小批量、样板与赠品。',
  },
];

/** 🔴 枚举白名单：客户端传什么都行，落在库里的只能是这三档之一。 */
export function normalizeScanMode(value) {
  const v = String(value || '').trim();
  if (SCAN_MODE_OPTIONS.some((o) => o.value === v)) return v;
  return SCAN_MODE_WEB;
}

/** 0/1 开关归一化（默认开：undefined/absent 视为开才是"新能力直接可用"）。 */
export function normalizeTraceSwitch(value, defaultOn = 1) {
  if (value === undefined || value === null || value === '') return defaultOn;
  return Number(value) === 1 ? 1 : 0;
}

/**
 * 组装后台要用的视图：当前档位、三档可用性（含不可用的具体原因）、以及
 * 「公众号内发送防伪码 → 回复验真结果」开关。
 *
 * 🔴 可用性必须在这里算真值，不能让后台猜：缺公众号授权、没配服务器地址（收不到扫码事件）
 *    这两种情况下把 push_* 档位开放出去，商户选了却没反应 —— 等于给了一个空开关。
 */
export function buildScanQueryView(db, tenantId, settings = {}) {
  const channel = db.prepare("SELECT * FROM channel_apps WHERE customer_id = ? AND channel_type = 'mp' AND (auth_status = 'authorized' OR (auth_status = 'none' AND app_secret <> '')) ORDER BY id DESC LIMIT 1").get(Number(tenantId));
  const cfg = channel ? db.prepare('SELECT * FROM mp_message_config WHERE channel_apps_id = ?').get(channel.id) : null;
  const pushReady = Boolean(channel) && Boolean(cfg?.msg_token) && Number(cfg?.url_enabled ?? 1) === 1;

  const reason = !channel
    ? '尚未为该商户配置公众号（需先在「渠道/公众号」完成授权或填写 AppSecret）'
    : !pushReady
      ? '公众号尚未完成服务器配置（URL + Token 未启用），收不到微信推送的扫码事件'
      : '';

  const options = SCAN_MODE_OPTIONS.map((o) => ({
    ...o,
    available: o.value === SCAN_MODE_WEB ? true : pushReady,
    reason: o.value === SCAN_MODE_WEB ? '' : reason,
    // 🔴 永久码还需「已认证服务号」（微信硬规则，未认证一律 48001）——
    //    这个资质要靠真实调用微信才知道，不能假装能查；这里如实写成提示让商户先用一张码试。
    note: o.value === SCAN_MODE_PUSH_PERMANENT
      ? '需已认证服务号；订阅号/未认证服务号会被微信拒绝（可用「生成一张试试」验证）。'
      : '',
  }));

  return {
    current: normalizeScanMode(settings.scanMode),
    options,
    replyEnabled: normalizeTraceSwitch(settings.wxReply),
  };
}
