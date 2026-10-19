<template>
  <!-- ===== 视频号作品管理·轻量编辑页（我的名片「名片内容」入口分流）
       视频号链接调用方案（2026-10 改造）：不再上传相册视频，改为录入视频号
       finderUserName + feedId，访客点击封面走 wx.openChannelsActivity 跳转具体视频
       （无主体限制）。封面统一默认图 + 播放键（微信反爬致封面无法服务端抓取）。
       支持：粘贴分享链接自动解析 / 手动填 ID 兜底 / 测试预览 / 多条排序 / 启停开关。 ===== -->
  <view class="wk-page" :style="[themeStyle, brandVars]">
    <PageNav title="视频管理" back></PageNav>

    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="wk-body" v-else>
      <view class="wk-desc">
        添加你的视频号作品，访客在名片详情页点击封面即可跳转观看，支持多条与排序。
        <text class="wk-quota" :class="{ full: videos.length >= videosLimit }">已添加 {{ videos.length }}/{{ videosLimit }} 个</text>
      </view>

      <!-- 无视频位（free）或已达上限：升级引导卡 -->
      <view class="vt-upgrade" v-if="videosLimit <= 0 || videos.length >= videosLimit">
        <view class="vt-up-t">视频号作品需白银及以上会员</view>
        <view class="vt-up-d">白银可添加 2 个、黄金 6 个、钻石 20 个视频号作品</view>
        <view class="vt-up-btn" @click="goUpgrade">去升级</view>
      </view>

      <view class="wk-empty" v-if="!videos.length && !loading && videosLimit > 0">
        <view class="wk-empty-t">还没有视频号作品</view>
        <view class="wk-empty-d">点击下方按钮，粘贴视频号分享链接即可添加</view>
      </view>

      <view class="wk-list">
        <view class="wk-row" v-for="(v, i) in videos" :key="v.id" :class="{ 'row-off': !v.isShow }">
          <view class="wk-idx">{{ i + 1 }}</view>
          <!-- 默认封面：品牌渐变底 + 播放键（无上传封面，coverUrl 恒空） -->
          <view class="wk-cover">
            <view class="wk-play"></view>
          </view>
          <view class="wk-mid">
            <input
              class="wk-title-input"
              v-model="v.title"
              placeholder="视频标题（选填）"
              placeholder-class="ph"
              @blur="saveMeta(v)"
            />
            <view class="wk-ids">finder: {{ v.finderUserName }}</view>
            <view class="wk-ids wk-feed">feedId: {{ v.feedId }}</view>
            <view class="wk-ops">
              <text class="wk-op" :class="{ off: i === 0 }" @click="move(v, -1)">上移</text>
              <text class="wk-op" :class="{ off: i === videos.length - 1 }" @click="move(v, 1)">下移</text>
              <text class="wk-op" @click="testVideo(v)">测试</text>
              <text class="wk-op del" @click="remove(v)">删除</text>
            </view>
          </view>
          <!-- 启停开关：隐藏后访客不可见，仅自己可见 -->
          <view class="wk-switch" :class="{ on: v.isShow }" @click="toggleShow(v)">
            <view class="wk-dot"></view>
          </view>
        </view>
      </view>

      <view class="wk-add" @click="openPopup" v-if="videosLimit > 0 && videos.length < videosLimit">
        <text class="wk-add-plus">＋</text>
        <text>添加视频号视频</text>
      </view>
    </view>

    <!-- ===== 添加弹窗：粘贴链接解析 / 手动填 ID 兜底 ===== -->
    <view class="wk-mask" v-if="popup.show" @click="closePopup"></view>
    <view class="wk-popup" v-if="popup.show">
      <view class="wk-pop-title">添加视频号视频</view>

      <view class="wk-mode">
        <view class="wk-mode-item" :class="{ on: popup.mode === 'link' }" @click="popup.mode = 'link'">粘贴分享链接（推荐）</view>
        <view class="wk-mode-item" :class="{ on: popup.mode === 'id' }" @click="popup.mode = 'id'">手动填写 ID</view>
      </view>

      <!-- 链接模式 -->
      <block v-if="popup.mode === 'link'">
        <textarea
          class="wk-link-input"
          v-model="popup.link"
          placeholder="粘贴视频号分享链接，如 https://channels.weixin.qq.com/web/pages/feed-detail/index?finderUserName=sphxxx&feedId=xxx"
          placeholder-class="ph"
          :maxlength="500"
        />
        <view class="wk-parse-btn" @click="doParse">
          <text v-if="!popup.parsing">解析链接</text>
          <text v-else>解析中…</text>
        </view>
      </block>

      <!-- 手动填 ID 模式 -->
      <block v-else>
        <view class="wk-hint">ID 获取：视频号助手 → 首页复制视频号ID（sph 开头）；动态管理 → 单条视频复制 feedId</view>
        <input class="wk-id-input" v-model="popup.finder" placeholder="finderUserName（视频号ID，sph 开头）" placeholder-class="ph" />
        <input class="wk-id-input" v-model="popup.feed" placeholder="feedId（视频唯一标识）" placeholder-class="ph" />
      </block>

      <!-- 解析结果 / 手动填写回显 -->
      <view class="wk-parsed" v-if="popup.finder && popup.feed">
        <text class="wk-parsed-ok">✓ 已识别</text>
        <text class="wk-parsed-ids">{{ popup.finder }} · {{ popup.feed }}</text>
      </view>

      <input class="wk-id-input" v-model="popup.title" placeholder="视频标题（选填）" placeholder-class="ph" />

      <view class="wk-test" @click="testPopup">测试预览（跳转视频号验证）</view>

      <!-- 合规承诺（开发文档 7.5）：平台仅跳转不存储视频内容 -->
      <view class="wk-agree" @click="popup.agree = !popup.agree">
        <view class="wk-checkbox" :class="{ on: popup.agree }"></view>
        <text class="wk-agree-t">我承诺拥有该视频内容版权、内容合法合规，平台仅做跳转、不存储视频</text>
      </view>

      <view class="wk-pop-btns">
        <view class="wk-pop-btn cancel" @click="closePopup">取消</view>
        <view class="wk-pop-btn ok" @click="saveVideo">
          <text v-if="!popup.saving">保存</text>
          <text v-else>保存中…</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, reactive, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
