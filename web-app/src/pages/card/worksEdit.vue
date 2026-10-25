<template>
  <!-- ===== 作品管理·轻量编辑页（我的名片「名片内容」入口分流）
       历史上 card_works 只有 seed 写入 + 公开 GET，用户/运营均无管理入口；
       本页补齐 C 端作品的增/改/删/排序（服务端 card.js 有归属校验）。 ===== -->
  <view class="wk-page" :style="[themeStyle, brandVars]">
    <PageNav title="作品管理" back></PageNav>

    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="wk-body" v-else>
      <view class="wk-desc">
        作品展示在名片详情页「{{ worksLabel || '作品' }}」标签，支持图片与标题，可拖动排序。
        <text class="wk-quota" :class="{ full: works.length >= worksLimit }">已添加 {{ works.length }}/{{ worksLimit }} 张</text>
      </view>

      <!-- 自定义标签名（白银+权益；锁定时展示升级入口） -->
      <view class="wk-label-row">
        <view class="wkl-main">
          <text class="wkl-name">标签名称</text>
          <text class="wkl-desc">最多 6 字，展示在名片详情页 Tab 上</text>
        </view>
        <input
          v-if="customWorksLabel"
          class="wkl-input"
          v-model="worksLabel"
          placeholder="作品"
          maxlength="6"
          placeholder-class="ph"
          @blur="saveLabel"
        />
        <view v-else class="wkl-lock" @click="goUpgradeForLabel">白银+ 可自定义 ›</view>
      </view>

      <view class="wk-empty" v-if="!works.length && !loading">
        <view class="wk-empty-t">还没有作品</view>
        <view class="wk-empty-d">点击下方按钮添加第一张作品图</view>
      </view>

      <view class="wk-list">
        <view class="wk-row" v-for="(w, i) in works" :key="w.id">
          <view class="wk-idx">{{ i + 1 }}</view>
          <image class="wk-img" :src="w.imageUrl" mode="aspectFill" />
          <view class="wk-mid">
            <input
              class="wk-title-input"
              v-model="w.title"
              placeholder="作品标题（选填）"
              placeholder-class="ph"
              @blur="saveTitle(w)"
            />
            <view class="wk-ops">
              <text class="wk-op" :class="{ off: i === 0 }" @click="move(w, -1)">上移</text>
              <text class="wk-op" :class="{ off: i === works.length - 1 }" @click="move(w, 1)">下移</text>
              <text class="wk-op del" @click="remove(w)">删除</text>
            </view>
          </view>
        </view>
      </view>

      <view class="wk-add" @click="add">
        <text class="wk-add-plus">＋</text>
        <text>{{ works.length >= worksLimit ? '已达上限，升级添加更多' : '添加作品' }}</text>
      </view>
    </view>
    <!-- 🔴 #312-18c 页面内原地登录：未登录不再跳登录页，当页弹浮层（useInlineLogin 提供开关与回调） -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import LoginGateModal from '../../components/LoginGateModal.vue';
import { useInlineLogin } from '../../utils/loginGate.js';
// 🔴 #312-18c 原地登录守卫：requireLogin 返回 Promise，登录成功自动继续被拦下的动作
const { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess } = useInlineLogin();
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
const themeStyle = useDesignTheme();
const { brandVars } = useBrandOverride();

const cardId = ref(null);
const works = ref([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
// 会员分级权益（benefits.js 单一来源经 /member/status 下发；兜底 free 档）
const worksLimit = ref(3);
const customWorksLabel = ref(false);
const worksLabel = ref('');

// 无显式 id 时按本人名片兜底（与 needTagsEdit 同款）
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
  loading.value = true;
  const id = await resolveCardId();
  if (!id) {
    loadFailed.value = true;
    loadFailedMsg.value = '未找到你的名片，请先创建名片';
    loading.value = false;
    return;
  }
  cardId.value = id;
  try {
    // 权益快照 + 当前名片自定义标签名（并行，互不依赖）
    const [st, c] = await Promise.all([
      cardApi.getMemberStatus().catch(() => null),
      cardApi.getCard(id).catch(() => null),
    ]);
    const b = (st && st.benefits) || {};
    if (Number(b.worksLimit) > 0) worksLimit.value = Number(b.worksLimit);
    customWorksLabel.value = !!b.customWorksLabel;
    worksLabel.value = (c && c.card && c.card.worksLabel) || '';
    const res = await cardApi.getCardWorks(id);
    works.value = (res.works || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '作品加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

// 升级引导（作品/标签名超限共用）
function showUpgrade(text) {
  uni.showModal({
    title: '升级会员',
    content: text,
    confirmText: '去升级',
    cancelText: '以后再说',
    success: (r) => {
      if (r.confirm) uni.navigateTo({ url: '/pages/card/member' });
    },
  });
}

function goUpgradeForLabel() {
  showUpgrade('自定义作品标签名是白银及以上会员权益，升级后即可把「作品」改成「案例」等名称');
}

async function add() {
  if (!cardId.value) return;
  // 前端预检（服务端 POST /works 同样强制，双保险）
  if (works.value.length >= worksLimit.value) {
    showUpgrade(`作品数量已达上限（${works.value.length}/${worksLimit.value} 张），升级会员可添加更多作品`);
    return;
  }
  uni.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
    success: async (res) => {
      const f = (res.tempFiles && res.tempFiles[0]) || {};
      if (!f.tempFilePath) return;
      uni.showLoading({ title: '上传中…', mask: true });
      try {
        const data = await cardApi.addCardWork(cardId.value, f.tempFilePath, '');
        uni.hideLoading();
        if (data && data.work) {
          works.value.push(data.work);
          uni.showToast({ title: '已添加', icon: 'success' });
        }
      } catch (e) {
        uni.hideLoading();
        // 服务端限额命中（403 limitHit）：弹升级引导而非普通错误
        if (String(e.message || '').indexOf('上限') >= 0) {
          showUpgrade(e.message);
        } else {
          uni.showToast({ title: e.message || '上传失败', icon: 'none' });
        }
      }
    },
  });
}

function remove(w) {
  uni.showModal({
    title: '删除作品',
    content: '确定删除这张作品吗？',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteCardWork(cardId.value, w.id);
        works.value = works.value.filter((x) => x.id !== w.id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e.message || '删除失败', icon: 'none' });
      }
    },
  });
}

