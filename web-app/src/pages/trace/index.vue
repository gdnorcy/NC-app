<template>
  <view class="trace-page">
    <!-- PageNav -->
    <PageNav title="防伪溯源" back></PageNav>

    <scroll-view class="trace-scroll" scroll-y :show-scrollbar="false">
      <view class="trace-inner">
        <!-- 查询卡片
             🔴 2026-10-30：扫码自动出结果后**把输入表单收起来** ——
                之前扫码进来仍是「防伪查询 + 立即查询」的表单页（用户反馈：扫二维码还是这个界面），
                对标站的形态是扫码直接给海报 + 结论。查完只剩一行「换个码再查」的入口。 -->
        <view class="tr-card">
          <text class="tr-card-title">{{ result && !reQuery ? '查询结果' : '防伪查询' }}</text>
          <text class="tr-card-desc" v-if="!result || reQuery">{{ welcomeText }}</text>

          <block v-if="!result || reQuery">
            <input
              class="tr-input"
              v-model="form.co"
              placeholder="请输入防伪码"
              placeholder-class="tr-ph"
              :maxlength="40"
            />
            <input
              class="tr-input"
              v-model="form.yzm"
              placeholder="验证码 / 暗码（可选）"
              placeholder-class="tr-ph"
              :maxlength="20"
            />

            <view class="tr-btn" :class="{ 'tr-btn-off': loading }" @click="submit">
              <text>{{ loading ? '查询中…' : '立即查询' }}</text>
            </view>
          </block>

          <view class="tr-recheck" v-else @click="reQuery = true">
            <text class="tr-recheck-code">{{ result.code || form.co }}</text>
            <text class="tr-recheck-btn">换个码再查</text>
          </view>
        </view>

        <!-- 🔴 溯源结果海报：把「banner + 结论卡」合并成一张带二维码的海报（对齐用户示意图）。
             结论做主视觉、内嵌公众号引导二维码、文字说明 + 操作引导。
             🔴 demo 码顶部提示迁到海报最上方（试印品一眼可辨，不能像正品）。
             🔴 功能不变：二维码复用既有公众号临时引导码 pushImg（push_dynamic 才生成，仅微信内展示）。 -->
        <view class="tr-poster-card" v-if="result && showWebResult">
          <!-- 演示/试印提示：海报顶端，抢在一切结论之前 -->
          <view class="tr-poster-demo" v-if="result.demo">
            <text>【演示·试印】本码为印刷前试印码，不是正式防伪码，请勿作为正品凭证</text>
          </view>

          <!-- 主视觉：品牌主图 + 验真徽标 + 商品名（沿用原 tr-poster 版式） -->
          <view class="tr-poster-hero">
            <image v-if="posterImage" class="tr-poster-hero-img" :src="posterImage" mode="aspectFill" />
            <view class="tr-poster-hero-mask" v-if="posterImage"></view>
            <view class="tr-poster-badge" :class="result.first ? 'tr-badge-ok' : 'tr-badge-warn'">
              <text>{{ posterBadge }}</text>
            </view>
            <view class="tr-poster-hero-foot">
              <text class="tr-poster-name">{{ posterName }}</text>
              <text class="tr-poster-sub" v-if="posterSub">{{ posterSub }}</text>
            </view>
          </view>

          <!-- 结论标题 -->
          <view class="tr-result-head">
            <SIcon name="verify" size="large" :color="ICON_SUCCESS" />
            <text class="tr-result-title">{{ resultTitle }}</text>
          </view>

          <!-- 文字说明 -->
          <view class="tr-line">
            <text class="tr-line-label">防伪码</text>
            <text class="tr-line-value">{{ result.code || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">查询次数</text>
            <text class="tr-line-value">{{ result.num || 0 }} 次</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">产品</text>
            <text class="tr-line-value">{{ batchInfo.product || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">品牌</text>
            <text class="tr-line-value">{{ batchInfo.brand || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">厂家</text>
            <text class="tr-line-value">{{ batchInfo.factory || '-' }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">产地</text>
            <text class="tr-line-value">{{ originText }}</text>
          </view>
          <view class="tr-line">
            <text class="tr-line-label">销售区域</text>
            <text class="tr-line-value">{{ regionText }}</text>
          </view>

          <text class="tr-tip" v-if="successTip">{{ successTip }}</text>

          <!-- 内嵌二维码 + 操作引导（复用公众号临时引导码 pushImg，仅微信内生成） -->
          <view class="tr-poster-qr" v-if="pushImg">
            <image class="tr-poster-qr-img" :src="pushImg" mode="aspectFit" />
            <text class="tr-poster-qr-tip">长按识别二维码，进入认证公众号查看验真结果</text>
          </view>
          <text class="tr-poster-qr-err" v-else-if="pushErr">当前无法生成引导二维码，请以本页结果为准。</text>
        </view>

        <!-- 🔴 公众号推送引导（扫码查询方案 = 「公众号推送」时）：
               2026-10-30 起它**降级为并行补充** —— 网页已经直接给结果与海报了，
               这里只是告诉用户「认证公众号也会推一份给你」，不再把它当唯一结果出口。
               仅在微信内展示 —— 其他浏览器长按识别不了二维码，展示就是纯干扰。 -->
        <view class="tr-card tr-card-push" v-if="pushImg || pushErr">
          <text class="tr-card-title">公众号也会推一份验真结果</text>
          <text class="tr-push-ok" v-if="pushImg">验真结果正通过认证公众号发送给您</text>
          <text class="tr-card-desc">为防止假冒查询页面，本产品的验真结果同时由商家认证公众号推送一份。您也可以直接以本页结果为准。</text>
          <image v-if="pushImg" class="tr-push-img" :src="pushImg" mode="aspectFit" />
          <text class="tr-push-err" v-if="pushErr">当前无法生成引导二维码，请以本页结果为准。</text>
        </view>

        <!-- 首页展示位（后台配置的推广位，按展示条件由服务端挑好下发）
             🔴 #521 版式对齐对标站：海报与结论在**上**，广告位在**下**；
                位区从横滑改为三列图文网格（一眼看全，不必左右滑，也不再依赖 MP 端横向 scroll-view）。 -->
        <view class="tr-card tr-slots" v-if="slotList.length">
          <text class="tr-slots-title">推荐</text>
          <view class="tr-slots-row">
            <view
              class="tr-slot"
              v-for="(s, i) in slotList"
              :key="i"
              @click="openSlot(s)"
            >
              <image class="tr-slot-cover" :src="slotCover(s.cover)" mode="aspectFill" />
              <text class="tr-slot-name">{{ s.title }}</text>
            </view>
          </view>
        </view>

        <!-- 🔴 P3 全局活动广告位（独立区块，海报下方；服务端已替换 [FWM]/[KEY]） -->
        <view class="tr-card tr-activity" v-if="activity.enabled" @click="openActivity">
          <image v-if="activity.cover" class="tr-activity-cover" :src="absOriginUrl(activity.cover)" mode="aspectFill" />
          <view class="tr-activity-body">
            <text class="tr-activity-title">{{ activity.title || '查看活动详情' }}</text>
            <text class="tr-activity-cta">查看详情 ›</text>
          </view>
        </view>

        <!-- 错误卡片 -->
        <view class="tr-card tr-card-err" v-if="errorMsg">
          <view class="tr-result-head">
            <SIcon name="show" size="large" :color="ICON_DANGER" />
            <text class="tr-result-title tr-title-err">{{ errorMsg }}</text>
          </view>
          <text class="tr-tip" v-if="failTip">{{ failTip }}</text>
        </view>

        <!-- 🔴 P2 激活入口：闸门开启时，消费者扫码被挡（"请联系经销商扫码激活"），
               经销商得有个地方能激活 → 这里给出入口（经销商拿到链接直接点进来）。
               闸门未开时不需要入口（激活无意义），故不显示。 -->
        <view class="tr-card tr-card-act" v-if="gateOn">
          <text class="tr-card-title">批次激活</text>
          <text class="tr-card-desc">货到后用厂家提供的批次号与激活口令完成绑定，激活后消费者扫码才能查看溯源详情。</text>
          <view class="tr-btn" @click="goActivate">
            <text>去激活批次</text>
          </view>
        </view>

        <view class="tr-bottom-space"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import PageNav from '../../components/PageNav.vue';
import SIcon from '../../components/SIcon.vue';
import { getTid } from '../../utils/mallUtil.js';
import { scanEntry, verifyTrace, traceSceneQr, traceScanMode, wxAuthStartUrl } from '../../utils/traceApi.js';
import { execCompLink } from '../../utils/compLink.js';
import { linkFromString } from '../../utils/compLinkModel.js';
import { API_HOST, IS_MP_WEIXIN } from '../../utils/apiBase.js';

// 🔴 SIcon 的 color 会被烘焙进产物（SVG data-URI / 预生成 PNG），var() 到不了
//    → 必须传真实 hex。语义与 styles/token.scss 的 $success / $danger 对齐。
const ICON_SUCCESS = '#07c160';
const ICON_DANGER = '#f53f3f';

const loading = ref(false);
const errorMsg = ref('');
const result = ref(null);
const form = reactive({ co: '', yzm: '' });
// 🔴 2026-10-30：扫码自动出结果后表单收起，这里记「用户又点了一次换个码查询」
const reQuery = ref(false);

// 租户标识：公开段只认 URL ?tid= 或登录态，前端必须把 tid 透传过去
const tid = ref('');

// 🔴 P2：闸门开启且批次未激活时，服务端会带 gateRequired=true → 显示「去激活批次」入口。
//    gateBatch 记住被拦的批次号，跳激活页时带过去（经销商少填一项）。
const gateOn = ref(false);
const gateBatch = ref('');

// 公众号推送方案的「长按识别」引导图（同源相对地址；小程序端需补 host）
const pushImg = ref('');
const pushErr = ref(false);

/** 是否在微信环境内（长按识别二维码的前提；不是微信就别展示引导卡） */
const isWeChatEnv = (() => {
  if (process.env.UNI_PLATFORM === 'mp-weixin') return true;
  try {
    return /micromessenger/i.test(String(navigator.userAgent || ''));
  } catch {
    return false;
  }
})();

function absApiUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `${API_HOST}${s.startsWith('/') ? '' : '/'}${s}`;
}

/**
 * 服务端资源（/uploads/... 相对路径）补全为可直连的绝对地址。
 * 🔴 这是项目里「小程序端 /uploads 相对路径全断」的标准修法（见 apiBase.absUrl）：
 *    - MP 端无 origin 概念，/uploads/... 会被当成「小程序包内路径」→ 加载失败 → 图片空白；
 *      必须补 API_HOST（VITE_MP_API_BASE）成完整 https URL。
 *    - H5 端（含微信内浏览器）补 page origin 成绝对地址，避免任何 base/子路径/CDN 边缘把
 *      根相对 /uploads 解析到错误前缀（同源相对在特殊部署下偶尔会踩，绝对地址最稳）。
 *    已是 https/data/blob 的地址原样返回。
 */
function absOriginUrl(u) {
  const s = String(u || '').trim();
  if (!s || /^(https?:|data:|blob:)/i.test(s)) return s;
  if (IS_MP_WEIXIN) return `${API_HOST}${s.startsWith('/') ? '' : '/'}${s}`;
  try {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
    if (origin) return `${origin}${s.startsWith('/') ? '' : '/'}${s}`;
  } catch { /* ignore */ }
  return s;
}

// 网页授权凭据（服务端签发；前端只原样回传，改一个字符就失效）
const oc = ref('');
// 授权失败过一次就不再重复跳（否则页面会在「跳授权 → 失败 → 再跳」之间死循环）
const oauthFailed = ref(false);

/**
 * 取引导二维码。
 * 🔴 只在档位为「公众号推送」（push_dynamic）时才请求：
 *    默认档位（网页验真）去调一次接口 = 白烧一个公众号二维码额度 + 多一个失败点。
 *    拿不到图就明确退化：页面本身的结果已经足够，不要让消费者以为查失败了。
 */
async function loadPushGuide(code) {
  pushImg.value = '';
  pushErr.value = false;
  if (!code || !isWeChatEnv) return;
  try {
    const r = await traceSceneQr(code, tid.value, oc.value);
    pushImg.value = r && r.imageUrl ? absOriginUrl(r.imageUrl) : '';
    if (!pushImg.value) pushErr.value = true;
  } catch {
    pushErr.value = true;
  }
}

/** 当前页面地址（发给服务端做授权后回跳；必须是本站相对路径） */
function selfPath() {
  try {
    const { pathname = '', search = '', hash = '' } = window.location || {};
    return `${pathname}${search}${hash}`;
  } catch {
    return '';
  }
}

/**
 * 扫码进来的主流程。
 * 🔴 顺序是**先问方案 → 必要时先授权 → 才验真**，不能反过来：
 *    反过来会在授权回跳后重复验真，把同一个人的一次查询记成两次。
 */
async function runScanFlow(rawCode) {
  // 🔴 #521：必须先等 applyScanCode 把清洗后的防伪码回填到 form.co，再 submit；
  //    否则 submit 读到的是空值，等于「扫码后还要手动点一次立即查询」。
  await applyScanCode(rawCode);
  if (isWeChatEnv && !oc.value && !oauthFailed.value && typeof window !== 'undefined') {
    try {
      const m = await traceScanMode(tid.value);
      if (m && m.scanMode === 'push_dynamic' && m.oauthReady) {
        window.location.href = wxAuthStartUrl(tid.value, selfPath());
        return;
      }
    } catch {
      /* 问不到方案就按默认档位走，不要因为一次探测失败卡住消费者 */
    }
  }
  submit();
}

const batchInfo = computed(() => (result.value && result.value.batch) || {});

/**
 * 结果标题：试印码不能显示「正品验证通过」（那是误导）。
 * 🔴 demo 由服务端按流水号预留段判定，前端不做二次推断。
 */
const resultTitle = computed(() => {
  const r = result.value;
  if (!r) return '';
  if (r.demo) return '演示码验证通过';
  return r.first ? '正品验证通过' : '该码已被查询过';
});

/* ============================================================
 * #521 海报区（大图在上 → 结论 → 广告位在下，对齐对标站结果页版式）
 * 数据全部来自服务端已下发的 result.batch，**不新增任何接口字段**。
 * ============================================================ */

/** 海报图：批次主图 banner 优先，缺省回落批次 logo（都没有 → 空，海报区只留信息条）。 */
const posterImage = computed(() => {
  const b = batchInfo.value || {};
  return absOriginUrl(b.banner || b.logo || '');
});

/** 海报上的商品名（取不到就显示通用词，别留空白）。 */
const posterName = computed(() => batchInfo.value.product || batchInfo.value.brand || '产品');

/** 海报副标题：工厂优先、其次品牌；都取不到就不渲染这一行（空行比不显示更难看）。 */
const posterSub = computed(() => batchInfo.value.factory || batchInfo.value.brand || '');

/** 海报右上角徽标文案：试印码不能说「验证通过」。 */
const posterBadge = computed(() => {
  const r = result.value;
  if (!r) return '';
  if (r.demo) return '演示码';
  return r.first ? '验证通过' : '已被查询';
});

/**
 * 首页展示位。
 * 🔴 服务端已按「展示条件 + 本次查询态」挑好（只给本次该渲染的），
 *    前端**不做二次筛选/排序** —— 再筛一次会让「后台配的和 C 端出来的不一致」无法定位。
 * 🔴 服务端下发时已剥掉接口密钥，这里拿到的只有展示字段。
 */
const slotList = computed(() => {
  const s = result.value && result.value.slots;
  return Array.isArray(s) ? s : [];
});

/** 🔴 P3 全局活动广告位（独立区块，不复用首页展示位；服务端已按 [FWM]/[KEY] 变量替换） */
const activity = computed(() => {
  const a = result.value && result.value.activity;
  return a && a.enabled ? a : { enabled: false };
});
function openActivity() {
  const a = activity.value;
  if (!a || !a.link) return;
  execCompLink(linkFromString(a.link));
}

/** 是否「公众号推送」档位（push_dynamic） */
const pushMode = computed(() => result.value?.scanMode === 'push_dynamic');
/**
 * 是否展示「网页验真」结果块（海报 + 结论 + 明细）。
 * 🔴 2026-10-30 起**任何档位都展示**：
 *    「公众号推送」档位原先只给引导、结果只信公众号，理由是防仿冒页。
 *    但实测反馈是：扫码后停在「防伪查询表单 + 请在公众号内查看验真结果」，
 *    既看不到结果、更看不到海报版式 —— 这一档等于没有结果。
 *    现在网页直接给结论与海报，公众号推送作为**并行补充**（下方引导块保留）。
 *    防伪的真防线是防伪码本身 + 批次流向数据，不是"把结果藏起来"。
 */
const showWebResult = computed(() => true);

// 🔴 服务端图片路径（/uploads/ 相对）在 MP 端全断 → 一律补成绝对地址（H5 补 origin / MP 补 API_HOST）。
function slotCover(u) {
  return absOriginUrl(u);
}

/** 点击展示位：跳转基建复用 execCompLink（不在本页另写一套 navigateTo） */
function openSlot(s) {
  if (!s || !s.link) return;
  execCompLink(linkFromString(s.link));
}

const regionText = computed(() => {
  const b = batchInfo.value;
  const parts = [b.province, b.city, b.district].filter(Boolean);
  return parts.length ? parts.join(' / ') : '-';
});

const originText = computed(() => batchInfo.value.origin || '-');

const welcomeText = computed(() => {
  const s = (result.value && result.value.settings) || {};
  return s.welcome || '输入包装上的防伪码，查询产品真伪与溯源信息';
});

const successTip = computed(() => {
  const s = (result.value && result.value.settings) || {};
  const reward = (result.value && result.value.reward) || {};
  if (reward.message) return reward.message;
  // 🔴 首查提示(sucOne)与复访提示(sucTwo)按是否首查分流；任一为空时回退到另一个，避免空白。
  //    此前无条件优先 sucOne，导致「该码已被查询过」（result.first=false）时仍显示"首次查询提示"。
  const isFirst = !!(result.value && result.value.first);
  return isFirst ? (s.sucOne || s.sucTwo || '') : (s.sucTwo || s.sucOne || '');
});

const failTip = computed(() => {
  const s = (result.value && result.value.settings) || {};
  return s.ftel || '';
});

/** 扫码进入：URL 直接带防伪码（?co=xxx）时自动清洗并回填。
 *  🔴 必须返回 Promise（runScanFlow 会 await），保证 form.co 回填后再 submit。 */
function applyScanCode(co) {
  const raw = String(co || '').trim();
  if (!raw) return Promise.resolve();
  return scanEntry(raw, tid.value)
    .then((res) => {
      form.co = (res && res.code) || raw;
    })
    .catch(() => {
      form.co = raw;
    });
}

async function submit() {
  if (loading.value) return;
  const co = String(form.co || '').trim();
  if (!co) {
    errorMsg.value = '请输入防伪码';
    result.value = null;
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  result.value = null;
  pushImg.value = '';
  pushErr.value = false;
  try {
    result.value = await verifyTrace({ co, yzm: String(form.yzm || '').trim(), oc: oc.value }, tid.value);
    // 查到了就把输入表单收起来（页面只剩结果 + 海报 + 广告位）
    reQuery.value = false;
    // 只有「公众号推送」档位（push_dynamic）才去取引导二维码
    if (result.value && result.value.scanMode === 'push_dynamic') loadPushGuide(result.value.code || co);
  } catch (e) {
    errorMsg.value = (e && e.message) || '查询失败，请稍后重试';
    // 🔴 P2 闸门拦截：服务端带结构化标记 gateRequired=true（不靠字符串匹配文案）→ 显示激活入口
    gateOn.value = !!(e && e.data && e.data.gateRequired);
    if (e && e.data && e.data.batchNo) gateBatch.value = String(e.data.batchNo);
  } finally {
    loading.value = false;
  }
}

/**
 * P2 经销商激活页跳转。
 * 🔴 路径必须走常量/工具函数，不要手写字符串（拼错 = 静默失败）。
 */
function goActivate() {
  uni.navigateTo({
    url: `/pages/trace/activate?tid=${encodeURIComponent(tid.value || '')}${gateBatch.value ? `&batch=${encodeURIComponent(gateBatch.value)}` : ''}`,
  });
}

onLoad((options) => {
  // 🔴 租户上下文单一来源 = utils/mallUtil.js 的 getTid（分享 query / 启动 query / 扫码 scene / 渠道绑定）
  tid.value = getTid(options);
  // 网页授权回跳带来的参数：oc = 服务端签发的身份凭据；oafail = 授权没成（按未授权继续出结果）
  if (options && options.oc) oc.value = String(options.oc);
  if (options && (options.oafail === '1' || options.oafail === 1)) oauthFailed.value = true;
  if (options && options.co) runScanFlow(options.co);
});
</script>

<style scoped>
.trace-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-page);
  overflow: hidden;
  box-sizing: border-box;
}
/* MP 端滚动必须 scroll-view：父级定高时用 flex:1 + height:0 撑开剩余空间 */
.trace-scroll { flex: 1; height: 0; }
.trace-inner { padding: 20rpx 24rpx 0; }

.tr-card {
  background: var(--card-bg);
  border-radius: var(--radius-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow-sm);
}
.tr-card-title {
  display: block;
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--t1);
}
.tr-card-desc {
  display: block;
  font-size: var(--fs-3);
  color: var(--t3);
  margin-top: 8rpx;
  margin-bottom: 20rpx;
}
.tr-input {
  height: 88rpx;
  background: var(--bg-page);
  border-radius: var(--radius-md);
  padding: 0 24rpx;
  font-size: var(--fs-5);
  color: var(--t1);
  margin-bottom: 16rpx;
}
.tr-ph { color: var(--t3); }
.tr-btn {
  margin-top: 8rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  background: var(--primary);
  color: var(--white);
  border-radius: var(--radius-md);
  font-size: var(--fs-5);
  font-weight: 600;
}
.tr-btn-off { opacity: 0.6; }
/* 公众号推送方案的引导卡（与其它卡同令牌体系，不新增裸色值） */
.tr-card-push { background: var(--bg-tag); text-align: center; }
.tr-push-img { width: 320rpx; height: 320rpx; margin: 12rpx auto 4rpx; display: block; background: var(--white); border-radius: var(--radius-sm); }
.tr-push-ok { display: block; margin-bottom: 12rpx; font-size: var(--fs-4); font-weight: 600; color: var(--success); }
.tr-push-err { display: block; margin-top: 8rpx; font-size: var(--fs-2); color: var(--t3); }
/* 🔴 P2 激活入口卡：与查询卡区分（用既有令牌，不新增裸 hex） */
.tr-card-act {
  background: var(--bg-tag);
  border: 1px solid var(--border);
}

/* 🔴 溯源结果海报：把「banner + 结论卡」合并成一张带二维码的海报（对齐用户示意图）。
   外层卡片承载圆角/阴影/内边距；演示条与主视觉用负外边距拉满左右与上沿。 */
.tr-poster-card {
  background: var(--card-bg);
  border-radius: var(--radius-md);
  margin-bottom: 20rpx;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  padding: 28rpx;
}
/* 演示/试印提示：海报顶端抢先提示（试印品一眼可辨，不能像正品）。
   🔴 全部走既有令牌（--danger / --white），不新增裸 hex。 */
.tr-poster-demo {
  margin: -28rpx -28rpx 16rpx;
  padding: 16rpx 28rpx;
  background: var(--danger);
  color: var(--white);
  font-size: var(--fs-3);
  line-height: 1.6;
  text-align: center;
}
/* 主视觉：品牌主图 + 验真徽标（沿用原 tr-poster 版式）。
   🔴 没有主图时用品牌色渐变当"文字海报"底，否则容器高度=0 → 徽标与商品名溢出。 */
.tr-poster-hero {
  position: relative;
  margin: -28rpx -28rpx 20rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-deep));
  min-height: 240rpx;
  overflow: hidden;
}
/* 🔴 uni image 无内在尺寸 → 必须显式给宽高，否则 MP 端海报高度为 0 */
.tr-poster-hero-img { width: 100%; height: 420rpx; display: block; background: var(--bg-page); }
/* 底部渐变遮罩：白字压在任何主图上都读得清。
   🔴 不新增裸色：既有 --bg-mask 令牌 + transparent 关键字（rgba 字面量会被 tokenAudit 基线拦） */
.tr-poster-hero-mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 260rpx;
  background: linear-gradient(to bottom, transparent 0%, var(--bg-mask) 100%);
}
.tr-poster-badge {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  padding: 8rpx 20rpx;
  border-radius: var(--radius-pill);
  background: var(--white);
  font-size: var(--fs-2);
  font-weight: 600;
}
.tr-badge-ok { color: var(--success); }
.tr-badge-warn { color: var(--danger); }
.tr-poster-hero-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 24rpx 24rpx;
}
.tr-poster-name {
  display: block;
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--white);
  line-height: 1.3;
}
.tr-poster-sub {
  display: block;
  margin-top: 6rpx;
  font-size: var(--fs-3);
  color: var(--white);
  opacity: 0.86;
  line-height: 1.3;
}
/* 🔴 海报内嵌二维码 + 操作引导（复用公众号临时引导码 pushImg，仅微信内生成） */
.tr-poster-qr {
  margin-top: 20rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid var(--border);
  text-align: center;
}
.tr-poster-qr-img {
  width: 320rpx;
  height: 320rpx;
  margin: 0 auto 12rpx;
  display: block;
  background: var(--white);
  border-radius: var(--radius-sm);
}
.tr-poster-qr-tip {
  display: block;
  font-size: var(--fs-3);
  color: var(--t3);
  line-height: 1.6;
}
.tr-poster-qr-err {
  display: block;
  margin-top: 16rpx;
  font-size: var(--fs-3);
  color: var(--t3);
  text-align: center;
}