const themeStyle = useDesignTheme();
const { brandVars } = useBrandOverride();

const cardId = ref(null);
const videos = ref([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
// 会员分级权益（benefits.js 单一来源经 /member/status 下发；free 档 videosLimit=0）
const videosLimit = ref(0);

// 无显式 id 时按本人名片兜底（与 worksEdit 同款）
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
    // 权益快照 + 视频列表（并行，互不依赖）
    const [st, res] = await Promise.all([
      cardApi.getMemberStatus().catch(() => null),
      cardApi.getCardVideos(id),
    ]);
    const b = (st && st.benefits) || {};
    videosLimit.value = Number(b.videosLimit) >= 0 ? Number(b.videosLimit) : 0;
    videos.value = (res.videos || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '视频加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

// 升级引导（超限/无视频位共用）
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

function goUpgrade() {
  showUpgrade('视频号作品是白银及以上会员权益：白银 2 个、黄金 6 个、钻石 20 个，升级后即可添加');
}

// ===== 添加弹窗 =====
const popup = reactive({
  show: false,
  mode: 'link',     // link=粘贴链接解析 / id=手动填写
  link: '',
  finder: '',
  feed: '',
  title: '',
  agree: false,
  parsing: false,
  saving: false,
});

function openPopup() {
  if (!cardId.value) return;
  // 前端预检（服务端同样强制，双保险）
  if (videosLimit.value <= 0) { goUpgrade(); return; }
  if (videos.value.length >= videosLimit.value) {
    showUpgrade(`视频号作品数量已达上限（${videos.value.length}/${videosLimit.value} 个），升级会员可添加更多`);
    return;
  }
  popup.show = true;
  popup.mode = 'link';
  popup.link = '';
  popup.finder = '';
  popup.feed = '';
  popup.title = '';
  popup.agree = false;
  popup.parsing = false;
  popup.saving = false;
}

function closePopup() {
  popup.show = false;
}

// 链接解析：失败自动切手动模式兜底（开发文档 3.2 降级链）；
// 主页短链（/sph/xxxx）单独引导——它拿不到具体视频，需用户复制「单条视频」的分享链接
async function doParse() {
  const link = String(popup.link || '').trim();
  if (!link) {
    uni.showToast({ title: '请先粘贴分享链接', icon: 'none' });
    return;
  }
  popup.parsing = true;
  try {
    const data = await cardApi.parseChannelLink(cardId.value, link);
    popup.finder = data.finderUserName || '';
    popup.feed = data.feedId || '';
    uni.showToast({ title: '解析成功', icon: 'success' });
  } catch (e) {
    popup.mode = 'id';
    if (e.data && e.data.code === 'channelHomeLink') {
      uni.showModal({ title: '这是视频号主页链接', content: e.message, showCancel: false });
    } else {
      uni.showToast({ title: e.message || '解析失败，请手动填写ID', icon: 'none' });
    }
  } finally {
    popup.parsing = false;
  }
}

// 测试预览：MP 走 wx.openChannelsActivity；H5 无该能力，提示去小程序验证
function testPreview(finder, feed) {
  if (!/^sph/i.test(String(finder || '')) || !feed) {
    uni.showToast({ title: '请先填写有效的 finderUserName 与 feedId', icon: 'none' });
    return;
  }
  // #ifdef MP-WEIXIN
  wx.openChannelsActivity({
    finderUserName: finder,
    feedId: feed,
    fail: () => uni.showToast({ title: '视频不存在或已被删除', icon: 'none' }),
  });
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '测试预览请在小程序端进行', icon: 'none' });
  // #endif
}

function testVideo(v) {
  testPreview(v.finderUserName, v.feedId);
}

function testPopup() {
  testPreview(popup.finder, popup.feed);
}

// 保存：JSON 落库（服务端 sph 校验 + 同卡去重 + 会员门禁）
async function saveVideo() {
  if (popup.saving) return;
  if (!/^sph/i.test(String(popup.finder || '').trim())) {
    uni.showToast({ title: 'finderUserName 需以 sph 开头', icon: 'none' });
    return;
  }
  const feed = String(popup.feed || '').trim();
  if (!feed) {
    uni.showToast({ title: '请填写 feedId', icon: 'none' });
    return;
  }
  if (!popup.agree) {
    uni.showToast({ title: '请先勾选内容合规承诺', icon: 'none' });
    return;
  }
  popup.saving = true;
  try {
    const data = await cardApi.addCardVideo(cardId.value, {
      finderUserName: String(popup.finder).trim(),
      feedId: feed,
      title: String(popup.title || '').trim(),
    });
    if (data && data.video) {
      videos.value.push(data.video);
      videos.value.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      closePopup();
      uni.showToast({ title: '已添加', icon: 'success' });
    }
  } catch (e) {
    // 403 limitHit → 升级引导；409 duplicated → 重复提示；其余普通错误
    if (e.data && e.data.code === 'limitHit') {
      showUpgrade(e.message);
    } else if (e.data && e.data.code === 'duplicated') {
      uni.showToast({ title: '该视频已添加过', icon: 'none' });
    } else {
      uni.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  } finally {
    popup.saving = false;
  }
}

function remove(v) {
  uni.showModal({
    title: '删除视频',
    content: '确定删除这个视频号作品吗？',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteCardVideo(cardId.value, v.id);
        videos.value = videos.value.filter((x) => x.id !== v.id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e.message || '删除失败', icon: 'none' });
      }
    },
  });
}

