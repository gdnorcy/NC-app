<template>
  <view class="trace-page">
    <!-- PageNav -->
    <PageNav title="防伪溯源" back></PageNav>

    <scroll-view class="trace-scroll" scroll-y :show-scrollbar="false">
      <view class="trace-inner">
        <!-- 查询卡片 -->
        <view class="tr-card">
          <text class="tr-card-title">防伪查询</text>
          <text class="tr-card-desc">{{ welcomeText }}</text>

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
        </view>

        <!-- 查询结果 -->
        <view class="tr-card tr-card-ok" v-if="result">
          <view class="tr-result-head">
            <SIcon name="verify" size="large" :color="ICON_SUCCESS" />
            <text class="tr-result-title">{{ resultTitle }}</text>
          </view>

          <!-- 🔴 P1 试印码提示：流水号落在「顶部预留段」→ 明确告诉扫码的人这是演示码，
               不让试印品冒充正品（试印包流入市场时必须一眼能分清）。 -->
          <view class="tr-demo-tip" v-if="result.demo">
            <text>【演示·试印】本码为印刷前试印码，不是正式防伪码，请勿作为正品凭证</text>
          </view>

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
        </view>

        <!-- 🔴 扫码查询方案 = 「网页 + 公众号推送」时的引导：结果由公众号推送，
               仿冒查询网站就没办法把假结果塞给消费者（这也是该方案存在的意义）。
               仅在微信内展示 —— 其他浏览器长按识别不了二维码，展示就是纯干扰。 -->
        <view class="tr-card tr-card-push" v-if="pushImg || pushErr">
          <text class="tr-card-title">请在公众号内查看验真结果</text>
          <text class="tr-card-desc">为防止假冒查询页面，本产品的验真结果由商家认证公众号主动推送给您。请长按识别下方二维码，识别后即可收到结果（二维码仅短期有效、使用一次后失效）。</text>
          <image v-if="pushImg" class="tr-push-img" :src="pushImg" mode="aspectFit" />
          <text class="tr-push-err" v-if="pushErr">当前无法生成引导二维码，请以本页结果为准。</text>
        </view>

        <!-- 首页展示位（后台配置的推广位，按展示条件由服务端挑好下发） -->
        <view class="tr-card tr-slots" v-if="slotList.length">
          <text class="tr-slots-title">推荐</text>
          <scroll-view class="tr-slots-scroll" scroll-x :show-scrollbar="false">
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
          </scroll-view>
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
import { scanEntry, verifyTrace, traceSceneQr } from '../../utils/traceApi.js';
import { execCompLink } from '../../utils/compLink.js';
import { linkFromString } from '../../utils/compLinkModel.js';
import { assetUrl } from '../../utils/assetUrl.js';
import { API_HOST } from '../../utils/apiBase.js';

// 🔴 SIcon 的 color 会被烘焙进产物（SVG data-URI / 预生成 PNG），var() 到不了
//    → 必须传真实 hex。语义与 styles/token.scss 的 $success / $danger 对齐。
const ICON_SUCCESS = '#07c160';
const ICON_DANGER = '#f53f3f';

const loading = ref(false);
const errorMsg = ref('');
const result = ref(null);
const form = reactive({ co: '', yzm: '' });

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
 * 取引导二维码。
 * 🔴 只在档位真的要求「网页 + 公众号推送」时才请求：
 *    默认档位（网页验真）去调一次接口 = 白烧一个公众号二维码额度 + 多一个失败点。
 *    拿不到图就明确退化：页面本身的结果已经足够，不要让消费者以为查失败了。
 */
async function loadPushGuide(code) {
  pushImg.value = '';
  pushErr.value = false;
  if (!code || !isWeChatEnv) return;
  try {
    const r = await traceSceneQr(code, tid.value);
    pushImg.value = r && r.imageUrl ? absApiUrl(r.imageUrl) : '';
    if (!pushImg.value) pushErr.value = true;
  } catch {
    pushErr.value = true;
  }
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

// 🔴 服务端图片路径（/uploads/ 相对）在 MP 端全断 → 展示点一律过 assetUrl。
function slotCover(u) {
  return assetUrl(u);
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

/** 扫码进入：URL 直接带防伪码（?co=xxx）时自动清洗并回填 */
function applyScanCode(co) {
  const raw = String(co || '').trim();
  if (!raw) return;
  scanEntry(raw, tid.value)
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
    result.value = await verifyTrace({ co, yzm: String(form.yzm || '').trim() }, tid.value);
    // 只有「网页 + 公众号推送」这一档才去取引导二维码
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
  if (options && options.co) applyScanCode(options.co);
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
.tr-push-err { display: block; margin-top: 8rpx; font-size: var(--fs-2); color: var(--t3); }
/* 🔴 P2 激活入口卡：与查询卡区分（用既有令牌，不新增裸 hex） */
.tr-card-act {
  background: var(--bg-tag);
  border: 1px solid var(--border);
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
/* 试印码提示条：红条 + 红字，一眼可辨（试印品绝不能看起来像正品）。
   🔴 全部走既有令牌（--danger / --bg-page / --radius-md），不新增裸 hex —— 
      裸 hex 有基线护栏（tokenAudit），每加一处都在吃掉全项目的余量。 */
.tr-demo-tip {
  margin: 12rpx 0 4rpx;
  padding: 16rpx 20rpx;
  border-radius: var(--radius-md);
  border-left: 6rpx solid var(--danger);
  background: var(--bg-page);
  color: var(--danger);
  font-size: var(--fs-3);
  line-height: 1.6;
}
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
/* 首页展示位：横滑卡片（对映公众号图文消息的 1~8 条图文） */
.tr-slots-title {
  display: block;
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 20rpx;
}
/* MP 端横向 scroll-view：父级需 nowrap/定宽，子项 flex-shrink:0 才不会被压扁 */
.tr-slots-scroll { width: 100%; white-space: nowrap; }
.tr-slots-row { display: inline-flex; flex-direction: row; }
.tr-slot { width: 240rpx; flex-shrink: 0; margin-right: 20rpx; }
.tr-slot:last-child { margin-right: 0; }
/* 🔴 uni image 无内在尺寸 → 必须显式给宽高，否则 MP 端封面图高度为 0 */
.tr-slot-cover {
  width: 240rpx;
  height: 180rpx;
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
.tr-bottom-space { height: 60rpx; }
</style>