async function move(w, dir) {
  const i = works.value.indexOf(w);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= works.value.length) return;
  const arr = works.value.slice();
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
  works.value = arr;
  try {
    await cardApi.sortCardWorks(cardId.value, arr.map((x) => x.id));
  } catch (e) {
    uni.showToast({ title: '排序保存失败', icon: 'none' });
  }
}

let titleTimer = null;
function saveTitle(w) {
  // 防抖：聚焦连续编辑只保存一次
  if (titleTimer) clearTimeout(titleTimer);
  titleTimer = setTimeout(async () => {
    try {
      await cardApi.updateCardWork(cardId.value, w.id, w.title || '');
    } catch (e) { /* 静默：失焦保存失败不打扰，用户可再次编辑触发 */ }
  }, 300);
}

let labelTimer = null;
function saveLabel() {
  // 自定义标签名（PUT /cards/:id 带 worksLabel；服务端按会员等级门禁）
  if (labelTimer) clearTimeout(labelTimer);
  labelTimer = setTimeout(async () => {
    const v = String(worksLabel.value || '').trim().slice(0, 6);
    try {
      await cardApi.updateCard(cardId.value, { worksLabel: v });
      uni.showToast({ title: '标签名已保存', icon: 'success' });
    } catch (e) {
      if (String(e.message || '').indexOf('会员') >= 0) {
        customWorksLabel.value = false;
        goUpgradeForLabel();
      } else {
        uni.showToast({ title: e.message || '保存失败', icon: 'none' });
      }
    }
  }, 300);
}

function reloadPage() { load(); }

onMounted(async () => {
  // 🔴 #312-18c 登录门禁：判据与老版一致（card_user.id 或 token 任一即放行），
  //   但未登录不再 redirectTo 登录页——当页弹浮层，登录成功后原地继续 load()
  const me = uni.getStorageSync('card_user') || {};
  const needLogin = !me.id && !uni.getStorageSync('card_token');
  if (needLogin && !(await requireLogin())) return;
  load();
});
</script>

<style scoped>
.wk-page { min-height: 100vh; background: var(--bg-page); }
.wk-body { padding: 20rpx 24rpx 80rpx; }
.wk-desc { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; margin-bottom: 24rpx; }
.wk-quota { margin-left: 16rpx; color: var(--t3); }
.wk-quota.full { color: var(--t1); font-weight: 500; }
.wk-label-row { display: flex; align-items: center; gap: 18rpx; background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 20rpx; margin-bottom: 20rpx; }
.wkl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }
.wkl-name { font-size: var(--fs-4); color: var(--t1); }
.wkl-desc { font-size: var(--fs-2); color: var(--t3); }
.wkl-input { width: 180rpx; font-size: var(--fs-4); color: var(--t1); text-align: right; border-bottom: 1rpx solid var(--border-strong); padding: 8rpx 0; }
.wkl-lock { font-size: var(--fs-3); color: var(--design-primary); flex-shrink: 0; }
.wk-empty { text-align: center; padding: 80rpx 40rpx; background: var(--white); border-radius: 20rpx; }
.wk-empty-t { font-size: var(--fs-5); font-weight: 500; color: var(--t5); }
.wk-empty-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; }
.wk-list { display: flex; flex-direction: column; gap: 20rpx; }
.wk-row { display: flex; align-items: center; gap: 18rpx; background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 20rpx; }
.wk-idx { width: 36rpx; text-align: center; font-size: var(--fs-4); color: var(--t3); flex-shrink: 0; }
.wk-img { width: 120rpx; height: 120rpx; border-radius: var(--radius-xs); background: var(--bg-hover); flex-shrink: 0; }
.wk-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14rpx; }
.wk-title-input { font-size: var(--fs-4); color: var(--t1); border-bottom: 1rpx solid var(--border-strong); padding: 8rpx 0; }
.ph { color: var(--t3); }
.wk-ops { display: flex; gap: 24rpx; }
.wk-op { font-size: var(--fs-3); color: var(--design-primary, #165dff); }
.wk-op.off { color: var(--t3); opacity: 0.5; }
.wk-op.del { color: var(--danger, #d54941); }
.wk-add {
  margin-top: 28rpx; height: 92rpx; border-radius: 20rpx; border: 2rpx dashed var(--border-strong);
  display: flex; align-items: center; justify-content: center; gap: 12rpx;
  color: var(--design-primary, #165dff); font-size: var(--fs-4); background: var(--white);
}
.wk-add-plus { font-size: 34rpx; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: var(--fs-4); color: var(--t3); }
.pg-btn { margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx; background: var(--design-primary, #165dff); color: var(--white); font-size: var(--fs-5); }
</style>