.tr-result-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.tr-result-title {
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--success);
}
.tr-title-err { color: var(--danger); }
.tr-line {
  display: flex;
  align-items: flex-start;
  padding: 8rpx 0;
}
.tr-line-label {
  width: 140rpx;
  font-size: var(--fs-4);
  color: var(--t3);
  flex-shrink: 0;
}
.tr-line-value {
  flex: 1;
  font-size: var(--fs-4);
  color: var(--t1);
  word-break: break-all;
}
.tr-tip {
  display: block;
  margin-top: 16rpx;
  font-size: var(--fs-3);
  color: var(--t3);
  line-height: 1.6;
}
/* 🔴 2026-10-30 扫码出结果后收起表单，只留「已查的码 + 换个码再查」一行 */
.tr-recheck {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.tr-recheck-code {
  flex: 1;
  font-size: var(--fs-3);
  color: var(--t3);
  word-break: break-all;
}
.tr-recheck-btn {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: var(--fs-3);
  color: var(--primary);
}
/* 首页展示位：三列图文网格（对标站结果页底部「相关商品」的版式）
   🔴 用 flex 不用 grid —— 小程序端 grid 支持不稳；也不用百分比宽度（卡片 padding 一变就串行） */
.tr-slots-title {
  display: block;
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 20rpx;
}
/* 位宽 204rpx × 3 + 间距 = 容器内宽 ≈ 646rpx（750 − 页面内边距 48 − 卡片内边距 56） */
.tr-slots-row { display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; }
.tr-slot { width: 204rpx; margin-bottom: 20rpx; }
/* 🔴 uni image 无内在尺寸 → 必须显式给宽高，否则 MP 端封面图高度为 0 */
.tr-slot-cover {
  width: 204rpx;
  height: 152rpx;
  display: block;
  border-radius: var(--radius-sm);
  background: var(--bg-page);
}
.tr-slot-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 12rpx;
  font-size: var(--fs-4);
  line-height: 1.4;
  color: var(--t1);
  white-space: normal;
}
/* 🔴 P3 全局活动广告位：结果海报下方的一张整图（独立区块，不复用首页展示位） */
.tr-activity {
  padding: 0;
  overflow: hidden;
}
/* 🔴 uni image 无内在尺寸 → 必须显式给宽高，否则 MP 端图片高度为 0 */
.tr-activity-cover {
  width: 100%;
  height: 300rpx;
  display: block;
  background: var(--bg-page);
}
.tr-activity-body {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
}
.tr-activity-title {
  flex: 1;
  font-size: var(--fs-4);
  line-height: 1.4;
  color: var(--t1);
}
.tr-activity-cta {
  margin-left: 16rpx;
  flex-shrink: 0;
  font-size: var(--fs-3);
  color: var(--t3);
}
.tr-bottom-space { height: 60rpx; }
</style>