async function move(v, dir) {
  const i = videos.value.indexOf(v);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= videos.value.length) return;
  const arr = videos.value.slice();
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
  videos.value = arr;
  try {
    await cardApi.sortCardVideos(cardId.value, arr.map((x) => x.id));
  } catch (e) {
    uni.showToast({ title: '排序保存失败', icon: 'none' });
  }
}

// 启停开关：乐观更新，失败回滚（访客只看 is_show=1）
async function toggleShow(v) {
  const next = !v.isShow;
  v.isShow = next;
  try {
    await cardApi.updateCardVideo(cardId.value, v.id, { isShow: next });
  } catch (e) {
    v.isShow = !next;
    uni.showToast({ title: '操作失败', icon: 'none' });
  }
}

let metaTimer = null;
function saveMeta(v) {
  // 防抖：聚焦连续编辑只保存一次（仅标题；duration 已随方案废弃，不传即保留）
  if (metaTimer) clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    try {
      await cardApi.updateCardVideo(cardId.value, v.id, { title: v.title || '' });
    } catch (e) { /* 静默：失焦保存失败不打扰，用户可再次编辑触发 */ }
  }, 300);
}

function reloadPage() { load(); }

onMounted(() => {
  // 登录门禁：与 worksEdit 同款（未登录跳登录并回跳本页）
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  const me = uni.getStorageSync('card_user') || {};
  if (!me.id && !uni.getStorageSync('card_token')) {
    uni.redirectTo({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/videosEdit' + (opts.id ? `?id=${opts.id}` : '')) });
    return;
  }
  load();
});
</script>

<style scoped>
.wk-page { min-height: 100vh; background: var(--bg-page); }
.wk-body { padding: 20rpx 24rpx 80rpx; }
.wk-desc { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; margin-bottom: 24rpx; }
.wk-quota { margin-left: 16rpx; color: var(--t3); }
.wk-quota.full { color: var(--t1); font-weight: 500; }
.vt-upgrade { background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 32rpx 24rpx; text-align: center; margin-bottom: 24rpx; }
.vt-up-t { font-size: var(--fs-4); font-weight: 500; color: var(--t1); }
.vt-up-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; line-height: 1.5; }
.vt-up-btn { margin: 24rpx auto 0; display: inline-block; padding: 12rpx 48rpx; border-radius: 40rpx; background: var(--design-primary); color: var(--white); font-size: var(--fs-4); }
.wk-empty { text-align: center; padding: 80rpx 40rpx; background: var(--white); border-radius: 20rpx; }
.wk-empty-t { font-size: var(--fs-5); font-weight: 500; color: var(--t5); }
.wk-empty-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; }
.wk-list { display: flex; flex-direction: column; gap: 20rpx; }
.wk-row { display: flex; align-items: center; gap: 18rpx; background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 20rpx; }
.wk-row.row-off { opacity: 0.55; }
.wk-idx { width: 36rpx; text-align: center; font-size: var(--fs-4); color: var(--t3); flex-shrink: 0; }
/* 默认封面：品牌渐变 + 居中播放键（CSS 三角，跨端稳定；不用 color-mix，MP 老版本不识别） */
.wk-cover {
  width: 120rpx; height: 120rpx; border-radius: 12rpx; flex-shrink: 0;
  background: var(--design-primary);
  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.32));
  display: flex; align-items: center; justify-content: center;
}
.wk-play {
  width: 0; height: 0;
  border-top: 16rpx solid transparent;
  border-bottom: 16rpx solid transparent;
  border-left: 26rpx solid rgba(255, 255, 255, 0.92);
  margin-left: 8rpx;
}.wk-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx; }
.wk-title-input { font-size: var(--fs-4); color: var(--t1); border-bottom: 1rpx solid var(--border-strong); padding: 8rpx 0; }
.wk-ids { font-size: var(--fs-1); color: var(--t3); word-break: break-all; }
.wk-feed { opacity: 0.8; }
.ph { color: var(--t3); }
.wk-ops { display: flex; gap: 24rpx; }
.wk-op { font-size: var(--fs-3); color: var(--design-primary); }
.wk-op.off { color: var(--t3); opacity: 0.5; }
.wk-op.del { color: var(--danger); }
/* 启停开关（view 手写，避免组件跨端差异） */
.wk-switch { width: 84rpx; height: 44rpx; border-radius: 22rpx; background: var(--border-strong); flex-shrink: 0; padding: 4rpx; transition: background 0.2s; }
.wk-switch.on { background: var(--design-primary); }
.wk-dot { width: 36rpx; height: 36rpx; border-radius: 50%; background: var(--white); transition: transform 0.2s; }
.wk-switch.on .wk-dot { transform: translateX(40rpx); }
.wk-add {
  margin-top: 28rpx; height: 92rpx; border-radius: 20rpx; border: 2rpx dashed var(--border-strong);
  display: flex; align-items: center; justify-content: center; gap: 12rpx;
  color: var(--design-primary); font-size: var(--fs-4); background: var(--white);
}
.wk-add-plus { font-size: 34rpx; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: var(--fs-4); color: var(--t3); }
.pg-btn { margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx; background: var(--design-primary); color: var(--white); font-size: var(--fs-5); }

