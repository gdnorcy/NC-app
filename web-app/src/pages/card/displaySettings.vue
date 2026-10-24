<template>
  <!-- ===== 展示设置·轻量页（我的名片「名片内容」入口分流）
       两项真实功能：模板样式（复用 templateSelect 页）+ 公开状态（isPublic 即时保存）。
       之前该入口与「名片资料」同跳 create 向导，描述是空头支票——本页让它变成真话。
       ⚠️ 2026-10-15：公开状态开关必须联动 card_market_items（见 onPublicChange/syncMarket），
       只写 is_public 会让「开关已开」与「myCard 集市状态未上架」永久不一致。 ===== -->
  <view class="ds-page" :style="[themeStyle, brandVars]">
    <PageNav title="展示设置" back></PageNav>

    <!-- 加载失败 -->
    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="ds-body" v-else>
      <!-- 模板样式 -->
      <view class="ds-card">
        <view class="ds-sec-title">模板样式</view>
        <view class="ds-row" @click="goTemplateSelect">
          <view class="dsr-icon"><SIcon name="card" size="default" :color="themeColor" /></view>
          <view class="dsr-main">
            <view class="dsr-name">当前模板</view>
            <view class="dsr-desc">{{ currentTemplateName }}</view>
          </view>
          <text class="dsr-arrow">›</text>
        </view>
        <view class="ds-hint">更换模板后名片详情页样式即时生效</view>
      </view>

      <!-- 公开状态 -->
      <view class="ds-card">
        <view class="ds-sec-title">公开状态</view>
        <view class="ds-switch-row">
          <view class="dsr-main">
            <view class="dsr-name">公开到人脉集市</view>
            <view class="dsr-desc">开启后你的名片可在集市页被所有人发现</view>
          </view>
          <switch :checked="isPublic" @change="onPublicChange" :color="themeColor" />
        </view>
      </view>
    </view>
    <!-- 🔴 #312-18c 页面内原地登录：未登录不再跳登录页，当页弹浮层（useInlineLogin 提供开关与回调） -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />

    <!-- 第20轮：无主体引导——输入项目口令发起入驻申请（code 模式；已有名片不重复建卡） -->
    <view v-if="showInviteSheet" class="ds-mask" @click="closeInviteSheet">
      <view class="ds-sheet" @click.stop>
        <view class="ds-sheet-title">输入入驻口令</view>
        <view class="ds-sheet-sub">口令由管理员提供，提交后等待审核，通过后可上架至名片集市</view>
        <input class="ds-sheet-input" v-model="inviteCode" placeholder="请输入入驻口令" placeholder-class="ph" maxlength="12" />
        <view class="ds-sheet-btn" :class="{ busy: inviteBusy }" @click="submitInvite">{{ inviteBusy ? '提交中…' : '提交申请' }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import SIcon from '../../components/SIcon.vue';
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { syncMarketWithIsPublic } from './utils/marketLink.js';
import { getIndividualJoinMode } from './utils/joinMode.js';
import LoginGateModal from '../../components/LoginGateModal.vue';
import { useInlineLogin } from '../../utils/loginGate.js';
// 🔴 #312-18c 原地登录守卫：requireLogin 返回 Promise，登录成功自动继续被拦下的动作
const { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess } = useInlineLogin();
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();
// 租户主题色（platform UI 跟随系统主题）；无主题时回落品牌蓝
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');

const cardId = ref(null);
const isPublic = ref(true);
const currentTemplateName = ref('加载中…');
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
// 第20轮：无主体时按租户双模给出两条引导（purchase=去开通会员 / code=输入口令）
const cardName = ref('');
const cardPhone = ref('');
const showInviteSheet = ref(false);
const inviteCode = ref('');
const inviteBusy = ref(false);

// 无显式 id 时按本人名片兜底（与 myCard 同款，绝不能用 cardLastViewId——可能是他人名片）
async function resolveCardId() {
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  if (opts.id) return opts.id;
  try {
    const safe = await cardApi.getCardsSafe();
    return (safe.cards && safe.cards[0] && safe.cards[0].id) || null;
  } catch (e) { return null; }
}

async function load() {
  const id = await resolveCardId();
  if (!id) {
    loadFailed.value = true;
    loadFailedMsg.value = '未找到你的名片，请先创建名片';
    return;
  }
  cardId.value = id;
  try {
    const [cardRes, tplRes] = await Promise.allSettled([cardApi.getCard(id), cardApi.getTemplates()]);
    if (cardRes.status !== 'fulfilled') throw cardRes.reason;
    const card = cardRes.value.card;
    isPublic.value = !!card.isPublic;
    cardName.value = card.name || '';
    cardPhone.value = card.phone || '';
    // 存量自愈：旧版开关只写 is_public、从不建 card_market_items → 存在一大批
    // 「开着开关却从未上架」的存量数据（真机表现：myCard 集市状态一直「未上架」）。
    // 本页加载时按同款联动逻辑补建一次（幂等，只补「开着但没上架」这一个方向）。
    if (isPublic.value) await healMarketLink();
    const tpls = tplRes.status === 'fulfilled' ? (tplRes.value.templates || []) : [];
    const cur = tpls.find((t) => t.id === Number(card.templateId));
    currentTemplateName.value = cur ? cur.name : (card.templateId ? '自定义模板' : '默认模板');
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '名片加载失败，请检查网络后重试';
  }
}

// onShow 驱动：从 templateSelect 返回后自动刷新当前模板名
onShow(async () => {
  // 🔴 #312-18c 登录门禁：判据与老版一致（card_user.id 或 token 任一即放行），
  //   但未登录不再 redirectTo 登录页——当页弹浮层，登录成功后原地继续 load()
  const me = uni.getStorageSync('card_user') || {};
  const needLogin = !me.id && !uni.getStorageSync('card_token');
  if (needLogin && !(await requireLogin())) return;
  load();
});

function goTemplateSelect() {
  if (!cardId.value) return;
  uni.navigateTo({ url: `/pages/card/templateSelect?cardId=${cardId.value}` });
}

// 公开状态即时保存（PUT /cards/:id 支持部分字段更新，未传字段不受影响）。
// ⚠️ 开关文案承诺「可在集市页被所有人发现」——只写 is_public 是空头支票：myCard 的集市状态
// 与 market 列表只认 card_market_items，不建记录就永远显示「未上架」（2026-10-15 真机报修）。
// 故保存 is_public 后必须联动集市，主体解析与 myCard 同源（utils/marketLink.js）。
async function onPublicChange(e) {
  const val = e.detail.value;
  isPublic.value = val; // 乐观更新，失败回滚
  if (!cardId.value) return;
  try {
    await cardApi.updateCard(cardId.value, { isPublic: val });
  } catch (err) {
    isPublic.value = !val;
    uni.showToast({ title: '保存失败，请重试', icon: 'none' });
    return;
  }
  await syncMarket(val);
}

/**
 * 开关 ↔ 上架记录联动。不变量：开关为开 ⇔ 主体有上架记录（或审核中）。
 * 达不到就把 is_public 回滚、开关回到真实状态——绝不留下「开着但没上架」的空头支票。
 */
async function syncMarket(val) {
  const r = await syncMarketWithIsPublic(cardApi, val);
  if (r.reason === 'no-subject') {
    // 无 active 主体（未入驻/审核中）：开方向无法兑现承诺 → 回滚 is_public，开关保持关。
    // 第20轮：按租户双模给两条路——purchase 引导买会员（买即入场），code 引导输口令。
    if (val) {
      await rollbackPublic(false);
      if (getIndividualJoinMode() === 'purchase') {
        uni.showModal({
          title: '上架名片集市',
          content: '开通会员套餐即可上架至名片集市',
          confirmText: '去开通',
          cancelText: '稍后再说',
          success: (m) => { if (m.confirm) uni.navigateTo({ url: '/pages/card/member' }); },
        });
      } else {
        uni.showModal({
          title: '上架名片集市',
          content: '入驻后可上架至名片集市，请向管理员获取入驻口令',
          confirmText: '输入口令',
          cancelText: '稍后再说',
          success: (m) => { if (m.confirm) showInviteSheet.value = true; },
        });
      }
    }
    // 关方向无记录可下架，is_public 已保存即可
    return;
  }
  if (r.soft) {
    // my-status 网络失败：is_public 保存有效（下次访问本页会自愈补齐），不回滚
    uni.showToast({ title: '已保存，集市状态同步失败请稍后重试', icon: 'none' });
    return;
  }
  if (!r.ok) {
    await rollbackPublic(!val);
    uni.showToast({ title: r.error || '集市操作失败，请重试', icon: 'none' });
    return;
  }
  uni.showToast({
    title: val ? (r.auditStatus === 'pending' ? '已提交上架申请，等待审核' : '已公开到集市') : '已关闭公开',
    icon: 'none',
  });
}

/** 存量自愈：开着开关却没上架记录时补建；无主体/硬失败则回滚开关，让开关只说真话 */
async function healMarketLink() {
  const r = await syncMarketWithIsPublic(cardApi, true);
  if (r.ok && r.changed) {
    uni.showToast({ title: r.auditStatus === 'pending' ? '已补齐上架申请，等待审核' : '已补齐集镇上架', icon: 'none' });
    return;
  }
  if (r.reason === 'no-subject') {
    // 存量「开着但从未上架」且无 active 主体（未入驻/审核中）→ 回滚成关并说明原因。
    // 第20轮：加载时的静默自愈不弹模态（惊扰），按双模给一句轻 toast。
    await rollbackPublic(false);
    uni.showToast({
      title: getIndividualJoinMode() === 'purchase'
        ? '开通会员套餐即可上架至名片集市'
        : '入驻后可上架至名片集市，请向管理员获取入驻口令',
      icon: 'none',
    });
    return;
  }
  if (!r.ok && !r.soft) {
    // 集市未开启/配额满等硬失败：开着也上不了 → 回滚成关
    await rollbackPublic(false);
    uni.showToast({ title: r.error || '集市未开启', icon: 'none' });
  }
  // soft（网络失败）/ 已一致：静默，myCard 会展示真实状态
}

async function rollbackPublic(v) {
  if (cardId.value) {
    try { await cardApi.updateCard(cardId.value, { isPublic: v }); } catch (e) { /* 本地态已回滚 */ }
  }
  isPublic.value = v;
}

/** 第20轮：凭项目口令发起入驻申请（POST /card-market/apply，个人类型） */
async function submitInvite() {
  const code = String(inviteCode.value || '').trim().toUpperCase();
  if (!code) {
    uni.showToast({ title: '请输入入驻口令', icon: 'none' });
    return;
  }
  if (inviteBusy.value) return;
  inviteBusy.value = true;
  try {
    if (!(await requireLogin())) return;
    await cardApi.applyIndividual({
      type: 'individual',
      bindCode: code,
      name: cardName.value || '未命名',
      phone: cardPhone.value || '',
      position: '',
    });
    closeInviteSheet();
    uni.showToast({ title: '入驻申请已提交，审核通过后可上架集市', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败，请重试', icon: 'none' });
  } finally {
    inviteBusy.value = false;
  }
}

function closeInviteSheet() {
  showInviteSheet.value = false;
  inviteCode.value = '';
}

function reloadPage() { load(); }
</script>

<style scoped>
.ds-page { min-height: 100vh; background: var(--bg-page); }
.ds-body { padding: 20rpx 24rpx 60rpx; }
.ds-card {
  background: var(--white); border-radius: 20rpx; padding: 24rpx 28rpx; margin-bottom: 20rpx;
  box-shadow: 0 8rpx 28rpx rgba(20,40,70,.08);
}
.ds-sec-title { font-size: var(--fs-5); font-weight: 600; color: var(--t5); padding: 8rpx 0 16rpx; }
.ds-row { display: flex; align-items: center; gap: 16rpx; padding: 16rpx 0; }
.dsr-icon { width: 72rpx; height: 72rpx; border-radius: var(--radius-md); background: rgba(var(--design-primary-rgb, 22, 93, 255), .06); display: flex; align-items: center; justify-content: center; }
.dsr-main { flex: 1; min-width: 0; }
.dsr-name { font-size: var(--fs-5); color: var(--t5); }
.dsr-desc { font-size: var(--fs-2); color: var(--t4); margin-top: 4rpx; }
.dsr-arrow { font-size: var(--fs-6); color: var(--border-strong); }
.ds-hint { font-size: var(--fs-2); color: var(--t4); padding: 8rpx 0 4rpx; }

/* 第20轮：入驻口令浮层（MP 安全：fixed + 令牌，禁 transform 造层叠） */
.ds-mask {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: var(--bg-mask); z-index: var(--z-popup);
  display: flex; align-items: flex-end; justify-content: center;
}
.ds-sheet {
  width: 100%; background: var(--white); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: 40rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
}
.ds-sheet-title { font-size: var(--fs-4); font-weight: 600; color: var(--t5); }
.ds-sheet-sub { font-size: var(--fs-2); color: var(--t4); margin: 12rpx 0 28rpx; }
.ds-sheet-input {
  height: 88rpx; background: var(--bg-page); border-radius: var(--radius-md);
  padding: 0 24rpx; font-size: var(--fs-4); color: var(--t5);
}
.ph { color: var(--t4); }
.ds-sheet-btn {
  margin-top: 32rpx; height: 88rpx; line-height: 88rpx; text-align: center;
  background: var(--design-primary); color: var(--white);
  border-radius: var(--radius-md); font-size: var(--fs-4); font-weight: 600;
}
.ds-sheet-btn.busy { opacity: .6; }
.ds-switch-row { display: flex; align-items: center; gap: 16rpx; padding: 8rpx 0 16rpx; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: var(--fs-4); color: var(--t3); }
.pg-btn {
  margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx;
  background: var(--design-primary, #165dff); color: var(--white); font-size: var(--fs-5);
}
</style>