/* ===== 添加弹窗 ===== */
/* mask 与 popup 同用 --z-popup，靠 DOM 顺序保证弹窗压遮罩（同 myCard 海报弹层模式） */
.wk-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: var(--bg-mask); z-index: var(--z-popup); }
.wk-popup {
  position: fixed; left: 24rpx; right: 24rpx; top: 50%; transform: translateY(-50%);
  background: var(--white); border-radius: 24rpx; padding: 36rpx 28rpx; z-index: var(--z-popup);
  max-height: 82vh; overflow-y: auto;
}
.wk-pop-title { font-size: var(--fs-5); font-weight: 600; color: var(--t1); text-align: center; margin-bottom: 28rpx; }
.wk-mode { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.wk-mode-item {
  flex: 1; text-align: center; font-size: var(--fs-3); color: var(--t3);
  border: 1rpx solid var(--border-strong); border-radius: 12rpx; padding: 14rpx 0;
}
.wk-mode-item.on { color: var(--design-primary); border-color: var(--design-primary); background: rgba(0, 0, 0, 0.04); }
/* 输入框对齐 customers.vue .form-input / customerDetail.vue .picker-value 规范：
   height 80rpx + line-height 80rpx（MP 原生 input 垂直 padding 不生效，必须显式高度，
   否则塌成一行矮盒——2026-10-19 开发者工具实测反馈）+ fs-5 + radius-xs */
.wk-link-input {
  width: 100%; height: 160rpx; box-sizing: border-box; font-size: var(--fs-5); color: var(--t1);
  background: var(--bg-card); border-radius: var(--radius-xs); padding: 20rpx 24rpx; line-height: 1.5;
}
.wk-id-input {
  width: 100%; box-sizing: border-box; height: 80rpx; line-height: 80rpx;
  background: var(--bg-card); border-radius: var(--radius-xs);
  padding: 0 24rpx; font-size: var(--fs-5); color: var(--t1); margin-bottom: 20rpx;
}
.wk-parse-btn {
  margin-top: 16rpx; text-align: center; font-size: var(--fs-4); color: var(--design-primary);
  border: 1rpx solid var(--design-primary); border-radius: 12rpx; padding: 14rpx 0;
}
.wk-hint { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; margin-bottom: 16rpx; }
.wk-parsed { margin-top: 20rpx; background: rgba(0, 0, 0, 0.04); border-radius: 12rpx; padding: 16rpx; }
.wk-parsed-ok { font-size: var(--fs-3); color: var(--design-primary); font-weight: 500; }
.wk-parsed-ids { display: block; font-size: var(--fs-1); color: var(--t3); margin-top: 8rpx; word-break: break-all; }
.wk-test { margin-top: 24rpx; text-align: center; font-size: var(--fs-3); color: var(--design-primary); text-decoration: underline; }
.wk-agree { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 28rpx; }
.wk-checkbox {
  width: 32rpx; height: 32rpx; border-radius: 8rpx; border: 2rpx solid var(--border-strong);
  flex-shrink: 0; margin-top: 4rpx; position: relative;
}
.wk-checkbox.on { background: var(--design-primary); border-color: var(--design-primary); }
.wk-checkbox.on::after {
  content: ''; position: absolute; left: 9rpx; top: 4rpx; width: 10rpx; height: 16rpx;
  border-right: 4rpx solid var(--white); border-bottom: 4rpx solid var(--white); transform: rotate(45deg);
}
.wk-agree-t { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; }
.wk-pop-btns { display: flex; gap: 20rpx; margin-top: 32rpx; }
.wk-pop-btn { flex: 1; text-align: center; font-size: var(--fs-4); border-radius: 14rpx; padding: 18rpx 0; }
.wk-pop-btn.cancel { color: var(--t3); background: var(--bg-page); }
.wk-pop-btn.ok { color: var(--white); background: var(--design-primary); }
</style>
